/**
 * Unit coverage for `useCauslDevtools` — the dev-time hook that wires a
 * `GridModel`'s causl graph into the Redux DevTools extension via
 * `@causl/devtools-bridge`.
 *
 * The bridge itself is exhaustively tested upstream; this file pins the
 * xldatagrid integration contract:
 *
 *   1. The hook is callable from a real React render and does not throw
 *      when the Redux DevTools extension is absent (the common case in CI
 *      and in headless tests).
 *   2. When the extension *is* present (we stub `globalThis.
 *      __REDUX_DEVTOOLS_EXTENSION__` with a recording fake), the dynamic
 *      `import('@causl/devtools-bridge')` resolves and the hook
 *      subscribes through `connectDevtools`.
 *   3. When `process.env.NODE_ENV === 'production'` and `forceInDev` is
 *      not set, the hook bails before importing the bridge — production
 *      bundles can tree-shake the dep out.
 *   4. Unmounting the hook disposes the subscription (the
 *      `connectDevtools` cleanup is invoked).
 *
 * The test runs against the real `@causl/devtools-bridge` published to
 * the workspace; only the browser extension hook (`__REDUX_DEVTOOLS_
 * EXTENSION__`) is faked, mirroring how a real developer's browser
 * surfaces the integration to the bridge.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGridModel, type GridModel } from '@iasbuilt/datagrid-core';
import { useCauslDevtools } from '../use-causl-devtools';

type Row = { id: string; name: string; value: number };

function makeModel(): GridModel<Row> {
  return createGridModel<Row>({
    data: [
      { id: '1', name: 'Alice', value: 10 },
      { id: '2', name: 'Bob', value: 20 },
    ],
    columns: [
      { id: 'name', field: 'name', title: 'Name' },
      { id: 'value', field: 'value', title: 'Value' },
    ],
    rowKey: 'id',
  });
}

// ---------------------------------------------------------------------------
// A minimal recording fake of the Redux DevTools extension. The bridge's
// `isExtensionAvailable` checks `globalThis.__REDUX_DEVTOOLS_EXTENSION__`,
// and `connect(...)` returns an instance with `init`, `send`, `subscribe`,
// and `unsubscribe`. The shape below is the minimum surface the bridge
// exercises in the happy path; if upstream ever broadens the contract the
// test will surface as a `TypeError` and we will mirror the change here.
// ---------------------------------------------------------------------------

interface FakeConnection {
  init: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
}

interface FakeExtension {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  __connections: FakeConnection[];
}

function installFakeExtension(): FakeExtension {
  const connections: FakeConnection[] = [];
  const fake: FakeExtension = {
    connect: vi.fn(() => {
      const conn: FakeConnection = {
        init: vi.fn(),
        send: vi.fn(),
        subscribe: vi.fn(() => () => {}),
        unsubscribe: vi.fn(),
        error: vi.fn(),
      };
      connections.push(conn);
      return conn;
    }),
    disconnect: vi.fn(),
    __connections: connections,
  };
  (globalThis as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__ = fake;
  return fake;
}

function uninstallFakeExtension(): void {
  delete (globalThis as Record<string, unknown>).__REDUX_DEVTOOLS_EXTENSION__;
}

// ---------------------------------------------------------------------------
// Process.env helpers — we mutate `process.env.NODE_ENV` per-test instead of
// stubbing the whole `process` global because the hook itself reads through
// `globalThis.process.env.NODE_ENV` and we want to exercise that exact path.
// ---------------------------------------------------------------------------

let originalNodeEnv: string | undefined;

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  // Default to 'development' so the hook does not bail; individual tests can
  // flip to 'production' when they want to assert the bail-out path.
  process.env.NODE_ENV = 'development';
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  uninstallFakeExtension();
  vi.restoreAllMocks();
});

describe('useCauslDevtools', () => {
  it('returns void and does not throw when the extension is absent', () => {
    // No fake extension installed — the bridge's `isExtensionAvailable`
    // should short-circuit and the hook should be a no-op without any
    // user-visible error.
    const model = makeModel();
    let returned: unknown = 'sentinel';
    expect(() => {
      const { result } = renderHook(() => useCauslDevtools(model));
      returned = result.current;
    }).not.toThrow();
    expect(returned).toBeUndefined();
  });

  it('subscribes through the bridge when the extension is present', async () => {
    const fake = installFakeExtension();
    const model = makeModel();

    renderHook(() => useCauslDevtools(model, { name: 'unit-test-grid' }));

    // The bridge's dynamic import resolves on the microtask queue; wait
    // for `connect(...)` to land before asserting.
    await waitFor(() => {
      expect(fake.connect).toHaveBeenCalledTimes(1);
    });

    const conn = fake.__connections[0];
    expect(conn).toBeDefined();
    // The bridge always seeds the panel with an `init` snapshot.
    expect(conn.init).toHaveBeenCalled();
    // The reverse-path subscription is wired so JUMP_TO_STATE etc. flow back
    // through the bridge — proves the hook reached the real connect path.
    expect(conn.subscribe).toHaveBeenCalled();
  });

  it('bails when NODE_ENV === "production" without forceInDev', async () => {
    process.env.NODE_ENV = 'production';
    const fake = installFakeExtension();
    const model = makeModel();

    renderHook(() => useCauslDevtools(model, { name: 'prod-grid' }));

    // Give any pending microtask a chance to flush; the assertion is that
    // no connection was ever attempted.
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.connect).not.toHaveBeenCalled();
  });

  it('does subscribe in production when forceInDev: true', async () => {
    process.env.NODE_ENV = 'production';
    const fake = installFakeExtension();
    const model = makeModel();

    renderHook(() =>
      useCauslDevtools(model, { name: 'forced', forceInDev: true }),
    );

    await waitFor(() => {
      expect(fake.connect).toHaveBeenCalledTimes(1);
    });
  });

  it('disposes the subscription on unmount', async () => {
    const fake = installFakeExtension();
    const model = makeModel();

    const { unmount } = renderHook(() =>
      useCauslDevtools(model, { name: 'cleanup-grid' }),
    );

    await waitFor(() => {
      expect(fake.connect).toHaveBeenCalledTimes(1);
    });
    const conn = fake.__connections[0];

    // The bridge installs `disconnect` (or per-connection `unsubscribe`) as
    // the teardown the hook calls on unmount. We assert at least one of
    // those cleanup paths fired so the bridge does not leak a subscription
    // beyond the React lifetime.
    unmount();
    await waitFor(() => {
      const ext = (globalThis as { __REDUX_DEVTOOLS_EXTENSION__?: FakeExtension })
        .__REDUX_DEVTOOLS_EXTENSION__;
      const disconnected =
        (ext?.disconnect.mock.calls.length ?? 0) > 0 ||
        conn.unsubscribe.mock.calls.length > 0;
      expect(disconnected).toBe(true);
    });
  });
});
