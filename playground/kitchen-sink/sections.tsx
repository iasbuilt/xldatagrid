import React, { useState, useMemo } from 'react';
import { MuiDataGrid, muiCellRendererMap } from '@iasbuilt/datagrid-mui';
import { MasterDetail, TransposedGrid } from '@iasbuilt/datagrid-react';
import type { DetailComponentProps } from '@iasbuilt/datagrid-react';
import type { ColumnDef, CellValue, GhostRowConfig, ContextMenuConfig, SelectionMode, TransposedField } from '@iasbuilt/datagrid-core';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Box from '@mui/material/Box';
import Sort from '@mui/icons-material/Sort';
import FilterList from '@mui/icons-material/FilterList';
import Download from '@mui/icons-material/Download';
import Undo from '@mui/icons-material/Undo';
import Redo from '@mui/icons-material/Redo';
import {
  makeEmployees, defaultColumns, departmentOptions, Employee,
  makeOrders, orderColumns,
  makeCellShowcaseData, cellShowcaseColumns,
  showcaseStatusOptions,
} from '../data';
import { EventLog, gridContainer, labelStyle } from '../helpers';

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const sectionStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
};

const headingStyle: React.CSSProperties = { margin: 0, fontSize: 20 };

const descStyle: React.CSSProperties = {
  margin: 0, color: '#64748b', fontSize: 13, lineHeight: 1.5,
};

const miniGridContainer: React.CSSProperties = {
  ...gridContainer, flex: 'none', height: 350,
};

const tallGridContainer: React.CSSProperties = {
  ...gridContainer, flex: 'none', height: 500,
};

const toolbarRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
};

// ---------------------------------------------------------------------------
// Section 1: Cell Types
// ---------------------------------------------------------------------------

