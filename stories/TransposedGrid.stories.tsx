import React, { useState, useCallback } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TransposedGrid } from '@iasbuilt/datagrid-react';
import type { TransposedField, CellValue } from '@iasbuilt/datagrid-core';
import { makeEmployees, departmentOptions } from './data';
import { storyContainer, gridContainer, allCellRenderers } from './helpers';
import * as styles from './stories.styles';

// Suppress unused-var lint — allCellRenderers is imported because
// TransposedGrid wraps the plain DataGrid (not MuiDataGrid).
void allCellRenderers;

const meta: Meta = {
  title: 'Examples/Transposed Grid',
};
export default meta;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildValues(
  employees: ReturnType<typeof makeEmployees>,
  fields: TransposedField[],
): Record<string, Record<string, CellValue>> {
  const values: Record<string, Record<string, CellValue>> = {};
  for (const field of fields) {
    values[field.id] = {};
    for (const emp of employees) {
      values[field.id][emp.id] = (emp as Record<string, unknown>)[field.id] as CellValue;
    }
  }
  return values;
}

// ---------------------------------------------------------------------------
// BasicTransposed
// ---------------------------------------------------------------------------

const basicFields: TransposedField[] = [
  { id: 'name', label: 'Name', cellType: 'text' },
  { id: 'email', label: 'Email', cellType: 'text' },
  { id: 'department', label: 'Department', cellType: 'status', options: departmentOptions },
  { id: 'salary', label: 'Salary', cellType: 'currency' },
  { id: 'active', label: 'Active', cellType: 'boolean' },
];

