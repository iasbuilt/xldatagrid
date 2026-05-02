/**
 * Virtualization hook for efficiently rendering large grids.
 *
 * Observes the container element's dimensions via `ResizeObserver` and tracks
 * scroll position, then delegates to the core `calculateVisibleRows` and
 * `calculateVisibleColumns` functions to determine which row and column
 * slices are currently within the viewport. Only these visible slices need
 * to be rendered, keeping DOM node count constant regardless of dataset size.
 *
 * When virtualization is disabled, the returned ranges span the entire data
 * set so the component renders everything without any windowing.
 *
 * @module use-virtualization
 */
import { useState, useCallback, useEffect } from 'react';
import { calculateVisibleRows, calculateVisibleColumns, VirtualRange } from '@iasbuilt/datagrid-core';

/**
 * Snapshot of the current virtualization window, including the visible row
 * and column ranges and the current scroll offsets.
 */
export interface VirtualizationState {
  /** The range of row indices currently visible in the viewport. */
  rowRange: VirtualRange;
  /** The range of column indices currently visible in the viewport. */
  colRange: VirtualRange;
  /** Vertical scroll offset in pixels. */
  scrollTop: number;
  /** Horizontal scroll offset in pixels. */
  scrollLeft: number;
}

/**
 * Manages viewport-aware row and column windowing for a scrollable grid container.
 *
 * Attaches a `ResizeObserver` to the container ref to track viewport
 * dimensions, stores scroll offsets on every scroll event, and computes the
 * visible row/column ranges on each render using the core virtualization
 * utilities.
 *
 * @param opts - Configuration object.
 * @param opts.totalRows - Total number of data rows in the grid.
 * @param opts.rowHeight - Fixed height (in pixels) of each row.
 * @param opts.columns - Array of column descriptors, each carrying a `width`
 *   in pixels, used for horizontal windowing.
 * @param opts.containerRef - React ref pointing to the scrollable container
 *   `<div>`.
 * @param opts.enabled - When `false`, virtualization is bypassed and the
 *   full data range is returned. Defaults to `true`.
 *
 * @returns An object containing the visible `rowRange`, `colRange`, a
 *   `handleScroll` callback to wire onto the container's `onScroll`,
 *   the raw `scrollTop`/`scrollLeft` values, and the measured `viewportSize`.
 *
 * @example
 * ```tsx
 * const { rowRange, colRange, handleScroll } = useVirtualization({
 *   totalRows: data.length,
 *   rowHeight: 32,
 *   columns: visibleColumns.map(c => ({ width: c.width ?? 100 })),
 *   containerRef,
 * });
 * return (
 *   <div ref={containerRef} onScroll={handleScroll} style={{ overflow: 'auto' }}>
 *     {renderRows(rowRange, colRange)}
 *   </div>
 * );
 * ```
 */
export function useVirtualization(opts: {
  totalRows: number;
  rowHeight: number;
  columns: { width: number }[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  enabled?: boolean;
}) {
  const { totalRows, rowHeight, columns, containerRef, enabled = true } = opts;

  // Track the current scroll offsets so they can feed into range calculations.
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Measured viewport dimensions; defaults are reasonable fallbacks until
  // the ResizeObserver fires its first entry.
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });

  // useEffect is necessary here: ResizeObserver must be attached imperatively
  // after the DOM element mounts, and cleaned up when it unmounts.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Observe the container's content-box size and update state on resize.
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setViewportSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  /**
   * Scroll event handler intended to be passed as the container's `onScroll`
   * prop. Captures the current scroll offsets into React state.
   */
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
    setScrollLeft(target.scrollLeft);
  }, []);

  // Compute the visible row range. When disabled, span the full data set.
  const rowRange = enabled
    ? calculateVisibleRows({ totalRows, rowHeight, viewportHeight: viewportSize.height, scrollTop })
    : { startIndex: 0, endIndex: totalRows - 1, offset: 0, totalSize: totalRows * rowHeight };

  // Compute the visible column range. When disabled, span all columns.
  const colRange = enabled
    ? calculateVisibleColumns({ columns, viewportWidth: viewportSize.width, scrollLeft })
    : { startIndex: 0, endIndex: columns.length - 1, offset: 0, totalSize: columns.reduce((a, c) => a + c.width, 0) };

  return { rowRange, colRange, handleScroll, scrollTop, scrollLeft, viewportSize };
}
