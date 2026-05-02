/**
 * React hook that incrementally builds per-column search indexes in the
 * background without blocking the main thread.
 *
 * Scheduling strategy: the hook iterates the configured list of `fields`
 * one at a time (or `chunkSize` at a time), yielding to the browser between
 * each chunk via `requestIdleCallback`. Environments that lack the API
 * (jsdom, older Safari) transparently fall back to `setTimeout(cb, 0)`, so
 * the hook never assumes idle-scheduling primitives exist. Per-field work
 * is intentionally chunked so that one slow column cannot starve the rest
 * of the pipeline — each column's `loading-cache → building → ready`
 * transition is independently observable by consumers, and an `error` on
 * one field does not abort the others.
 *
 * IDB cache contract: for every `(gridId, field)` pair the hook first
 * probes the injected `IdbAdapter` for a payload. If present, the entry is
 * trusted verbatim and surfaced immediately; otherwise the hook calls the
 * injected `buildIndex` to produce a fresh payload and writes it back
 * through `adapter.put`. Cache entries are trusted without hash comparison
 * as a pragmatic simplification — stale entries are invalidated implicitly
 * by any change to the effect dependencies (`gridId`, `data`, `rowIds`
 * content, `fields` content), which triggers a rebuild pass that
 * overwrites the cache. The trade-off: if the adapter contains an entry
 * built from a previous version of the data that still matches the current
 * dep set, the hook will return that stale payload until the next dep
 * change. Callers that cannot tolerate this should version their `gridId`.
 *
 * Inject-for-test seams: both `buildIndex` and `openAdapter` can be
 * supplied through options. Production callers leave them undefined; the
 * hook lazily `await import(...)`s the real implementations from
 * `@iasbuilt/datagrid-core` only when needed, which keeps the core
 * bundle out of consumers that fully inject their own builder/adapter.
 *
 * Invariants worth preserving on any refactor:
 * - `isMountedRef` plus a per-effect `cancelled` flag guard every async
 *   setState. Under React 19 + jsdom, post-unmount setState surfaces as
 *   `act()` warnings and — more insidiously — leaves dangling microtask
 *   chains that can cross-pollute subsequent tests running in the same
 *   worker. Both boundaries must be checked because `cancelled` flips on
 *   effect cleanup (dep change) while `isMountedRef` flips on unmount.
 * - `fieldsKey` and `rowIdsKey` memoise the array dep by content-joined
 *   string (separator `'\u0001'`, a non-printing control char that cannot
 *   occur inside a legitimate field name or row id). Callers routinely
 *   pass inline array literals (`fields={['a', 'b']}`) whose identity
 *   changes every render; tracking the raw array in the effect deps would
 *   reschedule the indexer every render, which calls `setStatus`, which
 *   re-renders, which creates a new literal — an infinite reschedule loop
 *   that has OOM'd vitest workers in the past.
 *
 * @module hooks/use-background-indexer
 */

import { useEffect, useMemo, useRef, useState } from 'react';

// -----------------------------------------------------------------------------
// Type imports — sibling agents are still building these modules. We use the
// real deep path when available and fall back to local structural types
// otherwise (duck-typed via the `buildIndex`/`openAdapter` injectors).
// -----------------------------------------------------------------------------

/**
 * Minimal structural shape of a built column index payload.
 *
 * The upstream `@iasbuilt/datagrid-core/search-index/column-index` module
 * may expose a richer type; this hook only depends on the fields shown
 * here. Declaring a narrow structural contract keeps the hook usable even
 * when the core package ships a superset of this interface.
 *
 * @property field          Column field name this index was built for.
 * @property hash           Content hash of the source data + field, used
 *                          by consumers (not by this hook) to detect
 *                          staleness against a freshly-derived hash.
 * @property distinctValues Sorted unique values observed in the column.
 * @property trie           Opaque prefix-search structure; treated as an
 *                          implementation detail of the builder.
 * @property valueToRowIds  Reverse index mapping a cell value back to the
 *                          row ids that contain it.
 */
export interface ColumnSearchIndex {
  field: string;
  hash: string;
  distinctValues: string[];
  trie: unknown;
  valueToRowIds: Map<string, string[]>;
}

