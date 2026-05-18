/**
 * Sorting module for the datagrid core engine.
 *
 * Provides multi-field, direction-aware sorting of tabular data. Rows are compared
 * using a stable, type-sensitive algorithm that handles nulls, Dates, booleans,
 * numbers, and strings out of the box. Sort state can be cycled through a
 * three-phase toggle (ascending, descending, unsorted) with optional multi-column
 * support.
 *
 * @module sorting
 */

import { SortState, SortDescriptor, CellValue } from './types';

/**
 * Builds a comparator function from the current sort state.
 *
 * The returned comparator evaluates each {@link SortDescriptor} in priority order,
 * short-circuiting as soon as a non-zero comparison is found. Descending descriptors
 * invert the comparison result. When all descriptors compare equally the original
 * array order is preserved (stable sort).
 *
 * @param sort - Ordered list of sort descriptors to evaluate.
 * @returns A comparator suitable for `Array.prototype.sort`.
 *
 * @example
 * ```ts
 * const cmp = createComparator([{ field: 'age', dir: 'desc' }]);
 * const sorted = [...rows].sort(cmp);
 * ```
 */
export function createComparator(sort: SortState): (a: Record<string, unknown>, b: Record<string, unknown>) => number {
  return (a, b) => {
    // Walk descriptors in priority order, returning early on the first decisive comparison
    for (const desc of sort) {
      const result = compareValues(a[desc.field] as CellValue, b[desc.field] as CellValue);
      if (result !== 0) return desc.dir === 'asc' ? result : -result;
    }
    return 0; // stable sort: preserve original order
  };
}

/**
 * Compares two cell values using type-aware ordering rules.
 *
 * Null / undefined values are pushed to the end regardless of type. Typed pairs
 * (Date-Date, boolean-boolean, number-number) use their natural ordering. All
 * remaining values fall back to a case-insensitive string comparison.
 *
 * @param a - Left-hand value.
 * @param b - Right-hand value.
 * @returns Negative if `a` precedes `b`, positive if `b` precedes `a`, zero if equal.
 */
export function compareValues(a: CellValue, b: CellValue): number {
  // nulls/undefined always last
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  // Date comparison
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();

  // Boolean comparison (false before true)
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;

  // Numeric comparison
  if (typeof a === 'number' && typeof b === 'number') return a - b;

  // String comparison (case-insensitive)
  const strA = String(a).toLowerCase();
  const strB = String(b).toLowerCase();
  return strA < strB ? -1 : strA > strB ? 1 : 0;
}

/**
 * Sorts an array of data rows according to the given sort state.
 *
 * A shallow copy of the array is sorted to avoid mutating the original data.
 * If the sort state is empty the original array reference is returned unchanged.
 *
 * @typeParam T - Row type, must extend a string-keyed record.
 * @param data - Source rows to sort.
 * @param sort - Current sort state (may be empty).
 * @returns A new sorted array, or the original array when no sorting is required.
 */
export function applySorting<T extends Record<string, unknown>>(data: T[], sort: SortState): T[] {
  if (!sort.length) return data;
  // Create a shallow copy so the caller's array is never mutated
  return [...data].sort(createComparator(sort));
}

/**
 * Cycles the sort direction for a given field through three phases:
 * **unsorted -> ascending -> descending -> unsorted**.
 *
 * When `multi` is `false` the returned state contains at most one descriptor.
 * When `multi` is `true` the new descriptor is appended to the existing state,
 * allowing multi-column sorting.
 *
 * @param current - The current sort state.
 * @param field - The column field whose sort direction should be toggled.
 * @param multi - Whether to allow multiple simultaneous sort descriptors.
 * @returns A new sort state reflecting the toggled direction.
 *
 * @example
 * ```ts
 * let state = toggleSort([], 'name', false);   // [{ field: 'name', dir: 'asc' }]
 * state = toggleSort(state, 'name', false);     // [{ field: 'name', dir: 'desc' }]
 * state = toggleSort(state, 'name', false);     // []
 * ```
 */
export function toggleSort(current: SortState, field: string, multi: boolean): SortState {
  // The three-state machine: unsorted → asc → desc → unsorted again.
  // Single-column mode collapses other descriptors; multi-column mode
  // preserves them so Excel-style shift-click stacking works.
  // Check if the field already has a sort descriptor
  const existing = current.find(s => s.field === field);
  if (!existing) {
    // Field is unsorted -- add a new ascending descriptor
    const newDesc: SortDescriptor = { field, dir: 'asc' };
    return multi ? [...current, newDesc] : [newDesc];
  }
  if (existing.dir === 'asc') {
    // Flip ascending to descending, preserving all other descriptors
    return current.map(s => s.field === field ? { ...s, dir: 'desc' as const } : s);
  }
  // desc -> remove the descriptor entirely (back to unsorted)
  return current.filter(s => s.field !== field);
}
