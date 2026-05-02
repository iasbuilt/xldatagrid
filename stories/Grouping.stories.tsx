import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import { makeOrders, orderColumns } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Grouping',
};
export default meta;

export const RowGrouping: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Row Grouping</h2>
      <p style={styles.subtitle}>
        Orders grouped by Category. Click group headers to expand/collapse.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeOrders(60)}
          columns={orderColumns as any}
          rowKey="id"

          grouping={{
            rows: { fields: ['category'], defaultExpanded: true },
          }}
          sorting
          showGroupControls
        />
      </div>
    </div>
  ),
};

export const RowGroupingWithAggregates: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Row Grouping + Aggregates</h2>
      <p style={styles.subtitle}>
        Grouped by Region with sum of Total and average Quantity per group.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeOrders(60)}
          columns={orderColumns as any}
          rowKey="id"

          grouping={{
            rows: {
              fields: ['region'],
              defaultExpanded: true,
              aggregates: { total: 'sum', quantity: 'avg' },
            },
          }}
          sorting
          showGroupControls
        />
      </div>
    </div>
  ),
};

export const MultiLevelGrouping: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Multi-Level Grouping</h2>
      <p style={styles.subtitle}>
        Two-level nesting: first by Region, then by Category within each region.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeOrders(60)}
          columns={orderColumns as any}
          rowKey="id"

          grouping={{
            rows: { fields: ['region', 'category'], defaultExpanded: true },
          }}
          sorting
          showGroupControls
        />
      </div>
    </div>
  ),
};

export const ColumnGrouping: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Column Grouping</h2>
      <p style={styles.subtitle}>
        Columns are grouped under spanning headers. Click the collapse button on a group to collapse.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeOrders(30)}
          columns={orderColumns as any}
          rowKey="id"

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
          sorting
        />
      </div>
    </div>
  ),
};