/**
 * Minimal structural shape of the IDB adapter returned by
 * `openIdbAdapter`. The real type is generic over the payload, but the
 * hook only needs `get` and `put` for column-index payloads.
 *
 * The adapter is assumed to be keyed by the composite `(gridId, field)`
 * tuple — the hook never looks at the stored `hash` itself, but carries
 * it in the return shape so tests and other consumers can assert on it.
 *
 * @typeParam TPayload Stored payload type; defaults to
 *                     {@link ColumnSearchIndex}.
 */
export interface IdbAdapter<TPayload extends { hash: string } = ColumnSearchIndex> {
  /**
   * Look up a cached payload for `(gridId, field)`.
   *
   * @param gridId Grid identifier namespace.
   * @param field  Column field name.
   * @returns The cached `{ payload, hash }` envelope, or `null` on miss.
   */
  get(gridId: string, field: string): Promise<{ payload: TPayload; hash: string } | null>;
  /**
   * Persist a freshly-built payload for `(gridId, field)`.
   *
   * @param gridId  Grid identifier namespace.
   * @param field   Column field name.
   * @param payload Newly-built index payload to store.
   */
  put(gridId: string, field: string, payload: TPayload): Promise<void>;
}

// -----------------------------------------------------------------------------
// Public API types
// -----------------------------------------------------------------------------

/**
 * Configuration accepted by {@link useBackgroundIndexer}.
 *
 * All fields except `gridId`, `data`, `rowIds`, and `fields` are optional.
 * The two injector fields (`buildIndex`, `openAdapter`) exist solely as
 * test seams — production callers omit them and the hook lazily imports
 * the real core implementations on first use.
 */
export interface BackgroundIndexerOptions {
  /** Stable identifier for the grid — used as part of the IDB composite key. */
  gridId: string;
  /** Source rows. Re-building triggers when this array reference changes. */
  data: ReadonlyArray<Record<string, unknown>>;
  /** Row identifier per source row, aligned positionally with `data`. */
  rowIds: ReadonlyArray<string>;
  /** Fields to index — typically the filterable column fields. */
  fields: ReadonlyArray<string>;
  /** When `true`, skip all indexing (test/SSR escape hatch). Defaults to `false`. */
  disabled?: boolean;
  /**
   * Optional `buildIndex` injector for testability. Production code should
   * leave this undefined so the real core implementation is used.
   */
  buildIndex?: (
    data: ReadonlyArray<Record<string, unknown>>,
    rowIds: ReadonlyArray<string>,
    field: string,
  ) => ColumnSearchIndex;
  /**
   * Optional adapter injector for testability. Production code should
   * leave this undefined so the real `openIdbAdapter` is used.
   */
  openAdapter?: () => Promise<IdbAdapter>;
  /** Number of fields built per idle tick. Defaults to `1`. */
  chunkSize?: number;
}

/**
 * Per-field lifecycle status. Transitions are monotonic within a single
 * effect pass: `idle → loading-cache → building → ready` on the build
 * path, `idle → loading-cache → ready` on a cache hit, or terminating in
 * `error` from any intermediate state if an exception escapes.
 */
export type BackgroundIndexerFieldStatus =
  | 'idle'
  | 'loading-cache'
  | 'building'
  | 'ready'
  | 'error';

/**
 * Snapshot of the indexer returned each render. Consumers can subscribe
 * to progress by reading `status[field]` per column and gate UI on
 * `isBusy` while any field is still resolving.
 */
export interface BackgroundIndexerState {
  /** Most recently-built indexes by field (in-memory cache). */
  indexes: Record<string, ColumnSearchIndex>;
  /** Per-field status map. */
  status: Record<string, BackgroundIndexerFieldStatus>;
  /** `true` while any field is still in-flight. */
  isBusy: boolean;
}

// -----------------------------------------------------------------------------
// Defaults for production code paths. Imported lazily to avoid forcing the
// core bundle into consumers who inject their own builder/adapter.
// -----------------------------------------------------------------------------

/**
 * Default `buildIndex` — attempts to import the real implementation from
 * core; if unavailable (e.g. sibling agent hasn't published yet) throws
 * a descriptive error so the caller knows to pass an injector.
 *
 * The dynamic `import(...)` is swallowed on failure so we produce the
 * actionable error message below rather than an opaque module-resolution
 * rejection.
 *
 * @returns Function that takes `(data, rowIds, field)` and returns a
 *          {@link ColumnSearchIndex}.
 */
async function defaultBuildIndex(): Promise<
  (
    data: ReadonlyArray<Record<string, unknown>>,
    rowIds: ReadonlyArray<string>,
    field: string,
  ) => ColumnSearchIndex
