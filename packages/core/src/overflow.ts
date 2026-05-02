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
