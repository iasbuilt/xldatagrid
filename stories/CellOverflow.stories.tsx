import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import type { ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/CellOverflow',
};
export default meta;

// ---------------------------------------------------------------------------
// DAM/CMMS fixture rows — each seeded with realistically long values so the
// per-column overflow policies have something to clip / clamp / wrap.
// ---------------------------------------------------------------------------

interface AssetRow {
  asset_name: string;
  asset_tag: string;
  serial_number: string;
  location_path: string;
  file_path: string;
  description: string;
  notes: string;
  status: string;
}

const statusOptions: StatusOption[] = [
  { value: 'Active', label: 'Active', color: '#10b981' },
  { value: 'Maintenance', label: 'Maintenance', color: '#f59e0b' },
  { value: 'Retired', label: 'Retired', color: '#ef4444' },
];

const rows: AssetRow[] = [
  {
    asset_name:
      'Studio A — Sony FX9 Cinema Camera Body Only with Original Box and Manual',
    asset_tag: '9X-A2D7-FB89-ZZ-2025-0001-EU-NORTH-LON',
    serial_number: 'SN-0007-FX9-2025-EU-NORTH-LON-42-AUX-SHIP',
    location_path:
      'HQ / Building 3 / Floor 2 / Studio A / Equipment Locker North / Shelf B-12',
    file_path:
      'C:\\Storage\\Productions\\2026\\Q1\\Episode-005\\Footage\\A001_C002_0419ZB.mxf',
    description:
      'Primary A-cam body used on Ep-005 and Ep-006; stored in hard-case shelf B-12 with silica gel and a Peli insert. Serviced 2026-02-14.',
    notes:
      'Requires quarterly sensor cleaning. Last cleaning performed by vendor XYZ on 2026-02-14. Calibration card archived in Vault.',
    status: 'Active',
  },
  {
    asset_name: 'Canon EOS C500 Mk II with EF Mount and Base Rig',
    asset_tag: 'C500-MKII-EF-2024-0002-EU-CENTRAL-PAR',
    serial_number: 'SN-0015-C500-2024-EU-CENTRAL-PAR-07',
    location_path:
      'HQ / Building 1 / Floor 1 / Storage Room 3 / Rack 4 / Slot C',
    file_path:
      'C:\\Storage\\Productions\\2025\\Q4\\Episode-002\\Footage\\B003_C001_1211KK.mxf',
    description:
      'Backup A-cam for narrative shoots. Currently in servicing queue for firmware upgrade v1.2.4.',
    notes: 'Battery plate replaced 2026-01-08.',
    status: 'Maintenance',
  },
  {
    asset_name: 'ARRI Alexa Mini LF with PL Mount',
    asset_tag: 'ALEXA-MINI-LF-PL-2023-0011-US-WEST-LAX',
    serial_number: 'SN-0022-AMLF-2023-US-WEST-LAX-18-CAMFLEET-9',
    location_path:
      'LA Office / Studio Floor / Rental Prep Bay / Cage 2 / Slot 7',
    file_path:
      'D:\\Media\\Projects\\FeatureFilm-X\\Dailies\\2026-04-12\\Roll-A014_C007_0412AB.mxf',
    description:
      'Flagship feature-film body, PL-only. Insured under policy 8814-LF.',
    notes: 'Do NOT ship without flight case. Requires CITES permit for EU use.',
    status: 'Active',
  },
  {
    asset_name: 'RED V-Raptor XL 8K VV',
    asset_tag: 'VRAPTOR-XL-8K-VV-2025-0003-APAC-TOKYO',
    serial_number: 'SN-0099-VRAPTOR-2025-APAC-TOKYO-03',
    location_path: 'Tokyo Office / Rental / Prep Bay 1 / Shelf A',
    file_path: 'E:\\Red\\Dailies\\2026-03-22\\A001_C005_0322XY.r3d',
    description:
      '8K VistaVision body; ships with 120 fps license and recorder upgrade module.',
    notes: 'Global shutter add-on ordered, ETA 2026-05-01.',
    status: 'Active',
  },
  {
    asset_name: 'Blackmagic URSA Mini Pro 12K',
    asset_tag: 'URSA-12K-0004-EMEA-LON',
    serial_number: 'SN-0121-URSA-2024-EMEA-LON-55',
    location_path: 'London HQ / Camera Vault / Cage 1 / Slot 12',
    file_path:
      'F:\\BM\\Projects\\Documentary-Q2\\Footage\\Day-03\\A003_C002_0501LM.braw',
    description:
      'Workhorse documentary body. Ships with 5-inch side handle and SSD cage.',
    notes: 'Battery drain on firmware 7.9.2 — schedule downgrade.',
    status: 'Maintenance',
  },
];