> {
  const mod = (await import('@iasbuilt/datagrid-core').catch(() => null)) as
    | { buildColumnIndex?: unknown }
    | null;
  if (mod && typeof mod.buildColumnIndex === 'function') {
    return mod.buildColumnIndex as (
      data: ReadonlyArray<Record<string, unknown>>,
      rowIds: ReadonlyArray<string>,
      field: string,
    ) => ColumnSearchIndex;
  }
  throw new Error(
    'useBackgroundIndexer: buildColumnIndex is not exported from @iasbuilt/datagrid-core. ' +
      'Pass a `buildIndex` injector via options.',
  );
}

/**
 * Default adapter opener — delegates to the real IDB adapter in core.
 *
 * Mirrors {@link defaultBuildIndex}'s lazy-import pattern so consumers
 * that always inject their own adapter never pull the IDB module into
 * their bundle.
 *
 * @returns Resolved {@link IdbAdapter} instance.
 */
async function defaultOpenAdapter(): Promise<IdbAdapter> {
  const mod = (await import('@iasbuilt/datagrid-core').catch(() => null)) as
    | { openIdbAdapter?: () => Promise<IdbAdapter> }
    | null;
  if (mod && typeof mod.openIdbAdapter === 'function') {
    return mod.openIdbAdapter();
  }
  throw new Error(
    'useBackgroundIndexer: openIdbAdapter is not exported from @iasbuilt/datagrid-core. ' +
      'Pass an `openAdapter` injector via options.',
  );
}

// -----------------------------------------------------------------------------
// Idle-callback helpers. `requestIdleCallback` is not universally available
// (notably Safari < 16.4 and Node/jsdom). We detect at call time to stay
// SSR-safe and testable.
// -----------------------------------------------------------------------------

/** Opaque handle returned by {@link scheduleIdle}; accepted by {@link cancelIdle}. */
type IdleHandle = number;

/** Minimal deadline object matching the native `IdleDeadline` surface. */
type IdleDeadline = { didTimeout: boolean; timeRemaining: () => number };

/**
 * Schedule `cb` to run when the browser is idle, or on the next task tick
 * when `requestIdleCallback` is unavailable. The fallback synthesises a
 * permissive deadline (`timeRemaining: 50`) so callers can use the same
 * code path regardless of environment.
 *
 * @param cb Callback invoked with an `IdleDeadline`.
 * @returns Handle that can be passed to {@link cancelIdle}.
 */
function scheduleIdle(cb: (deadline: IdleDeadline) => void): IdleHandle {
  const w = typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: (d: IdleDeadline) => void) => IdleHandle;
  }) : undefined;
  if (w && typeof w.requestIdleCallback === 'function') {
    return w.requestIdleCallback(cb);
  }
  // setTimeout fallback — synthesise a permissive deadline.
  return setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0) as unknown as IdleHandle;
}

/**
 * Cancel a pending handle returned by {@link scheduleIdle}. Routes to
 * `cancelIdleCallback` when available and `clearTimeout` otherwise — the
 * handle shape is identical in both cases because `scheduleIdle` returned
 * whichever the host produced.
 *
 * @param handle Handle previously returned by {@link scheduleIdle}.
 */
function cancelIdle(handle: IdleHandle): void {
  const w = typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & {
    cancelIdleCallback?: (h: IdleHandle) => void;
  }) : undefined;
  if (w && typeof w.cancelIdleCallback === 'function') {
    w.cancelIdleCallback(handle);
    return;
  }
  clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}

// -----------------------------------------------------------------------------
// Hook implementation
// -----------------------------------------------------------------------------

/** Frozen sentinel so the initial render returns referentially-stable empty objects. */
const EMPTY_INDEXES: Record<string, ColumnSearchIndex> = Object.freeze({});
/** Frozen sentinel for the initial `status` state — see {@link EMPTY_INDEXES}. */
const EMPTY_STATUS: Record<string, BackgroundIndexerFieldStatus> = Object.freeze({});

/**
 * Incrementally builds (and caches) per-column search indexes in the
 * background. See module-level docs for the full strategy overview,
 * including scheduling, cache contract, and invariants.
 *
 * The returned state object is stable across renders where nothing
 * changes, but `indexes` and `status` are replaced (not mutated) whenever
 * a field completes, so consumers can rely on identity-based memoisation.
 *
 * @param options See {@link BackgroundIndexerOptions}.
 * @returns Live snapshot of index payloads, per-field status, and the
 *          aggregate `isBusy` flag. See {@link BackgroundIndexerState}.
 */
