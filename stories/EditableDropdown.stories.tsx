/**
 * Editable-dropdown stories (see GitHub #93).
 *
 * Demonstrates a status column whose option list is mutable from inside
 * the dropdown — users can append new options via the inline "Add new…"
 * input and remove existing ones via the per-option × button when the
 * consumer-supplied auth gate (`canDeleteOption`) authorises it.
 *
 * These stories drive the React-flavoured `DataGrid` (not the MUI variant)
 * because the editable-dropdown UI is implemented in the React
 * `StatusCell` renderer.
 */
import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataGrid, cellRendererMap } from '@iasbuilt/datagrid-react';
import type { ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Editable Dropdown',
};
export default meta;

interface Row {
  id: string;
  name: string;
  status: string;
}

const initialOptions: StatusOption[] = [
  { value: 'active', label: 'Active', color: '#22c55e' },
  { value: 'inactive', label: 'Inactive', color: '#ef4444' },
  { value: 'pending', label: 'Pending', color: '#f59e0b' },
];

const initialData: Row[] = [
  { id: 'r1', name: 'Asset Alpha', status: 'active' },
  { id: 'r2', name: 'Asset Beta', status: 'inactive' },
  { id: 'r3', name: 'Asset Gamma', status: 'pending' },
];

// ---------------------------------------------------------------------------
// Story: editable dropdown with admin-style permissions (delete authorised
// for every option).
// ---------------------------------------------------------------------------

/**
 * The "admin" view shows the full feature surface: add new options + delete
 * any option. Consumers wire arbitrary permission logic (e.g. a GraphQL
 * user-type lookup, cached for the session) inside `canDeleteOption`.
 */
export const AdminEditableDropdown: StoryObj = {
  render: () => {
    const [options, setOptions] = useState<StatusOption[]>(initialOptions);

    const columns: ColumnDef<Row>[] = [
      { id: 'name', field: 'name', title: 'Name', width: 200 },
      {
        id: 'status',
        field: 'status',
        title: 'Status',
        width: 200,
        cellType: 'status',
        editable: true,
        options,
        // The cell mutates its own internal list, but for the story we mirror
        // the change into the parent state so the new options persist across
        // re-renders / row toggles.
        onAddOption: async (label: string) => {
          const created: StatusOption = {
            value: label.toLowerCase().replace(/\s+/g, '-'),
            label,
            color: '#6366f1',
          };
          setOptions((prev) =>
            prev.some((o) => o.value === created.value) ? prev : [...prev, created],
          );
          return created;
        },
        canDeleteOption: () => true,
        onDeleteOption: async (opt) => {
          setOptions((prev) => prev.filter((o) => o.value !== opt.value));
        },
      },
    ];

    return (
      <div style={storyContainer} data-testid="story-root">
        <h2 style={styles.heading}>Editable Dropdown — Admin</h2>
        <p style={styles.subtitle}>
          Double-click a status cell to open the dropdown. Use the "Add new…"
          input at the bottom to append options; click × on any option to
          remove it.
        </p>
        <div style={gridContainer}>
          <DataGrid
            data={initialData}
            columns={columns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            cellRenderers={cellRendererMap as any}
          />
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Story: read-only "viewer" — add allowed but delete denied. Exercises the
// negative branch of canDeleteOption.
// ---------------------------------------------------------------------------

/**
 * The "viewer" surface keeps the Add affordance but withholds delete from
 * every option. The × buttons must not render and the keyboard Delete
 * shortcut must be a no-op.
 */
export const ViewerEditableDropdown: StoryObj = {
  render: () => {
    const [options, setOptions] = useState<StatusOption[]>(initialOptions);

    const columns: ColumnDef<Row>[] = [
      { id: 'name', field: 'name', title: 'Name', width: 200 },
      {
        id: 'status',
        field: 'status',
        title: 'Status',
        width: 200,
        cellType: 'status',
        editable: true,
        options,
        onAddOption: async (label: string) => {
          const created: StatusOption = {
            value: label.toLowerCase().replace(/\s+/g, '-'),
            label,
            color: '#0ea5e9',
          };
          setOptions((prev) =>
            prev.some((o) => o.value === created.value) ? prev : [...prev, created],
          );
          return created;
        },
        // Viewer role — no deletions authorised.
        canDeleteOption: () => false,
        onDeleteOption: async () => {
          throw new Error('unauthorised');
        },
      },
    ];

    return (
      <div style={storyContainer} data-testid="story-root">
        <h2 style={styles.heading}>Editable Dropdown — Viewer</h2>
        <p style={styles.subtitle}>
          Add is enabled, delete is gated off by <code>canDeleteOption</code>.
        </p>
        <div style={gridContainer}>
          <DataGrid
            data={initialData}
            columns={columns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            cellRenderers={cellRendererMap as any}
          />
        </div>
      </div>
    );
  },
};
