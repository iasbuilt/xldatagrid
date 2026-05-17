/**
 * Inline-style factories consumed by {@link ./DataGridBody}.
 *
 * Each export returns a `React.CSSProperties` object (or is a static one) and
 * is applied via the `style` prop rather than a CSS class. The body
 * intentionally uses inline styles so that per-row values (height, width,
 * offset, frozen-left offset, selection and error state) can be computed at
 * render time without a CSS-in-JS runtime. CSS custom properties
 * (`var(--dg-*)`) are used for all themable tokens so a host application can
 * override colours, spacing and borders via its own stylesheet.
 *
 * Helpers are grouped by concern (scroll container, data cells, group header
 * rows, aggregate rows, data rows, row-number overrides, empty state).
 */
import type { CSSProperties } from 'react';
import type { RowOutlineSides } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Scrollable body
// ---------------------------------------------------------------------------

/** Static style for the outer scroll container that owns the vertical (and
 *  horizontal) scroll. `position: relative` is required so absolutely-
 *  positioned virtualised rows inside {@link virtualizedBodyWrapper} anchor
 *  to it. */
export const scrollableBody: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  position: 'relative',
};

/** Wrapper for the grouped render path. Grouped rendering does not use
 *  virtualisation, so only the total width is fixed; height flows from the
 *  stacked group / aggregate / data rows. */
export const groupedBodyWrapper = (totalWidth: number): CSSProperties => ({
  width: totalWidth,
});

/** Spacer wrapper for the virtualised (non-grouped) render path. Its height
 *  equals `totalSize` from the virtualiser so the scrollbar thumb reflects
 *  the full dataset; individual rows are placed inside via
 *  `position: absolute; top: rowIdx * rowHeight`. */
export const virtualizedBodyWrapper = (
  totalHeight: number,
  totalWidth: number,
): CSSProperties => ({
  height: totalHeight,
  width: totalWidth,
  position: 'relative',
});

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** Style for a single data cell. Encodes fixed width (no flex growth),
 *  selection outline, validation-error border, frozen-column stickiness and
 *  the editable cursor affordance.
 *
 *  `background` is an already-resolved CSS colour (or `null`) that the caller
 *  composes from chrome-column presentation hooks (issue #14) — most notably
 *  the in-grid Shift+Arrow range tint (issue #16) which is now routed through
 *  the same chrome-API plumbing as consumer-supplied row backgrounds rather
 *  than being hard-coded in this factory. Pass `'var(--dg-range-bg, …)'` to
 *  render the range tint, a HEX/rgba value for a consumer-authored colour,
 *  or `null` to keep the cell transparent (so the row container's background
 *  shows through).
 *
 *  The frozen-column background still wins over any supplied `background` so
 *  pinned columns stay legible against a scrolled range.
 */
export const cell = (opts: {
  width: number;
  height: number;
  selected: boolean;
  background?: string | null;
  hasError: boolean;
  frozen: 'left' | 'right' | null;
  frozenLeftOffset: number;
  editable: boolean;
  suppressSelectionOutline?: boolean;
  /**
   * Row-level resting background (used when no per-cell tint applies). Passed
   * by the row renderer so every cell paints a concrete colour and
   * `getComputedStyle().backgroundColor` always resolves — the #70 gutter-
   * vs-data luminance check reads this on every data cell. Defaults to the
   * default row token chain when omitted.
   */
  rowBackground?: string;
}): CSSProperties => {
  const frozenBg = opts.frozen ? 'var(--dg-header-bg, #f8fafc)' : undefined;
  const outlineValue = opts.suppressSelectionOutline
    ? 'none'
    : opts.selected ? '2px solid var(--dg-selection-border, #3b82f6)' : 'none';
  return {
    width: opts.width,
    minWidth: opts.width,
    maxWidth: opts.width,
    height: opts.height,
    display: 'flex',
    alignItems: 'center',
    padding: 'var(--dg-cell-padding, 0 12px)',
    borderRight: '1px solid var(--dg-border-color, #e2e8f0)',
    boxSizing: 'border-box',
    outline: outlineValue,
    outlineOffset: -2,
    overflow: 'hidden',
    cursor: opts.editable ? 'text' : 'default',
    border: opts.hasError ? '2px solid var(--dg-error-color, #ef4444)' : undefined,
    position: opts.frozen ? 'sticky' : 'relative',
    left: opts.frozen === 'left' ? opts.frozenLeftOffset : undefined,
    zIndex: opts.frozen ? 2 : undefined,
    // Precedence: frozen-column background wins so pinned columns stay
    // legible against a scrolled range. A per-cell tint from the chrome API
    // (range highlight, row-selection tint) wins next. The row-level
    // resting background (passed as `rowBackground`) is used when neither
    // higher-priority layer applies — this makes computed-style probes
    // (#70 luminance contract) see a concrete colour. When the caller
    // omits `rowBackground` the cell stays transparent so consumer row
    // colours paint through unchanged (see range/chrome-composition tests).
    background: frozenBg ?? opts.background ?? opts.rowBackground ?? undefined,
  };
};

/** Style for the fallback `<input>` editor used when no custom cell renderer
 *  is configured. Strips the native input chrome so it visually matches the
 *  surrounding cell.
 *
 *  Excel-365 padding parity (issue #65): the input is positioned absolutely
 *  to fill the cell's *border-box* (not the padding-box) so that
 *  `input.getBoundingClientRect().left === cell.getBoundingClientRect().left`.
 *  It then re-applies the same `--dg-cell-padding` token the cell uses, so
 *  the first glyph lands on the exact pixel it occupied in display mode —
 *  the only visible change when edit mode begins is a blinking caret. Font
 *  is inherited so family / size / weight / line-height match the cell. */
export const cellInput: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  border: 'none',
  outline: 'none',
  padding: 'var(--dg-cell-padding, 0 12px)',
  font: 'inherit',
  lineHeight: 'inherit',
  background: 'transparent',
  boxSizing: 'border-box',
};

/** Style for the read-only display span inside a cell; clips with an
 *  ellipsis when the formatted value is wider than the cell. */
export const cellValueText: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** Style for the small inline validation-error label rendered at the bottom
 *  of a cell whose value failed an error-severity validation. */
export const validationError: CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 4,
  fontSize: 10,
  color: 'var(--dg-error-color, #ef4444)',
  whiteSpace: 'nowrap',
};

