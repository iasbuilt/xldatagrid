import React, { useState, useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import type { ColumnDef, CellValue } from '@iasbuilt/datagrid-core';
import { makeEmployees, defaultColumns, Employee } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Editing',
};
export default meta;

export const InlineEditing: StoryObj = {
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    const data = useMemo(() => makeEmployees(15), []);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Inline Cell Editing</h2>
        <p style={styles.subtitle}>
          Double-click any editable cell. Press <kbd>Enter</kbd> or <kbd>Tab</kbd> to commit, <kbd>Escape</kbd> to cancel. Edit events logged below.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onCellEdit={(rowId, field, value, prev) =>
              setLog((p) => [...p.slice(-6), `[${rowId}].${field}: ${String(prev)} -> ${String(value)}`])
            }
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(edit a cell to see events)'}
        </pre>
      </div>
    );
  },
};

// Excel-365 commit-and-advance: Enter commits and moves DOWN one row, Tab
// commits and moves RIGHT one column. At the grid edge (last row for Enter,
// last column for Tab) the selection stays on the same cell. Escape discards
// the draft and keeps the selection on the same cell.
export const EnterTabCommitAndAdvance: StoryObj = {
  name: 'Enter/Tab commit-and-advance (Excel-365)',
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    const data = useMemo(() => makeEmployees(10), []);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Enter / Tab: commit-and-advance</h2>
        <p style={styles.subtitle}>
          Double-click a cell, type a new value, then press <kbd>Enter</kbd> <em>or</em> <kbd>Tab</kbd>.
          Following Excel-365, <kbd>Enter</kbd> commits the value and moves the selection
          <strong> down one row</strong>; <kbd>Tab</kbd> commits and moves the selection
          <strong> right one column</strong>. At the grid edge (last row for Enter, last
          column for Tab) the selection stays put.
          <br />
          <kbd>Escape</kbd> cancels the edit and keeps selection on the same cell.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onCellEdit={(rowId, field, value, prev) =>
              setLog((p) => [
                ...p.slice(-8),
                `[${rowId}].${field}: ${String(prev)} -> ${String(value)}`,
              ])
            }
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(edit a cell, then press Enter or Tab)'}
        </pre>
      </div>
    );
  },
};

export const WithValidation: StoryObj = {
  render: () => {
    const cols: ColumnDef<Employee>[] = defaultColumns.map((c) => {
      if (c.field === 'name') {
        return {
          ...c,
          validate: (v: CellValue) =>
            !v || String(v).trim().length < 2
              ? { message: 'Name must be at least 2 characters', severity: 'error' as const }
              : null,
        };
      }
      if (c.field === 'salary') {
        return {
          ...c,
          validate: (v: CellValue) =>
            v != null && Number(v) < 30000
              ? { message: 'Salary must be >= 30,000', severity: 'error' as const }
              : null,
        };
      }
      return c;
    });
    const data = useMemo(() => makeEmployees(10), []);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Validation</h2>
        <p style={styles.subtitle}>
          Name requires 2+ characters. Salary must be {'>='} 30,000. Invalid cells show a red border and tooltip.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={cols as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
          />
        </div>
      </div>
    );
  },
};

export const EscapeCancelsAndKeepsSelection: StoryObj = {
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    const data = useMemo(() => makeEmployees(8), []);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Escape Cancels Edit and Keeps Selection</h2>
        <p style={styles.subtitle}>
          Click a cell to select it, press <kbd>F2</kbd> or double-click to edit,
          type a new value, then press <kbd>Escape</kbd>. The original value is
          preserved and the cell remains selected (issue #11). The onCellEdit
          log below should stay empty after Escape.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onCellEdit={(rowId, field, value, prev) =>
              setLog((p) => [...p.slice(-6), `[${rowId}].${field}: ${String(prev)} -> ${String(value)}`])
            }
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(no commits — press Escape to cancel edits)'}
        </pre>
      </div>
    );
  },
};

export const UndoRedo: StoryObj = {
  render: () => {
    const data = useMemo(() => makeEmployees(10), []);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Undo / Redo</h2>
        <p style={styles.subtitle}>
          Edit cells then press <kbd>Ctrl+Z</kbd> to undo and <kbd>Ctrl+Y</kbd> or <kbd>Ctrl+Shift+Z</kbd> to redo.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
          />
        </div>
      </div>
    );
  },
};
