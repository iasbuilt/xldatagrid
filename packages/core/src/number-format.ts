/**
 * Excel-style number formatting primitives for the datagrid.
 *
 * Provides a small discriminated union — {@link NumberFormatSpec} — that
 * encodes the most common Excel format presets (currency, percentage,
 * accounting, scientific, thousands-separator, fixed-decimals) along with a
 * single entry point, {@link formatNumber}, that resolves a raw value into a
 * locale-aware display string via `Intl.NumberFormat`.
 *
 * The functions are pure: they take a value + spec and return a string.
 * They never touch React, never read column state, and are exhaustively
 * testable in isolation.
 *
 * @module number-format
 */

/**
 * Discriminated union of the supported Excel-style format presets.
 *
 * - `'thousands'` — locale-grouped integer/decimal (e.g. `1,234,567`).
 *   This shorthand string is preserved for backwards compatibility with the
 *   pre-discriminated `format: 'thousands'` API surface.
 * - `{ kind: 'currency'; currency: string; locale?: string }` — currency
 *   formatting via `Intl.NumberFormat` (e.g. `$1,234.56`, `€1.234,56`).
 * - `{ kind: 'percent'; decimals?: number }` — percent formatting.
 *   The value is treated as a ratio (`0.25` → `25%`) per the Excel convention.
 * - `{ kind: 'accounting' }` — accounting format: currency-style with parens
 *   around negatives (defaults to USD if `currency` is omitted).
 * - `{ kind: 'scientific' }` — scientific notation (e.g. `1.23E+5`).
 * - `{ kind: 'fixed'; decimals: number }` — fixed decimal count, no grouping.
 *
 * An optional `locale` field is honoured on every object form; when omitted
 * the runtime's default locale is used.
 */
export type NumberFormatSpec =
  | 'thousands'
  | { kind: 'currency'; currency: string; locale?: string }
  | { kind: 'percent'; decimals?: number; locale?: string }
  | { kind: 'accounting'; currency?: string; locale?: string }
  | { kind: 'scientific'; decimals?: number; locale?: string }
  | { kind: 'fixed'; decimals: number; locale?: string };

/**
 * Type-guard distinguishing a {@link NumberFormatSpec} object from a plain
 * format string (e.g. legacy `'YYYY-MM-DD'` masks on calendar columns).
 *
 * Returns `true` for the shorthand `'thousands'` literal and for any object
 * carrying a recognised `kind`.
 */
export function isNumberFormatSpec(value: unknown): value is NumberFormatSpec {
  if (value === 'thousands') return true;
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === 'currency' ||
    kind === 'percent' ||
    kind === 'accounting' ||
    kind === 'scientific' ||
    kind === 'fixed'
  );
}

/**
 * Coerces an arbitrary cell value to a finite number.
 *
 * Returns `null` for nullish / empty-string / non-finite inputs so the caller
 * can short-circuit to a friendly empty-cell display.
 */
function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formats a numeric value into a display string using the given spec.
 *
 * Returns `''` for nullish, empty-string, or non-finite inputs so cells render
 * blank rather than showing `NaN`. When `spec` is `undefined`, the value is
 * rendered with a plain `String()` conversion (no grouping, no decimals
 * coercion) — matching the pre-existing default for numeric columns.
 *
 * @param value - The raw cell value to format.
 * @param spec  - The format spec; see {@link NumberFormatSpec}.
 * @returns The formatted string, or `''` when the value is empty/not numeric.
 *
 * @example
 * ```ts
 * formatNumber(1234567, 'thousands');                        // → "1,234,567"
 * formatNumber(19.99, { kind: 'currency', currency: 'USD' }); // → "$19.99"
 * formatNumber(0.25, { kind: 'percent', decimals: 1 });       // → "25.0%"
 * formatNumber(-1000, { kind: 'accounting' });               // → "($1,000.00)"
 * formatNumber(123_456, { kind: 'scientific', decimals: 2 }); // → "1.23E5"
 * formatNumber(3.14159, { kind: 'fixed', decimals: 2 });      // → "3.14"
 * ```
 */
export function formatNumber(value: unknown, spec: NumberFormatSpec | undefined): string {
  const num = toFiniteNumber(value);
  if (num === null) return '';

  if (spec === undefined) return String(num);

  if (spec === 'thousands') {
    return new Intl.NumberFormat().format(num);
  }

  switch (spec.kind) {
    case 'currency':
      return new Intl.NumberFormat(spec.locale, {
        style: 'currency',
        currency: spec.currency,
      }).format(num);

    case 'percent': {
      const decimals = spec.decimals ?? 0;
      return new Intl.NumberFormat(spec.locale, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);
    }

    case 'accounting': {
      const currency = spec.currency ?? 'USD';
      return new Intl.NumberFormat(spec.locale, {
        style: 'currency',
        currency,
        currencySign: 'accounting',
      }).format(num);
    }

    case 'scientific': {
      const decimals = spec.decimals ?? 2;
      // `Intl.NumberFormat` does not expose a native `style: 'scientific'`;
      // `Number.prototype.toExponential` is the cross-engine canonical path.
      // Normalise the exponent separator to upper-case `E` to match Excel.
      return num.toExponential(decimals).replace('e', 'E').replace('E+', 'E');
    }

    case 'fixed':
      return new Intl.NumberFormat(spec.locale, {
        useGrouping: false,
        minimumFractionDigits: spec.decimals,
        maximumFractionDigits: spec.decimals,
      }).format(num);
  }
}

/**
 * Describes a dual-unit sub-cell rendered below the primary value.
 *
 * When set on a numeric column, the cell renders the primary (stored) value
 * on the first line and a smaller, derived secondary line below it (e.g.
 * `"100 kg / 220.46 lb"`). Edit mode shows only the primary input; the
 * secondary line is presentation-only and recomputes on every render.
 *
 * - `label`      — short unit label appended to the converted value
 *                  (e.g. `"lb"`, `"°F"`, `"mi"`).
 * - `conversion` — pure function mapping the primary numeric value to the
 *                  secondary unit. Called with the raw `number`; nullish
 *                  primaries skip the secondary line entirely.
 * - `format`     — optional spec controlling how the converted value is
 *                  rendered (defaults to a plain `String()` conversion).
 */
export interface SecondaryUnitSpec {
  /** Short label for the secondary unit, appended after the value. */
  label: string;
  /** Pure function converting the primary value to the secondary unit. */
  conversion: (value: number) => number;
  /** Optional format spec for the converted secondary value. */
  format?: NumberFormatSpec;
}
