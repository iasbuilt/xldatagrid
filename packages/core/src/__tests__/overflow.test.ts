/**
 * Red-phase contracts for the cell text overflow helpers.
 *
 * Specification (Phase B will add `packages/core/src/overflow.ts`):
 *
 *   1. `truncateMiddle(text, maxChars)` leaves strings shorter than or equal to
 *      `maxChars` untouched. When longer, it produces a string of length
 *      exactly `maxChars` that preserves the original's first and last
 *      characters and inserts the Unicode horizontal ellipsis (U+2026)
 *      somewhere in the middle. Example:
 *        truncateMiddle('C:\\Users\\rom\\very\\long\\path\\file.txt', 20)
 *          => 'C:\\Users\\rom\\…\\file.txt'
 *
 *   2. `getDefaultOverflowPolicy(field?)` maps well-known DAM/CMMS fields to
 *      an OverflowPolicy:
 *        asset_name, location_name, manufacturer, model, status
 *          => 'truncate-end'
 *        asset_tag, serial_number, location_path, file_name, file_path
 *          => 'truncate-middle'
 *        description, work_order_summary, notes
 *          => 'clamp-2'
 *        anything else (or no argument)
 *          => 'truncate-end'
 *
 * These tests are expected to FAIL until Phase B lands the helpers — the
 * assertion errors pin the public contract before any production code exists.
 */
// @ts-expect-error — Phase B will add `overflow.ts` and re-export these.
import { truncateMiddle, getDefaultOverflowPolicy } from '@iasbuilt/datagrid-core';
import {
  resolveRichTextOverflow,
  DEFAULT_RICH_TEXT_OVERFLOW,
  RICH_TEXT_FIT_MIN_FONT_PX,
} from '@iasbuilt/datagrid-core';

describe('truncateMiddle', () => {
  it('returns the input untouched when it already fits within maxChars', () => {
    const out = truncateMiddle('short', 100);
    expect(out).toBe('short');
  });

  it('returns the input untouched when length equals maxChars exactly', () => {
    const out = truncateMiddle('exactly8', 8);
    expect(out).toBe('exactly8');
  });

  it('returns a string of length exactly maxChars when the input is longer', () => {
    const out = truncateMiddle('verylongstring', 8);
    expect(out).toHaveLength(8);
  });

  it('inserts a U+2026 ellipsis character in the truncated output', () => {
    const out = truncateMiddle('verylongstring', 8);
    expect(out).toContain('\u2026');
  });

  it('preserves the first character of the original string', () => {
    const src = 'verylongstring';
    const out = truncateMiddle(src, 8);
    expect(out.charAt(0)).toBe(src.charAt(0));
  });

  it('preserves the last character of the original string', () => {
    const src = 'verylongstring';
    const out = truncateMiddle(src, 8);
    expect(out.charAt(out.length - 1)).toBe(src.charAt(src.length - 1));
  });

  it('produces the documented result for the Windows path example', () => {
    const out = truncateMiddle('C:\\Users\\rom\\very\\long\\path\\file.txt', 20);
    // Starts with the path root, ends with the file name, ellipsis in between.
    expect(out.startsWith('C:\\Users')).toBe(true);
    expect(out.endsWith('file.txt')).toBe(true);
    expect(out).toContain('\u2026');
    expect(out).toHaveLength(20);
  });
});

describe('getDefaultOverflowPolicy', () => {
  it('maps asset_name to truncate-end', () => {
    expect(getDefaultOverflowPolicy('asset_name')).toBe('truncate-end');
  });

  it('maps serial_number to truncate-middle', () => {
    expect(getDefaultOverflowPolicy('serial_number')).toBe('truncate-middle');
  });

  it('maps file_path to truncate-middle', () => {
    expect(getDefaultOverflowPolicy('file_path')).toBe('truncate-middle');
  });

  it('maps description to clamp-2', () => {
    expect(getDefaultOverflowPolicy('description')).toBe('clamp-2');
  });

  it('maps notes to clamp-2', () => {
    expect(getDefaultOverflowPolicy('notes')).toBe('clamp-2');
  });

  it('falls back to truncate-end for unknown fields', () => {
    expect(getDefaultOverflowPolicy('unknown_field')).toBe('truncate-end');
  });

  it('falls back to truncate-end when called with no argument', () => {
    expect(getDefaultOverflowPolicy()).toBe('truncate-end');
  });
});

// ---------------------------------------------------------------------------
// resolveRichTextOverflow — issue #96
//
// Rich-text cells take a narrower overflow vocabulary than plain-text cells
// (`truncate | wrap | fit`) because `truncate-middle` and the clamp-N
// variants don't compose with marked-up content. The resolver maps a
// column-like input onto one of those three modes, falling back to
// `truncate` when the column omits the field.
// ---------------------------------------------------------------------------

describe('resolveRichTextOverflow (issue #96)', () => {
  it('defaults to truncate when the source is undefined', () => {
    expect(resolveRichTextOverflow(undefined)).toBe('truncate');
  });

  it('defaults to truncate when the source is null', () => {
    expect(resolveRichTextOverflow(null)).toBe('truncate');
  });

  it('defaults to truncate when richTextOverflow is omitted', () => {
    expect(resolveRichTextOverflow({})).toBe('truncate');
  });

  it('returns truncate when richTextOverflow is explicitly truncate', () => {
    expect(resolveRichTextOverflow({ richTextOverflow: 'truncate' })).toBe(
      'truncate',
    );
  });

  it('returns wrap when richTextOverflow is wrap', () => {
    expect(resolveRichTextOverflow({ richTextOverflow: 'wrap' })).toBe('wrap');
  });

  it('returns fit when richTextOverflow is fit', () => {
    expect(resolveRichTextOverflow({ richTextOverflow: 'fit' })).toBe('fit');
  });

  it('ignores unknown string values and falls back to the default mode', () => {
    // Cast through `unknown` so the test exercises the runtime guard even
    // though the type system would normally reject the value.
    expect(
      resolveRichTextOverflow({
        richTextOverflow: 'banana' as unknown as 'wrap',
      }),
    ).toBe('truncate');
  });

  it('exposes the documented DEFAULT_RICH_TEXT_OVERFLOW constant', () => {
    expect(DEFAULT_RICH_TEXT_OVERFLOW).toBe('truncate');
  });

  it('keeps the fit-mode font-size floor at the documented minimum (9px)', () => {
    expect(RICH_TEXT_FIT_MIN_FONT_PX).toBe(9);
  });
});
