import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/RichText',
  id: 'examples-richtext',
};
export default meta;

// ---------------------------------------------------------------------------
// Shared row shape + data
// ---------------------------------------------------------------------------

interface AuditRow {
  id: string;
  asset: string;
  notes: string;
}

const NOTES_SAMPLES: string[] = [
  '**Q3 audit:** ~all assets accounted for~. *Pending tag for new HVAC unit.*',
  '**Forklift #4:** battery replaced on *2026-03-12*. See [maintenance log](https://example.com/m/4).',
  '*Conference room A/V:* ~~needs recabling~~ completed. **Sign-off** pending from facilities.',
  '**Server rack 7:** running hot — investigate ~airflow~ and **schedule** a walkthrough.',
  '*Fleet vehicle 22:* tires rotated. **Next service:** `2026-06-01`. Notes: [ticket](https://example.com/t/22).',
  '**Printer cluster:** *toner* low on 3/5 units. ~~Order placed~~ — ETA **Friday**.',
  '*Warehouse scanners:* firmware **v4.2.1** rolled out. No ~regressions~ observed.',
  '**Office laptops:** 12 due for refresh. *Prioritize* engineering first, then ~~sales~~ support.',
  '*Security cameras:* **all 24** online. Night IR flagged on cam 11 — [footage](https://example.com/cam/11).',
  '**Generator test:** ran under load for 2h. ~No faults~ — *annual inspection* booked for May.',
];

function makeAuditRows(count: number): AuditRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    asset: `Asset ${String(i + 1).padStart(2, '0')}`,
    notes: NOTES_SAMPLES[i % NOTES_SAMPLES.length]!,
  }));
}

const columns: ColumnDef<AuditRow>[] = [
  { id: 'asset', field: 'asset', title: 'Asset', width: 140 },
  {
    id: 'notes',
    field: 'notes',
    title: 'Notes',
    width: 320,
    cellType: 'richText',
    editable: true,
  },
];

// ---------------------------------------------------------------------------
// Local layout styles for the edge + show-formatting stories
// ---------------------------------------------------------------------------

const edgeWrapper: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: 480,
  maxWidth: 480,
  flex: 1,
  minHeight: 0,
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  overflow: 'hidden',
};

const instructions: React.CSSProperties = {
  margin: 0,
  padding: 16,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  color: '#334155',
  fontSize: 13,
  lineHeight: 1.6,
};

const instructionsList: React.CSSProperties = {
  margin: '8px 0 0',
  paddingLeft: 20,
};

// ---------------------------------------------------------------------------
// Default
// ---------------------------------------------------------------------------

export const Default: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Rich-text editing — floating toolbar</h2>
      <p style={styles.subtitle}>
        Double-click a Notes cell to enter edit mode. The formatting toolbar is portaled to
        <code> document.body </code>so it escapes the cell DOM, and its placement / alignment
        recalculate on scroll and resize to stay inside the viewport even when the cell is near
        an edge.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeAuditRows(6)}
          columns={columns as any}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// ViewportEdges — Playwright target
// ---------------------------------------------------------------------------

export const ViewportEdges: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Toolbar flips near viewport edges</h2>
      <p style={styles.subtitle}>
        Edit cells near the right edge to see the toolbar align right; edit cells near the bottom
        to see the toolbar place above instead of below.
      </p>
      <div style={edgeWrapper}>
        <MuiDataGrid
          data={makeAuditRows(10)}
          columns={columns as any}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// ShowFormattingDemo
// ---------------------------------------------------------------------------

export const ShowFormattingDemo: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Show formatting toggle</h2>
      <p style={styles.subtitle}>
        Toggle the raw markdown delimiters alongside the rendered preview — Word-style.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeAuditRows(6)}
          columns={columns as any}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
      <aside style={instructions}>
        Click into any rich-text cell, then click the <strong>Show formatting</strong> button
        (<span aria-hidden>&para;</span> glyph) on the right of the floating toolbar.
        <ul style={instructionsList}>
          <li>Off: rendered preview only (clean reading view)</li>
          <li>
            On: raw markdown delimiters (<code>**bold**</code>, <code>*italic*</code>) visible
            alongside the rendered output
          </li>
          <li>State persists while the cell stays in edit mode</li>
        </ul>
      </aside>
    </div>
  ),
};
