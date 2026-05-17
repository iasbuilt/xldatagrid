/**
 * useCauslDevtools — connect a `GridModel`'s causl graph to the Redux
 * DevTools browser extension during development.
 *
 * Every Causl `Commit` shows up in the DevTools timeline as a Redux
 * action of the form `{ type: intent, payload: { changedNodes } }`,
 * paired with the post-commit graph snapshot. The extension's
 * time-travel UI (Jump-to-Action / Jump-to-State) replays against
 * the engine's bounded snapshot retention — see
 * `@causl/devtools-bridge`'s contract for the supported reverse-path
 * messages.
 *
 * Zero-cost when the extension isn't installed: `connectDevtools`
 * short-circuits before allocating any subscription or observer.
 * Safe to call unconditionally; the hook also bails on
 * `process.env.NODE_ENV === 'production'` so production bundles can
 * tree-shake the `@causl/devtools-bridge` import out entirely.
 *
 * Setup (one-time, per developer machine):
 *   1. Install the Redux DevTools extension in Chrome / Firefox /
 *      Edge. https://github.com/reduxjs/redux-devtools/tree/main/extension
 *   2. Open DevTools → the **Redux** tab is added by the extension.
 *   3. `npm i -D @causl/devtools-bridge` (or `pnpm add -D`).
 *   4. In your DataGrid container: call `useCauslDevtools(model)` (or
 *      pass `devtools: true` to `useGrid` once that wiring lands).
 *
 * @example
 * ```tsx
 * import { useGrid, useCauslDevtools } from '@iasbuilt/datagrid-react';
 *
 * function MyGrid({ data, columns }) {
 *   const model = useGrid({ data, columns, rowKey: 'id' });
 *   useCauslDevtools(model, { name: 'employees-grid' });
 *   return <DataGrid model={model} />;
 * }
 * ```
 *
 * @module use-causl-devtools
 */
import { useEffect } from 'react';
import type { GridModel } from '@iasbuilt/datagrid-core';

/**
 * Optional knobs forwarded to `connectDevtools`.
 *
 * Typed against the published `@causl/devtools-bridge` `ConnectOptions`
 * shape but mirrored here so xldatagrid does not impose a hard
 * dependency at type-resolve time on consumers that never use this
 * hook. The structural compatibility is asserted at the call site.
 */
export interface UseCauslDevtoolsOptions {
  /** Instance label shown in the DevTools dropdown. */
  name?: string;
  /** Whether to forward commits (default `true`). */
  enabled?: boolean;
  /** Override the production-bail-out (default: bail in prod). */
  forceInDev?: boolean;
}

export function useCauslDevtools<TData extends Record<string, unknown>>(
  model: GridModel<TData>,
  options: UseCauslDevtoolsOptions = {},
): void {
  useEffect(() => {
    // Bail in production unless the caller explicitly forced it.
    // Refer to `process` via globalThis to avoid pulling in node typings.
    const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process;
    const isProd = proc?.env?.NODE_ENV === 'production';
    if (isProd && !options.forceInDev) return;
    if (options.enabled === false) return;

    let disconnect: (() => void) | undefined;
    let cancelled = false;

    // Dynamic import so a production bundle that tree-shakes useEffect
    // can also drop the bridge from the dep graph. Bundlers that can't
    // tree-shake dynamic imports still get the dev-only conditional
    // above as a guard.
    void import('@causl/devtools-bridge')
      .then((mod) => {
        if (cancelled) return;
        disconnect = mod.connectDevtools(model.graph, {
          name: options.name,
        });
      })
      .catch(() => {
        // `@causl/devtools-bridge` is optional (declared as an optional
        // peer dependency). If it isn't installed, do nothing — the
        // grid keeps working without DevTools wiring.
      });

    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, [model, options.name, options.enabled, options.forceInDev]);
}
