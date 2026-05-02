import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import { serializeRangeToText } from '@iasbuilt/datagrid-core';
import type { CellRange, ColumnDef } from '@iasbuilt/datagrid-core';
import { makeEmployees, defaultColumns } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Clipboard',
};
export default meta;

export const CopyPaste: StoryObj = {
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Copy / Paste / Cut</h2>
        <p style={styles.subtitle}>
          Select a cell or range, then use <kbd>Ctrl+C</kbd> to copy, <kbd>Ctrl+X</kbd> to cut, and <kbd>Ctrl+V</kbd> to paste.
          Hold <kbd>Shift</kbd> + arrow keys to extend the selection before copying.
        </p>
        <p style={styles.subtitle}>
          Pastes into Excel preserve cell layout via the <code>text/html</code> flavor; pastes into a plain editor get clean TSV via <code>text/plain</code>. Cells containing tabs, newlines, or quotes are RFC-4180 quoted.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(15)}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="range"
            keyboardNavigation
            onCellEdit={(rowId, field, value, prev) =>
              setLog((p) => [...p.slice(-9), `[${rowId}].${field}: ${String(prev)} -> ${String(value)}`])
            }
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(clipboard events will appear here)'}
        </pre>
      </div>
    );
  },
};

const crossGridContainer: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  flex: 1,
  minHeight: 0,
};

const halfGrid: React.CSSProperties = {
  flex: 1,
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  overflow: 'hidden',
};

export const CrossGridPaste: StoryObj = {
  render: () => {
    const [logA, setLogA] = useState<string[]>([]);
    const [logB, setLogB] = useState<string[]>([]);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Cross-Grid Paste</h2>
        <p style={styles.subtitle}>
          Select and copy cells from the left grid (<kbd>Ctrl+C</kbd>), then click a cell in the right grid and paste (<kbd>Ctrl+V</kbd>).
        </p>
        <div style={crossGridContainer}>
          <div style={halfGrid}>
            <MuiDataGrid
              data={makeEmployees(15)}
              columns={defaultColumns as any}
              rowKey="id"
              selectionMode="range"
              keyboardNavigation
              onCellEdit={(rowId, field, value, prev) =>
                setLogA((p) => [...p.slice(-4), `A: [${rowId}].${field}: ${String(prev)} -> ${String(value)}`])
              }
            />
          </div>
          <div style={halfGrid}>
            <MuiDataGrid
              data={makeEmployees(15)}
              columns={defaultColumns as any}
              rowKey="id"
              selectionMode="range"
              keyboardNavigation
              onCellEdit={(rowId, field, value, prev) =>
                setLogB((p) => [...p.slice(-4), `B: [${rowId}].${field}: ${String(prev)} -> ${String(value)}`])
              }
            />
          </div>
        </div>
        <pre style={styles.logPre}>
          {[...logA, ...logB].length
            ? [...logA, ...logB].join('\n')
            : '(copy from Grid A, paste into Grid B)'}
        </pre>
      </div>
    );
  },
};

export const PasteFromExcel: StoryObj = {
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Paste from Excel / Google Sheets</h2>
        <p style={styles.subtitle}>
          Copy a range of cells from Excel or Google Sheets, click a target cell below, and press <kbd>Ctrl+V</kbd>.
          Tab-separated text is automatically parsed into rows and columns.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(15)}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="range"
            keyboardNavigation
            onCellEdit={(rowId, field, value, prev) =>
              setLog((p) => [...p.slice(-9), `[${rowId}].${field}: ${String(prev)} -> ${String(value)}`])
            }
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(paste from an external spreadsheet to see events)'}
        </pre>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// EscapingShowcase — demonstrates RFC-4180 quoting & HTML escaping
// ---------------------------------------------------------------------------

interface TrickyRow {
  id: string;
  label: string;
  value: string;
}

const trickyRows: TrickyRow[] = [
  { id: '1', label: 'tabs', value: 'cell\twith\ttabs' },
  { id: '2', label: 'newlines', value: 'multi\nline\nvalue' },
  { id: '3', label: 'quotes', value: 'has "quoted" text inside' },
  { id: '4', label: 'html + quotes', value: 'mix of <html> & "quotes"' },
  { id: '5', label: 'plain', value: 'plain value' },
];

const trickyColumns: ColumnDef<TrickyRow>[] = [
  { id: 'label', field: 'label', title: 'Label', width: 160 },
  { id: 'value', field: 'value', title: 'Value', width: 360, editable: true },
];

export const EscapingShowcase: StoryObj = {
  render: () => {
    // Compute the expected TSV payload once, for a range spanning all rows
    // and both visible columns. This mirrors what Ctrl+C places on the
    // clipboard's text/plain flavour.
    const fullRange: CellRange = {
      anchor: { rowId: trickyRows[0]!.id, field: 'label' },
      focus: { rowId: trickyRows[trickyRows.length - 1]!.id, field: 'value' },
    };
    const tsv = serializeRangeToText(
      trickyRows as unknown as Record<string, unknown>[],
      fullRange,
      trickyColumns as ColumnDef[],
      trickyRows.map((r) => r.id),
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Special-character escaping</h2>
        <p style={styles.subtitle}>
          Values containing <code>\t</code>, <code>\n</code>, <code>\r</code>, or <code>"</code> are
          auto-quoted with internal quotes doubled (RFC-4180 style). The <code>text/html</code> flavor
          additionally escapes <code>&amp;</code>, <code>&lt;</code>, and <code>&gt;</code> so markup
          characters survive a paste into rich targets.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={trickyRows}
            columns={trickyColumns as any}
            rowKey="id"
            selectionMode="range"
            keyboardNavigation
          />
        </div>
        <ul style={styles.subtitle}>
          <li>
            Try copying a multi-cell selection containing one of these — paste into a TSV-aware editor (or Excel) to see the round-trip is faithful.
          </li>
        </ul>
        <details>
          <summary>What gets written</summary>
          <pre style={styles.logPre}>{tsv}</pre>
        </details>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// ChromeColumnsExcluded — row-number / controls gutters never appear in copy
// ---------------------------------------------------------------------------

export const ChromeColumnsExcluded: StoryObj = {
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Chrome columns are excluded from copy</h2>
        <p style={styles.subtitle}>
          The row-number column and the controls column never appear in copied data — only the
          user-defined columns are written to either clipboard flavor. Select a range that visually
          spans the chrome gutters and paste it elsewhere to confirm.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(15)}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="range"
            keyboardNavigation
            chrome={{
              rowNumbers: true,
              controls: {
                actions: [
                  {
                    key: 'view',
                    label: 'View',
                    onClick: (rowId: string) =>
                      setLog((p) => [...p.slice(-4), `View row ${rowId}`]),
                  },
                ],
              },
            }}
            onCellEdit={(rowId, field, value, prev) =>
              setLog((p) => [...p.slice(-9), `[${rowId}].${field}: ${String(prev)} -> ${String(value)}`])
            }
          />
        </div>
        <ul style={styles.subtitle}>
          <li>
            Selecting cells that visually span the row-number / controls columns still produces clean copied output containing only your data columns.
          </li>
        </ul>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(copy a range and paste it into any target)'}
        </pre>
      </div>
    );
  },
};
