import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import { makeEmployees, defaultColumns } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Keyboard Navigation',
};
export default meta;

export const FullKeyboardSupport: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Keyboard Navigation</h2>
      <div style={styles.keyboardDescriptionBlock}>
        <table style={styles.keyboardTable}>
          <thead>
            <tr>
              <th style={styles.keyboardTh}>Key</th>
              <th style={styles.keyboardTh}>Action</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Arrow keys', 'Move selection'],
              ['Shift + Arrow', 'Pan viewport (scroll) — default; switch to range-extend via shiftArrowBehavior'],
              ['Ctrl + Arrow', 'Jump to edge of the current data block (Excel "End" mode)'],
              ['Ctrl + Shift + Arrow', 'Extend selection to edge of the current data block'],
              ['Tab / Shift+Tab', 'Move to next/previous cell'],
              ['Enter', 'Start editing / commit + move down'],
              ['Escape', 'Cancel edit / clear selection'],
              ['F2', 'Start editing current cell'],
              ['Space', 'Toggle boolean cells'],
              ['Delete', 'Clear cell value'],
              ['Ctrl+A', 'Select all cells'],
              ['Ctrl+Z', 'Undo'],
              ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
              ['Home / End', 'First/last column in row'],
              ['Ctrl+Home / Ctrl+End', 'First/last cell in grid'],
              ['Tab (to header)', 'Focus the per-column filter button'],
              ['Enter / Space (on filter button)', 'Open the column filter menu'],
            ].map(([key, desc]) => (
              <tr key={key}>
                <td style={styles.keyboardTdKey}><kbd>{key}</kbd></td>
                <td style={styles.keyboardTdDesc}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(20)}
          columns={defaultColumns as any}
          rowKey="id"
          selectionMode="range"
          keyboardNavigation
          sorting
        />
      </div>
    </div>
  ),
};

/**
 * Shift + Arrow in the default `'scroll'` mode. The viewport pans by roughly
 * half a screen per keystroke; the selection is left alone.
 */
export const ShiftArrowScroll: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Default `shiftArrowBehavior: "scroll"`. Click a cell to select it, then hold Shift and press the arrow keys — the viewport pans by ~½ screen in the arrow direction while the selection stays put. Useful for quickly surveying large grids without losing your place.',
      },
    },
  },
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Shift + Arrow — Scroll Viewport (default)</h2>
      <p style={styles.subtitle}>
        Click a cell, then press <kbd>Shift</kbd> + arrow keys to pan the viewport. Selection does not change.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(200)}
          columns={defaultColumns as any}
          rowKey="id"
          selectionMode="range"
          keyboardNavigation
          shiftArrowBehavior="scroll"
        />
      </div>
    </div>
  ),
};

/**
 * Shift + Arrow in the alternative `'rangeSelect'` mode. Each keystroke
 * extends the rectangular range by one cell in the arrow direction; the
 * anchor cell stays fixed and every cell in the rectangle is included in
 * the selection (this fixes the "only 2 cells selected" bug in #16).
 */
export const ShiftArrowRangeSelect: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Opt-in `shiftArrowBehavior: "rangeSelect"`. Shift + Arrow keys extend the rectangular range one cell at a time. Every cell between the anchor and the current focus is part of the selection — press Shift+Right twice from A1 and B1, C1 are both included.',
      },
    },
  },
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Shift + Arrow — Extend Range Selection</h2>
      <p style={styles.subtitle}>
        Click a cell, then press <kbd>Shift</kbd> + arrow keys to grow the selection rectangle.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(20)}
          columns={defaultColumns as any}
          rowKey="id"
          selectionMode="range"
          keyboardNavigation
          shiftArrowBehavior="rangeSelect"
        />
      </div>
    </div>
  ),
};
