/**
 * Re-exports shared demo data from stories + playground-specific data generators.
 */
export {
  makeEmployees,
  defaultColumns,
  departmentOptions,
  roleOptions,
  cityOptions,
  makeOrders,
  orderColumns,
  orderStatusOptions,
} from '../../stories/data';
export type { Employee, Order } from '../../stories/data';

// ---------------------------------------------------------------------------
// Cell Showcase — covers all 15 cell types in one grid
// ---------------------------------------------------------------------------

import type { ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';

export interface CellShowcase {
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
  compoundChipList: { id: string; label: string }[];
  upload: string;
  subGrid: Record<string, unknown>[];
}

export const showcaseStatusOptions: StatusOption[] = [
  { value: 'Active', label: 'Active', color: '#10b981' },
  { value: 'Inactive', label: 'Inactive', color: '#ef4444' },
  { value: 'Pending', label: 'Pending', color: '#f59e0b' },
];

export const priorityOptions: StatusOption[] = [
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
  { value: 'Critical', label: 'Critical' },
];

const subGridCols: ColumnDef[] = [
  { id: 'task', field: 'task', title: 'Task', width: 200 },
  { id: 'hours', field: 'hours', title: 'Hours', width: 80, cellType: 'numeric' },
];

export const cellShowcaseColumns: ColumnDef<CellShowcase>[] = [
  { id: 'text', field: 'text', title: 'Text', width: 150, cellType: 'text', editable: true, placeholder: 'Type here...' },
  { id: 'numeric', field: 'numeric', title: 'Numeric', width: 100, cellType: 'numeric', editable: true, min: 0, max: 100 },
  { id: 'currency', field: 'currency', title: 'Currency', width: 120, cellType: 'currency', editable: true, format: 'USD' },
  { id: 'boolean', field: 'boolean', title: 'Boolean', width: 90, cellType: 'boolean', editable: true },
  { id: 'calendar', field: 'calendar', title: 'Calendar', width: 150, cellType: 'calendar', editable: true },
  { id: 'status', field: 'status', title: 'Status', width: 120, cellType: 'status', options: showcaseStatusOptions, editable: true },
  { id: 'list', field: 'list', title: 'List', width: 120, cellType: 'list', options: priorityOptions, editable: true },
  { id: 'password', field: 'password', title: 'Password', width: 130, cellType: 'password', editable: true },
  { id: 'tags', field: 'tags', title: 'Tags', width: 200, cellType: 'tags', suggestions: ['react', 'vue', 'angular', 'svelte'], allowFreeText: true, editable: true },
  { id: 'chipSelect', field: 'chipSelect', title: 'Chip Select', width: 200, cellType: 'chipSelect', options: priorityOptions, multiSelect: true, editable: true },
  { id: 'richText', field: 'richText', title: 'Rich Text', width: 200, cellType: 'richText', editable: true },
  { id: 'upload', field: 'upload', title: 'Upload', width: 140, cellType: 'upload', editable: true },
  { id: 'compoundChipList', field: 'compoundChipList', title: 'Compound Chips', width: 250, cellType: 'compoundChipList', editable: true },
  { id: 'subGrid', field: 'subGrid', title: 'Sub-Grid', width: 120, cellType: 'subGrid', subGridColumns: subGridCols, subGridRowKey: 'task' },
];

export function makeCellShowcaseData(count = 8): CellShowcase[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    text: `Item ${i + 1}`,
    numeric: 10 + i * 7,
    currency: 1500 + i * 250,
    boolean: i % 2 === 0,
    calendar: `2025-0${(i % 9) + 1}-${String(10 + i).padStart(2, '0')}`,
    status: showcaseStatusOptions[i % showcaseStatusOptions.length]!.value,
    password: 'p@ssw0rd!',
    richText: `<b>Bold ${i + 1}</b> and <em>italic</em> text`,
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
