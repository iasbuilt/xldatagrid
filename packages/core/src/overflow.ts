/**
 * Cell text overflow policies and helpers.
 *
 * This module defines the framework-agnostic vocabulary used by the grid to
 * decide how cell text is rendered when the value is wider than the column.
 * Rendering adapters (notably `@iasbuilt/datagrid-react`) consume these types
 * and helpers to drive CSS class selection, reveal-mechanism wiring, and
 * density-aware row heights.
 *
 * @module overflow
 */

/** Display strategy applied to a column's cells when text exceeds width. */
export type OverflowPolicy =
  | 'truncate-end'      // single line, trailing ellipsis
  | 'truncate-middle'   // single line, ellipsis in the middle (preserves prefix + suffix)
  | 'clamp-2'           // wrap up to 2 lines then ellipsis
  | 'clamp-3'           // wrap up to 3 lines then ellipsis
  | 'wrap'              // full wrap, row grows to fit
  | 'reveal-only';      // compact placeholder; full text shown via reveal mechanism

/** Grid density mode controlling row height + clamp eligibility. */
export type Density = 'compact' | 'comfortable';

/**
 * Rich-text-specific overflow modes (issue #96).
 *
 * Rich-text cells (`cellType: 'richText'`) render Markdown via
 * `react-markdown` and so cannot reuse the plain-text `OverflowPolicy`
 * vocabulary verbatim — clamping a markdown block by `-webkit-line-clamp`
 * works, but `truncate-middle` doesn't compose with marked-up content.
 * Issue #96 narrows the rich-text vocabulary to the three modes users
 * actually asked for:
 *
 *   - `'truncate'` — current behaviour; clip the rendered markdown at the
 *     cell width and render a trailing ellipsis. Single-line, fixed row
 *     height.
 *   - `'wrap'`    — let the rendered markdown wrap to multiple lines; the
 *     cell grows vertically and the effective row height becomes
 *     `max(rowHeight, contentHeight)`.
 *   - `'fit'`     — scale the rendered font-size down (within a sensible
 *     minimum) until the content fits the available width without
 *     truncation. Driven by a `ResizeObserver` + a CSS variable so the
 *     scaling re-runs whenever the cell width or content changes.
 */
export type RichTextOverflowMode = 'truncate' | 'wrap' | 'fit';

/**
 * The default rich-text overflow mode applied when a column omits
 * `richTextOverflow`. Matches the pre-#96 behaviour so existing grids
 * upgrade with zero visual diff.
 */
export const DEFAULT_RICH_TEXT_OVERFLOW: RichTextOverflowMode = 'truncate';

/**
 * Minimum font-size (px) that the `'fit'` mode will scale the rendered
 * markdown down to. Below this floor the content is allowed to overflow /
 * clip instead, so cells with extreme content never produce unreadable
 * 4-pixel text.
 */
export const RICH_TEXT_FIT_MIN_FONT_PX = 9;

/**
 * Returns the effective rich-text overflow mode for a column-like value
 * carrying an optional `richTextOverflow` field. Falls back to
 * {@link DEFAULT_RICH_TEXT_OVERFLOW} when omitted.
 *
 * Accepts a structural argument (not the full `ColumnDef`) so the helper
 * lives in `@iasbuilt/datagrid-core` without taking a circular dep on
 * higher-level packages and so unit tests can exercise the resolution
 * without constructing a full grid column.
 */
export function resolveRichTextOverflow(
  source?: { richTextOverflow?: RichTextOverflowMode | undefined } | null,
): RichTextOverflowMode {
  const v = source?.richTextOverflow;
  if (v === 'truncate' || v === 'wrap' || v === 'fit') return v;
  return DEFAULT_RICH_TEXT_OVERFLOW;
}

const ELLIPSIS = '\u2026';

/**
 * Returns a string of at most `maxChars` characters with the middle replaced
 * by an ellipsis when the input is too long. Preserves the leading and
 * trailing fragments so identifier-like strings (paths, serials, filenames)
 * remain recognisable. Splits the visible budget evenly between prefix and
 * suffix; the ellipsis itself counts toward `maxChars`.
 *
 * Returns the input unchanged when it already fits or when `maxChars < 2`.
 */
export function truncateMiddle(text: string, maxChars: number): string {
  if (text == null) return '';
  if (maxChars < 2 || text.length <= maxChars) return text;
  const budget = maxChars - 1; // 1 char for ELLIPSIS
  const head = Math.ceil(budget / 2);
  const tail = Math.floor(budget / 2);
  return text.slice(0, head) + ELLIPSIS + text.slice(text.length - tail);
}

/**
 * Returns a string of at most `maxChars` characters with a trailing ellipsis
 * when the input is too long. Single counterpart to {@link truncateMiddle};
 * the ellipsis itself counts toward `maxChars`.
 *
 * Returns the input unchanged when it already fits or when `maxChars < 2`.
 */
export function truncateEnd(text: string, maxChars: number): string {
  if (text == null) return '';
  if (maxChars < 2 || text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + ELLIPSIS;
}

/**
 * Spec-driven default overflow policy per column field name. The grid uses
 * this when a column omits an explicit `overflow` declaration. Identifier-,
 * path-, and filename-like fields prefer middle truncation; description-like
 * fields use clamp-2; everything else falls back to single-line end truncation.
 */
export function getDefaultOverflowPolicy(field?: string): OverflowPolicy {
  if (!field) return 'truncate-end';
  switch (field) {
    case 'asset_tag':
    case 'serial_number':
    case 'location_path':
    case 'file_name':
    case 'file_path':
      return 'truncate-middle';
    case 'description':
    case 'work_order_summary':
    case 'notes':
      return 'clamp-2';
    default:
      return 'truncate-end';
  }
}