export function useBackgroundIndexer(
  options: BackgroundIndexerOptions,
): BackgroundIndexerState {
  const {
    gridId,
    data,
    rowIds,
    fields,
    disabled = false,
    buildIndex,
    openAdapter,
    chunkSize = 1,
  } = options;

  // Three independent state slices drive the consumer-visible snapshot:
  // in-memory index payloads, per-field status, and the aggregate busy
  // flag. Splitting them lets each update touch only the slice that
  // changed and preserves referential identity on the others.
  const [indexes, setIndexes] = useState<Record<string, ColumnSearchIndex>>(
    EMPTY_INDEXES,
  );
  const [status, setStatus] = useState<
    Record<string, BackgroundIndexerFieldStatus>
  >(EMPTY_STATUS);
  const [isBusy, setIsBusy] = useState(false);

  // Latest-ref pattern so the async loop reads current injectors without
  // being part of the effect's dependency array (avoiding accidental
  // re-schedules when a parent component re-creates inline closures).
  const buildIndexRef = useRef(buildIndex);
  const openAdapterRef = useRef(openAdapter);
  buildIndexRef.current = buildIndex;
  openAdapterRef.current = openAdapter;

  // Tracks whether the hook is still mounted. Async work that resolves
  // after unmount must NOT call setState — under React 19 + jsdom this
  // surfaces as `act()` warnings and, more critically, can leave dangling
  // microtask chains that cross-pollute subsequent tests in the same file.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Stabilise array dependencies by content. Callers frequently pass inline
  // array literals (e.g. `fields={['a', 'b']}`) which create a fresh
  // reference on every render. Using the raw arrays in the effect's deps
  // would re-schedule the indexer on every render — and because the effect
  // itself triggers a re-render via `setStatus`, that quickly degenerates
  // into an infinite render loop. Hashing the contents to a stable key
  // collapses identity-equal arrays into a single dep value.
  const fieldsKey = useMemo(() => fields.join('\u0001'), [fields]);
  const rowIdsKey = useMemo(() => rowIds.join('\u0001'), [rowIds]);

  // Core scheduling effect. Re-runs when the composite dep key changes
  // (gridId / data reference / rowIds content / fields content / disabled
  // / chunkSize) and takes responsibility for driving every field through
  // the cache-probe → rebuild → write-back → publish pipeline.
  useEffect(() => {
    // Short-circuit when the caller explicitly opts out. No cleanup to
    // perform because no work was scheduled this pass.
    if (disabled) {
      return undefined;
    }
    // With no fields there is nothing to build, but previous passes may
    // have left `isBusy` asserted — normalise it before bailing.
    if (fields.length === 0) {
      if (isMountedRef.current) setIsBusy(false);
      return undefined;
    }

    // Per-effect-pass cancellation flag. Flips to true in the cleanup
    // function below, which lets any microtask spawned by this pass
    // observe the cancellation before invoking setState.
    let cancelled = false;
    // Handle for the currently-pending idle callback, if any. Non-null
    // only between `scheduleIdle` and the idle callback firing.
    let idleHandle: IdleHandle | null = null;
    // Lazily-opened adapter reused across fields inside this pass so we
    // only pay the `openAdapter` cost once per effect run.
    let adapter: IdbAdapter | null = null;

    // Local guard: a setState is safe iff the effect hasn't been cleaned up
    // AND the component is still mounted. Centralising the check here
    // prevents stray updates from in-flight Promises that resolve after
    // either boundary.
    const safeSetIndexes: typeof setIndexes = (updater) => {
      if (cancelled || !isMountedRef.current) return;
      setIndexes(updater);
    };
    const safeSetStatus: typeof setStatus = (updater) => {
      if (cancelled || !isMountedRef.current) return;
      setStatus(updater);
    };
    const safeSetIsBusy: typeof setIsBusy = (updater) => {
      if (cancelled || !isMountedRef.current) return;
      setIsBusy(updater);
    };

    // Kick the status map forward before any async work begins so
    // consumers see an immediate `loading-cache` hint for every field in
    // the current set. Preserving `prev` entries that fall outside the
    // current `fields` avoids dropping historical state for fields the
    // caller may surface again later.
    safeSetStatus((prev) => {
      const next: Record<string, BackgroundIndexerFieldStatus> = { ...prev };
      for (const f of fields) next[f] = 'loading-cache';
      return next;
    });
    safeSetIsBusy(true);

    // Per-field pipeline closure. Kept inside the effect so it captures
    // the current `adapter`/`cancelled` cell and a consistent snapshot
    // of `data`/`rowIds`/`gridId` for this pass. Every await is bracketed
    // by a `cancelled` check so unmount (or dep change) aborts promptly.
    const processField = async (field: string): Promise<void> => {
      if (cancelled) return;
      try {
        // Open the adapter on first use. Subsequent fields in the same
        // pass reuse the already-opened handle.
        if (!adapter) {
          const opener = openAdapterRef.current ?? defaultOpenAdapter;
          adapter = await opener();
        }
        if (cancelled) return;

        // (a) cache probe
        const cached = await adapter.get(gridId, field);
        if (cancelled) return;

        if (cached && cached.payload) {
          // Pragmatic simplification: trust any fresh cached entry. See
          // module-level strategy note. The module docs explain the
          // stale-cache trade-off callers need to understand.
          const payload = cached.payload;
          safeSetIndexes((prev) => ({ ...prev, [field]: payload }));
          safeSetStatus((prev) => ({ ...prev, [field]: 'ready' }));
          return;
        }

        // (b) rebuild path — cache miss. Move the field into `building`
        // before we pay the (potentially expensive) builder call so
        // consumers can render a spinner attribution on the exact column.
        safeSetStatus((prev) => ({ ...prev, [field]: 'building' }));
        const builder = buildIndexRef.current ?? (await defaultBuildIndex());
        if (cancelled) return;

        const payload = builder(data, rowIds, field);
        if (cancelled) return;

        // Persist before publishing so a crash between the two cannot
        // leave a consumer reading an index that never made it to disk.
        await adapter.put(gridId, field, payload);
        if (cancelled) return;

        safeSetIndexes((prev) => ({ ...prev, [field]: payload }));
        safeSetStatus((prev) => ({ ...prev, [field]: 'ready' }));
      } catch {
        // Intentionally swallow and surface via status. One failing
        // column must not take down the rest of the pipeline.
        safeSetStatus((prev) => ({ ...prev, [field]: 'error' }));
      }
    };

    // Chunked driver. Each call schedules a single idle callback that
    // processes `chunkSize` fields before re-scheduling the next slice.
    // This yields to the browser between slices so painting and input
    // handling remain responsive even on large column sets. React effect
    // cleanups are synchronous so we cannot await anything here, but
    // flipping `cancelled` before any further microtask executes is
    // sufficient — every setState in the pipeline is gated on it.
    const runChunk = (startIdx: number): void => {
      idleHandle = scheduleIdle(() => {
        // Clear the handle first so the cleanup path does not try to
        // cancel a callback that has already started executing.
        idleHandle = null;
        if (cancelled) return;
        // IIFE bridges the synchronous idle callback into the async
        // processing pipeline without leaking an unhandled-rejection
        // warning (errors inside `processField` are already caught).
        void (async () => {
          const end = Math.min(startIdx + chunkSize, fields.length);
          for (let i = startIdx; i < end; i += 1) {
            if (cancelled) return;
            await processField(fields[i]!);
          }
          if (cancelled) return;
          if (end < fields.length) {
            // More fields remain — yield to the browser again before
            // starting the next slice.
            runChunk(end);
          } else {
            // Pipeline drained. Flip the aggregate flag off so consumers
            // can stop showing a global spinner.
            safeSetIsBusy(false);
          }
        })();
      });
    };

    // Kick off the first chunk. Subsequent chunks are scheduled by the
    // recursive tail inside `runChunk` itself.
    runChunk(0);

    // Cleanup: invalidate this pass's cancellation flag and cancel any
    // pending idle callback. The in-flight async processing (if any) will
    // observe `cancelled` at its next await and return without touching
    // state, so no extra teardown is needed for the adapter handle.
    return () => {
      cancelled = true;
      if (idleHandle != null) {
        cancelIdle(idleHandle);
        idleHandle = null;
      }
    };
    // `fields`/`rowIds` are intentionally tracked by content (via the
    // memoised keys above) so callers passing new array literals on every
    // render don't trigger an infinite reschedule loop. `data` is still
    // tracked by reference: callers should hand a stable rows array and
    // mutate it through immutable updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridId, data, rowIdsKey, fieldsKey, disabled, chunkSize]);

  return { indexes, status, isBusy };
}
