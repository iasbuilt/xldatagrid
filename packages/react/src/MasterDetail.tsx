/**
 * Master-detail grid component module.
 *
 * Wraps the standard DataGrid to add expandable detail panels beneath each
 * master row. Supports single- or multi-expand modes, lazy-loading of detail
 * data with a built-in cache keyed to master-row state, keyboard-driven
 * expand/collapse, and pluggable detail-panel rendering via a consumer-supplied
 * React component.
 *
 * @module MasterDetail
 */
import React, { useCallback, useEffect, useState } from 'react';
import { DataGridProps } from './DataGrid';
import * as styles from './MasterDetail.styles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link MasterDetail} component.
 *
 * Extends all standard `DataGridProps` with additional detail-panel options
 * such as the component to render inside the expanded panel, expansion mode,
 * lazy-fetch callback, and lifecycle hooks.
 *
 * @typeParam TData - Shape of each master-row data object.
 */
export interface MasterDetailProps<TData extends Record<string, unknown> = Record<string, unknown>>
  extends DataGridProps<TData> {
  /** Component rendered as the detail panel for an expanded row */
  detailComponent: React.ComponentType<DetailComponentProps<TData>>;
  /** Whether only one row can be expanded at a time (default: false) */
  singleExpand?: boolean;
  /** Fixed height for detail panels; if omitted the panel sizes to content */
  detailHeight?: number;
  /** Called when a row is expanded */
  onDetailExpand?: (row: TData) => void;
  /** Called when a row is collapsed */
  onDetailCollapse?: (row: TData) => void;
  /** Lazy-load function: called on expand to fetch detail data */
  fetchDetail?: (row: TData) => Promise<unknown>;
  /** Called when the master row's data changes to invalidate the detail cache */
  detailCacheKey?: (row: TData) => string;
}

/**
 * Props received by the consumer-provided detail-panel component.
 *
 * @typeParam TData - Shape of the master-row data.
 */
