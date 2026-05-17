/**
 * Unit tests for the Excel-style number-format helpers introduced for
 * issue #92. The helpers in `packages/core/src/number-format.ts` are pure
 * — they take a value + spec and return a string — so we cover the entire
 * preset matrix here without React, DOM, or grid state.
 *
 * Locale-formatted strings vary by host environment. Each assertion is
 * cross-checked against a freshly constructed `Intl.NumberFormat` instance
 * configured with the same options so the test is robust across Node /
 * browser locales, while still pinning the structural expectations
 * (sign placement, decimals, grouping, exponent separator).
 */
import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  isNumberFormatSpec,
  type NumberFormatSpec,
} from '../number-format';

describe('isNumberFormatSpec', () => {
  it('recognises the "thousands" shorthand', () => {
    expect(isNumberFormatSpec('thousands')).toBe(true);
  });
  it('recognises every preset kind object', () => {
    expect(isNumberFormatSpec({ kind: 'currency', currency: 'USD' })).toBe(true);
    expect(isNumberFormatSpec({ kind: 'percent' })).toBe(true);
    expect(isNumberFormatSpec({ kind: 'accounting' })).toBe(true);
    expect(isNumberFormatSpec({ kind: 'scientific' })).toBe(true);
    expect(isNumberFormatSpec({ kind: 'fixed', decimals: 2 })).toBe(true);
  });
  it('rejects unrelated strings and arbitrary objects', () => {
    expect(isNumberFormatSpec('USD')).toBe(false);
    expect(isNumberFormatSpec('YYYY-MM-DD')).toBe(false);
    expect(isNumberFormatSpec({ foo: 'bar' })).toBe(false);
    expect(isNumberFormatSpec(null)).toBe(false);
    expect(isNumberFormatSpec(undefined)).toBe(false);
    expect(isNumberFormatSpec(42)).toBe(false);
  });
});

describe('formatNumber', () => {
  describe('empty / non-numeric inputs', () => {
    it('returns "" for null, undefined, empty string, and NaN', () => {
      expect(formatNumber(null, 'thousands')).toBe('');
      expect(formatNumber(undefined, 'thousands')).toBe('');
      expect(formatNumber('', 'thousands')).toBe('');
      expect(formatNumber(NaN, 'thousands')).toBe('');
      expect(formatNumber('not-a-number', 'thousands')).toBe('');
    });
    it('returns "" for infinities', () => {
      expect(formatNumber(Infinity, 'thousands')).toBe('');
      expect(formatNumber(-Infinity, 'thousands')).toBe('');
    });
  });

  describe('no spec', () => {
    it('falls back to plain String() conversion', () => {
      expect(formatNumber(1234567, undefined)).toBe('1234567');
      expect(formatNumber(-12.5, undefined)).toBe('-12.5');
    });
  });

  describe('thousands shorthand', () => {
    it('matches the default Intl.NumberFormat output', () => {
      const expected = new Intl.NumberFormat().format(1234567);
      expect(formatNumber(1234567, 'thousands')).toBe(expected);
    });
  });

  describe('currency', () => {
    it('matches Intl.NumberFormat currency output (USD)', () => {
      const spec: NumberFormatSpec = { kind: 'currency', currency: 'USD', locale: 'en-US' };
      const expected = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(1234.5);
      expect(formatNumber(1234.5, spec)).toBe(expected);
    });
    it('matches Intl.NumberFormat currency output (EUR / de-DE)', () => {
      const spec: NumberFormatSpec = { kind: 'currency', currency: 'EUR', locale: 'de-DE' };
      const expected = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.5);
      expect(formatNumber(1234.5, spec)).toBe(expected);
    });
  });

  describe('percent', () => {
    it('treats the value as a ratio (0.25 → 25%)', () => {
      const expected = new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(0.25);
      expect(formatNumber(0.25, { kind: 'percent', locale: 'en-US' })).toBe(expected);
    });
    it('honours the `decimals` option', () => {
      const expected = new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(0.12345);
      expect(formatNumber(0.12345, { kind: 'percent', decimals: 2, locale: 'en-US' })).toBe(expected);
    });
  });

  describe('accounting', () => {
    it('wraps negatives in accounting parens', () => {
      const out = formatNumber(-1000, { kind: 'accounting', currency: 'USD', locale: 'en-US' });
      expect(out).toMatch(/\(.*1,000.*\)/);
    });
    it('formats positives like a regular currency', () => {
      const expected = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        currencySign: 'accounting',
      }).format(1000);
      expect(formatNumber(1000, { kind: 'accounting', currency: 'USD', locale: 'en-US' })).toBe(expected);
    });
    it('defaults to USD when currency is omitted', () => {
      const out = formatNumber(1000, { kind: 'accounting', locale: 'en-US' });
      expect(out).toContain('$');
    });
  });

  describe('scientific', () => {
    it('uses uppercase E exponent separator', () => {
      const out = formatNumber(123456, { kind: 'scientific', decimals: 2 });
      expect(out).toMatch(/^1\.23E5$/);
    });
    it('honours the decimals option', () => {
      expect(formatNumber(0.000123, { kind: 'scientific', decimals: 3 })).toBe('1.230E-4');
    });
    it('defaults to 2 decimals', () => {
      expect(formatNumber(50000, { kind: 'scientific' })).toBe('5.00E4');
    });
  });

  describe('fixed', () => {
    it('renders the requested decimal count with no grouping', () => {
      expect(formatNumber(3.14159, { kind: 'fixed', decimals: 2, locale: 'en-US' })).toBe('3.14');
      expect(formatNumber(1234.5, { kind: 'fixed', decimals: 0, locale: 'en-US' })).toBe('1235');
    });
    it('pads with trailing zeros when needed', () => {
      expect(formatNumber(5, { kind: 'fixed', decimals: 3, locale: 'en-US' })).toBe('5.000');
    });
  });
});
