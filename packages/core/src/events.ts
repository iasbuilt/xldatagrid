/**
 * Event bus implementation for the datagrid system.
 *
 * Provides a centralised publish/subscribe mechanism through which all grid
 * operations are dispatched. The bus supports three-phase hook execution
 * (`before` → `on` → `after`), priority ordering within each phase, event
 * cancellation from `before`-phase hooks, and a lightweight listener
 * notification layer for external state-synchronisation subscribers.
 *
 * @module events
 */

import { GridEventType, GridEvent, HookPhase, HookRegistration, GridListener } from './types';

/**
 * Internal representation of a registered hook, augmenting
 * {@link HookRegistration} with a resolved phase, priority, and a stable
 * numeric identity used for unsubscription.
 */
interface HookEntry {
  /** The event type this hook listens for. */
  event: GridEventType;
  /** Resolved lifecycle phase (`'on'` when omitted from the registration). */
  phase: HookPhase;
  /** Numeric priority within the phase (lower executes first). */
  priority: number;
  /** The handler callback. */
  handler: (event: GridEvent) => void | false | Promise<void | false>;
  /** Auto-incrementing identifier, unique per {@link EventBus} instance. */
  id: number;
}

/**
 * Lookup table mapping each {@link HookPhase} to a numeric rank so that
 * hooks can be sorted in `before` → `on` → `after` order with a simple
 * subtraction.
 */
const phaseOrder: Record<HookPhase, number> = { before: 0, on: 1, after: 2 };

/**
 * Central event bus that dispatches {@link GridEvent} instances through a
 * three-phase hook pipeline and notifies plain listeners after each dispatch.
 *
 * @remarks
 * Hooks are executed in deterministic order: first by phase (`before` → `on`
 * → `after`), then by ascending priority within each phase. A `before`-phase
 * handler may cancel the event by returning `false`, which prevents all
 * `on`-phase handlers from running while still allowing `after`-phase
 * handlers to execute (useful for logging, analytics, and cleanup).
 *
 * @example
 * ```ts
 * const bus = new EventBus();
 *
 * const removeHook = bus.addHook({
 *   event: 'cell:valueChange',
 *   phase: 'before',
 *   handler: (e) => {
 *     if (!isValid(e.payload)) return false; // cancels the event
 *   },
 * });
 *
 * await bus.dispatch('cell:valueChange', { rowId: '1', field: 'name', value: 'Alice' });
 * removeHook(); // unsubscribe when done
 * ```
 */
export class EventBus {
  /** Sorted array of all registered hook entries. */
  private hooks: HookEntry[] = [];
  /** Monotonically increasing counter for generating unique hook IDs. */
  private nextId = 0;
  /** Set of plain listeners notified after every dispatch cycle. */
  private listeners: Set<GridListener> = new Set();

  /**
   * Registers a hook for a specific event and lifecycle phase.
   *
   * The hook list is re-sorted after insertion to maintain the
   * phase-then-priority ordering invariant.
   *
   * @param reg - The hook registration descriptor.
   * @returns A disposal function that removes this hook when called.
   */
  addHook(reg: HookRegistration): () => void {
    // Build the internal entry, defaulting phase to 'on' and priority to 500
    const entry: HookEntry = {
      event: reg.event,
      phase: reg.phase ?? 'on',
      priority: reg.priority ?? 500,
      handler: reg.handler,
      id: this.nextId++,
    };
    this.hooks.push(entry);

    // Re-sort to preserve the phase → priority ordering invariant
    this.hooks.sort((a, b) => {
      if (a.phase !== b.phase) return phaseOrder[a.phase] - phaseOrder[b.phase];
      return a.priority - b.priority;
    });

    // Capture the ID for the disposal closure
    const id = entry.id;
    return () => {
      this.hooks = this.hooks.filter(h => h.id !== id);
    };
  }

  /**
   * Dispatches an event through the three-phase hook pipeline.
   *
   * Execution proceeds as follows:
   * 1. **before** hooks run in priority order. Any handler returning `false`
   *    cancels the event immediately.
   * 2. **on** hooks run in priority order — skipped entirely if the event was
   *    cancelled during the `before` phase.
   * 3. **after** hooks run unconditionally, regardless of cancellation state.
   *
   * After all hooks complete, every registered plain listener is notified.
   *
   * @param type - The event type identifier.
   * @param payload - Arbitrary data attached to the event.
   * @returns The fully-processed {@link GridEvent} (inspect `cancelled` to
   *          determine if a `before`-phase hook vetoed it).
   */
  /**
   * Synchronous fast-path used by core mutation methods to run the
   * `before:*` cancellation gate without an `await` boundary that would
   * defer React's view of the mutation to a microtask.
   *
   * All currently-shipped extensions register synchronous before-hooks
   * (regex-validation, column-resize, excel-mode). If a user-provided
   * hook returns a Promise, this method ignores its eventual resolution
   * — it cannot block synchronously. Hooks needing async work should
   * register on the `on:*` phase instead, which still runs through the
   * async `dispatch` path below.
   *
   * @returns the {@link GridEvent} with `cancelled` already set per any
   *   sync before-handler verdict.
   */
  dispatchBeforeSync(type: GridEventType, payload: Record<string, unknown> = {}): GridEvent {
    let cancelled = false;
    const event: GridEvent = {
      type,
      timestamp: performance.now(),
      payload,
      get cancelled() { return cancelled; },
      cancel() { cancelled = true; },
    };
    for (const hook of this.hooks) {
      if (hook.event !== type || hook.phase !== 'before') continue;
      if (cancelled) break;
      const result = hook.handler(event);
      if (result === false) { cancelled = true; break; }
      // Promise results from misregistered async before-hooks are ignored.
    }
    return event;
  }

  async dispatch(type: GridEventType, payload: Record<string, unknown> = {}): Promise<GridEvent> {
    // Construct the event envelope with a reactive cancelled flag
    let cancelled = false;
    const event: GridEvent = {
      type,
      timestamp: performance.now(),
      payload,
      get cancelled() { return cancelled; },
      cancel() { cancelled = true; },
    };

    // Collect hooks that match the dispatched event type
    const relevant = this.hooks.filter(h => h.event === type);

    // Phase 1: before — allow cancellation
    for (const hook of relevant.filter(h => h.phase === 'before')) {
      if (cancelled) break;
      const result = await hook.handler(event);
      if (result === false) { cancelled = true; break; }
    }

    // Phase 2: on — skipped when cancelled
    if (!cancelled) {
      for (const hook of relevant.filter(h => h.phase === 'on')) {
        await hook.handler(event);
      }
    }

    // Phase 3: after — always runs regardless of cancellation
    for (const hook of relevant.filter(h => h.phase === 'after')) {
      await hook.handler(event);
    }

    // Notify plain listeners that a dispatch cycle completed
    this.notifyListeners();
    return event;
  }

  /**
   * Registers a plain listener that is called after every event dispatch.
   *
   * Unlike hooks, listeners receive no event data — they serve as a
   * lightweight signal for external consumers (e.g. UI frameworks) to
   * re-read state.
   *
   * @param listener - The callback to invoke on each dispatch.
   * @returns A disposal function that removes the listener when called.
   */
  subscribe(listener: GridListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Iterates over all registered listeners and invokes each one.
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Removes all hooks and listeners, resetting the bus to a clean state.
   *
   * Typically called during grid teardown to prevent stale references.
   */
  clear(): void {
    this.hooks = [];
    this.listeners.clear();
  }
}