// ---------------------------------------------------------------------------
// Row group header
// ---------------------------------------------------------------------------

/** Style for a row-group header row. `depth` indents the label to reflect
 *  nesting when multiple group levels are configured. */
export const groupHeaderRow = (opts: {
  height: number;
  totalWidth: number;
  depth: number;
}): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  height: opts.height,
  width: opts.totalWidth,
  borderBottom: '1px solid var(--dg-border-color, #e2e8f0)',
  background: 'var(--dg-header-bg, #f8fafc)',
  paddingLeft: opts.depth * 20 + 8,
  cursor: 'pointer',
  fontWeight: 600,
  boxSizing: 'border-box',
});

/** Style for the expand/collapse triangle glyph inside a group header. */
export const groupExpandIcon: CSSProperties = {
  marginRight: 8,
};

/** Style for the `(N)` group member count shown next to a group header
 *  label. */
export const groupCount: CSSProperties = {
  marginLeft: 8,
  color: '#94a3b8',
};

// ---------------------------------------------------------------------------
// Aggregate row
// ---------------------------------------------------------------------------

/** Style for the aggregate row that follows an expanded group header when
 *  `rowGroupConfig.aggregates` is configured. */
export const groupAggregateRow = (height: number, totalWidth: number): CSSProperties => ({
  display: 'flex',
  height,
  width: totalWidth,
  borderBottom: '1px solid var(--dg-border-color, #e2e8f0)',
  background: 'var(--dg-row-bg-alt, #f1f5f9)',
  fontStyle: 'italic',
});

/** Style for a single cell inside the aggregate row. Mirrors the data-cell
 *  box model (fixed width, right border, padding) but without selection or
 *  error chrome. */
