/**
 * Property-based tests for Shift+Arrow range extension — the third suite
 * called out in the hardening plan (alongside the already-landed
 * `stripField.property.test.ts` and `getEndJumpCell.property.test.ts`).
 *
 * The grid models Shift+Arrow via two primitives in `@iasbuilt/datagrid-core`:
 *
 *   - `extendSelection(state, cell)` — sets `range.focus` to `cell`, keeping
 *     `range.anchor` fixed. This is the function called by the React
 *     `use-keyboard.ts` hook via `model.extendTo(...)` on every Shift+Arrow
 *     keystroke.
 *   - `getNextCell(current, direction, columns, rowIds)` — computes the
 *     adjacent cell in a direction, returning `null` at the grid boundary.
 *
 * The invariants we pin here are defined on the *composition* of those two
 * primitives: the observable behaviour of "press Shift+Arrow in a particular
 * direction N times" starting from a known selection.
 */
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  createSelection,
  selectCell,
  extendSelection,
  getNextCell,
  isCellInRange,
} from '@iasbuilt/datagrid-core';
import type {
  ColumnDef,
  CellAddress,
  SelectionState,
} from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Dir = 'up' | 'down' | 'left' | 'right';
const DIRECTIONS: Dir[] = ['up', 'down', 'left', 'right'];

function makeColumns(numCols: number): ColumnDef<any>[] {
  return Array.from({ length: numCols }, (_, i) => ({
    id: `c${i}`,
    field: `c${i}`,
    title: `Col ${i}`,
  }));
}

function makeRowIds(numRows: number): string[] {
  return Array.from({ length: numRows }, (_, i) => `r${i}`);
}

/**
 * Simulate pressing Shift+<direction> `steps` times starting from `state`.
 * Each step re-derives the next focus from the *current* focus (not the
 * anchor), matching the real `use-keyboard.ts` behaviour — compound
 * Shift+Arrow keystrokes walk outward one cell at a time.
 *
 * When the focus would step off the grid, the call is a no-op (mirrors the
 * keyboard handler, which only invokes `extendTo` when `getNextCell` yields
 * a target). The selection therefore clamps at the boundary.
 */
function pressShiftArrow(
  state: SelectionState,
  direction: Dir,
  steps: number,
  columns: ColumnDef<any>[],
  rowIds: string[],
): SelectionState {
  let current = state;
  for (let i = 0; i < steps; i++) {
    const focus = current.range?.focus;
    if (!focus) break;
    const next = getNextCell(focus, direction, columns, rowIds);
    if (!next) break; // clamped at the grid boundary
    current = extendSelection(current, next);
  }
  return current;
}

/** Normalised rectangular bounds (row/col indices) of the active range. */
function rangeBounds(
  state: SelectionState,
  columns: ColumnDef<any>[],
  rowIds: string[],
): { minRow: number; maxRow: number; minCol: number; maxCol: number } | null {
  const range = state.range;
  if (!range) return null;
  const colFields = columns.map((c) => c.field);
  const anchorRow = rowIds.indexOf(range.anchor.rowId);
  const focusRow = rowIds.indexOf(range.focus.rowId);
  const anchorCol = colFields.indexOf(range.anchor.field);
  const focusCol = colFields.indexOf(range.focus.field);
  return {
    minRow: Math.min(anchorRow, focusRow),
    maxRow: Math.max(anchorRow, focusRow),
    minCol: Math.min(anchorCol, focusCol),
    maxCol: Math.max(anchorCol, focusCol),
  };
}

// Reverse direction helper — used by the symmetry property.
const REVERSE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a bounded grid + a starting anchor cell. The grid is at least
 * 3×3 so every property has room to step in at least one direction without
 * hitting a boundary trivially.
 */