// ---------------------------------------------------------------------------
// Column definitions — each column declares its intended overflow policy.
// Fields map 1:1 to `getDefaultOverflowPolicy`'s defaults, but we also set
// `overflow` explicitly so the story showcases the API surface Phase B will
// add and the Playwright spec can rely on known attributes.
// ---------------------------------------------------------------------------

const columns: ColumnDef<AssetRow>[] = [
  {
    id: 'asset_name',
    field: 'asset_name',
    title: 'Asset Name',
    width: 220,
    // @ts-expect-error — Phase B will add `overflow` to ColumnDef
    overflow: 'truncate-end',
  },
  {
    id: 'asset_tag',
    field: 'asset_tag',
    title: 'Asset Tag',
    width: 180,
    // @ts-expect-error — Phase B will add `overflow` to ColumnDef
    overflow: 'truncate-middle',
  },
  {
    id: 'serial_number',
    field: 'serial_number',
    title: 'Serial Number',
    width: 200,
    // @ts-expect-error — Phase B will add `overflow` to ColumnDef
    overflow: 'truncate-middle',
  },
  {
    id: 'location_path',
    field: 'location_path',
    title: 'Location Path',
    width: 240,
    // @ts-expect-error — Phase B will add `overflow` to ColumnDef
    overflow: 'truncate-middle',
  },
  {
    id: 'file_path',
    field: 'file_path',
    title: 'File Path',
    width: 260,
    // @ts-expect-error — Phase B will add `overflow` to ColumnDef
    overflow: 'truncate-middle',
  },
  {
    id: 'description',
    field: 'description',
    title: 'Description',
    width: 280,
    // @ts-expect-error — Phase B will add `overflow` to ColumnDef
    overflow: 'clamp-2',
  },
  {
    id: 'notes',
    field: 'notes',
    title: 'Notes',
    width: 240,
    // @ts-expect-error — Phase B will add `overflow` to ColumnDef
    overflow: 'clamp-2',
  },
  {
    id: 'status',
    field: 'status',
    title: 'Status',
    width: 120,
    cellType: 'status',
    options: statusOptions,
    // @ts-expect-error — Phase B will add `overflow` to ColumnDef
    overflow: 'truncate-end',
  },
];

// ---------------------------------------------------------------------------
// Default story — includes a density toggle the Playwright spec targets via
// `[data-testid="density-toggle"]`.
// ---------------------------------------------------------------------------

export const Default: StoryObj = {
  render: () => {
    const [density, setDensity] = useState<'compact' | 'comfortable'>(
      'compact',
    );
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Cell Overflow &amp; Full-Text Reveal</h2>
        <p style={styles.subtitle}>
          Every column declares an <code>overflow</code> policy. Hover or focus
          a clipped cell to reveal the full raw value via the hover tooltip.
          Double-click a cell to edit the original text. Toggle density below
          to give multi-line policies (<code>clamp-2</code>, <code>clamp-3</code>
          , <code>wrap</code>) room to breathe.
        </p>
        <div style={styles.flexRowCenter}>
          <button
            type="button"
            data-testid="density-toggle"
            onClick={() =>
              setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))
            }
            style={styles.extensionsBtnStyle}
          >
            Density: {density} (click to toggle)
          </button>
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={rows}
            columns={columns as any}
            rowKey="asset_tag"
            selectionMode="cell"
            keyboardNavigation
            // @ts-expect-error — Phase B will add `density` to DataGridProps
            density={density}
          />
        </div>
      </div>
    );
  },
};