export const aggregateCell = (width: number): CSSProperties => ({
  width,
  minWidth: width,
  maxWidth: width,
  display: 'flex',
  alignItems: 'center',
  padding: 'var(--dg-cell-padding, 0 12px)',
  borderRight: '1px solid var(--dg-border-color, #e2e8f0)',
  boxSizing: 'border-box',
});

// ---------------------------------------------------------------------------
// Data rows
// ---------------------------------------------------------------------------

/**
 * Per-row border override descriptor forwarded from
 * `chrome.getRowBorder`. Fields mirror the public
 * `RowBorderStyle` shape and are applied on top of the row's default border.
 * Kept private to this module so public API stays in `@iasbuilt/datagrid-core`.
 */
export interface RowBorderOverride {
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  width?: number;
  sides?: Array<'top' | 'right' | 'bottom' | 'left'>;
}

/**
 * Computes the per-side border CSS for a {@link RowBorderOverride}. Returns a
 * partial `CSSProperties` object that callers spread onto the row style to
 * override the stock separator. When `sides` is omitted all four edges are
 * painted; the bottom edge intentionally overrides the row's default
 * `borderBottom` so consumers can fully replace the separator.
 */
function rowBorderOverrideStyle(border: RowBorderOverride | null | undefined): CSSProperties {
  if (!border) return {};
  // Normalise the shorthand `border: "<width> <style> <color>"` per side we
  // need. Defaults chosen to mirror the stock row separator so a minimal
  // `{ color: '#f00' }` override still renders.
  const width = border.width ?? 1;
  const style = border.style ?? 'solid';
  const color = border.color ?? 'currentColor';
  const borderShorthand = `${width}px ${style} ${color}`;
  const sides = border.sides ?? ['top', 'right', 'bottom', 'left'];
  const out: CSSProperties = {};
  if (sides.includes('top')) out.borderTop = borderShorthand;
  if (sides.includes('right')) out.borderRight = borderShorthand;
  if (sides.includes('bottom')) out.borderBottom = borderShorthand;
  if (sides.includes('left')) out.borderLeft = borderShorthand;
  return out;
}

/** Style for a data row on the grouped render path. Uses normal flow (no
 *  absolute positioning) since grouped rendering does not virtualise.
 *  `isEven` selects the zebra-striping background token. `background` and
 *  `border`, when provided, win over the default zebra stripe and the row
 *  separator respectively — see `chrome.getRowBackground` and
 *  `chrome.getRowBorder`. `borders` drives a per-side inset box-shadow that
 *  replaces the old all-or-nothing `outline` so contiguous multi-row ranges
 *  can suppress internal horizontal borders. */
export const dataRow = (opts: {
  height: number;
  totalWidth: number;
  isEven: boolean;
  background?: string | null;
  border?: RowBorderOverride | null;
  borders?: RowOutlineSides | null;
}): CSSProperties => {
  const shadowParts = opts.borders ? [
    opts.borders.top    ? 'inset 0 2px 0 0 var(--dg-selection-border, #3b82f6)' : null,
    opts.borders.right  ? 'inset -2px 0 0 0 var(--dg-selection-border, #3b82f6)' : null,
    opts.borders.bottom ? 'inset 0 -2px 0 0 var(--dg-selection-border, #3b82f6)' : null,
    opts.borders.left   ? 'inset 2px 0 0 0 var(--dg-selection-border, #3b82f6)' : null,
  ].filter(Boolean).join(', ') : '';
  return {
    display: 'flex',
    // `position: relative` makes the row a containing block for the
    // absolutely-positioned row-wide drop indicator bar (#68). Adding this
    // unconditionally is harmless — the row's children are all in normal
    // flow (no other absolute descendants depend on a wrapper as their
    // containing block).
    position: 'relative',
    height: opts.height,
    width: opts.totalWidth,
    borderBottom: '1px solid var(--dg-border-color, #e2e8f0)',
    background: opts.background ?? (opts.isEven
      ? 'var(--dg-row-bg, #ffffff)'
      : 'var(--dg-row-bg-alt, #f8fafc)'),
    ...rowBorderOverrideStyle(opts.border),
    ...(shadowParts ? { boxShadow: shadowParts } : {}),
  };
};