export const BasicTransposed: StoryObj = {
  render: () => {
    const employees = makeEmployees(3);
    const entityKeys = employees.map((e) => e.id);
    const [values, setValues] = useState(() => buildValues(employees, basicFields));
    const [log, setLog] = useState<string[]>([]);

    const handleChange = useCallback(
      (fieldId: string, entityKey: string, value: CellValue) => {
        setValues((prev) => ({
          ...prev,
          [fieldId]: { ...prev[fieldId], [entityKey]: value },
        }));
        setLog((p) => [...p.slice(-6), `${fieldId}[${entityKey}] = ${String(value)}`]);
      },
      [],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Basic Transposed Grid</h2>
        <p style={styles.subtitle}>
          3 entities as columns, 5 fields as rows. Edit a cell and see the change logged below.
        </p>
        <div style={gridContainer}>
          <TransposedGrid
            fields={basicFields}
            entityKeys={entityKeys}
            values={values}
            onValueChange={handleChange}
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(edit a cell to see value changes)'}
        </pre>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// SingleEntity
// ---------------------------------------------------------------------------

const singleEntityFields: TransposedField[] = [
  { id: 'name', label: 'Full Name', cellType: 'text', required: true },
  { id: 'email', label: 'Email', cellType: 'text' },
  { id: 'department', label: 'Department', cellType: 'status', options: departmentOptions },
  { id: 'salary', label: 'Salary', cellType: 'currency' },
  { id: 'startDate', label: 'Start Date', cellType: 'calendar' },
  { id: 'active', label: 'Active', cellType: 'boolean' },
  { id: 'city', label: 'City', cellType: 'text' },
  { id: 'notes', label: 'Notes', cellType: 'text' },
];

export const SingleEntity: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'One entity rendered as a form-like layout. In transposed/form mode the row-number gutter still honours the `position` contract — it defaults to left-sticky but can be flipped to right via `chrome.rowNumbers.position`.',
      },
    },
  },
  render: () => {
    const employees = makeEmployees(1);
    const entityKeys = employees.map((e) => e.id);
    const [values, setValues] = useState(() => buildValues(employees, singleEntityFields));
    const [log, setLog] = useState<string[]>([]);

    const handleChange = useCallback(
      (fieldId: string, entityKey: string, value: CellValue) => {
        setValues((prev) => ({
          ...prev,
          [fieldId]: { ...prev[fieldId], [entityKey]: value },
        }));
        setLog((p) => [...p.slice(-6), `${fieldId} = ${String(value)}`]);
      },
      [],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Single Entity (Form Mode)</h2>
        <p style={styles.subtitle}>
          One entity displayed as a form-like layout with 8 fields. Works like a detail/edit panel.
        </p>
        <div style={gridContainer}>
          <TransposedGrid
            fields={singleEntityFields}
            entityKeys={entityKeys}
            values={values}
            onValueChange={handleChange}
            entityColumnWidth={320}
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(edit a field to see changes)'}
        </pre>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// ManyEntities
// ---------------------------------------------------------------------------

export const ManyEntities: StoryObj = {
  render: () => {
    const employees = makeEmployees(10);
    const entityKeys = employees.map((e) => e.id);
    const [values, setValues] = useState(() => buildValues(employees, basicFields));
    const [log, setLog] = useState<string[]>([]);

    const handleChange = useCallback(
      (fieldId: string, entityKey: string, value: CellValue) => {
        setValues((prev) => ({
          ...prev,
          [fieldId]: { ...prev[fieldId], [entityKey]: value },
        }));
        setLog((p) => [...p.slice(-6), `${fieldId}[${entityKey}] = ${String(value)}`]);
      },
      [],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Many Entities (Horizontal Scroll)</h2>
        <p style={styles.subtitle}>
          10 entities rendered as columns to demonstrate horizontal scrolling in transposed mode.
        </p>
        <div style={gridContainer}>
          <TransposedGrid
            fields={basicFields}
            entityKeys={entityKeys}
            values={values}
            onValueChange={handleChange}
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(edit a cell to see value changes)'}
        </pre>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// ChromeFieldColumnWithMixedEditors (issue #18 — all four sub-features)
// ---------------------------------------------------------------------------

const credentialFields: TransposedField[] = [
  { id: 'name', label: 'Full Name', cellType: 'text' },
  { id: 'salary', label: 'Salary', cellType: 'numeric' },
  { id: 'active', label: 'Active', cellType: 'booleanSelected', defaultValue: true },
  { id: 'password', label: 'Password', cellType: 'passwordConfirm' },
];

export const ChromeFieldColumnWithMixedEditors: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates all four issue #18 upgrades on a single transposed grid: ' +
          '(1) the field-name column is rendered as chrome via `useChromeFieldColumn`; ' +
          '(2) each row chooses its own editor (text / numeric / booleanSelected / passwordConfirm); ' +
          '(3) the "Active" row uses the `booleanSelected` cell which shows "Selected" / em-dash; ' +
          '(4) the "Password" row uses the `passwordConfirm` cell which requires a re-entry and a shared eye toggle before committing.',
      },
    },
  },
  render: () => {
    const [values, setValues] = useState<Record<string, Record<string, CellValue>>>(() => ({
      name: { u1: 'Alice Admin', u2: 'Bob Builder' },
      salary: { u1: 120000, u2: 85000 },
      active: { u1: true, u2: false },
      password: { u1: '', u2: '' },
    }));
    const entityKeys = ['u1', 'u2'];
    const [log, setLog] = useState<string[]>([]);

    const handleChange = useCallback(
      (fieldId: string, entityKey: string, value: CellValue) => {
        setValues((prev) => ({
          ...prev,
          [fieldId]: { ...prev[fieldId], [entityKey]: value },
        }));
        setLog((p) => [
          ...p.slice(-6),
          `${fieldId}[${entityKey}] = ${fieldId === 'password' ? '***' : String(value)}`,
        ]);
      },
      [],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Chrome Field Column + Per-Row Editors (issue #18)</h2>
        <p style={styles.subtitle}>
          The left gutter is now the row-number chrome column (not a data column), rendering
          the field labels via <code>chrome.getChromeCellContent</code>. Each row picks its own
          editor: <em>numeric</em>, <em>booleanSelected</em> (shows the word "Selected" or an
          em-dash), and <em>passwordConfirm</em> (two inputs plus shared eye toggle; commit is
          gated on match).
        </p>
        <div style={gridContainer}>
          <TransposedGrid
            fields={credentialFields}
            entityKeys={entityKeys}
            values={values}
            onValueChange={handleChange}
            useChromeFieldColumn
            fieldColumnWidth={180}
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(edit any cell to see value changes)'}
        </pre>
      </div>
    );
  },
};
