/**
 * Stories exercising the Excel-style number-format presets and the
 * optional dual-unit sub-cell introduced for issue #92.
 *
 * The `Presets` story exposes one numeric column per supported preset so
 * the corresponding e2e (`e2e/issue-92-number-format-presets.spec.ts`)
 * can assert each one renders correctly via `Intl.NumberFormat`. The
 * `SecondaryUnit` story exposes a single editable `weight_kg` column with
 * a `lb` dual-unit sub-cell so the e2e can verify both the initial render
 * and the post-edit recomputation.
 */
import React, { useState, useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Number Format',
};
export default meta;

// ---------------------------------------------------------------------------
// Sample data — one row covers every preset; positive + negative values let
// the e2e exercise the accounting parens path.
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  thousands: number;
  currency: number;
  percent: number;
  accounting: number;
  scientific: number;
  fixed: number;
}

const rows: Row[] = [
  { id: '1', thousands: 1234567, currency: 1234.5, percent: 0.25, accounting: -1000, scientific: 123456, fixed: 3.14159 },
  { id: '2', thousands: 42, currency: 19.99, percent: 0.125, accounting: 250, scientific: 0.000123, fixed: 2.71828 },
];

const presetColumns: ColumnDef<Row>[] = [
  { id: 'thousands', field: 'thousands', title: 'Thousands', width: 140, cellType: 'numeric', editable: true, format: 'thousands' },
  { id: 'currency', field: 'currency', title: 'Currency (USD)', width: 160, cellType: 'numeric', editable: true, format: { kind: 'currency', currency: 'USD', locale: 'en-US' } },
  { id: 'percent', field: 'percent', title: 'Percent (1 dp)', width: 140, cellType: 'numeric', editable: true, format: { kind: 'percent', decimals: 1, locale: 'en-US' } },
  { id: 'accounting', field: 'accounting', title: 'Accounting', width: 160, cellType: 'numeric', editable: true, format: { kind: 'accounting', currency: 'USD', locale: 'en-US' } },
  { id: 'scientific', field: 'scientific', title: 'Scientific', width: 140, cellType: 'numeric', editable: true, format: { kind: 'scientific', decimals: 2 } },
  { id: 'fixed', field: 'fixed', title: 'Fixed (3 dp)', width: 140, cellType: 'numeric', editable: true, format: { kind: 'fixed', decimals: 3, locale: 'en-US' } },
];

export const Presets: StoryObj = {
  render: () => {
    const [data, setData] = useState<Row[]>(rows);
    const columns = useMemo(() => presetColumns, []);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Excel-style number format presets</h2>
        <p style={styles.subtitle}>
          One column per preset. Double-click a cell to edit; the new value
          re-renders through <code>Intl.NumberFormat</code>.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={columns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onCellEdit={(rowId, field, value) => {
              setData((prev) =>
                prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)),
              );
            }}
          />
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Dual-unit sub-cell — `weight_kg` with a derived `lb` second line.
// ---------------------------------------------------------------------------

interface WeightRow {
  id: string;
  weight_kg: number;
}

const weightRows: WeightRow[] = [
  { id: '1', weight_kg: 100 },
  { id: '2', weight_kg: 50 },
];

const weightColumns: ColumnDef<WeightRow>[] = [
  {
    id: 'weight_kg',
    field: 'weight_kg',
    title: 'Weight (kg)',
    width: 200,
    cellType: 'numeric',
    editable: true,
    format: { kind: 'fixed', decimals: 1, locale: 'en-US' },
    secondaryUnit: {
      label: 'lb',
      // 1 kg = 2.20462 lb. Pure function — runs on every render.
      conversion: (kg) => kg * 2.20462,
      format: { kind: 'fixed', decimals: 2, locale: 'en-US' },
    },
  },
];

export const SecondaryUnit: StoryObj = {
  name: 'Dual-unit sub-cell',
  render: () => {
    const [data, setData] = useState<WeightRow[]>(weightRows);
    const columns = useMemo(() => weightColumns, []);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Dual-unit sub-cell</h2>
        <p style={styles.subtitle}>
          A <code>weight_kg</code> column with a derived <code>lb</code>
          second line. Edit the primary value — the secondary line
          recomputes automatically.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={columns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onCellEdit={(rowId, field, value) => {
              setData((prev) =>
                prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)),
              );
            }}
          />
        </div>
      </div>
    );
  },
};
