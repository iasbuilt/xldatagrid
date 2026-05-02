/**
 * Read-only Jotai atoms that compute cached projections from the primitive
 * {@link BaseAtoms}. Because Jotai memoises derived atom values until a
 * dependency changes, these atoms act as an efficient caching layer: the grid
 * only re-renders when the filtered/sorted data or visible column set actually
 * differs from the previous computation.
 *
 * @module derived-atoms
 */
import { atom, type Atom } from 'jotai/vanilla';
import type { ColumnDef, RowKeyResolver } from '@iasbuilt/datagrid-core';
import { applyFiltering, applySorting, getVisibleColumns } from '@iasbuilt/datagrid-core';
import type { BaseAtoms } from './base-atoms';

/**
 * Shape of the read-only atom bundle produced by {@link createDerivedAtoms}.
 *
 * Each member is a Jotai `Atom<T>` (no write capability). Values are
 * recomputed lazily whenever an upstream base atom changes.
 *
 * @typeParam TData - Row data type for the grid. Defaults to a generic record.
 */
export interface DerivedAtoms<TData = Record<string, unknown>> {
  /** Rows after filtering and sorting have been applied. */
  processedDataAtom: Atom<TData[]>;
  /** Stable array of row keys derived from the current data set. */
  rowIdsAtom: Atom<string[]>;
  /** Column definitions restricted to those currently marked visible. */
  visibleColumnsAtom: Atom<ColumnDef<TData>[]>;
  /** Per-column resolved widths (explicit, column default, or 150px fallback). */
  columnWidthsAtom: Atom<{ field: string; width: number }[]>;
}

/**
 * Build the set of read-only derived atoms that project base-atom state into
 * shapes consumed directly by grid UI components.
 *
 * Filtering is applied first, then sorting, so sort comparisons only run over
 * rows that passed all active filters.
 *
 * @typeParam TData - Row data type constrained to a string-keyed record.
 * @param baseAtoms - The primitive atom bundle to derive from.
 * @param resolveRowKey - Callback that extracts a stable unique key from a row,
 *   used to build the `rowIdsAtom` projection.
 * @returns A {@link DerivedAtoms} bundle of memoised, read-only atoms.
 *
 * @example
 * ```ts
 * const derived = createDerivedAtoms(baseAtoms, (row) => row.id);
 * const rows = store.get(derived.processedDataAtom); // filtered + sorted
 * ```
 */
export function createDerivedAtoms<TData extends Record<string, unknown>>(
  baseAtoms: BaseAtoms<TData>,
  resolveRowKey: RowKeyResolver<TData>,
): DerivedAtoms<TData> {
  /**
   * Processed data pipeline: filter first, then sort. The atom subscribes to
   * dataAtom, filterAtom, and sortAtom, so any change to raw data, active
   * filters, or sort descriptors triggers a recomputation.
   */
  const processedDataAtom = atom<TData[]>((get) => {
    const data = get(baseAtoms.dataAtom);
    const filter = get(baseAtoms.filterAtom);
    const sort = get(baseAtoms.sortAtom);

    // Apply filtering before sorting so the comparator only processes
    // rows that satisfy all active filter predicates.
    const filtered = applyFiltering(data as Record<string, unknown>[] as TData[], filter);
    return applySorting(filtered as Record<string, unknown>[] as TData[], sort);
  });

  /**
   * Maps every row in the raw (unfiltered) data array to its stable key.
   * Components that need a row identity list (e.g. selection, virtualisation)
   * subscribe here instead of recomputing keys themselves.
   */
  const rowIdsAtom = atom<string[]>((get) => {
    const data = get(baseAtoms.dataAtom);
    return data.map(resolveRowKey);
  });

  /**
   * Filters the full column state down to only the columns marked visible.
   * Subscribes to columnsAtom so toggling visibility triggers a re-derive.
   */
  const visibleColumnsAtom = atom<ColumnDef<TData>[]>((get) => {
    const columns = get(baseAtoms.columnsAtom);
    return getVisibleColumns(columns) as ColumnDef<TData>[];
  });

  /**
   * Resolves each visible column's effective pixel width by checking, in
   * order: an explicit width override in `columns.widths`, the column
   * definition's own `width` property, and finally a 150px default.
   */
  const columnWidthsAtom = atom<{ field: string; width: number }[]>((get) => {
    const columns = get(baseAtoms.columnsAtom);
    const visible = getVisibleColumns(columns);
    return visible.map((c) => ({
      field: c.field,
      width: columns.widths[c.field] ?? c.width ?? 150,
    }));
  });

  return {
    processedDataAtom,
    rowIdsAtom,
    visibleColumnsAtom,
    columnWidthsAtom,
  };
}
