/**
 * Compile-time regression fixture for the ColumnDef validation API migration.
 *
 * The legacy single-validator field `ColumnDef.validate?: (value) =>
 * ValidationResult | null` is being REMOVED as part of the validation-tooltip
 * subsystem rollout. The replacement is `ColumnDef.validators?: Validator[]`.
 * This repository is pre-release, so there are no compatibility shims — once
 * the field is gone from `ColumnDef`, supplying `validate` must be a hard
 * TypeScript error.
 *
 * This file is a type-level fixture: it is compiled by the same `tsc` /
 * Vitest type-check pipeline as the other tests, and the `@ts-expect-error`
 * directive below only holds once the old field is actually gone. If someone
 * re-introduces `validate` on `ColumnDef`, this fixture fails to compile with
 *
 *   "Unused '@ts-expect-error' directive."
 *
 * making the regression obvious. A runtime assertion is attached so the
 * fixture also participates in the test run (and is visibly red today: the
 * `@ts-expect-error` fires because `validate` *is* still present, producing a
 * "used but was unexpected" diagnostic flipping the meaning).
 */

import type { ColumnDef, Validator } from '@iasbuilt/datagrid-core';

type Row = { id: string; name: string };

const legacyColumn: ColumnDef<Row> = {
  id: 'name',
  field: 'name',
  title: 'Name',
  // @ts-expect-error — `validate` has been removed; use `validators` instead.
  validate: (value) => (value == null ? { message: 'x', severity: 'error' } : null),
};

// The new surface: `validators` is an array of `Validator<Row>`.
const modernColumn: ColumnDef<Row> = {
  id: 'name',
  field: 'name',
  title: 'Name',
  validators: [
    {
      name: 'required',
      run: (value) =>
        value == null || String(value).trim() === ''
          ? { message: 'Required', severity: 'error' }
          : null,
    } satisfies Validator<Row>,
  ],
};

// Light runtime assertion so Vitest discovers this as an actual test file.
describe('ColumnDef legacy `validate` field removal', () => {
  it('modern ColumnDef accepts `validators` array', () => {
    expect(modernColumn.validators).toBeDefined();
    expect(Array.isArray(modernColumn.validators)).toBe(true);
  });

  it('legacy fixture references a ColumnDef (compile-time guarded)', () => {
    expect(legacyColumn.id).toBe('name');
  });
});