/** Style for a data row on the virtualised (non-grouped) render path.
 *  Absolutely positioned at `top` inside the virtualised wrapper so rows
 *  outside `rowRange` can be skipped entirely. `background`/`border`/`borders`
 *  semantics match {@link dataRow}. */
export const virtualizedRow = (opts: {
  height: number;
  totalWidth: number;
  top: number;
  isEven: boolean;
  background?: string | null;
  border?: RowBorderOverride | null;
  borders?: RowOutlineSides | null;
}): CSSProperties => {
  const shadowParts = opts.borders ? [
    opts.borders.top    ? 'inset 0 2px 0 0 var(--dg-selection-border, #3b82f6)' : null,
    opts.borders.right  ? 'inset -2px 0 0 0 var(--dg-selection-border, #3b82f6)' : null,
    opts.borders.bottom ? 'inset 0 -2px 0 0 var(--dg-selection-border, #3b82f6)' : null,
    opts.borders.left   ? 'inset 2px 0 0 0 var(--dg-selection-border, #3b82f6)' : null,
  ].filter(Boolean).join(', ') : '';
  return {
    display: 'flex',
    position: 'absolute',
    top: opts.top,
    height: opts.height,
    width: opts.totalWidth,
    borderBottom: '1px solid var(--dg-border-color, #e2e8f0)',
    background: opts.background ?? (opts.isEven
      ? 'var(--dg-row-bg, #ffffff)'
      : 'var(--dg-row-bg-alt, #f8fafc)'),
    ...rowBorderOverrideStyle(opts.border),
    ...(shadowParts ? { boxShadow: shadowParts } : {}),
  };
};

// ---------------------------------------------------------------------------
// Row number chrome overrides for left (sticky) positioning
// ---------------------------------------------------------------------------

/**
 * Returns style overrides for the row-number cell when it is anchored on the
 * left side of the data cells. Makes the cell `position: sticky` so it remains
 * pinned during horizontal scroll. `stickyLeft` should be `controlsWidth` when
 * the controls column is also pinned-left, otherwise `0`.
 */
export const rowNumberCellLeft = (
  _width: number,
  _height: number,
  stickyLeft: number,
): CSSProperties => ({
  position: 'sticky',
  left: stickyLeft,
  zIndex: 5,
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

/** Style for the "No data" placeholder shown when `processedData` is
 *  empty on the non-grouped render path. */
export const emptyState: CSSProperties = {
  padding: 24,
  textAlign: 'center',
  color: '#94a3b8',
};

// ---------------------------------------------------------------------------
// Sub-grid expansion row
// ---------------------------------------------------------------------------

/**
 * Container for an inline expansion row rendered beneath a parent row when
 * its id is in the model's `expandedSubGrids` set. Spans the full data width
 * so nested grids can size to their own columns without being clipped by the
 * parent row bounds. Uses a subtle background tint to visually group the
 * nested content with its parent row.
 *
 * Indents according to `depth` so stacked levels (level 1 → 2 → 3) visibly
 * nest inside each other.
 */
export const subGridExpansionRow = (opts: {
  totalWidth: number;
  depth: number;
  top?: number;
  absolute?: boolean;
}): CSSProperties => ({
  width: opts.totalWidth,
  boxSizing: 'border-box',
  paddingLeft: 24 + opts.depth * 8,
  paddingRight: 8,
  paddingTop: 6,
  paddingBottom: 6,
  background: 'rgba(148, 163, 184, 0.06)',
  borderBottom: '1px solid var(--dg-border-color, #e2e8f0)',
  borderTop: '1px solid var(--dg-border-color, #e2e8f0)',
  position: opts.absolute ? 'absolute' : 'relative',
  top: opts.absolute && opts.top !== undefined ? opts.top : undefined,
  left: opts.absolute ? 0 : undefined,
});

/** Inner frame around the nested DataGrid so it visually reads as a discrete
 *  embedded grid rather than a bare section of the parent body. */
export const subGridExpansionInner: CSSProperties = {
  border: '1px solid var(--dg-border-color, #e2e8f0)',
  borderRadius: 4,
  overflow: 'hidden',
  background: 'var(--dg-bg-color, #ffffff)',
};