export function CellTypesSection() {
  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Cell Types</h2>
      <p style={descStyle}>
        All 15 built-in cell types. Scroll horizontally to see every type. Double-click to edit.
      </p>
      <div style={tallGridContainer}>
        <MuiDataGrid
          data={makeCellShowcaseData(8)}
          columns={cellShowcaseColumns as any}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Actions Column
// ---------------------------------------------------------------------------

export function ActionsColumnSection() {
  const [log, setLog] = useState<string[]>([]);

  const data = useMemo(() => [
    { id: '1', name: 'Alice Martin', status: 'Active' },
    { id: '2', name: 'Bob Chen', status: 'Inactive' },
    { id: '3', name: 'Carol White', status: 'Pending' },
    { id: '4', name: 'David Kim', status: 'Active' },
    { id: '5', name: 'Eva Torres', status: 'Active' },
  ], []);

  const columns: ColumnDef[] = useMemo(() => [
    { id: 'name', field: 'name', title: 'Name', width: 200, cellType: 'text' },
    {
      id: 'status', field: 'status', title: 'Status', width: 120, cellType: 'status',
      options: showcaseStatusOptions,
    },
    {
      id: 'actions', field: 'actions', title: 'Actions', width: 160, cellType: 'actions',
      options: [
        { value: 'edit', label: 'Edit' },
        { value: 'delete', label: 'Delete' },
        { value: 'archive', label: 'Archive' },
      ],
    },
  ], []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Actions Column</h2>
      <p style={descStyle}>
        The actions cell type renders a dropdown menu of contextual row actions. Click the actions
        button on any row to trigger an action.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={columns as any}
          rowKey="id"
          onCellEdit={({ rowId, field, value }) => {
            if (field === 'actions') {
              setLog(prev => [`Row ${rowId}: action="${value}"`, ...prev].slice(0, 20));
            }
          }}
        />
      </div>
      <EventLog entries={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Single-Column Sort
// ---------------------------------------------------------------------------

export function SortSingleSection() {
  const data = useMemo(() => makeEmployees(30), []);

  return (
    <div style={sectionStyle}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Sort fontSize="small" color="action" />
        <h2 style={headingStyle}>Sorting — Single Column</h2>
      </Box>
      <p style={descStyle}>
        Click any column header to sort. Only one column is sorted at a time — clicking a new header
        clears the previous sort.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          sorting={{ mode: 'single' }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 4: Multi-Column Sort
// ---------------------------------------------------------------------------

export function SortMultiSection() {
  const data = useMemo(() => makeEmployees(30), []);

  return (
    <div style={sectionStyle}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Sort fontSize="small" color="action" />
        <h2 style={headingStyle}>Sorting — Multi Column</h2>
      </Box>
      <p style={descStyle}>
        Hold Shift and click headers to add sort columns. Numbers show sort priority. Click a header
        without Shift to reset to single-column sort on that column.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          sorting={{ mode: 'multi' }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 5: Filtering
// ---------------------------------------------------------------------------

export function FilteringSection() {
  const data = useMemo(() => makeEmployees(50), []);

  return (
    <div style={sectionStyle}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FilterList fontSize="small" color="action" />
        <h2 style={headingStyle}>Filtering</h2>
      </Box>
      <p style={descStyle}>
        Pre-filtered to Engineering department. Use the column filter icons to modify or add
        filters. Sorting is also enabled — click headers to sort filtered results.
      </p>
      <div style={tallGridContainer}>
        <MuiDataGrid
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          filtering={{ debounceMs: 200 }}
          sorting={{ mode: 'multi' }}
          initialFilter={{
            logic: 'and',
            filters: [{ field: 'department', operator: 'eq', value: 'Engineering' }],
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 6: Selection Modes
// ---------------------------------------------------------------------------

export function SelectionSection() {
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('row');
  const [log, setLog] = useState<string[]>([]);
  const data = useMemo(() => makeEmployees(20), []);

  const modes: SelectionMode[] = ['cell', 'row', 'range', 'none'];

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Selection Modes</h2>
      <p style={descStyle}>
        Switch between selection modes. Range mode: click a cell then Shift-click another to select
        a rectangular block.
      </p>
      <div style={toolbarRow}>
        <span style={labelStyle}>Mode:</span>
        <ToggleButtonGroup
          value={selectionMode}
          exclusive
          onChange={(_, val) => { if (val) setSelectionMode(val); }}
          size="small"
        >
          {modes.map(mode => (
            <ToggleButton key={mode} value={mode}>{mode}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          selectionMode={selectionMode}
          onSelectionChange={(selection) => {
            const summary = Array.isArray(selection)
              ? `Selected ${selection.length} row(s): ${selection.slice(0, 3).join(', ')}${selection.length > 3 ? '...' : ''}`
              : `Selection changed`;
            setLog(prev => [summary, ...prev].slice(0, 20));
          }}
        />
      </div>
      <EventLog entries={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 7: Edit Validation
// ---------------------------------------------------------------------------

export function EditValidationSection() {
  const [log, setLog] = useState<string[]>([]);
  const data = useMemo(() => makeEmployees(10), []);

  const columns: ColumnDef[] = useMemo(() => [
    {
      id: 'name', field: 'name', title: 'Name', width: 180, cellType: 'text', editable: true,
      validate: (v: CellValue) =>
        !v || String(v).trim().length < 2
          ? { message: 'Min 2 characters', severity: 'error' }
          : null,
    },
    {
      id: 'email', field: 'email', title: 'Email', width: 220, cellType: 'text', editable: true,
      validate: (v: CellValue) =>
        v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))
          ? { message: 'Invalid email', severity: 'error' }
          : null,
    },
    {
      id: 'salary', field: 'salary', title: 'Salary', width: 130, cellType: 'currency',
      editable: true, format: 'USD',
      validate: (v: CellValue) =>
        typeof v === 'number' && v < 30000
          ? { message: 'Salary must be >= $30,000', severity: 'error' }
          : null,
    },
    { id: 'department', field: 'department', title: 'Department', width: 150, cellType: 'status', options: departmentOptions },
    { id: 'active', field: 'active', title: 'Active', width: 80, cellType: 'boolean' },
  ], []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Edit Validation</h2>
      <p style={descStyle}>
        Double-click to edit. Name requires 2+ characters, email must be valid format, salary must
        be at least $30,000. Invalid cells show a red border and tooltip.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={columns as any}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
          onCellEdit={({ rowId, field, value }) => {
            setLog(prev => [`Edited row=${rowId} field=${field} value=${JSON.stringify(value)}`, ...prev].slice(0, 20));
          }}
        />
      </div>
      <EventLog entries={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 8: Undo / Redo
// ---------------------------------------------------------------------------

export function UndoRedoSection() {
  const data = useMemo(() => makeEmployees(10), []);

  return (
    <div style={sectionStyle}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Undo fontSize="small" color="action" />
        <Redo fontSize="small" color="action" />
        <h2 style={headingStyle}>Undo / Redo</h2>
      </Box>
      <p style={descStyle}>
        Edit cells, then use Ctrl+Z to undo and Ctrl+Y (or Ctrl+Shift+Z) to redo. The grid
        maintains a full command history for all edits made during the session.
      </p>
      <div style={miniGridContainer}>
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
}

// ---------------------------------------------------------------------------
// Section 9: Clipboard
// ---------------------------------------------------------------------------

export function ClipboardSection() {
  const [log, setLog] = useState<string[]>([]);
  const data = useMemo(() => makeEmployees(15), []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Clipboard</h2>
      <p style={descStyle}>
        Select a range, then Ctrl+C to copy, Ctrl+X to cut, Ctrl+V to paste. Multi-cell paste is
        supported. Paste from Excel or Google Sheets also works.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          selectionMode="range"
          keyboardNavigation
          onCopy={() => setLog(prev => [`Copied selection to clipboard`, ...prev].slice(0, 20))}
          onCut={() => setLog(prev => [`Cut selection to clipboard`, ...prev].slice(0, 20))}
          onPaste={() => setLog(prev => [`Pasted from clipboard`, ...prev].slice(0, 20))}
          onCellEdit={({ rowId, field, value }) => {
            setLog(prev => [`Pasted cell row=${rowId} field=${field} value=${JSON.stringify(value)}`, ...prev].slice(0, 20));
          }}
        />
      </div>
      <EventLog entries={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 10: Column Resize & Reorder
// ---------------------------------------------------------------------------

export function ColResizeReorderSection() {
  const [log, setLog] = useState<string[]>([]);
  const data = useMemo(() => makeEmployees(15), []);

  const columns: ColumnDef[] = useMemo(() =>
    (defaultColumns as ColumnDef[]).map(col => ({ ...col, resizable: true, reorderable: true })),
  []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Column Resize &amp; Reorder</h2>
      <p style={descStyle}>
        Drag column edges to resize. Drag column headers to reorder. Double-click resize handle to auto-fit.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={columns as any}
          rowKey="id"
          sorting
          onColumnResize={({ columnId, width }) => {
            setLog(prev => [`Resized column=${columnId} to ${width}px`, ...prev].slice(0, 20));
          }}
          onColumnReorder={({ columnId, fromIndex, toIndex }) => {
            setLog(prev => [`Reordered column=${columnId} from ${fromIndex} to ${toIndex}`, ...prev].slice(0, 20));
          }}
        />
      </div>
      <EventLog entries={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 11: Column Visibility
// ---------------------------------------------------------------------------

export function ColVisibilitySection() {
  const [log, setLog] = useState<string[]>([]);
  const data = useMemo(() => makeEmployees(15), []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Column Visibility</h2>
      <p style={descStyle}>
        Click the column visibility menu (toolbar icon) to toggle which columns are shown.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          showColumnVisibilityMenu
          onColumnVisibilityChange={({ columnId, visible }) => {
            setLog(prev => [`Column=${columnId} visible=${visible}`, ...prev].slice(0, 20));
          }}
        />
      </div>
      <EventLog entries={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 12: Frozen Columns
// ---------------------------------------------------------------------------

export function ColFreezeSection() {
  const data = useMemo(() => makeEmployees(20), []);

  const columns: ColumnDef[] = useMemo(() =>
    (defaultColumns as ColumnDef[]).map(col => ({
      ...col,
      resizable: true,
      ...(col.field === 'name' ? { frozen: 'left' as const } : {}),
      ...(col.field === 'rating' ? { frozen: 'right' as const } : {}),
    })),
  []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Frozen Columns</h2>
      <p style={descStyle}>
        Name is frozen left, Rating is frozen right. Scroll horizontally to see frozen columns stay pinned.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={columns as any}
          rowKey="id"
          sorting
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 13: Column Menu
// ---------------------------------------------------------------------------

export function ColMenuSection() {
  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Column Menu</h2>
      <p style={descStyle}>
        Click the vertical dots (&#8942;) on any column header to open the column menu. Options: sort, hide, freeze.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={makeEmployees(15)}
          columns={defaultColumns as any}
          rowKey="id"
          showColumnMenu
          sorting
          selectionMode="cell"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 14: Ghost Row
// ---------------------------------------------------------------------------

export function GhostRowSection() {
  const [log, setLog] = useState<string[]>([]);

  const handleRowAdd = (row: Record<string, unknown>) => {
    setLog(prev => [`Row added: ${JSON.stringify(row)}`, ...prev].slice(0, 20));
  };

  const variantContainerStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 6,
  };

  const variantLabelStyle: React.CSSProperties = {
    margin: 0, fontSize: 13, fontWeight: 600, color: '#475569',
  };

  const ghostGridStyle: React.CSSProperties = {
    border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', height: 250,
  };

  const dataA = useMemo(() => makeEmployees(5), []);
  const dataB = useMemo(() => makeEmployees(5), []);
  const dataC = useMemo(() => makeEmployees(5), []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Ghost Row</h2>
      <p style={descStyle}>
        Three ghost row positions. Bottom: standard. Top (sticky): stays visible on scroll. With validation: name is required.
      </p>

      <div style={variantContainerStyle}>
        <h3 style={variantLabelStyle}>Bottom ghost row</h3>
        <div style={ghostGridStyle}>
          <MuiDataGrid
            data={dataA}
            columns={defaultColumns as any}
            rowKey="id"
            keyboardNavigation
            ghostRow={{ position: 'bottom', placeholder: 'Add employee (bottom)...' }}
            onRowAdd={handleRowAdd as any}
          />
        </div>
      </div>

      <div style={variantContainerStyle}>
        <h3 style={variantLabelStyle}>Top sticky ghost row</h3>
        <div style={ghostGridStyle}>
          <MuiDataGrid
            data={dataB}
            columns={defaultColumns as any}
            rowKey="id"
            keyboardNavigation
            ghostRow={{ position: 'top', sticky: true, placeholder: 'New row (sticky top)...' }}
            onRowAdd={handleRowAdd as any}
          />
        </div>
      </div>

      <div style={variantContainerStyle}>
        <h3 style={variantLabelStyle}>Ghost row with validation + defaults</h3>
        <div style={ghostGridStyle}>
          <MuiDataGrid
            data={dataC}
            columns={defaultColumns as any}
            rowKey="id"
            keyboardNavigation
            ghostRow={{
              position: 'bottom',
              placeholder: 'Name required...',
              defaultValues: { department: 'Engineering', active: true },
              validate: (v: Record<string, unknown>) => !v.name ? 'Name required' : null,
            } as GhostRowConfig}
            onRowAdd={handleRowAdd as any}
          />
        </div>
      </div>

      <EventLog entries={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 15: Row Grouping (single field)
// ---------------------------------------------------------------------------

export function GroupingRowSection() {
  const data = useMemo(() => makeOrders(60), []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Row Grouping</h2>
      <p style={descStyle}>
        Orders grouped by Region. Aggregates: sum of Total, average Quantity. Click group headers to collapse.
      </p>
      <div style={tallGridContainer}>
        <MuiDataGrid
          data={data}
          columns={orderColumns as any}
          rowKey="id"
          sorting
          showGroupControls
          grouping={{
            rows: {
              fields: ['region'],
              defaultExpanded: true,
              aggregates: { total: 'sum', quantity: 'avg' },
            },
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 16: Multi-Level Row Grouping
// ---------------------------------------------------------------------------

export function GroupingMultiSection() {
  const data = useMemo(() => makeOrders(60), []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Multi-Level Grouping</h2>
      <p style={descStyle}>
        Two-level nesting: Region &#8594; Category. Expand/collapse individual groups or all at once.
      </p>
      <div style={tallGridContainer}>
        <MuiDataGrid
          data={data}
          columns={orderColumns as any}
          rowKey="id"
          sorting
          showGroupControls
          grouping={{
            rows: {
              fields: ['region', 'category'],
              defaultExpanded: true,
            },
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 17: Column Grouping
// ---------------------------------------------------------------------------

export function GroupingColumnSection() {
  const data = useMemo(() => makeOrders(30), []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Column Grouping</h2>
      <p style={descStyle}>
        Columns grouped under spanning headers. Click collapse buttons to hide group columns.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={orderColumns as any}
          rowKey="id"
          sorting
          grouping={{
            columns: {
              groups: [
                { id: 'order-info', title: 'Order Info', columns: ['id', 'customer', 'date', 'status'] },
                { id: 'product-info', title: 'Product', columns: ['product', 'category'] },
                { id: 'financials', title: 'Financials', columns: ['quantity', 'unitPrice', 'total'] },
              ],
              collapsible: true,
            },
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 18: Master-Detail
// ---------------------------------------------------------------------------

function EmployeeDetail({ masterRow, detailData, loading }: DetailComponentProps<Employee>) {
  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;
  return (
    <div style={{ padding: 16, background: '#f8fafc', display: 'flex', gap: 32, fontSize: 13 }}>
      <div>
        <strong>Full Profile</strong>
        <table style={{ marginTop: 8, borderCollapse: 'collapse' }}>
          <tbody>
            {Object.entries(masterRow).map(([key, val]) => (
              <tr key={key}>
                <td style={{ padding: '2px 12px 2px 0', color: '#64748b', fontWeight: 600 }}>{key}</td>
                <td style={{ padding: '2px 0' }}>{String(val)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detailData && (
        <div>
          <strong>Fetched Detail</strong>
          <pre style={{ fontSize: 11, background: '#e2e8f0', padding: 8, borderRadius: 4 }}>
            {JSON.stringify(detailData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function MasterDetailSection() {
  const data = useMemo(() => makeEmployees(20), []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Master-Detail</h2>
      <p style={descStyle}>
        Click the expand arrow to see detail panels. Single-expand mode: only one row expands at a time.
        Detail data loaded asynchronously (800ms delay).
      </p>
      <div style={tallGridContainer}>
        <MasterDetail
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          cellRenderers={muiCellRendererMap}
          sorting
          selectionMode="cell"
          detailComponent={EmployeeDetail as any}
          singleExpand
          fetchDetail={(row: Employee) =>
            new Promise(resolve =>
              setTimeout(() => resolve({ employeeId: row.id, fetchedAt: new Date().toISOString(), extra: 'async data' }), 800)
            )
          }
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 19: Context Menu
// ---------------------------------------------------------------------------

export function ContextMenuSection() {
  const [log, setLog] = useState<string[]>([]);
  const data = useMemo(() => makeEmployees(10), []);

  const menuConfig: ContextMenuConfig = useMemo(() => ({
    items: [
      {
        key: 'copy',
        label: 'Copy Cell',
        shortcut: 'Ctrl+C',
        onClick: ({ rowId, field }: { rowId: string; field: string }) =>
          setLog(prev => [`Copy: [${rowId}].${field}`, ...prev].slice(0, 20)),
      },
      {
        key: 'paste',
        label: 'Paste',
        shortcut: 'Ctrl+V',
        onClick: () => setLog(prev => ['Paste', ...prev].slice(0, 20)),
        dividerAfter: true,
      },
      {
        key: 'delete',
        label: 'Delete Row',
        danger: true,
        onClick: ({ rowId }: { rowId: string }) =>
          setLog(prev => [`Delete: ${rowId}`, ...prev].slice(0, 20)),
      },
      {
        key: 'export',
        label: 'Export',
        onClick: () => {},
        children: [
          { key: 'csv', label: 'As CSV', onClick: () => setLog(prev => ['Export CSV', ...prev].slice(0, 20)) },
          { key: 'pdf', label: 'As PDF', onClick: () => setLog(prev => ['Export PDF', ...prev].slice(0, 20)) },
        ],
      },
    ],
  }), []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Context Menu</h2>
      <p style={descStyle}>
        Right-click any cell for the context menu. Includes nested submenu (Export) and danger action (Delete Row).
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          contextMenu={menuConfig}
          sorting
          selectionMode="cell"
        />
      </div>
      <EventLog entries={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 20: Keyboard Navigation
// ---------------------------------------------------------------------------

const keyboardShortcuts = [
  { key: 'Arrow keys', action: 'Navigate cells' },
  { key: 'Tab / Shift+Tab', action: 'Move horizontally (wraps rows)' },
  { key: 'Enter', action: 'Toggle editing / move down' },
  { key: 'Escape', action: 'Cancel edit / clear selection' },
  { key: 'F2', action: 'Enter edit mode' },
  { key: 'Space', action: 'Toggle boolean cells' },
  { key: 'Delete', action: 'Clear cell value' },
  { key: 'Home / End', action: 'First / last column in row' },
  { key: 'Ctrl+Home / Ctrl+End', action: 'First / last cell in grid' },
  { key: 'Ctrl+A', action: 'Select all' },
  { key: 'Ctrl+Z / Ctrl+Y', action: 'Undo / Redo' },
];

export function KeyboardNavSection() {
  const data = useMemo(() => makeEmployees(20), []);

  const tableStyle: React.CSSProperties = {
    borderCollapse: 'collapse',
    fontSize: 13,
    marginBottom: 12,
  };

  const cellStyle: React.CSSProperties = { padding: '3px 16px 3px 0' };

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Keyboard Navigation</h2>
      <p style={descStyle}>
        Navigate and edit using keyboard shortcuts. Reference table shows all available keys.
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Key</th>
            <th style={cellStyle}>Action</th>
          </tr>
        </thead>
        <tbody>
          {keyboardShortcuts.map(({ key, action }) => (
            <tr key={key}>
              <td style={cellStyle}><code>{key}</code></td>
              <td style={cellStyle}>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={miniGridContainer}>
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
}

// ---------------------------------------------------------------------------
// Section 21: Theming
// ---------------------------------------------------------------------------

type ThemeMode = 'light' | 'dark' | 'purple';

const customPurpleTheme: Record<string, string> = {
  '--dg-primary-color': '#7c3aed',
  '--dg-bg-color': '#faf5ff',
  '--dg-text-color': '#1e1b4b',
  '--dg-border-color': '#ddd6fe',
  '--dg-header-bg': '#ede9fe',
  '--dg-selection-color': '#7c3aed',
  '--dg-hover-bg': '#f5f3ff',
};

export function ThemingSection() {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const data = useMemo(() => makeEmployees(15), []);

  const resolvedTheme = theme === 'light' ? 'light' : theme === 'dark' ? 'dark' : customPurpleTheme;
  const wrapperStyle: React.CSSProperties = {
    ...miniGridContainer,
    ...(theme === 'dark' ? { background: '#1e293b' } : {}),
  };

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Theming</h2>
      <p style={descStyle}>
        Switch between built-in light/dark themes and a custom purple theme.
      </p>
      <div style={toolbarRow}>
        <span style={labelStyle}>Theme:</span>
        <ToggleButtonGroup
          value={theme}
          exclusive
          onChange={(_, val) => { if (val) setTheme(val); }}
          size="small"
        >
          {(['light', 'dark', 'purple'] as ThemeMode[]).map(t => (
            <ToggleButton key={t} value={t}>{t}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
      <div style={wrapperStyle}>
        <MuiDataGrid
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          theme={resolvedTheme as any}
          sorting
          selectionMode="cell"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 22: Transposed Grid
// ---------------------------------------------------------------------------

export function TransposedSection() {
  const [log, setLog] = useState<string[]>([]);

  const fields: TransposedField[] = useMemo(() => [
    { id: 'name', label: 'Name', cellType: 'text' },
    { id: 'email', label: 'Email', cellType: 'text' },
    { id: 'department', label: 'Department', cellType: 'status', options: departmentOptions },
    { id: 'salary', label: 'Salary', cellType: 'currency' },
    { id: 'active', label: 'Active', cellType: 'boolean' },
  ], []);

  const entityKeys = useMemo(() => ['entity-1', 'entity-2', 'entity-3'], []);

  const values = useMemo(() => {
    const employees = makeEmployees(3);
    const result: Record<string, Record<string, CellValue>> = {};
    entityKeys.forEach((key, i) => {
      const emp = employees[i];
      result[key] = {
        name: emp.name,
        email: emp.email,
        department: emp.department,
        salary: emp.salary,
        active: emp.active,
      };
    });
    return result;
  }, []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Transposed Grid</h2>
      <p style={descStyle}>
        Form-mode grid: rows are fields, columns are entities. Each column represents one record.
      </p>
      <div style={miniGridContainer}>
        <TransposedGrid
          fields={fields}
          entityKeys={entityKeys}
          values={values}
          cellRenderers={muiCellRendererMap}
          onValueChange={(fieldId, entityKey, value) =>
            setLog(prev => [`${fieldId}[${entityKey}] = ${String(value)}`, ...prev].slice(0, 20))
          }
        />
      </div>
      <EventLog entries={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 23: Virtualization
// ---------------------------------------------------------------------------

export function VirtualizationSection() {
  const data = useMemo(() => makeEmployees(500), []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Virtualization</h2>
      <p style={descStyle}>
        500 rows with virtualized rendering. Only visible rows are in the DOM. Scroll rapidly to test performance.
      </p>
      <div style={tallGridContainer}>
        <MuiDataGrid
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          sorting={{ mode: 'multi' }}
          selectionMode="range"
          keyboardNavigation
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 24: Extensions (Validation + Export)
// ---------------------------------------------------------------------------

export function ExtensionsSection() {
  const [log, setLog] = useState<string[]>([]);
  const data = useMemo(() => makeEmployees(10), []);

  const columns: ColumnDef[] = useMemo(() => [
    {
      id: 'name',
      field: 'name',
      title: 'Name',
      width: 180,
      cellType: 'text',
      editable: true,
      validate: (v: CellValue) => {
        const s = String(v ?? '').trim();
        if (s.length < 2) return { message: 'Min 2 characters', severity: 'error' as const };
        if (!/^[a-zA-Z\s]+$/.test(s)) return { message: 'Letters only', severity: 'warning' as const };
        return null;
      },
    },
    {
      id: 'email',
      field: 'email',
      title: 'Email',
      width: 220,
      cellType: 'text',
      editable: true,
      validate: (v: CellValue) =>
        v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))
          ? { message: 'Invalid email format', severity: 'error' as const }
          : null,
    },
    { id: 'department', field: 'department', title: 'Department', width: 150, cellType: 'status', options: departmentOptions },
    { id: 'salary', field: 'salary', title: 'Salary', width: 130, cellType: 'currency', format: 'USD' },
    { id: 'active', field: 'active', title: 'Active', width: 80, cellType: 'boolean' },
  ], []);

  function exportCSV() {
    const header = columns.map(c => c.title).join(',');
    const rows = data.map(row =>
      columns.map(c => JSON.stringify((row as any)[c.field] ?? '')).join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
    setLog(prev => ['Exported CSV', ...prev].slice(0, 20));
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.json';
    a.click();
    URL.revokeObjectURL(url);
    setLog(prev => ['Exported JSON', ...prev].slice(0, 20));
  }

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Extensions</h2>
      <p style={descStyle}>
        Regex validation on email and name fields. Export buttons for CSV and JSON download.
      </p>
      <div style={toolbarRow}>
        <Button variant="outlined" size="small" startIcon={<Download />} onClick={exportCSV}>Export CSV</Button>
        <Button variant="outlined" size="small" startIcon={<Download />} onClick={exportJSON}>Export JSON</Button>
      </div>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={columns as any}
          rowKey="id"
          sorting
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
      <EventLog entries={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 25: Empty State
// ---------------------------------------------------------------------------

export function EmptyStateSection() {
  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Empty State</h2>
      <p style={descStyle}>
        Grid with zero rows. Shows the empty/placeholder state.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={[]}
          columns={defaultColumns as any}
          rowKey="id"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 26: Read-Only
// ---------------------------------------------------------------------------

export function ReadOnlySection() {
  const data = useMemo(() => makeEmployees(20), []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Read-Only</h2>
      <p style={descStyle}>
        All cells are read-only. Navigation and sorting work, but double-click does not enter edit mode.
      </p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          readOnly
          sorting
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 28: Excel 365 Column Filter Menu
//
// Showcases the Excel-style header dropdown opted in via `showFilterMenu`:
// - Sort ascending / descending from the menu itself
// - "Clear filter from ..." entry when any predicate is active
// - Text / Number / Date Filters submenu that opens the custom-condition dialog
// - Search input for narrowing the value checklist
// - (Select All) + (Blanks) + distinct-values checklist committed on OK
// The 240-row fixture is deliberately beyond what a user wants to scroll —
// it is what makes the search box and checklist pagination meaningful.
// ---------------------------------------------------------------------------

export function Excel365FilterMenuSection() {
  const data = useMemo(() => makeEmployees(240), []);

  // Pre-declare filterable on each column so the header renders the Excel
  // filter icon for every column; `defaultColumns` only marks a subset.
  const columns = useMemo(
    () => defaultColumns.map(col => ({ ...col, filterable: true, sortable: true })),
    [],
  );

  return (
    <div style={sectionStyle}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FilterList fontSize="small" color="action" />
        <h2 style={headingStyle}>Excel 365 Column Filter Menu</h2>
      </Box>
      <p style={descStyle}>
        Click the chevron icon on any column header to open the Excel-style filter dropdown. Try:
        sort from inside the menu, type in the search box to narrow the value checklist, toggle
        (Select All) / (Blanks), and click the "Text Filters" / "Number Filters" / "Date Filters"
        entry to open the custom-condition dialog. The dropdown is portaled to the body and
        stays anchored below the column header on scroll.
      </p>
      <div style={tallGridContainer}>
        <MuiDataGrid
          data={data}
          columns={columns as any}
          rowKey="id"
          showFilterMenu
          showColumnMenu
          gridId="excel365-filter-menu-demo"
          sorting={{ mode: 'multi' }}
          filtering={{ debounceMs: 200 }}
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 29: Filter Condition Dialog — two-clause AND / OR custom filter
//
// The same grid as above, but pre-filtered via the `in` operator (the shape
// the value checklist produces). The intent is to open the "Custom Filter…"
// entry from the Excel dropdown and build two chained clauses (e.g. "contains
// Eng" AND "contains ing") — the dialog itself is accessible (role="dialog",
// focus trap, labelled inputs) and its output is committed as a
// CompositeFilterDescriptor scoped to the field.
// ---------------------------------------------------------------------------

export function FilterConditionDialogSection() {
  const data = useMemo(() => makeEmployees(240), []);

  const columns = useMemo(
    () => defaultColumns.map(col => ({ ...col, filterable: true, sortable: true })),
    [],
  );

  return (
    <div style={sectionStyle}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FilterList fontSize="small" color="action" />
        <h2 style={headingStyle}>Filter Condition Dialog</h2>
      </Box>
      <p style={descStyle}>
        Open the filter dropdown on the Department column, then click "Text Filters → Custom
        Filter…". The dialog lets you compose two clauses with AND / OR. It is fully keyboard-
        accessible: Tab cycles within the dialog, Enter applies, Escape cancels. The composite
        predicate is applied on OK and scoped to the target field only, so it composes with
        filters on other columns.
      </p>
      <div style={tallGridContainer}>
        <MuiDataGrid
          data={data}
          columns={columns as any}
          rowKey="id"
          showFilterMenu
          gridId="filter-condition-dialog-demo"
          sorting={{ mode: 'multi' }}
          filtering={{ debounceMs: 200 }}
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 30: `in` / `notIn` Filter Operators
//
// Demonstrates the two new multi-value operators the Excel dropdown depends
// on. The grid is initialised with an `in` predicate on Department and a
// `notIn` predicate on Role, composed via `and`. These operators are
// first-class citizens — they evaluate array values directly, coerce
// non-string cells via String(), and short-circuit on an empty array.
// ---------------------------------------------------------------------------

export function InNotInOperatorsSection() {
  const data = useMemo(() => makeEmployees(120), []);

  return (
    <div style={sectionStyle}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FilterList fontSize="small" color="action" />
        <h2 style={headingStyle}>`in` / `notIn` Filter Operators</h2>
      </Box>
      <p style={descStyle}>
        Pre-filtered with two multi-value predicates joined by AND: Department
        <code> in [Engineering, Sales]</code> AND Role <code>notIn [Intern]</code>. Both
        operators are evaluated directly against array values — this is what the Excel-style
        checklist commits when the user clicks OK.
      </p>
      <div style={tallGridContainer}>
        <MuiDataGrid
          data={data}
          columns={defaultColumns as any}
          rowKey="id"
          filtering={{ debounceMs: 200 }}
          sorting={{ mode: 'multi' }}
          initialFilter={{
            logic: 'and',
            filters: [
              { field: 'department', operator: 'in', value: ['Engineering', 'Sales'] },
              { field: 'role', operator: 'notIn', value: ['Intern'] },
            ],
          }}
          selectionMode="cell"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 31: Background IndexedDB Search Index
//
// Enabling `showFilterMenu` activates the `useBackgroundIndexer` hook: it
// walks the configured fields one at a time on idle callbacks (or
// setTimeout(0) on browsers without rIC), derives distinct values, and
// persists them to IndexedDB under a gridId-scoped namespace. On first
// mount the index is built; on subsequent mounts (remount, page reload)
// the cache is hit and the checklist appears instantly.
// ---------------------------------------------------------------------------

export function BackgroundIndexerSection() {
  const data = useMemo(() => makeEmployees(10_000), []);

  const columns = useMemo(
    () => defaultColumns.map(col => ({ ...col, filterable: true, sortable: true })),
    [],
  );

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Background IndexedDB Search Index</h2>
      <p style={descStyle}>
        10 000 rows. The first time this section mounts, the Excel filter menu shows "Indexing…"
        for a column while the background indexer walks the dataset on <code>requestIdleCallback</code>
        and persists distinct values to IndexedDB (namespaced by <code>gridId</code>). Refresh
        the page — the second load hits the IndexedDB cache and the checklist is available
        instantly. Open devtools → Application → IndexedDB → <code>iasbuilt-datagrid-index</code>
        to inspect the stored payload.
      </p>
      <div style={tallGridContainer}>
        <MuiDataGrid
          data={data}
          columns={columns as any}
          rowKey="id"
          showFilterMenu
          gridId="background-indexer-demo-10k"
          sorting={{ mode: 'multi' }}
          filtering={{ debounceMs: 200 }}
          selectionMode="range"
          keyboardNavigation
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 32: Row-Number Gutter (Left vs Right)
//
// Default is `position: 'left'` (Excel 365 convention) with sticky-under-
// scroll so horizontal scrolling keeps the gutter pinned. `position: 'right'`
// is opt-in; it floats after the last data column and scrolls with it. Each
// grid uses wide columns that overflow the viewport so the scroll behaviour
// is actually observable.
// ---------------------------------------------------------------------------

export function RowNumberGutterSection() {
  const data = useMemo(() => makeEmployees(30), []);

  // Force horizontal overflow by widening every column.
  const wideColumns = useMemo(
    () => defaultColumns.map(col => ({ ...col, width: Math.max(col.width ?? 150, 200) })),
    [],
  );

  const variantLabelStyle: React.CSSProperties = {
    margin: 0, fontSize: 13, fontWeight: 600, color: '#475569',
  };

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Row-Number Gutter — Left (default) vs Right</h2>
      <p style={descStyle}>
        Scroll each grid horizontally. The left gutter stays sticky-pinned (Excel 365 style);
        the right gutter floats after the last data column and scrolls with the content.
      </p>

      <h3 style={variantLabelStyle}>Left gutter (default, sticky-under-scroll)</h3>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={wideColumns as any}
          rowKey="id"
          selectionMode="row"
          chrome={{ rowNumbers: { position: 'left' } }}
        />
      </div>

      <h3 style={variantLabelStyle}>Right gutter (opt-in, scrolls with content)</h3>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={wideColumns as any}
          rowKey="id"
          selectionMode="row"
          chrome={{ rowNumbers: { position: 'right' } }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 33: Context Menu in a CSS-Transformed Ancestor
//
// Regression guard for the portal-positioning fix: any ancestor with a CSS
// `transform` establishes a new containing block for `position: fixed`
// descendants. Before the fix, right-clicking a cell opened the context
// menu at offset (20,20) relative to the true cursor position because the
// portal's `position: fixed` coordinates were being resolved against the
// transformed ancestor instead of the viewport. The current implementation
// portals into `document.body` and uses viewport coords so the menu lands
// exactly under the cursor regardless of ancestor transforms.
// ---------------------------------------------------------------------------

export function ContextMenuInTransformedAncestorSection() {
  const [log, setLog] = useState<string[]>([]);
  const data = useMemo(() => makeEmployees(10), []);

  const menuConfig: ContextMenuConfig = useMemo(() => ({
    items: [
      {
        key: 'copy',
        label: 'Copy Cell',
        shortcut: 'Ctrl+C',
        onClick: (ctx: { rowId: string | null; field: string | null }) =>
          setLog(prev => [`Copy [${ctx.rowId ?? '-'}].${ctx.field ?? '-'}`, ...prev].slice(0, 20)),
      },
      {
        key: 'paste',
        label: 'Paste',
        shortcut: 'Ctrl+V',
        onClick: () => setLog(prev => ['Paste', ...prev].slice(0, 20)),
        dividerAfter: true,
      },
      {
        key: 'delete',
        label: 'Delete Row',
        danger: true,
        onClick: (ctx: { rowId: string | null; field: string | null }) =>
          setLog(prev => [`Delete ${ctx.rowId ?? '-'}`, ...prev].slice(0, 20)),
      },
    ],
  }), []);

  // Transformed ancestor: any non-identity transform establishes a new
  // containing block for `position: fixed` descendants. Before the portal
  // fix, this would push the menu 20px off the cursor on both axes.
  const transformedWrapper: React.CSSProperties = {
    transform: 'translate3d(20px, 20px, 0)',
    transformStyle: 'preserve-3d',
    padding: 8,
    border: '1px dashed #94a3b8',
    borderRadius: 8,
    background: '#fafafa',
  };

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Context Menu in a Transformed Ancestor</h2>
      <p style={descStyle}>
        The grid below is wrapped in a container with{' '}
        <code>transform: translate3d(20px, 20px, 0)</code>. Right-click any cell — the context
        menu must appear exactly under the cursor, not offset by the ancestor's transform.
        The fix portals the menu to <code>document.body</code> and positions it in viewport
        coordinates instead of inheriting the transformed containing block.
      </p>
      <div style={transformedWrapper}>
        <div style={miniGridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            contextMenu={menuConfig}
            selectionMode="cell"
            sorting
          />
        </div>
      </div>
      <EventLog entries={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 34: Excel 365 Theme
//
// Tokens are scoped — importing the stylesheet alone does not touch any
// other grid. A root element must carry either `.dg-theme-excel365` or
// `data-theme="excel365"`. We wrap the grid in a div with the class; the
// grid root inherits the cascaded custom properties, including the
// `--dg-row-number-bg` token (#f3f2f1, Excel's gutter colour).
// ---------------------------------------------------------------------------

export function Excel365ThemeSection() {
  const data = useMemo(() => makeEmployees(40), []);

  const columns = useMemo(
    () => defaultColumns.map(col => ({ ...col, filterable: true, sortable: true })),
    [],
  );

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Excel 365 Theme</h2>
      <p style={descStyle}>
        Tokens scoped to <code>.dg-theme-excel365</code> (or{' '}
        <code>[data-theme="excel365"]</code>). The Segoe UI / Calibri stack, 12px baseline,
        20px row height, and Excel green accent all come from the scoped stylesheet — including
        the <code>--dg-row-number-bg</code> token (#f3f2f1) visible on the row-number gutter.
        The theme is strictly opt-in: other grids on the page keep their own tokens.
      </p>
      <div className="dg-theme-excel365" style={{ borderRadius: 8, overflow: 'hidden' }}>
        <div style={tallGridContainer}>
          <MuiDataGrid
            data={data}
            columns={columns as any}
            rowKey="id"
            showFilterMenu
            showColumnMenu
            gridId="excel365-theme-demo"
            sorting={{ mode: 'multi' }}
            filtering={{ debounceMs: 200 }}
            selectionMode="cell"
            keyboardNavigation
            chrome={{ rowNumbers: { position: 'left' } }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 27: Chrome Columns
// ---------------------------------------------------------------------------

export function ChromeColumnsSection() {
  const [log, setLog] = useState<string[]>([]);
  const data = useMemo(() => makeEmployees(5), []);
  const cols: ColumnDef[] = useMemo(() => [
    { id: 'name', field: 'name', title: 'Name', width: 160, cellType: 'text' },
    { id: 'department', field: 'department', title: 'Department', width: 150, cellType: 'status', options: departmentOptions },
    { id: 'salary', field: 'salary', title: 'Salary', width: 130, cellType: 'currency', format: 'USD' },
  ], []);

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Chrome Columns</h2>
      <p style={descStyle}>
        Chrome columns add UI chrome to the grid: a controls column (far left) with action buttons,
        and a row-number column (far right) with click-to-select and optional drag-reorder.
      </p>

      <h3 style={{ margin: '8px 0 4px', fontSize: 15 }}>Controls Only</h3>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={cols as any}
          rowKey="id"
          chrome={{
            controls: {
              width: 100,
              actions: [
                { key: 'view', label: 'View', onClick: (rowId: string, rowIndex: number) => setLog(prev => [`View row ${rowId} (index ${rowIndex})`, ...prev].slice(0, 20)) },
                { key: 'edit', label: 'Edit', onClick: (rowId: string) => setLog(prev => [`Edit row ${rowId}`, ...prev].slice(0, 20)) },
                { key: 'delete', label: 'Del', onClick: (rowId: string) => setLog(prev => [`Delete row ${rowId}`, ...prev].slice(0, 20)) },
              ],
            },
          }}
        />
      </div>

      <h3 style={{ margin: '8px 0 4px', fontSize: 15 }}>Row Numbers Only</h3>
      <p style={descStyle}>Click a row number to select the entire row. Shift+click for range, Ctrl/Cmd+click to toggle.</p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={cols as any}
          rowKey="id"
          selectionMode="row"
          chrome={{ rowNumbers: true }}
        />
      </div>

      <h3 style={{ margin: '8px 0 4px', fontSize: 15 }}>Both + Drag Reorder</h3>
      <p style={descStyle}>Controls on the left, row numbers on the right. Drag row numbers to reorder rows.</p>
      <div style={miniGridContainer}>
        <MuiDataGrid
          data={data}
          columns={cols as any}
          rowKey="id"
          selectionMode="row"
          chrome={{
            controls: {
              actions: [
                { key: 'view', label: 'View', onClick: (rowId: string) => setLog(prev => [`View ${rowId}`, ...prev].slice(0, 20)) },
              ],
            },
            rowNumbers: { reorderable: true },
          }}
          onRowReorder={({ sourceRowId, targetRowId }: { sourceRowId: string; targetRowId: string }) =>
            setLog(prev => [`Reorder: ${sourceRowId} -> ${targetRowId}`, ...prev].slice(0, 20))
          }
        />
      </div>

      <EventLog entries={log} />
    </div>
  );
}
