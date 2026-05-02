import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import type { GhostRowConfig } from '@iasbuilt/datagrid-core';
import { makeEmployees, defaultColumns, Employee } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Ghost Row',
};
export default meta;

export const BottomGhostRow: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Bottom ghost row for inserting new records. When a row-number gutter is enabled, the ghost row renders below the last data row and the left-sticky gutter continues to run alongside it.',
      },
    },
  },
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Ghost Row (Bottom)</h2>
        <p style={styles.subtitle}>
          An input row at the bottom for adding new records. Tab between cells, press <kbd>Enter</kbd> on the last cell to insert.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(5)}
            columns={defaultColumns as any}
            rowKey="id"

            ghostRow={{ position: 'bottom', placeholder: 'Add new employee...' } as GhostRowConfig<Employee>}
            onRowAdd={(row) => setLog((p) => [...p.slice(-4), JSON.stringify(row)])}
            keyboardNavigation
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(add a row to see events)'}
        </pre>
      </div>
    );
  },
};

export const TopStickyGhostRow: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Ghost Row (Top, Sticky)</h2>
      <p style={styles.subtitle}>
        Ghost row pinned to the top of the scroll area. Scroll down — it stays visible.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(30)}
          columns={defaultColumns as any}
          rowKey="id"
          ghostRow={{ position: 'top', sticky: true, placeholder: 'New row (sticky top)...' } as GhostRowConfig<Employee>}
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

export const AboveHeaderGhostRow: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Ghost Row (Above Header)</h2>
      <p style={styles.subtitle}>
        The ghost row renders above the column headers.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(10)}
          columns={defaultColumns as any}
          rowKey="id"
          ghostRow={{ position: 'above-header', placeholder: 'New row above header...' } as GhostRowConfig<Employee>}
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

export const GhostRowWithValidation: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Ghost Row with Validation</h2>
      <p style={styles.subtitle}>
        Row-level validation: name is required. Try submitting without filling in the Name field.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(5)}
          columns={defaultColumns as any}
          rowKey="id"
          ghostRow={{
            position: 'bottom',
            placeholder: 'Name is required...',
            validate: (values: Partial<Employee>) =>
              !values.name || String(values.name).trim() === '' ? 'Name is required' : null,
          } as GhostRowConfig<Employee>}
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

export const GhostRowWithDefaults: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Ghost Row with Default Values</h2>
      <p style={styles.subtitle}>
        New rows are pre-filled with <code>department: Engineering</code> and <code>active: true</code>.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(5)}
          columns={defaultColumns as any}
          rowKey="id"
          ghostRow={{
            position: 'bottom',
            defaultValues: { department: 'Engineering', active: true },
          } as GhostRowConfig<Employee>}
          keyboardNavigation
        />
      </div>
    </div>
  ),
};
