import React, { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataGrid } from '@iasbuilt/datagrid-react';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/HoverTooltip',
};
export default meta;

// ---------------------------------------------------------------------------
// Demo data — CMMS / DAM flavoured so the per-row notes feel realistic.
// ---------------------------------------------------------------------------

interface Asset {
  id: string;
  name: string;
  serial: string;
  location: string;
  technician: string;
  status: string;
  lastService: string;
}

const assets: Asset[] = [
  {
    id: 'a-001',
    name: 'HVAC-Roof-A2',
    serial: 'HV-2019-88142',
    location: 'Bldg A / Roof / Zone 2',
    technician: 'M. Alvarez',
    status: 'Operational',
    lastService: '2025-08-13',
  },
  {
    id: 'a-002',
    name: 'Generator-North',
    serial: 'GN-2021-00417',
    location: 'Bldg B / Basement / Utility 1',
    technician: 'R. Okafor',
    status: 'Scheduled',
    lastService: '2025-11-02',
  },
  {
    id: 'a-003',
    name: 'Chiller-03',
    serial: 'CH-2018-55091',
    location: 'Bldg A / Mech Room 3',
    technician: 'S. Tanaka',
    status: 'Operational',
    lastService: '2025-09-21',
  },
  {
    id: 'a-004',
    name: 'Pump-Condensate-7',
    serial: 'PC-2022-10338',
    location: 'Bldg C / Plant Deck',
    technician: 'M. Alvarez',
    status: 'Attention',
    lastService: '2025-07-04',
  },
  {
    id: 'a-005',
    name: 'AHU-East-Wing',
    serial: 'AH-2020-66210',
    location: 'Bldg A / East Wing / Ceiling',
    technician: 'L. Petrov',
    status: 'Operational',
    lastService: '2025-10-11',
  },
  {
    id: 'a-006',
    name: 'Boiler-Main',
    serial: 'BM-2017-41008',
    location: 'Bldg B / Basement / Utility 2',
    technician: 'R. Okafor',
    status: 'Down',
    lastService: '2025-06-28',
  },
  {
    id: 'a-007',
    name: 'Elevator-Freight-1',
    serial: 'EF-2023-77520',
    location: 'Bldg C / Shaft 1',
    technician: 'S. Tanaka',
    status: 'Operational',
    lastService: '2025-10-30',
  },
];

// ---------------------------------------------------------------------------
// Columns used by the Default + KeyboardAccessible stories
// ---------------------------------------------------------------------------

const defaultAssetColumns: ColumnDef<Asset>[] = [
  {
    field: 'name',
    header: 'Asset',
    width: 200,
    editable: true,
    // No `note` -> tooltip falls back to the cell's rendered text.
  },
  {
    field: 'serial',
    header: 'Serial',
    width: 180,
    // Static string note -> same hint for every cell in the column.
    note: "The serial number on the asset's manufacturer label.",
  },
  {
    field: 'location',
    header: 'Location',
    width: 260,
    // Function note -> per-row computed content.
    note: (row) =>
      `Full path: ${row.location} (asset ${row.id}, last serviced ${row.lastService}).`,
  },
];

// ---------------------------------------------------------------------------
// Default — mix of fallback / static / dynamic notes
// ---------------------------------------------------------------------------

export const Default: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Hover tooltip — column notes</h2>
      <p style={styles.subtitle}>
        Hover (or keyboard-focus) any cell and pause for ~400ms. A portaled{' '}
        <code>[role=&quot;tooltip&quot;]</code> appears next to the cell. Content
        priority: <code>note</code> function &rarr; <code>note</code> string
        &rarr; the cell's rendered text. The tooltip dismisses on mouseleave,{' '}
        <kbd>Escape</kbd>, scroll, or focus change.
      </p>
      <div style={gridContainer}>
        <DataGrid
          data={assets}
          columns={defaultAssetColumns as any}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
      <ul style={{ ...styles.subtitle, paddingLeft: 20, margin: 0 }}>
        <li>
          <span style={{ color: '#10b981' }}>&#10003;</span>{' '}
          <code>note: string</code> &mdash; static per-column hint (see{' '}
          <strong>Serial</strong>).
        </li>
        <li>
          <span style={{ color: '#10b981' }}>&#10003;</span>{' '}
          <code>note: (row) =&gt; string</code> &mdash; per-row dynamic content
          (see <strong>Location</strong>).
        </li>
        <li>
          <span style={{ color: '#10b981' }}>&#10003;</span> No <code>note</code>{' '}
          &mdash; tooltip shows the cell's rendered text (see{' '}
          <strong>Asset</strong>).
        </li>
      </ul>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// PerRowNotes — prominent use of the function-note form
// ---------------------------------------------------------------------------

const perRowColumns: ColumnDef<Asset>[] = [
  {
    field: 'name',
    header: 'Asset',
    width: 220,
    editable: true,
    // Function note string-templates from row fields so each row's tooltip
    // reads as a contextual service summary.
    note: (row) =>
      `Last serviced ${row.lastService} by ${row.technician}. Status: ${row.status}.`,
  },
  {
    field: 'technician',
    header: 'Technician',
    width: 160,
    note: (row) => `Primary technician assigned to ${row.name}.`,
  },
  {
    field: 'status',
    header: 'Status',
    width: 140,
    note: (row) =>
      row.status === 'Down'
        ? `${row.name} is currently DOWN — escalate to ${row.technician}.`
        : `${row.name} reported ${row.status.toLowerCase()} at last check.`,
  },
  {
    field: 'lastService',
    header: 'Last service',
    width: 140,
  },
];

export const PerRowNotes: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Per-row hover tooltips</h2>
      <p style={styles.subtitle}>
        Every column here uses the function form of <code>note</code>, so the
        tooltip string is computed from the hovered row. Hover any{' '}
        <strong>Asset</strong> cell to see a service summary built from{' '}
        <code>row.lastService</code>, <code>row.technician</code>, and{' '}
        <code>row.status</code>.
      </p>
      <div style={gridContainer}>
        <DataGrid
          data={assets}
          columns={perRowColumns as any}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// KeyboardAccessible — same columns as Default, plus a focus-first-cell button
// ---------------------------------------------------------------------------

export const KeyboardAccessible: StoryObj = {
  render: () => {
    const gridWrapperRef = useRef<HTMLDivElement | null>(null);

    const focusFirstCell = () => {
      const root = gridWrapperRef.current;
      if (!root) return;
      // DataGrid cells are rendered with `data-row-id` + `data-col`. Pick the
      // first one so users can watch the keyboard reveal path light up.
      const firstCell = root.querySelector<HTMLElement>(
        '[data-row-id][data-col]'
      );
      firstCell?.focus();
    };

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Keyboard-accessible hover tooltip</h2>
        <p style={styles.subtitle}>
          The same 400ms tooltip fires on keyboard focus, not just mouse hover.
          Tab into the grid (or click the button below) and pause on a cell —
          after the delay the portaled tooltip appears. Press <kbd>Escape</kbd>{' '}
          to dismiss; moving focus to a different cell also dismisses the
          current tooltip before opening the next one.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={focusFirstCell}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Focus first cell
          </button>
          <span style={{ ...styles.subtitle, fontSize: 12 }}>
            Hint: press <kbd>Escape</kbd> to dismiss the tooltip.
          </span>
        </div>
        <div ref={gridWrapperRef} style={gridContainer}>
          <DataGrid
            data={assets}
            columns={defaultAssetColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
          />
        </div>
      </div>
    );
  },
};
