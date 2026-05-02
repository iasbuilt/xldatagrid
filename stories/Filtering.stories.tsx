import React, { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import { applyFiltering } from '@iasbuilt/datagrid-core';
import type { FilterState } from '@iasbuilt/datagrid-core';
import { makeEmployees, defaultColumns } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Filtering',
};
export default meta;

export const BasicFiltering: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Filterable Columns</h2>
      <p style={styles.subtitle}>
        Columns with <code>filterable: true</code> show a filter icon in the header. The grid supports 12 filter operators.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(50)}
          columns={defaultColumns as any}
          rowKey="id"
          filtering={{ debounceMs: 200 }}
          sorting
        />
      </div>
    </div>
  ),
};

export const PreAppliedFilter: StoryObj = {
  render: () => {
    const initialFilter: FilterState = {
      logic: 'and',
      filters: [
        { field: 'department', operator: 'eq', value: 'Engineering' },
      ],
    };
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Pre-Applied Filter</h2>
        <p style={styles.subtitle}>
          Grid loads with <code>department = Engineering</code> already applied via <code>initialFilter</code>.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(50)}
            columns={defaultColumns as any}
            rowKey="id"
            filtering
            initialFilter={initialFilter}
            sorting
          />
        </div>
      </div>
    );
  },
};

export const ExcelStyleFilterDropdown: StoryObj = {
  render: () => {
    const rows = useMemo(() => makeEmployees(120), []);
    const [filter, setFilter] = useState<FilterState | null>(null);

    const filteredCount = useMemo(
      () => applyFiltering(rows, filter).length,
      [rows, filter],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Excel-Style Filter Dropdown</h2>
        <p style={styles.subtitle}>
          Click the filter chevron in a column header to open the Excel-365 dropdown.
          Note the fixed section order: <strong>Sort</strong> entries, <strong>Clear Filter</strong>,
          the <strong>Text/Number/Date Filters</strong> submenu, a <strong>search</strong> input,
          the distinct-values <strong>checklist</strong>, and <strong>OK/Cancel</strong> footer.
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            alignSelf: 'flex-start',
            padding: '4px 10px',
            borderRadius: 999,
            background: '#e0f2fe',
            color: '#0369a1',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Showing {filteredCount} of {rows.length} rows
          {filter ? ' (filter active)' : ''}
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={rows}
            columns={defaultColumns as any}
            rowKey="id"
            filtering={{ debounceMs: 200 }}
            sorting
            showFilterMenu
            gridId="filtering-excel-dropdown"
            onFilterChange={setFilter}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Opens the DataGridColumnFilterMenu (Excel 365) when the filter chevron is clicked. ' +
          'The chevron is a real <button aria-haspopup="menu"> for keyboard/a11y support. ' +
          'Distinct values come from useBackgroundIndexer, which is wired up automatically when filtering is enabled.',
      },
    },
  },
};

export const FilterMenu_ValueChecklist: StoryObj = {
  render: () => {
    const rows = useMemo(() => makeEmployees(150), []);
    const [filter, setFilter] = useState<FilterState | null>(null);

    const filteredCount = useMemo(
      () => applyFiltering(rows, filter).length,
      [rows, filter],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Filter Menu — Value Checklist</h2>
        <p style={styles.subtitle}>
          Click the filter chevron on <strong>Department</strong> or <strong>City</strong>.
          Use the search box to narrow the list, toggle <em>(Select All)</em> or individual values,
          then press <strong>OK</strong> to commit an <code>in</code>-operator predicate.
          <strong> Cancel</strong> discards the draft without changing the grid.
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            alignSelf: 'flex-start',
            padding: '4px 10px',
            borderRadius: 999,
            background: '#ecfdf5',
            color: '#047857',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Showing {filteredCount} of {rows.length} rows
          {filter ? ' (value checklist active)' : ''}
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={rows}
            columns={defaultColumns as any}
            rowKey="id"
            filtering={{ debounceMs: 200 }}
            sorting
            showFilterMenu
            gridId="filtering-value-checklist"
            onFilterChange={setFilter}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Showcases the distinct-values checklist inside DataGridColumnFilterMenu. ' +
          'The background indexer produces the list; the search input filters it in real time ' +
          'via case-insensitive substring match. Committing the draft emits a single ' +
          '{ field, operator: "in", value: [...] } descriptor.',
      },
    },
  },
};

