import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import { DataGrid, cellRendererMap } from '@iasbuilt/datagrid-react';
import type { ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Cell Types',
};
export default meta;

// ---------------------------------------------------------------------------
// All Cell Types showcase
// ---------------------------------------------------------------------------

interface CellShowcase {
  id: string;
  text: string;
  numeric: number;
  currency: number;
  boolean: boolean;
  calendar: string;
  status: string;
  password: string;
  richText: string;
  tags: string[];
  list: string;
  chipSelect: string[];
  compoundChipList: { id: string; label: string; color?: string }[];
  upload: string;
  subGrid: Record<string, unknown>[];
}

const statusOptions: StatusOption[] = [
  { value: 'Active', label: 'Active', color: '#10b981' },
  { value: 'Inactive', label: 'Inactive', color: '#ef4444' },
  { value: 'Pending', label: 'Pending', color: '#f59e0b' },
];

const priorityOptions: StatusOption[] = [
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
  { value: 'Critical', label: 'Critical' },
];

const subGridCols: ColumnDef[] = [
  { id: 'task', field: 'task', title: 'Task', width: 200 },
  { id: 'hours', field: 'hours', title: 'Hours', width: 80, cellType: 'numeric' },
];

const columns: ColumnDef<CellShowcase>[] = [
  { id: 'text', field: 'text', title: 'Text', width: 150, cellType: 'text', editable: true, placeholder: 'Type here...' },
  { id: 'numeric', field: 'numeric', title: 'Numeric', width: 100, cellType: 'numeric', editable: true, min: 0, max: 100 },
  { id: 'currency', field: 'currency', title: 'Currency', width: 120, cellType: 'currency', editable: true, format: 'USD' },
  { id: 'boolean', field: 'boolean', title: 'Boolean', width: 90, cellType: 'boolean', editable: true },
  { id: 'calendar', field: 'calendar', title: 'Calendar', width: 150, cellType: 'calendar', editable: true },
  { id: 'status', field: 'status', title: 'Status', width: 120, cellType: 'status', options: statusOptions, editable: true },
  { id: 'list', field: 'list', title: 'List', width: 120, cellType: 'list', options: priorityOptions, editable: true },
  { id: 'password', field: 'password', title: 'Password', width: 130, cellType: 'password', editable: true },
  { id: 'tags', field: 'tags', title: 'Tags', width: 200, cellType: 'tags', suggestions: ['react', 'vue', 'angular', 'svelte'], allowFreeText: true, editable: true },
  { id: 'chipSelect', field: 'chipSelect', title: 'Chip Select', width: 200, cellType: 'chipSelect', options: priorityOptions, multiSelect: true, editable: true },
  { id: 'richText', field: 'richText', title: 'Rich Text', width: 200, cellType: 'richText', editable: true },
  { id: 'upload', field: 'upload', title: 'Upload', width: 140, cellType: 'upload', editable: true },
  { id: 'compoundChipList', field: 'compoundChipList', title: 'Compound Chips', width: 250, cellType: 'compoundChipList', editable: true },
  { id: 'subGrid', field: 'subGrid', title: 'Sub-Grid', width: 120, cellType: 'subGrid', subGridColumns: subGridCols, subGridRowKey: 'task' },
];

function makeData(): CellShowcase[] {
  return Array.from({ length: 8 }, (_, i) => ({
    id: String(i + 1),
    text: `Item ${i + 1}`,
    numeric: 10 + i * 7,
    currency: 1500 + i * 250,
    boolean: i % 2 === 0,
    calendar: `2025-0${(i % 9) + 1}-${String(10 + i).padStart(2, '0')}`,
    status: statusOptions[i % statusOptions.length]!.value,
    password: 'p@ssw0rd!',
    richText: [
      `### Row ${i + 1}`,
      '',
      `**Bold** and *italic* text with \`code\` and [a link](https://example.com).`,
      '',
      '- GFM task lists',
      `- [${i % 2 === 0 ? 'x' : ' '}] Strikethrough via ~~tilde~~`,
    ].join('\n'),
    tags: ['react', 'typescript'].slice(0, 1 + (i % 2)),
    list: priorityOptions[i % priorityOptions.length]!.value,
    chipSelect: [priorityOptions[i % priorityOptions.length]!.value],
    compoundChipList: [
      { id: `c${i}-1`, label: `Chip A-${i}` },
      { id: `c${i}-2`, label: `Chip B-${i}` },
    ],
    upload: i % 3 === 0 ? 'report.pdf' : '',
    subGrid: [
      { task: `Sub-task ${i}-A`, hours: 4 },
      { task: `Sub-task ${i}-B`, hours: 2 },
    ],
  }));
}