export interface DetailComponentProps<TData = Record<string, unknown>> {
  /** The master-row data that this detail panel belongs to. */
  masterRow: TData;
  /** Resolved detail payload returned by `fetchDetail`, or `undefined` when not yet loaded. */
  detailData?: unknown;
  /** `true` while the detail data is being fetched via `fetchDetail`. */
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a master-detail grid where each row can be expanded to reveal a
 * consumer-defined detail panel.
 *
 * The component prepends an expand-toggle column, manages expansion state
 * (optionally limited to one row at a time via `singleExpand`), and integrates
 * an async `fetchDetail` pipeline with a `detailCacheKey`-based invalidation
 * strategy. The detail panel is focused automatically after expansion for
 * keyboard accessibility.
 *
 * @typeParam TData - Shape of each master-row data object.
 * @param props - Combined DataGrid and master-detail configuration.
 * @returns A composite grid element with expandable detail rows.
 *
 * @example
 * ```tsx
 * <MasterDetail
 *   data={orders}
 *   columns={orderColumns}
 *   rowKey="orderId"
 *   detailComponent={OrderLineItems}
 *   fetchDetail={(row) => api.getLineItems(row.orderId)}
 *   singleExpand
 * />
 * ```
 */
export function MasterDetail<TData extends Record<string, unknown>>(
  props: MasterDetailProps<TData>,
) {
  const {
    detailComponent: DetailComponent,
    singleExpand = false,
    detailHeight,
    onDetailExpand,
    onDetailCollapse,
    fetchDetail,
    detailCacheKey,
    rowHeight = 36,
    headerHeight = 40,
    columns: propColumns,
    data,
    rowKey,
    onSortChange,
    onFilterChange: _onFilterChange,
    // `_rest` collects the remaining DataGrid props but the wrapper never
    // forwards them today — the inner DataGrid is rendered by the host. Kept
    // to document the prop contract even though it's unused at runtime.
    ...rest
  } = props;
  void rest;

  // Normalise rowKey into a function form for consistent usage
  const resolveRowKey = typeof rowKey === 'function'
    ? rowKey
    : (row: TData) => String(row[rowKey as keyof TData]);

  // Track which rows are currently expanded
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  // Cache fetched detail data keyed by rowId, with a secondary cacheKey for invalidation
  const [detailCache, setDetailCache] = useState<Map<string, { data: unknown; cacheKey: string }>>(new Map());
  // Track rows whose detail data is currently being fetched
  const [loadingRows, setLoadingRows] = useState<Set<string>>(new Set());

  // Synthesise a narrow non-interactive column for the expand/collapse toggle icon
  const expandColumn = {
    id: '__expand',
    field: '__expand',
    title: '',
    width: 40,
    sortable: false,
    filterable: false,
    editable: false,
    resizable: false,
  };

  const allColumns = [expandColumn, ...propColumns];

  // Toggle a row's expansion state: collapse if expanded, expand if collapsed.
  // In singleExpand mode, all other rows are collapsed first.
  // Triggers lazy-fetch when the cache is missing or stale.
  const toggleExpand = useCallback((rowId: string, row: TData) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
        onDetailCollapse?.(row);
      } else {
        if (singleExpand) {
          // Collapse all others
          for (const id of next) {
            if (id !== rowId) {
              const collapsedRow = data.find(r => resolveRowKey(r) === id);
              if (collapsedRow) onDetailCollapse?.(collapsedRow);
            }
          }
          next.clear();
        }
        next.add(rowId);
        onDetailExpand?.(row);

        // Lazy load
        if (fetchDetail) {
          const currentCacheKey = detailCacheKey?.(row) ?? rowId;
          const cached = detailCache.get(rowId);
          if (!cached || cached.cacheKey !== currentCacheKey) {
            setLoadingRows(prev2 => new Set(prev2).add(rowId));
            fetchDetail(row).then(result => {
              setDetailCache(prev2 => {
                const next2 = new Map(prev2);
                next2.set(rowId, { data: result, cacheKey: currentCacheKey });
                return next2;
              });
              setLoadingRows(prev2 => {
                const next2 = new Set(prev2);
                next2.delete(rowId);
                return next2;
              });
            });
          }
        }
      }
      return next;
    });
  }, [singleExpand, onDetailExpand, onDetailCollapse, fetchDetail, detailCacheKey, detailCache, data, resolveRowKey]);

  // Invalidate stale detail-cache entries when the master row's cacheKey changes
  useEffect(() => {
    if (!detailCacheKey) return;
    setDetailCache(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const row of data) {
        const rowId = resolveRowKey(row);
        const cached = next.get(rowId);
        if (cached) {
          const currentKey = detailCacheKey(row);
          if (cached.cacheKey !== currentKey) {
            next.delete(rowId);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [data, detailCacheKey, resolveRowKey]);

  // Allow Enter key on a focused master row to toggle its detail panel
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      const rowEl = target.closest('[data-row-id]');
      if (rowEl) {
        const rowId = rowEl.getAttribute('data-row-id');
        if (rowId) {
          const row = data.find(r => resolveRowKey(r) === rowId);
          if (row) {
            toggleExpand(rowId, row);
          }
        }
      }
    }
  }, [data, resolveRowKey, toggleExpand]);

  return (
    <div
      className="iasbuilt-master-detail"
      style={styles.container}
      role="grid"
      aria-rowcount={data.length}
      aria-colcount={allColumns.length}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Header */}
      <div style={styles.headerRow(headerHeight)} role="row">
        {allColumns.map((col, idx) => (
          <div
            key={col.id}
            style={styles.headerCell(col.width ?? 150)}
            role="columnheader"
            aria-colindex={idx + 1}
          >
            {col.title}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div style={styles.rowsContainer}>
        {data.map((row, rowIdx) => {
          const rowId = resolveRowKey(row);
          const isExpanded = expandedRows.has(rowId);
          const isLoading = loadingRows.has(rowId);
          const cached = detailCache.get(rowId);

          return (
            <React.Fragment key={rowId}>
              {/* Master row */}
              <div
                style={styles.masterRow(rowHeight)}
                role="row"
                aria-rowindex={rowIdx + 2}
                data-row-id={rowId}
                data-row-header="true"
              >
                {/* Expand icon cell */}
                <div
                  style={styles.expandIconCell(expandColumn.width)}
                  role="gridcell"
                  data-field="__expand"
                  data-row-id={rowId}
                  onClick={() => toggleExpand(rowId, row)}
                  aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                  data-testid={`expand-icon-${rowId}`}
                >
                  <span className="expand-icon" style={styles.expandIcon}>
                    {isExpanded ? '\u25BC' : '\u25B6'}
                  </span>
                </div>

                {/* Data cells */}
                {propColumns.map((col, colIdx) => (
                  <div
                    key={col.field}
                    style={styles.dataCell(col.width ?? 150)}
                    role="gridcell"
                    aria-colindex={colIdx + 2}
                    data-field={col.field}
                    data-row-id={rowId}
                  >
                    <span style={styles.cellText}>
                      {row[col.field as keyof TData] != null ? String(row[col.field as keyof TData]) : ''}
                    </span>
                  </div>
                ))}
              </div>

              {/* Detail panel */}
              {isExpanded && (
                <div
                  className="detail-panel"
                  data-testid={`detail-panel-${rowId}`}
                  style={styles.detailPanel(detailHeight)}
                  tabIndex={-1}
                  ref={(el) => {
                    // Focus the panel after expand
                    if (el) {
                      requestAnimationFrame(() => el.focus());
                    }
                  }}
                >
                  {isLoading ? (
                    <div className="detail-loading" data-testid={`detail-loading-${rowId}`} style={styles.detailLoading}>
                      <span className="spinner" role="status" aria-label="Loading">Loading...</span>
                    </div>
                  ) : (
                    <DetailComponent
                      masterRow={row}
                      detailData={cached?.data}
                      loading={false}
                    />
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
