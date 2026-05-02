import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MasterDetail } from '@iasbuilt/datagrid-react';
import type { DetailComponentProps } from '@iasbuilt/datagrid-react';
import { makeEmployees, defaultColumns, Employee } from './data';
import { allCellRenderers, storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Master-Detail',
};
export default meta;

function EmployeeDetail({ masterRow, detailData, loading }: DetailComponentProps<Employee>) {
  if (loading) return <div style={styles.masterDetailLoading}>Loading...</div>;
  return (
    <div style={styles.masterDetailPanel}>
      <div>
        <strong>Full Profile</strong>
        <table style={styles.masterDetailTable}>
          <tbody>
            {Object.entries(masterRow).map(([key, val]) => (
              <tr key={key}>
                <td style={styles.masterDetailKeyCell}>{key}</td>
                <td style={styles.masterDetailValueCell}>{String(val)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detailData && (
        <div>
          <strong>Fetched Detail</strong>
          <pre style={styles.masterDetailPre}>
            {JSON.stringify(detailData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export const BasicMasterDetail: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Master-Detail</h2>
      <p style={styles.subtitle}>
        Click the expand arrow on a row to see its detail panel. Multiple rows can be expanded.
      </p>
      <div style={gridContainer}>
        <MasterDetail
          data={makeEmployees(20)}
          columns={defaultColumns as any}
          rowKey="id"
          cellRenderers={allCellRenderers}
          detailComponent={EmployeeDetail as any}
          sorting
          selectionMode="cell"
        />
      </div>
    </div>
  ),
};

export const SingleExpand: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Master-Detail (Single Expand)</h2>
      <p style={styles.subtitle}>
        Only one row can be expanded at a time. Expanding a new row collapses the previous one.
      </p>
      <div style={gridContainer}>
        <MasterDetail
          data={makeEmployees(15)}
          columns={defaultColumns as any}
          rowKey="id"
          cellRenderers={allCellRenderers}
          detailComponent={EmployeeDetail as any}
          singleExpand
          sorting
        />
      </div>
    </div>
  ),
};

export const LazyLoadDetail: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Lazy-Loaded Detail</h2>
      <p style={styles.subtitle}>
        Detail data is fetched asynchronously on expand (simulated 800ms delay).
      </p>
      <div style={gridContainer}>
        <MasterDetail
          data={makeEmployees(15)}
          columns={defaultColumns as any}
          rowKey="id"
          cellRenderers={allCellRenderers}
          detailComponent={EmployeeDetail as any}
          fetchDetail={async (row: Employee) => {
            await new Promise((r) => setTimeout(r, 800));
            return { bio: `${row.name} has been at the company since ${row.startDate}.`, projects: 3 + Number(row.id) };
          }}
          sorting
        />
      </div>
    </div>
  ),
};