export const AllCellTypes: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>All 15 Cell Types</h2>
      <p style={styles.subtitle}>
        Scroll horizontally to see every cell type. Double-click to edit.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeData()}
          columns={columns as any}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
          chrome={{ rowNumbers: true }}
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Tags — multi-select dropdown (issue #94)
// ---------------------------------------------------------------------------

const tagOptions: StatusOption[] = [
  { value: 'frontend', label: 'Frontend', color: '#3b82f6' },
  { value: 'backend', label: 'Backend', color: '#10b981' },
  { value: 'design', label: 'Design', color: '#a855f7' },
  { value: 'qa', label: 'QA', color: '#f59e0b' },
  { value: 'docs', label: 'Docs' },
];

interface TagRow {
  id: string;
  name: string;
  labels: string[];
}

function makeTagRows(): TagRow[] {
  // Two rows are enough for the e2e — one prefilled to assert the round-trip
  // of pre-selected options, one empty to assert the picker flow from scratch.
  return [
    { id: '1', name: 'Ticket #1', labels: ['frontend'] },
    { id: '2', name: 'Ticket #2', labels: [] },
  ];
}

const tagColumns: ColumnDef<TagRow>[] = [
  { id: 'name', field: 'name', title: 'Name', width: 160, cellType: 'text' },
  {
    id: 'labels',
    field: 'labels',
    title: 'Labels',
    width: 320,
    cellType: 'tags',
    options: tagOptions,
    editable: true,
  },
];

/**
 * Tag-list cell — multi-select variant of the dropdown cell (issue #94).
 *
 * Uses the React (non-MUI) `DataGrid` directly so the new `TagsCell`
 * checkbox-picker is exercised. The MUI grid swaps in `MuiTagsCell` via its
 * own renderer map, which is a separate concern.
 */
export const TagsMultiSelect: StoryObj = {
  render: () => {
    // Controlled data so chip-remove + multi-select commits round-trip into
    // the visible cell — without this the cell would re-mount with the stale
    // prop on every commit and lose the change.
    const [rows, setRows] = React.useState<TagRow[]>(() => makeTagRows());
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Tag list — multi-select (#94)</h2>
        <p style={styles.subtitle}>
          Double-click the Labels cell to open the multi-select picker. Click
          chips' × in either mode to remove a tag.
        </p>
        <div style={gridContainer}>
          <DataGrid
            data={rows}
            columns={tagColumns as any}
            rowKey="id"
            cellRenderers={cellRendererMap as any}
            selectionMode="cell"
            keyboardNavigation
            onCellEdit={(_id, field, value) => {
              setRows((prev) =>
                prev.map((r) =>
                  r.id === _id ? { ...r, [field]: value as string[] } : r
                )
              );
            }}
          />
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Actions column
// ---------------------------------------------------------------------------

export const ActionsColumn: StoryObj = {
  render: () => {
    const data = makeData().slice(0, 5);
    const cols: ColumnDef<CellShowcase>[] = [
      { id: 'text', field: 'text', title: 'Name', width: 200 },
      { id: 'status', field: 'status', title: 'Status', width: 120, cellType: 'status', options: statusOptions },
      {
        id: 'actions', field: 'id', title: 'Actions', width: 200, cellType: 'actions',
        options: [
          { value: 'edit', label: 'Edit' },
          { value: 'delete', label: 'Delete' },
          { value: 'archive', label: 'Archive' },
        ],
      },
    ];
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Actions Column</h2>
        <p style={styles.subtitle}>
          Action buttons rendered per row via the <code>actions</code> cell type.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={cols as any}
            rowKey="id"
            />
        </div>
      </div>
    );
  },
};