const setupArb = fc
  .tuple(
    fc.integer({ min: 3, max: 12 }), // numRows
    fc.integer({ min: 3, max: 8 }), //  numCols
  )
  .chain(([numRows, numCols]) =>
    fc.record({
      numRows: fc.constant(numRows),
      numCols: fc.constant(numCols),
      anchorRow: fc.integer({ min: 0, max: numRows - 1 }),
      anchorCol: fc.integer({ min: 0, max: numCols - 1 }),
    }),
  );

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('range-extend — property-based invariants', () => {
  // -------------------------------------------------------------------------
  // Property 1 — idempotence under reverse-then-extend
  //
  // Extending N cells in a direction, collapsing back to the anchor, and
  // extending N cells again must yield the same range as the direct
  // extend. The collapse step models the "anchor + focus back on the
  // anchor" recovery path that Ctrl+click uses; the property asserts that
  // the extension operation has no hidden state beyond (anchor, focus).
  // -------------------------------------------------------------------------
  it('idempotent: extend(N) === collapse-then-extend(N)', () => {
    fc.assert(
      fc.property(
        setupArb,
        fc.constantFrom(...DIRECTIONS),
        fc.integer({ min: 1, max: 6 }),
        ({ numRows, numCols, anchorRow, anchorCol }, direction, steps) => {
          const columns = makeColumns(numCols);
          const rowIds = makeRowIds(numRows);
          const anchor: CellAddress = {
            rowId: rowIds[anchorRow]!,
            field: columns[anchorCol]!.field,
          };

          // Direct extend N cells in one go.
          const direct = pressShiftArrow(
            selectCell(createSelection('range'), anchor),
            direction,
            steps,
            columns,
            rowIds,
          );

          // Collapse back to the anchor, then extend again.
          const collapsed = selectCell(direct, anchor);
          const reExtended = pressShiftArrow(
            collapsed,
            direction,
            steps,
            columns,
            rowIds,
          );

          const a = rangeBounds(direct, columns, rowIds);
          const b = rangeBounds(reExtended, columns, rowIds);
          if (a === null || b === null) return false;
          return (
            a.minRow === b.minRow &&
            a.maxRow === b.maxRow &&
            a.minCol === b.minCol &&
            a.maxCol === b.maxCol
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 2 — anchor invariance
  //
  // The anchor cell must always remain inside the output range no matter
  // how many times extend is called and in which direction. The anchor is
  // one corner of the rectangular selection and must stay covered.
  // -------------------------------------------------------------------------
  it('anchor invariance: anchor cell stays inside the range across any extension sequence', () => {
    fc.assert(
      fc.property(
        setupArb,
        fc.array(
          fc.tuple(
            fc.constantFrom(...DIRECTIONS),
            fc.integer({ min: 1, max: 4 }),
          ),
          { minLength: 1, maxLength: 10 },
        ),
        ({ numRows, numCols, anchorRow, anchorCol }, moves) => {
          const columns = makeColumns(numCols);
          const rowIds = makeRowIds(numRows);
          const anchor: CellAddress = {
            rowId: rowIds[anchorRow]!,
            field: columns[anchorCol]!.field,
          };

          let state = selectCell(createSelection('range'), anchor);
          for (const [dir, n] of moves) {
            state = pressShiftArrow(state, dir, n, columns, rowIds);
            if (!state.range) return false;
            // Anchor never moves.
            if (
              state.range.anchor.rowId !== anchor.rowId ||
              state.range.anchor.field !== anchor.field
            ) {
              return false;
            }
            // Anchor always inside the normalised range rectangle.
            if (!isCellInRange(anchor, state.range, columns, rowIds)) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 3 — bounds clamping
  //
  // Extending far past the grid boundary (up to 2× the grid dimension)
  // must never produce a range whose focus is out of range. The
  // `use-keyboard.ts` hook refuses to call `extendTo` when `getNextCell`
  // returns `null`, so the range must clamp at the edge.
  // -------------------------------------------------------------------------
  it('bounds clamping: extending past the grid boundary never produces out-of-range cells', () => {
    fc.assert(
      fc.property(
        setupArb,
        fc.constantFrom(...DIRECTIONS),
        ({ numRows, numCols, anchorRow, anchorCol }, direction) => {
          const columns = makeColumns(numCols);
          const rowIds = makeRowIds(numRows);
          const anchor: CellAddress = {
            rowId: rowIds[anchorRow]!,
            field: columns[anchorCol]!.field,
          };

          // Press Shift+<dir> 2× the grid extent — guaranteed to over-run
          // the boundary from any starting position.
          const over = 2 * Math.max(numRows, numCols);
          const final = pressShiftArrow(
            selectCell(createSelection('range'), anchor),
            direction,
            over,
            columns,
            rowIds,
          );

          const bounds = rangeBounds(final, columns, rowIds);
          if (bounds === null) return false;

          // No negative / out-of-range indices.
          if (
            bounds.minRow < 0 ||
            bounds.maxRow >= numRows ||
            bounds.minCol < 0 ||
            bounds.maxCol >= numCols
          ) {
            return false;
          }

          // The focus must pin to the grid edge in the direction of travel
          // (since we ran past the boundary).
          const focus = final.range?.focus;
          if (!focus) return false;
          const focusRow = rowIds.indexOf(focus.rowId);
          const focusCol = columns.findIndex((c) => c.field === focus.field);

          switch (direction) {
            case 'up':
              return focusRow === 0;
            case 'down':
              return focusRow === numRows - 1;
            case 'left':
              return focusCol === 0;
            case 'right':
              return focusCol === numCols - 1;
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 4 — symmetry
  //
  // Extending left-N from the anchor then right-N must return to the
  // single-cell (anchor-only) range — provided no boundary was hit along
  // the way. Same for up/down. The guard condition is that the anchor is
  // at least N cells away from the edge in both the forward and reverse
  // direction, so no clamping occurs.
  // -------------------------------------------------------------------------
  it('symmetry: extend(N) then extend-reverse(N) returns to the original range (when no boundary is hit)', () => {
    fc.assert(
      fc.property(
        setupArb,
        fc.constantFrom(...DIRECTIONS),
        fc.integer({ min: 1, max: 3 }),
        ({ numRows, numCols, anchorRow, anchorCol }, direction, nRaw) => {
          const columns = makeColumns(numCols);
          const rowIds = makeRowIds(numRows);

          // Cap N so there is at least N cells of headroom in `direction`
          // from some interior anchor position — otherwise the anchor
          // clamp below has nothing to pick and symmetry is vacuously
          // impossible. With minimum grid size 3, `maxN` is at least 1.
          const maxHeadroom =
            direction === 'up' || direction === 'down' ? numRows - 1 : numCols - 1;
          const n = Math.min(nRaw, maxHeadroom);

          // Constrain the anchor so N steps in `direction` (and back) stays
          // inside the grid — symmetry only holds in the interior.
          let ar = anchorRow;
          let ac = anchorCol;
          if (direction === 'up') ar = Math.min(Math.max(ar, n), numRows - 1);
          if (direction === 'down') ar = Math.max(Math.min(ar, numRows - 1 - n), 0);
          if (direction === 'left') ac = Math.min(Math.max(ac, n), numCols - 1);
          if (direction === 'right') ac = Math.max(Math.min(ac, numCols - 1 - n), 0);

          const anchor: CellAddress = {
            rowId: rowIds[ar]!,
            field: columns[ac]!.field,
          };

          const start = selectCell(createSelection('range'), anchor);
          const out = pressShiftArrow(start, direction, n, columns, rowIds);
          const back = pressShiftArrow(
            out,
            REVERSE[direction],
            n,
            columns,
            rowIds,
          );

          // Back to a single-cell range rooted at the anchor.
          const bounds = rangeBounds(back, columns, rowIds);
          if (bounds === null) return false;
          return (
            bounds.minRow === ar &&
            bounds.maxRow === ar &&
            bounds.minCol === ac &&
            bounds.maxCol === ac
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
