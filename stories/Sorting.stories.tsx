import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import type { SortState } from '@iasbuilt/datagrid-core';
import { makeEmployees, defaultColumns } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Sorting',
};
export default meta;

export const SingleSort: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Single Column Sort</h2>
      <p style={styles.subtitle}>Click a column header to sort. Click again to reverse.</p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(30)}
          columns={defaultColumns as any}
          rowKey="id"
          sorting={{ mode: 'single' }}
        />
      </div>
    </div>
  ),
};

export const MultiSort: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Multi-Column Sort</h2>
      <p style={styles.subtitle}>
        Hold <kbd>Shift</kbd> and click additional column headers to add secondary sorts. Priority numbers appear next to arrows.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(30)}
          columns={defaultColumns as any}
          rowKey="id"
          sorting={{ mode: 'multi' }}
        />
      </div>
    </div>
  ),
};

export const SortChangeCallback: StoryObj = {
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>onSortChange Callback</h2>
        <p style={styles.subtitle}>Sort events are logged below the grid.</p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(15)}
            columns={defaultColumns as any}
            rowKey="id"
              sorting={{ mode: 'multi' }}
            onSortChange={(s: SortState) =>
              setLog((prev) => [...prev.slice(-4), JSON.stringify(s)])
            }
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(sort a column to see events)'}
        </pre>
      </div>
    );
  },
};

export const SortFromFilterMenu: StoryObj = {
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Sort from the Excel Filter Menu</h2>
        <p style={styles.subtitle}>
          When <code>showFilterMenu</code> is enabled, the Excel 365 filter dropdown
          also hosts the sort entries at the top of the menu. Click the filter chevron
          on any header and choose <strong>Sort A to Z</strong> / <strong>Sort Z to A</strong>
          (or <em>Smallest to Largest</em> / <em>Oldest to Newest</em> for numeric/date
          columns). The dropdown emits the same sort mutation as clicking a header, so
          <code> onSortChange</code> fires in both paths.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(40)}
            columns={defaultColumns as any}
            rowKey="id"
            sorting={{ mode: 'single' }}
            filtering={{ debounceMs: 200 }}
            showFilterMenu
            gridId="sorting-filter-menu"
            onSortChange={(s: SortState) =>
              setLog((prev) => [...prev.slice(-4), JSON.stringify(s)])
            }
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(open the filter menu on a header and pick a sort row)'}
        </pre>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Sort can be triggered either by clicking a column header (classic path) or by ' +
          'opening the Excel 365 filter menu and choosing one of the top-of-menu sort rows. ' +
          'The sort label adapts to column data type: "Sort A to Z" for text, ' +
          '"Sort Smallest to Largest" for numbers, "Sort Oldest to Newest" for dates.',
      },
    },
  },
};
