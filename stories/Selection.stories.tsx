import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import type { CellRange } from '@iasbuilt/datagrid-core';
import { makeEmployees, defaultColumns } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Selection',
};
export default meta;

export const CellSelection: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Cell Selection</h2>
      <p style={styles.subtitle}>Click a cell to select it. Use arrow keys to navigate.</p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(20)}
          columns={defaultColumns as any}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

export const RowSelection: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Clicking anywhere on a row selects the entire row. Both row-number gutter clicks and clicks inside the row body are routed through the same chrome-column row-click handler (issue #15), so there is a single "select this row" code path. Shift/Ctrl modifiers still extend or toggle the selection.',
      },
    },
  },
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Row Selection</h2>
      <p style={styles.subtitle}>
        Click anywhere on a row to select the entire row — clicks on a data
        cell and clicks on the row-number gutter share the chrome click
        handler.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(20)}
          columns={defaultColumns as any}
          rowKey="id"
          selectionMode="row"
          keyboardNavigation
          chrome={{ rowNumbers: true }}
        />
      </div>
    </div>
  ),
};

/**
 * Row-header-driven row selection with Excel-style UX. The contract:
 *
 *   - Plain click on a `role="rowheader"` cell selects the whole row; the
 *     outline is painted once on the `role="row"` element.
 *   - Clicking any `role="gridcell"` collapses back to per-cell selection.
 *
 * See `RowRangeContiguous` and `RowRangeDisjoint` for the Shift/Cmd-click
 * and keyboard-driven extensions built on top of this primitive.
 */
export const RowHeaderSelection: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Plain-click row selection via the row-number gutter. Clicking the gutter selects the whole row; clicking any data cell collapses back to per-cell selection.',
      },
    },
  },
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Row-Header Selection</h2>
      <p style={styles.subtitle}>
        Click a row-number cell in the left gutter to select the entire row
        — notice the single outline around the whole row. Then click any
        data cell to switch back to per-cell selection.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(20)}
          columns={defaultColumns as any}
          rowKey="id"
          selectionMode="range"
          keyboardNavigation
          chrome={{ rowNumbers: true }}
        />
      </div>
    </div>
  ),
};

/**
 * Contiguous row-range selection. Click a row-number gutter cell, then
 * Shift+click another row-number cell further down: every row in between
 * (and the anchor + focus rows themselves) is selected as a single range,
 * and the outline is painted around the outer edges of the whole block —
 * top border on the first row, bottom border on the last row, left/right
 * borders on every row, no internal horizontals.
 *
 * Keyboard: with a row selected, Shift+ArrowDown / Shift+ArrowUp extends
 * the range one row at a time. Plain ArrowDown / ArrowUp moves the
 * single-row selection. Shift+ArrowLeft / Shift+ArrowRight and plain
 * ArrowLeft / ArrowRight are no-ops while a full-row selection is active.
 * ESC clears.
 */
export const RowRangeContiguous: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Shift+click a row-number cell after a plain click selects every row between the anchor and focus as a single range, outlined as one rectangle. Shift+ArrowDown / Shift+ArrowUp extends the range by one row; plain ArrowDown / ArrowUp moves the selection; left/right arrows are no-ops while a row range is active; ESC clears.',
      },
    },
  },
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Contiguous Row-Range Selection</h2>
      <p style={styles.subtitle}>
        Click row 2's gutter cell, then <kbd>Shift</kbd>+click row 6's
        gutter cell — rows 2–6 are one range with a single outer outline.
        Try <kbd>Shift</kbd>+<kbd>↓</kbd> / <kbd>Shift</kbd>+<kbd>↑</kbd> to
        grow or shrink the range.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(20)}
          columns={defaultColumns as any}
          rowKey="id"
          selectionMode="range"
          keyboardNavigation
          shiftArrowBehavior="rangeSelect"
          chrome={{ rowNumbers: true }}
        />
      </div>
    </div>
  ),
};

/**
 * Disjoint multi-row selection. Cmd/Ctrl+click row-number gutter cells to
 * toggle rows into or out of the selection without clearing existing
 * selections. Each disjoint row paints its own four-sided outline so the
 * visual grouping reads as "several independent rows", not "one range".
 *
 * On macOS use Cmd+click; on Windows/Linux use Ctrl+click (the rowheader
 * handler reads both via `metaKey || ctrlKey`).
 */
export const RowRangeDisjoint: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Cmd/Ctrl+click row-number cells to build a disjoint row selection — non-adjacent rows highlighted independently, each with its own outline. Cmd/Ctrl+click a selected row again to toggle it off.',
      },
    },
  },
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Disjoint Row-Range Selection</h2>
      <p style={styles.subtitle}>
        Click row 2's gutter cell, then <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+click
        row 5 and row 8. Three separate rows are highlighted, each with its
        own outline. <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+click any selected row
        again to toggle it off.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(20)}
          columns={defaultColumns as any}
          rowKey="id"
          selectionMode="range"
          keyboardNavigation
          chrome={{ rowNumbers: true }}
        />
      </div>
    </div>
  ),
};

export const RangeSelection: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Range selection with Shift+click drag across cells. With the default `shiftArrowBehavior: "scroll"`, Shift+arrow keys pan the viewport instead of extending the range — see `RangeSelectionKeyboard` for opt-in keyboard range extension. The row-number gutter is enabled here so you can also demonstrate row-level range features: plain-click a gutter cell selects one row, Shift+click a second gutter cell extends into a contiguous row range outlined as a single block, and Cmd/Ctrl+click toggles disjoint rows. See `RowRangeContiguous` and `RowRangeDisjoint` for standalone demos.',
      },
    },
  },
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Range Selection</h2>
      <p style={styles.subtitle}>
        Click a cell, then <kbd>Shift</kbd>+click another cell to select a
        rectangular range. <kbd>Ctrl+A</kbd> selects all. Clicking the
        left-gutter row-number cells selects whole rows — Shift+click for
        a contiguous row range, Cmd/Ctrl+click for disjoint rows.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(20)}
          columns={defaultColumns as any}
          rowKey="id"
          selectionMode="range"
          keyboardNavigation
          chrome={{ rowNumbers: true }}
        />
      </div>
    </div>
  ),
};

/**
 * Demonstrates the opt-in `shiftArrowBehavior: 'rangeSelect'` mode where
 * Shift + Arrow extends the rectangle one cell per keystroke while keeping
 * the anchor fixed.
 */
export const RangeSelectionKeyboard: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Keyboard-driven range selection via `shiftArrowBehavior: "rangeSelect"`. Click a cell, then Shift + arrow keys extend the range one cell at a time; every intermediate cell is included. Multi-cell ranges render with a tinted background so the shape reads as a cohesive block.',
      },
    },
  },
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Keyboard Range Selection</h2>
      <p style={styles.subtitle}>
        Click a cell, then hold <kbd>Shift</kbd> + arrow keys to grow the selection rectangle one cell at a time.
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

export const SelectionCallback: StoryObj = {
  render: () => {
    const [sel, setSel] = useState<string>('(none)');
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>onSelectionChange</h2>
        <p style={styles.subtitle}>Selection state is logged below the grid.</p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(15)}
            columns={defaultColumns as any}
            rowKey="id"
              selectionMode="range"
            keyboardNavigation
            onSelectionChange={(r: CellRange | null) => setSel(r ? JSON.stringify(r) : '(cleared)')}
          />
        </div>
        <pre style={styles.statePre}>{sel}</pre>
      </div>
    );
  },
};
