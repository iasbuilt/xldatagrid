import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import { makeEmployees, defaultColumns } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Basic Grid',
};
export default meta;

// ---------------------------------------------------------------------------
// Default
// ---------------------------------------------------------------------------

export const Default: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Basic grid with 50 rows, multi-sort, filterable columns, and cell selection. When the row-number gutter is enabled via `chrome.rowNumbers`, it now defaults to `position: "left"` and stays sticky-left during horizontal scroll (Excel 365 convention). Opt in to the legacy right-side gutter with `position: "right"`.',
      },
    },
  },
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Basic DataGrid</h2>
      <p style={styles.subtitle}>
        50 rows, sorting enabled, filterable columns. Double-click a cell to edit.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(50)}
          columns={defaultColumns as any}
          rowKey="id"
          sorting={{ mode: 'multi' }}
          filtering
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Read Only
// ---------------------------------------------------------------------------

export const ReadOnly: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Read-Only Grid</h2>
      <p style={styles.subtitle}>
        All editing disabled. Sort and select still work.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(20)}
          columns={defaultColumns as any}
          rowKey="id"
          readOnly
          sorting
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Large Dataset
// ---------------------------------------------------------------------------

export const LargeDataset: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Large Dataset (500 rows)</h2>
      <p style={styles.subtitle}>
        Virtualized rendering for performance. Scroll to verify smooth behaviour.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(500)}
          columns={defaultColumns as any}
          rowKey="id"
          sorting={{ mode: 'multi' }}
          selectionMode="range"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Left Row Numbers (Excel-style sticky gutter)
// ---------------------------------------------------------------------------

export const BasicGrid_LeftRowNumbers: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Basic grid with the row-number gutter enabled. The gutter defaults to `position: "left"` and is sticky-left during horizontal scroll, matching Excel 365. Clicking a row-number cell still selects the whole row.',
      },
    },
  },
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Basic Grid with Left Row Numbers</h2>
      <p style={styles.subtitle}>
        Excel-style sticky row-number gutter on the left. Scroll horizontally — the gutter stays pinned.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(30)}
          columns={defaultColumns as any}
          rowKey="id"
          chrome={{ rowNumbers: true }}
          sorting
          selectionMode="range"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

export const EmptyGrid: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Empty Grid</h2>
      <p style={styles.subtitle}>
        No data rows — the grid shows column headers only.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={[]}
          columns={defaultColumns as any}
          rowKey="id"
        />
      </div>
    </div>
  ),
};