export const FilterMenu_CustomConditionDialog: StoryObj = {
  render: () => {
    const rows = useMemo(() => makeEmployees(120), []);
    const [filter, setFilter] = useState<FilterState | null>(null);

    const filteredCount = useMemo(
      () => applyFiltering(rows, filter).length,
      [rows, filter],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Filter Menu — Custom Condition Dialog</h2>
        <p style={styles.subtitle}>
          Open the filter chevron on a numeric column (<strong>Salary</strong> or <strong>Rating</strong>)
          or a date column (<strong>Start Date</strong>) and click
          <strong> Number Filters…</strong> / <strong>Date Filters…</strong>.
          The Excel 365 <em>Custom AutoFilter</em> dialog opens with two clauses joined by And/Or —
          for example <code>salary &gt;= 80000</code> AND <code>salary &lt; 130000</code>.
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            alignSelf: 'flex-start',
            padding: '4px 10px',
            borderRadius: 999,
            background: '#fef3c7',
            color: '#b45309',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Showing {filteredCount} of {rows.length} rows
          {filter ? ' (custom condition active)' : ''}
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={rows}
            columns={defaultColumns as any}
            rowKey="id"
            filtering={{ debounceMs: 200 }}
            sorting
            showFilterMenu
            gridId="filtering-custom-condition"
            onFilterChange={setFilter}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Drives FilterConditionDialog — the two-clause And/Or custom filter modal. ' +
          'Operator lists adapt to the column data type (text/number/date). ' +
          'A valid single clause emits a single-descriptor composite; two valid clauses ' +
          'combine under the And/Or radio. The dialog is modal, traps Tab, and restores focus on close.',
      },
    },
  },
};

export const FilterMenu_InOperator: StoryObj = {
  render: () => {
    const rows = useMemo(() => makeEmployees(150), []);
    // Apply an `in` filter imperatively via initialFilter. This is exactly the
    // descriptor shape the Excel menu's value checklist produces on OK.
    const initialFilter: FilterState = {
      logic: 'and',
      filters: [
        {
          field: 'department',
          operator: 'in',
          value: ['Engineering', 'Design', 'Finance'],
        },
      ],
    };

    const filteredCount = useMemo(
      () => applyFiltering(rows, initialFilter).length,
      [rows],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>`in` Operator (applied imperatively)</h2>
        <p style={styles.subtitle}>
          Grid starts with an <code>in</code> predicate applied to <strong>department</strong>:
          <code> value = ['Engineering', 'Design', 'Finance']</code>.
          Open the filter chevron on Department to see the matching values pre-checked in the checklist —
          the Excel menu round-trips cleanly with the <code>in</code> operator it produces.
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            alignSelf: 'flex-start',
            padding: '4px 10px',
            borderRadius: 999,
            background: '#eef2ff',
            color: '#4338ca',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Showing {filteredCount} of {rows.length} rows (in = 3 departments)
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={rows}
            columns={defaultColumns as any}
            rowKey="id"
            filtering={{ debounceMs: 200 }}
            sorting
            showFilterMenu
            gridId="filtering-in-operator"
            initialFilter={initialFilter}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates the `in` filter operator imperatively. This is the descriptor the ' +
          'value-checklist OK button emits: { field, operator: "in", value: string[] }. ' +
          'Including the sentinel "(blanks)" in the value array also matches null/undefined cells.',
      },
    },
  },
};

export const FilterMenu_NotInOperator: StoryObj = {
  render: () => {
    const rows = useMemo(() => makeEmployees(150), []);
    // `notIn` is the logical complement of `in`. Useful for "everyone except X/Y".
    const initialFilter: FilterState = {
      logic: 'and',
      filters: [
        {
          field: 'city',
          operator: 'notIn',
          value: ['New York', 'Tokyo'],
        },
      ],
    };

    const filteredCount = useMemo(
      () => applyFiltering(rows, initialFilter).length,
      [rows],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>`notIn` Operator (applied imperatively)</h2>
        <p style={styles.subtitle}>
          Grid starts with a <code>notIn</code> predicate on <strong>city</strong>:
          <code> value = ['New York', 'Tokyo']</code>.
          All rows matching those cities are excluded; everything else passes through.
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            alignSelf: 'flex-start',
            padding: '4px 10px',
            borderRadius: 999,
            background: '#fee2e2',
            color: '#b91c1c',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Showing {filteredCount} of {rows.length} rows (excluding 2 cities)
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={rows}
            columns={defaultColumns as any}
            rowKey="id"
            filtering={{ debounceMs: 200 }}
            sorting
            showFilterMenu
            gridId="filtering-not-in-operator"
            initialFilter={initialFilter}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates the `notIn` filter operator — the logical complement of `in`. ' +
          'Useful for "everything except these values". Pair it with the Excel checklist ' +
          'pattern in custom UIs when most values should remain selected.',
      },
    },
  },
};

export const CompositeFilter: StoryObj = {
  render: () => {
    const initialFilter: FilterState = {
      logic: 'or',
      filters: [
        { field: 'department', operator: 'eq', value: 'Engineering' },
        { field: 'department', operator: 'eq', value: 'Design' },
      ],
    };
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Composite OR Filter</h2>
        <p style={styles.subtitle}>
          Shows rows where department is Engineering <strong>OR</strong> Design.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(50)}
            columns={defaultColumns as any}
            rowKey="id"
            filtering
            initialFilter={initialFilter}
            sorting
          />
        </div>
      </div>
    );
  },
};
