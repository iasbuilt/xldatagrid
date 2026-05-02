/**
 * Barrel file for the `hooks/` directory.
 *
 * Collects the React hooks exposed by `@iasbuilt/datagrid-react` so
 * application code and downstream components can import them from
 * `@iasbuilt/datagrid-react/hooks` without reaching into internal paths.
 * Each hook adapts a framework-agnostic core subsystem (event bus, search
 * index, etc.) into a React-friendly stateful API.
 */

// Incrementally builds per-column search indexes in the background, bridging
// the core search-index builders with React render state and the IDB adapter.
export { useBackgroundIndexer } from './use-background-indexer';
export type {
  BackgroundIndexerOptions,
  BackgroundIndexerState,
  BackgroundIndexerFieldStatus,
  ColumnSearchIndex,
  IdbAdapter,
} from './use-background-indexer';
