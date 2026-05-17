/**
 * Unit tests for the bare-graph overload {@link useCauslDevtoolsForGraph}.
 *
 * Contracts protected by this file:
 * - The hook is callable with a bare `Graph` from `@causl/core` — no
 *   `GridModel` wrapper required (this is the whole point of the
 *   overload, issue #105).
 * - When the Redux DevTools extension is present (mocked via
 *   `globalThis.__REDUX_DEVTOOLS_EXTENSION__`), the bridge calls
 *   `graph.subscribeCommits` to forward commits — we verify by counting
 *   subscribe calls observed against a spy installed on the real graph.
 * - Unmounting disposes the subscription: after `unmount()` the
 *   per-graph refcount drops to zero and the underlying
 *   `subscribeCommits` disposer fires.
 *
 * The bridge does its work inside a dynamic `import()`; the hook then
 * calls `connectDevtools` only after that promise resolves. We use
 * `waitFor` to let the microtask settle before asserting.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The `@causl/core` primitives are re-exported via `@iasbuilt/datagrid-core`
// so packages downstream of core do not have to declare a direct dep on
// the engine. Tests follow the same import path the public API consumer
// would use.
import { createCausl, type Graph } from '@iasbuilt/datagrid-core';

import { useCauslDevtoolsForGraph } from '../use-causl-devtools';

// ---------------------------------------------------------------------------
// Mock of the Redux DevTools Extension surface. The bridge calls
// `__REDUX_DEVTOOLS_EXTENSION__.connect({ name })` once per graph and
// then talks to the returned connection. We capture the connection so
// the test can assert init/send/unsubscribe were invoked.
// ---------------------------------------------------------------------------

interface MockConnection {
  init: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function installMockExtension(): { connect: ReturnType<typeof vi.fn>; lastConnection: () => MockConnection | undefined } {
  let last: MockConnection | undefined;
  const connect = vi.fn((_opts?: { name?: string }) => {
    const conn: MockConnection = {
      init: vi.fn(),
      send: vi.fn(),
      // The bridge subscribes for reverse messages; return a no-op disposer.
      subscribe: vi.fn(() => () => undefined),
      unsubscribe: vi.fn(),
    };
    last = conn;
    return conn;
  });
  (globalThis as unknown as { __REDUX_DEVTOOLS_EXTENSION__: unknown }).__REDUX_DEVTOOLS_EXTENSION__ = { connect };
  return { connect, lastConnection: () => last };
}

function removeMockExtension(): void {
  delete (globalThis as unknown as { __REDUX_DEVTOOLS_EXTENSION__?: unknown }).__REDUX_DEVTOOLS_EXTENSION__;
}

describe('useCauslDevtoolsForGraph', () => {
  beforeEach(() => {
    // The hook bails in production. The test runner sets NODE_ENV=test
    // but be defensive in case some other test stamped it to 'production'.
    if ((globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env) {
      (globalThis as { process: { env: { NODE_ENV?: string } } }).process.env.NODE_ENV = 'development';
    }
  });

  afterEach(() => {
    removeMockExtension();
    vi.restoreAllMocks();
  });

  it('accepts a bare causl Graph (the #105 overload)', async () => {
    // No extension installed — the bridge short-circuits inside the dynamic
    // import. The hook must still resolve without throwing.
    const graph = createCausl({ name: 'unit-bare-graph' });
    const { unmount } = renderHook(() => useCauslDevtoolsForGraph(graph));
    // Give the dynamic import a tick to settle so any throw surfaces.
    await new Promise((r) => setTimeout(r, 0));
    expect(() => unmount()).not.toThrow();
  });

  it('subscribes to the graph when the DevTools extension is present', async () => {
    const { connect, lastConnection } = installMockExtension();
    const graph: Graph = createCausl({ name: 'unit-subscribe' });
    const subscribeCommitsSpy = vi.spyOn(graph, 'subscribeCommits');

    renderHook(() => useCauslDevtoolsForGraph(graph, { name: 'unit' }));

    await waitFor(
      () => {
        expect(connect).toHaveBeenCalledTimes(1);
      },
      { timeout: 2_000 },
    );
    // The bridge initialises the panel with the current snapshot and
    // wires a commit listener through `graph.subscribeCommits`.
    expect(subscribeCommitsSpy).toHaveBeenCalledTimes(1);
    expect(lastConnection()!.init).toHaveBeenCalledTimes(1);
  });

  it('disposes the subscription on unmount', async () => {
    installMockExtension();
    const graph: Graph = createCausl({ name: 'unit-dispose' });

    // Track the disposer that subscribeCommits hands back so we can
    // assert it actually runs at teardown. We wrap the real
    // implementation so the bridge keeps working.
    const realSubscribeCommits = graph.subscribeCommits.bind(graph);
    const innerDisposer = vi.fn();
    const subscribeCommitsSpy = vi
      .spyOn(graph, 'subscribeCommits')
      .mockImplementation((listener) => {
        const dispose = realSubscribeCommits(listener);
        return () => {
          innerDisposer();
          dispose();
        };
      });

    const { unmount } = renderHook(() => useCauslDevtoolsForGraph(graph));

    await waitFor(
      () => {
        expect(subscribeCommitsSpy).toHaveBeenCalledTimes(1);
      },
      { timeout: 2_000 },
    );

    unmount();
    // Give the cleanup microtask a chance to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(innerDisposer).toHaveBeenCalledTimes(1);
  });
});
