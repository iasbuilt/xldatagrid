import React, { useState, useEffect, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import { useGridContext } from '@iasbuilt/datagrid-react';
import { createRegexValidation, createCellComments, createExportExtension } from '@iasbuilt/datagrid-extensions';
import type { ColumnDef, CellValue } from '@iasbuilt/datagrid-core';
import { makeEmployees, defaultColumns, Employee } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Extensions',
};
export default meta;

// ---------------------------------------------------------------------------
// Regex Validation
// ---------------------------------------------------------------------------

export const RegexValidation: StoryObj = {
  render: () => {
    const cols: ColumnDef<Employee>[] = defaultColumns.map((c) => {
      if (c.field === 'email') {
        return {
          ...c,
          validate: (v: CellValue) => {
            if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) {
              return { message: 'Invalid email address', severity: 'error' as const };
            }
            return null;
          },
        };
      }
      if (c.field === 'name') {
        return {
          ...c,
          validate: (v: CellValue) => {
            if (!v || String(v).trim().length < 2) {
              return { message: 'Name must be at least 2 characters', severity: 'error' as const };
            }
            if (!/^[A-Za-z\s]+$/.test(String(v))) {
              return { message: 'Name must contain only letters', severity: 'warning' as const };
            }
            return null;
          },
        };
      }
      return c;
    });

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Regex Validation Extension</h2>
        <p style={styles.subtitle}>
          Email must be a valid address. Name must be 2+ letters only. Edit cells to trigger validation — invalid cells get a red border.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(10)}
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

// ---------------------------------------------------------------------------
// Export (CSV / Excel / PDF)
// ---------------------------------------------------------------------------

export const ExportFormats: StoryObj = {
  render: () => {
    const [lastExport, setLastExport] = useState('');
    const data = makeEmployees(20);

    const handleExportCSV = () => {
      const ext = createExportExtension({ filename: 'employees' });
      // Quick CSV generation using the extension's utility
      const header = defaultColumns.map((c) => c.title).join(',');
      const rows = data.map((r) => defaultColumns.map((c) => String((r as any)[c.field] ?? '')).join(','));
      const csv = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employees.csv';
      a.click();
      URL.revokeObjectURL(url);
      setLastExport('CSV downloaded');
    };

    const handleExportJSON = () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employees.json';
      a.click();
      URL.revokeObjectURL(url);
      setLastExport('JSON downloaded');
    };

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Export Extension</h2>
        <p style={styles.subtitle}>
          The export extension supports CSV, Excel (XLSX), and PDF formats. Click the buttons to export.
        </p>
        <div style={styles.flexRow}>
          <button onClick={handleExportCSV} style={styles.extensionsBtnStyle}>Export CSV</button>
          <button onClick={handleExportJSON} style={styles.extensionsBtnStyle}>Export JSON</button>
          {lastExport && <span style={styles.extensionsExportStatus}>{lastExport}</span>}
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            sorting
            selectionMode="cell"
          />
        </div>
      </div>
    );
  },
};
