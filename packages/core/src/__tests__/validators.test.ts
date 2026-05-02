/**
 * Unit tests for the new multi-validator API in core.
 *
 * Contracts guarded by this file (ALL expected to fail today — the implementation
 * does not yet exist; see PLAN for the validation-tooltip subsystem):
 *
 *   1.  A `Validator<TData>` shape exists with the form
 *         `{ name?: string; run: (value, ctx) => ValidationResult | null }`.
 *
 *   2.  `runValidators(value, validators, ctx)` runs every validator in the
 *       array sequentially and returns a `ValidationResult[]` in declaration
 *       order. Null/"clean" results are skipped. An empty input array or an
 *       all-null run both produce an empty array (no synthetic "clean"
 *       sentinel).
 *
 *   3.  `mostSevere(results)` picks the highest-severity entry in the array
 *       using the ordering `error > warning > info`. Ties break on earliest
 *       declaration order. Returns `null` when the array is empty.
 *
 *   4.  Multi-severity runs keep every entry so the UI layer can render the
 *       full list in the tooltip while the most-severe result drives aria /
 *       border styling.
 *
 * This is the pure-core contract for the validators subsystem. The React
 * layer's tooltip rendering is tested separately in
 * `packages/react/src/__tests__/validation-tooltip.test.tsx`.
 *
 * The tests import from `@iasbuilt/datagrid-core` directly so the test
 * doubles as a public-API smoke check: the new symbols must be re-exported
 * from the package barrel.
 */

import {
  runValidators,
  mostSevere,
  // The type is imported for compile-time shape assertions below.
  type Validator,
  type ValidationResult,
  type CellValue,
} from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Type-shape fixtures (enforced at type-check time; no runtime assertion).
// ---------------------------------------------------------------------------

// Helper: if the `Validator` type shape drifts, this constant fails to compile.
// It accepts both the minimal and the fully annotated form.
type Row = { id: string; name: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _minimalValidator: Validator<Row> = {
  run: (value) => (value == null ? { message: 'required', severity: 'error' } : null),
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _namedValidator: Validator<Row> = {
  name: 'required',
  run: (value, ctx) => {
    // `ctx` should expose at least the row + field being validated.
    void ctx;
    return value == null ? { message: 'required', severity: 'error' } : null;
  },
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const row: Row = { id: 'r1', name: 'Alice' };
const ctx = { row, rowId: 'r1', field: 'name' } as const;

function required(): Validator<Row> {
  return {
    name: 'required',
    run: (value: CellValue): ValidationResult | null =>
      value == null || String(value).trim() === ''
        ? { message: 'Required', severity: 'error' }
        : null,
  };
}

function minLength(n: number): Validator<Row> {
  return {
    name: `minLength(${n})`,
    run: (value: CellValue): ValidationResult | null =>
      value != null && String(value).length < n
        ? { message: `Min length ${n}`, severity: 'error' }
        : null,
  };
}

function softAdvice(): Validator<Row> {
  return {
    name: 'softAdvice',
    run: (): ValidationResult | null => ({ message: 'FYI', severity: 'info' }),
  };
}

function warnOnDigits(): Validator<Row> {
  return {
    name: 'warnOnDigits',
    run: (value: CellValue): ValidationResult | null =>
      value != null && /\d/.test(String(value))
        ? { message: 'Contains digits', severity: 'warning' }
        : null,
  };
}

// ---------------------------------------------------------------------------
// runValidators
// ---------------------------------------------------------------------------

describe('runValidators', () => {
  it('returns an empty array for an empty validator list', () => {
    const results = runValidators('anything', [], ctx);
    expect(results).toEqual([]);
  });

  it('returns an empty array when every validator returns null', () => {
    const results = runValidators('Alice', [required(), minLength(2)], ctx);
    expect(results).toEqual([]);
  });

  it('returns one result when a single validator fails', () => {
    const results = runValidators('', [required()], ctx);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ message: 'Required', severity: 'error' });
  });

  it('preserves declaration order and keeps every non-null result', () => {
    // required fails → minLength(3) also fails → warnOnDigits passes (no digits).
    const results = runValidators('', [required(), minLength(3), warnOnDigits()], ctx);
    expect(results).toHaveLength(2);
    expect(results[0]!.message).toBe('Required');
    expect(results[1]!.message).toBe('Min length 3');
  });

  it('keeps mixed-severity results in declaration order (error, warning, info)', () => {
    const results = runValidators('a1', [required(), warnOnDigits(), softAdvice()], ctx);
    // required passes on 'a1'; warnOnDigits → warning; softAdvice → info.
    expect(results.map((r) => r.severity)).toEqual(['warning', 'info']);
    expect(results.map((r) => r.message)).toEqual(['Contains digits', 'FYI']);
  });

  it('skips validators whose run() returns null without affecting ordering', () => {
    // required passes, minLength(5) fails, warnOnDigits passes → one entry.
    const results = runValidators('abc', [required(), minLength(5), warnOnDigits()], ctx);
    expect(results).toHaveLength(1);
    expect(results[0]!.message).toBe('Min length 5');
  });

  it('passes the context object through to each validator', () => {
    const spy = vi.fn().mockReturnValue(null);
    const v: Validator<Row> = { name: 'spy', run: spy };
    runValidators('x', [v], ctx);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('x', ctx);
  });
});

// ---------------------------------------------------------------------------
// mostSevere
// ---------------------------------------------------------------------------

describe('mostSevere', () => {
  it('returns null for an empty result set', () => {
    expect(mostSevere([])).toBeNull();
  });

  it('returns the sole entry when only one result exists', () => {
    const r: ValidationResult = { message: 'x', severity: 'warning' };
    expect(mostSevere([r])).toBe(r);
  });

  it('picks error over warning and info', () => {
    const info: ValidationResult = { message: 'i', severity: 'info' };
    const warn: ValidationResult = { message: 'w', severity: 'warning' };
    const err: ValidationResult = { message: 'e', severity: 'error' };
    expect(mostSevere([info, warn, err])).toBe(err);
    expect(mostSevere([err, warn, info])).toBe(err);
    expect(mostSevere([warn, err])).toBe(err);
  });

  it('picks warning over info', () => {
    const info: ValidationResult = { message: 'i', severity: 'info' };
    const warn: ValidationResult = { message: 'w', severity: 'warning' };
    expect(mostSevere([info, warn])).toBe(warn);
    expect(mostSevere([warn, info])).toBe(warn);
  });

  it('breaks ties on declaration order (first wins)', () => {
    const a: ValidationResult = { message: 'first', severity: 'error' };
    const b: ValidationResult = { message: 'second', severity: 'error' };
    expect(mostSevere([a, b])).toBe(a);
  });
});
