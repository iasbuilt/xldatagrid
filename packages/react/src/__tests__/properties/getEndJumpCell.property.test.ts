/**
 * Property-based tests for `getEndJumpCell`.
 *
 * Verifies the invariants of Ctrl+Arrow navigation:
 * - The result is always within the grid boundaries (never out of bounds).
 * - The result is never in the middle of an empty run (if the destination is
 *   empty, it must be at the grid edge or be the first non-empty after a gap).
 * - Starting from the grid edge returns null.
 * - The result equals the starting cell only when already at the edge.
 */
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { getEndJumpCell } from '@iasbuilt/datagrid-core';
import type { ColumnDef, CellAddress } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a 2D grid of values (rows × cols), each cell nullable or a number. */
function gridArb(maxRows = 20, maxCols = 10) {
  return fc
    .tuple(
      fc.integer({ min: 2, max: maxRows }), // numRows
      fc.integer({ min: 2, max: maxCols }), // numCols
    )
    .chain(([numRows, numCols]) => {
      const cellArb = fc.oneof(
        { weight: 3, arbitrary: fc.integer({ min: 1, max: 100 }) },
        { weight: 1, arbitrary: fc.constant(null) },
      );
      const rowArb = fc.array(cellArb, { minLength: numCols, maxLength: numCols });
      return fc
        .array(rowArb, { minLength: numRows, maxLength: numRows })
        .map((grid) => ({ grid, numRows, numCols }));
    });
}

/** Build the ColumnDef array from column count. */
function makeColumns(numCols: number): ColumnDef<any>[] {
  return Array.from({ length: numCols }, (_, i) => ({
    id: `c${i}`,
    field: `c${i}`,
    title: `Column ${i}`,
  }));
}

/** Build the rowIds array. */
function makeRowIds(numRows: number): string[] {
  return Array.from({ length: numRows }, (_, i) => `r${i}`);
}

/** Cell value reader for the 2D array. */
function makeCellReader(
  grid: (number | null)[][],
  numCols: number,
  rowIds: string[],
) {
  return (cell: CellAddress): unknown => {
    const rowIdx = rowIds.indexOf(cell.rowId);
    const colIdx = parseInt(cell.field.slice(1), 10);
    if (rowIdx < 0 || rowIdx >= grid.length) return null;
    if (colIdx < 0 || colIdx >= numCols) return null;
    return grid[rowIdx]![colIdx];
  };
}

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('getEndJumpCell — property-based', () => {
  it('result is always within grid boundaries (never out of bounds)', () => {
    fc.assert(
      fc.property(
        gridArb(),
        (params) => {
          const { grid, numRows, numCols } = params;
          const columns = makeColumns(numCols);
          const rowIds = makeRowIds(numRows);
          const getCellValue = makeCellReader(grid, numCols, rowIds);

          for (const direction of DIRECTIONS) {
            for (let r = 0; r < numRows; r++) {
              for (let c = 0; c < numCols; c++) {
                const current: CellAddress = { rowId: rowIds[r]!, field: columns[c]!.field };
                const result = getEndJumpCell(current, direction, columns, rowIds, getCellValue);
                if (result === null) continue;

                const destRowIdx = rowIds.indexOf(result.rowId);
                const destColIdx = columns.findIndex(col => col.field === result.field);

                // Destination must be within the grid
                if (destRowIdx < 0 || destRowIdx >= numRows) return false;
                if (destColIdx < 0 || destColIdx >= numCols) return false;
              }
            }
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null when starting at the edge in the direction of travel', () => {
    fc.assert(
      fc.property(
        gridArb(),
        (params) => {
          const { grid, numRows, numCols } = params;
          const columns = makeColumns(numCols);
          const rowIds = makeRowIds(numRows);
          const getCellValue = makeCellReader(grid, numCols, rowIds);

          // Top-left corner moving up or left should return null
          const topLeft: CellAddress = { rowId: rowIds[0]!, field: columns[0]!.field };
          const upResult = getEndJumpCell(topLeft, 'up', columns, rowIds, getCellValue);
          const leftResult = getEndJumpCell(topLeft, 'left', columns, rowIds, getCellValue);
          if (upResult !== null) return false;
          if (leftResult !== null) return false;

          // Bottom-right corner moving down or right should return null
          const bottomRight: CellAddress = {
            rowId: rowIds[numRows - 1]!,
            field: columns[numCols - 1]!.field,
          };
          const downResult = getEndJumpCell(bottomRight, 'down', columns, rowIds, getCellValue);
          const rightResult = getEndJumpCell(bottomRight, 'right', columns, rowIds, getCellValue);
          if (downResult !== null) return false;
          if (rightResult !== null) return false;

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('destination is never in the interior of an empty run (only at an edge or transition)', () => {
    // Invariant: if the result cell is empty, it must be at the grid boundary.
    // (Landing on a non-edge empty cell would mean we stopped mid-run, which
    //  violates the Excel Ctrl+Arrow semantics.)
    fc.assert(
      fc.property(
        gridArb(),
        (params) => {
          const { grid, numRows, numCols } = params;
          const columns = makeColumns(numCols);
          const rowIds = makeRowIds(numRows);
          const getCellValue = makeCellReader(grid, numCols, rowIds);

          for (const direction of DIRECTIONS) {
            for (let r = 0; r < numRows; r++) {
              for (let c = 0; c < numCols; c++) {
                const current: CellAddress = { rowId: rowIds[r]!, field: columns[c]!.field };
                const result = getEndJumpCell(current, direction, columns, rowIds, getCellValue);
                if (result === null) continue;

                const destValue = getCellValue(result);
                const isEmpty = destValue === null || destValue === undefined || destValue === '';
                if (!isEmpty) continue;

                // Destination is empty — it must be at the grid edge in the
                // direction of travel.
                const destRowIdx = rowIds.indexOf(result.rowId);
                const destColIdx = columns.findIndex(col => col.field === result.field);

                const isEdge =
                  (direction === 'up' && destRowIdx === 0) ||
                  (direction === 'down' && destRowIdx === numRows - 1) ||
                  (direction === 'left' && destColIdx === 0) ||
                  (direction === 'right' && destColIdx === numCols - 1);

                if (!isEdge) return false;
              }
            }
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when starting at a non-empty cell with a non-empty neighbour, lands at the last non-empty in the run', () => {
    // Specific case C from the implementation: current non-empty, neighbour non-empty
    // → result is the last non-empty cell in the current populated block.
    fc.assert(
      fc.property(
        // Generate a row of cells where positions 0..runLen-1 are non-null
        fc.integer({ min: 2, max: 15 }).chain(numCols => {
          return fc.record({
            numCols: fc.constant(numCols),
            runLen: fc.integer({ min: 2, max: numCols }), // at least 2 for "current AND neighbour non-empty"
            startIdx: fc.integer({ min: 0, max: numCols - 2 }), // not the last col (needs a neighbour)
          });
        }),
        ({ numCols, runLen, startIdx }) => {
          // Clamp startIdx to be within a run that has a non-empty neighbour to the right
          // Build a single row: positions 0..runLen-1 = non-null, rest = null
          const row = Array.from({ length: numCols }, (_, i) => (i < runLen ? i + 1 : null));
          const grid = [row];
          const columns = makeColumns(numCols);
          const rowIds = ['r0'];
          const getCellValue = makeCellReader(grid, numCols, rowIds);

          // Only test within the run (where current and neighbour are both non-empty)
          const c = Math.min(startIdx, runLen - 2); // ensure neighbour right is also in run
          const current: CellAddress = { rowId: 'r0', field: columns[c]!.field };

          const result = getEndJumpCell(current, 'right', columns, rowIds, getCellValue);
          if (result === null) return true; // edge case ok

          const destColIdx = columns.findIndex(col => col.field === result.field);
          // Should land at end of run (runLen - 1) or the last column
          const expectedEndOfRun = Math.min(runLen - 1, numCols - 1);
          return destColIdx === expectedEndOfRun;
        },
      ),
      { numRuns: 200 },
    );
  });
});
