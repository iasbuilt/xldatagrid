// ---------------------------------------------------------------------------
// Examples / Excel Mode — Storybook showcase for the `feat/excel-365-column-menu`
// branch. Each story below exercises one of the end-to-end features added by
// this branch:
//
//   * Excel-365 column filter menu (sort header, "Clear Filter From <field>",
//     Text/Number/Date Filters submenu, search box, "(Select All)" +
//     "(Blanks)" value checklist, OK/Cancel).
//   * FilterConditionDialog — accessible two-row AND/OR custom condition
//     dialog launched from the filter menu's "Custom Filter…" entry.
//   * `in` / `notIn` filter operators used to back the value checklist.
//   * Background IndexedDB-backed column search index (via the internal
//     `useBackgroundIndexer`) that keeps the filter-menu search snappy on
//     larger datasets.
//   * Row-number gutter defaulting to `position: 'left'` (Excel-style), with
//     opt-in `position: 'right'`, themed via `--dg-row-number-bg`.
//   * Context-menu portal fix: context menus render to `document.body`, so
//     they position correctly even inside CSS-transformed ancestors.
//   * Filter chevron rendered as an accessible `<button aria-label="Filter
//     <col>" aria-haspopup="menu">`.
//   * Mutual exclusion: opening the filter menu closes the column menu
//     (and vice versa).
//   * Scoped Excel-365 theme tokens (`.dg-theme-excel365` /
//     `[data-theme="excel365"]`).
//
// The doc pane of each story describes what to look for in the rendered grid.
// ---------------------------------------------------------------------------

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import { createExcelMode } from '@iasbuilt/datagrid-extensions';
import type { ContextMenuConfig, FilterState } from '@iasbuilt/datagrid-core';
import { makeEmployees, defaultColumns } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Excel Mode',
};
export default meta;

// ---------------------------------------------------------------------------
// Shared control panel (used by `Default`)
// ---------------------------------------------------------------------------

interface ExcelModeControlsProps {
  autoSave: boolean;
  enterDirection: 'down' | 'right';
  tabWrap: boolean;
  editOnKeypress: boolean;
  onAutoSaveChange: (v: boolean) => void;
  onEnterDirectionChange: (v: 'down' | 'right') => void;
  onTabWrapChange: (v: boolean) => void;
  onEditOnKeypressChange: (v: boolean) => void;
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  cursor: 'pointer',
};

const selectStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid #e2e8f0',
  fontSize: 13,
};

const badgeStyle: React.CSSProperties = {
  background: '#e0f2fe',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 12,
};

function ExcelModeControls({
  autoSave,
  enterDirection,
  tabWrap,
  editOnKeypress,
  onAutoSaveChange,
  onEnterDirectionChange,
  onTabWrapChange,
  onEditOnKeypressChange,
}: ExcelModeControlsProps) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={autoSave}
          onChange={(e) => onAutoSaveChange(e.target.checked)}
        />
        Auto-save
      </label>
      <label style={labelStyle}>
        Enter direction:
        <select
          style={selectStyle}
          value={enterDirection}
          onChange={(e) => onEnterDirectionChange(e.target.value as 'down' | 'right')}
        >
          <option value="down">Down</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={tabWrap}
          onChange={(e) => onTabWrapChange(e.target.checked)}
        />
        Tab wrap
      </label>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={editOnKeypress}
          onChange={(e) => onEditOnKeypressChange(e.target.checked)}
        />
        Edit on keypress
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fixture helper — larger dataset so the background indexer + filter checklist
// have real work to do and the search input has enough values to filter.
// ---------------------------------------------------------------------------

function useLargeEmployeeFixture(count = 300) {
  return useMemo(() => makeEmployees(count), [count]);
}

// ---------------------------------------------------------------------------
// Default story — full interactive controls (unchanged, still useful)
// ---------------------------------------------------------------------------

export const Default: StoryObj = {
  render: () => {
    const [data, setData] = useState(() => makeEmployees(20));
    const [autoSave, setAutoSave] = useState(true);
    const [enterDirection, setEnterDirection] = useState<'down' | 'right'>('down');
    const [tabWrap, setTabWrap] = useState(true);
    const [editOnKeypress, setEditOnKeypress] = useState(true);
    const [log, setLog] = useState<string[]>([]);

    const addLog = useCallback((msg: string) => {
      setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30));
    }, []);

    const handleCellChange = useCallback(
      (rowId: string, field: string, value: any) => {
        setData((prev) =>
          prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
        );
        if (autoSave) {
          addLog(`Auto-saved: row ${rowId}, ${field} = ${JSON.stringify(value)}`);
        }
      },
      [autoSave, addLog],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Excel Mode Extension</h2>
        <p style={styles.subtitle}>
          Spreadsheet-style navigation: Tab moves right (wraps to next row), Enter moves{' '}
          {enterDirection === 'down' ? 'down' : 'right'}. Toggle the controls below to change
          behaviour.
        </p>
        <ExcelModeControls
          autoSave={autoSave}
          enterDirection={enterDirection}
          tabWrap={tabWrap}
          editOnKeypress={editOnKeypress}
          onAutoSaveChange={setAutoSave}
          onEnterDirectionChange={setEnterDirection}
          onTabWrapChange={setTabWrap}
          onEditOnKeypressChange={setEditOnKeypress}
        />
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onCellValueChange={handleCellChange}
          />
        </div>
        {log.length > 0 && (
          <pre style={styles.logPre}>
            {log.join('\n')}
          </pre>
        )}
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Enter-goes-right variant (unchanged)
// ---------------------------------------------------------------------------

export const EnterGoesRight: StoryObj = {
  render: () => {
    const [data, setData] = useState(() => makeEmployees(10));

    const handleCellChange = useCallback((rowId: string, field: string, value: any) => {
      setData((prev) =>
        prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
      );
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ext = useRef(
      createExcelMode({
        enterDirection: 'right',
        tabWrap: true,
        editOnKeypress: true,
      }),
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Excel Mode — Enter Goes Right</h2>
        <p style={styles.subtitle}>
          Configured so that pressing Enter moves the selection right instead of down — useful for
          horizontal data entry workflows.
        </p>
        <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
          <span style={badgeStyle}>Enter: right</span>
          <span style={badgeStyle}>Tab wrap: on</span>
          <span style={badgeStyle}>Edit on keypress: on</span>
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onCellValueChange={handleCellChange}
          />
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Excel 365 / Full Skin — the original catch-all story. Kept as-is; each of
// the named stories below drills into one specific branch feature.
// ---------------------------------------------------------------------------

export const Excel365Skin: StoryObj = {
  name: 'Excel 365 / Full Skin',
  render: () => {
    const data = useLargeEmployeeFixture(500);

    const contextMenu: ContextMenuConfig = useMemo(
      () => ({
        items: [
          { key: 'copy', label: 'Copy', shortcut: 'Ctrl+C', onClick: () => {} },
          { key: 'paste', label: 'Paste', shortcut: 'Ctrl+V', onClick: () => {}, dividerAfter: true },
          { key: 'delete', label: 'Delete Row', danger: true, onClick: () => {} },
        ],
      }),
      [],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Excel 365 / Full Skin</h2>
        <p style={styles.subtitle}>
          All Excel-365 features combined — gutter on the left, scoped Excel theme, Excel-style
          filter dropdown with search + value checklist, portaled context menu, and 500 rows of
          realistic fixture data.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            sorting
            filtering={{ debounceMs: 200 }}
            showColumnMenu
            showFilterMenu
            gridId="excel365-full-skin"
            contextMenu={contextMenu}
            theme="excel365"
            className="dg-theme-excel365"
            chrome={{
              rowNumbers: { position: 'left' },
            }}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Catch-all showcase: Excel-365 theme class (`.dg-theme-excel365`), left-anchored row-number gutter, Excel filter dropdown (`showFilterMenu`), context menu portaled to `document.body`, and a 500-row fixture so the background indexer has non-trivial work.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// FilterMenu — value checklist, "(Select All)", "(Blanks)", search, and OK/Cancel.
// Backed by the `in` / `notIn` filter operators introduced in this branch.
// ---------------------------------------------------------------------------

export const FilterMenu_ValueChecklist: StoryObj = {
  name: 'FilterMenu / Value Checklist',
  render: () => {
    const data = useLargeEmployeeFixture(300);
    const [filter, setFilter] = useState<FilterState | null>(null);

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Excel Filter Menu — Value Checklist</h2>
        <p style={styles.subtitle}>
          Click the filter chevron on the <b>Department</b>, <b>City</b>, or <b>Name</b> column.
          The dropdown is an accessible <code>role="menu"</code> popup containing:
          Sort A→Z / Z→A at the top, <i>Clear Filter From &lt;field&gt;</i>, a
          Text/Number/Date Filters submenu, a search input, and an
          <code> (Select All)</code> + <code>(Blanks)</code> + distinct-value checklist
          with OK / Cancel buttons. Applied selections become an <code>in</code> filter
          predicate.
        </p>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={badgeStyle}>showFilterMenu: on</span>
          <span style={badgeStyle}>operators: in / notIn</span>
          <span style={badgeStyle}>backed by IndexedDB indexer</span>
          <span style={badgeStyle}>
            filter: {filter ? `${filter.filters.length} predicate(s)` : 'none'}
          </span>
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            sorting
            filtering={{ debounceMs: 150 }}
            showFilterMenu
            showColumnMenu
            gridId="excel-filter-menu-value-checklist"
            onFilterChange={setFilter}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Opens the Excel-365 column filter dropdown. Watch for: the sort items above the divider, "Clear Filter From <field>", the search input, the (Select All) / (Blanks) checklist, and the OK / Cancel footer. Applied selections produce an `in` predicate on the filter state; the filter chevron in the header is a real `<button aria-label="Filter <col>" aria-haspopup="menu">`.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// FilterMenu — Custom Filter dialog (FilterConditionDialog). Two rows of
// (operator, value) joined by AND/OR, with placeholder-disabled OK, focus
// trap, `role="dialog"`, `aria-modal`.
// ---------------------------------------------------------------------------

export const FilterMenu_CustomConditionDialog: StoryObj = {
  name: 'FilterMenu / Custom Condition Dialog',
  render: () => {
    const data = useLargeEmployeeFixture(300);
    const [filter, setFilter] = useState<FilterState | null>(null);

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Custom Filter Condition Dialog</h2>
        <p style={styles.subtitle}>
          In the Excel filter menu, open <b>Text Filters → Custom Filter…</b> (or Number/Date
          Filters on the salary/start-date columns). A modal opens with two rows of
          (operator, value) inputs joined by an AND/OR radio. It is an accessible
          <code> role="dialog"</code> with <code>aria-modal="true"</code>, a focus trap,
          and a disabled OK button while placeholder rows are empty.
        </p>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={badgeStyle}>role="dialog"</span>
          <span style={badgeStyle}>aria-modal</span>
          <span style={badgeStyle}>focus-trap</span>
          <span style={badgeStyle}>
            filter: {filter ? JSON.stringify(filter.filters.length) + ' predicate(s)' : 'none'}
          </span>
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            sorting
            filtering={{ debounceMs: 150 }}
            showFilterMenu
            showColumnMenu
            gridId="excel-filter-menu-custom-dialog"
            onFilterChange={setFilter}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Launches the FilterConditionDialog from the "Text/Number/Date Filters → Custom Filter…" entry. The dialog renders two (operator, value) rows joined by AND/OR, traps focus, disables OK until both rows have values, and closes on Escape. The resulting composite descriptor replaces the field\'s filter predicate atomically.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// FilterMenu + background IndexedDB indexer. Intentionally uses a large
// fixture so the indexer's non-blocking behaviour is observable: filter menu
// opens instantly, values appear as the indexer settles.
// ---------------------------------------------------------------------------

export const FilterMenu_BackgroundIndexer: StoryObj = {
  name: 'FilterMenu / Background Indexer',
  render: () => {
    const data = useLargeEmployeeFixture(500);
    const [mountedAt, setMountedAt] = useState<number>(0);
    useEffect(() => setMountedAt(Date.now()), []);

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Filter Menu + Background IndexedDB Indexer</h2>
        <p style={styles.subtitle}>
          The filter menu's distinct-value checklist is sourced from a background indexer
          (<code>useBackgroundIndexer</code>) that persists per-column indexes to IndexedDB
          keyed by <code>gridId</code>. The UI thread is never blocked: opening a column's
          filter menu is instantaneous on any dataset size, and the search input queries the
          pre-built index so typing remains snappy even on 500+ rows.
        </p>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={badgeStyle}>rows: 500</span>
          <span style={badgeStyle}>gridId: excel-bg-indexer</span>
          <span style={badgeStyle}>
            mounted: {mountedAt ? new Date(mountedAt).toLocaleTimeString() : '…'}
          </span>
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            sorting
            filtering={{ debounceMs: 150 }}
            showFilterMenu
            showColumnMenu
            gridId="excel-bg-indexer"
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'The background indexer streams distinct values for each filterable column into IndexedDB. Because indexing happens off the render path, opening the Excel filter menu never blocks on enumeration — values stream in as the indexer settles. Reload the story: the second open hits the IDB cache and is instant.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Row-number gutter — left (Excel-style default) and right (opt-in).
// ---------------------------------------------------------------------------

export const RowNumbers_LeftGutter: StoryObj = {
  name: 'RowNumbers / Left Gutter (default)',
  render: () => {
    const data = useLargeEmployeeFixture(200);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Row-Number Gutter — Left (Excel Default)</h2>
        <p style={styles.subtitle}>
          The row-number gutter now defaults to <code>position: 'left'</code> to match the
          Excel 365 convention. The gutter cells use <code>--dg-row-number-bg</code>
          (falling back to <code>--dg-header-bg</code>) and stay sticky-left during
          horizontal scrolling.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            sorting
            chrome={{
              rowNumbers: true,
            }}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Passing `rowNumbers: true` (or an object without `position`) now defaults to the left side, matching Excel 365. The gutter cells read `--dg-row-number-bg` with `--dg-header-bg` as fallback, so themes can customise just the gutter colour.',
      },
    },
  },
};

export const RowNumbers_RightGutter: StoryObj = {
  name: 'RowNumbers / Right Gutter (opt-in)',
  render: () => {
    const data = useLargeEmployeeFixture(200);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Row-Number Gutter — Right (opt-in)</h2>
        <p style={styles.subtitle}>
          Legacy behaviour is preserved via an opt-in <code>position: 'right'</code>.
          The gutter floats after the last data column and scrolls with it.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            sorting
            chrome={{
              rowNumbers: { position: 'right' },
            }}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Opt-in `position: "right"` for consumers who need the legacy right-side gutter. Same `--dg-row-number-bg` theming applies.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Context-menu portal fix — the grid is placed inside an ancestor with
// `transform: translateZ(0)`. Without the `document.body` portal, a context
// menu's `position: fixed` would be re-anchored to the transformed ancestor
// and mis-position. This story visually confirms the fix: right-click a cell
// and the menu appears at the correct viewport coordinates.
// ---------------------------------------------------------------------------

export const ContextMenu_InTransformedAncestor: StoryObj = {
  name: 'ContextMenu / In Transformed Ancestor',
  render: () => {
    const data = useLargeEmployeeFixture(200);

    const contextMenu: ContextMenuConfig = useMemo(
      () => ({
        items: [
          { key: 'copy', label: 'Copy', shortcut: 'Ctrl+C', onClick: () => {} },
          { key: 'paste', label: 'Paste', shortcut: 'Ctrl+V', onClick: () => {}, dividerAfter: true },
          { key: 'export', label: 'Export row…', onClick: () => {} },
        ],
      }),
      [],
    );

    // The outer wrapper has `transform: translateZ(0)` which historically
    // would trap `position: fixed` descendants. The context menu now portals
    // to `document.body`, sidestepping the containing-block rule entirely.
    const transformedAncestor: React.CSSProperties = {
      transform: 'translateZ(0)',
      filter: 'saturate(1)',
      // Make the broken-before state visually obvious: the wrapper is offset
      // and has a visible border. If the portal regression returned, the
      // context menu would appear glued to this box instead of the cursor.
      margin: '0 auto',
      width: '95%',
      padding: 16,
      border: '2px dashed #6366f1',
      borderRadius: 8,
      background: 'rgba(99, 102, 241, 0.04)',
      height: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    };

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Context Menu Inside a Transformed Ancestor</h2>
        <p style={styles.subtitle}>
          The grid below is wrapped in an element with <code>transform: translateZ(0)</code>
          (which creates a new containing block for fixed-positioned descendants). Right-click
          a cell: the context menu now portals to <code>document.body</code>, so it positions
          relative to the viewport and appears at the cursor — not glued to the dashed wrapper.
        </p>
        <div style={transformedAncestor}>
          <span style={badgeStyle}>ancestor: transform: translateZ(0)</span>
          <div style={{ ...gridContainer, flex: 1 }}>
            <MuiDataGrid
              data={data}
              columns={defaultColumns as any}
              rowKey="id"
              selectionMode="cell"
              keyboardNavigation
              sorting
              contextMenu={contextMenu}
            />
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Regression guard for the context-menu portal fix. The grid lives inside a wrapper with `transform: translateZ(0)` — historically this re-anchored `position: fixed` menus to the wrapper. The menu now portals to `document.body`, so right-click coordinates map to the viewport.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Mutual exclusion — opening the filter menu closes the column menu and
// vice versa. Captures the state in a side panel so the behaviour is easy to
// read without instrumenting the DOM.
// ---------------------------------------------------------------------------

export const FilterMenu_MutualExclusion: StoryObj = {
  name: 'FilterMenu / Mutual Exclusion With Column Menu',
  render: () => {
    const data = useLargeEmployeeFixture(200);

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Filter Menu ↔ Column Menu — Mutual Exclusion</h2>
        <p style={styles.subtitle}>
          Each column header has two independent triggers: the filter chevron (opens the
          Excel filter dropdown) and the caret (opens the legacy column menu — Sort / Hide /
          Freeze). Opening one now closes the other, so they can never overlay each other.
          Alternate-click the two triggers on a single column to watch them swap.
        </p>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={badgeStyle}>showFilterMenu: on</span>
          <span style={badgeStyle}>showColumnMenu: on</span>
          <span style={badgeStyle}>only one menu open at a time</span>
        </div>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            sorting
            filtering={{ debounceMs: 150 }}
            showFilterMenu
            showColumnMenu
            gridId="excel-mutual-exclusion"
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Opening the Excel filter dropdown dismisses the column menu and vice versa. Click the filter chevron on one column, then click the caret on the same (or a neighbouring) column — the previously open popup disappears before the new one renders.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Theme scoping — two grids on the same page: one with the Excel-365 theme
// applied via the `.dg-theme-excel365` class (or `data-theme="excel365"`
// attribute), one using the default theme. Confirms the Excel tokens only
// affect the scoped grid and don't leak onto `:root`.
// ---------------------------------------------------------------------------

export const Theme_Excel365Scoped: StoryObj = {
  name: 'Theme / Excel 365 Scoped Tokens',
  render: () => {
    const data = useLargeEmployeeFixture(150);

    const halfContainer: React.CSSProperties = {
      flex: 1,
      minHeight: 0,
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      overflow: 'hidden',
    };

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Excel-365 Theme — Scoped Tokens</h2>
        <p style={styles.subtitle}>
          The Excel-365 stylesheet lives at{' '}
          <code>packages/react/src/styles/excel-365-theme.css</code> and is imported through{' '}
          <code>datagrid-theme.css</code>. The Excel tokens are scoped to
          <code> .dg-theme-excel365</code> and <code>[data-theme="excel365"]</code> —
          <b> not</b> <code>:root</code>. The two grids below share a page but only the top one
          gets the Segoe UI / 20px-row / #f3f2f1 gutter look; the bottom grid keeps the default
          theme.
        </p>
        <div style={{ display: 'flex', gap: 12, flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={halfContainer}>
            <MuiDataGrid
              data={data}
              columns={defaultColumns as any}
              rowKey="id"
              selectionMode="cell"
              keyboardNavigation
              sorting
              filtering={{ debounceMs: 150 }}
              showFilterMenu
              showColumnMenu
              gridId="excel-theme-scoped-top"
              theme="excel365"
              className="dg-theme-excel365"
              chrome={{ rowNumbers: { position: 'left' } }}
            />
          </div>
          <div style={halfContainer}>
            <MuiDataGrid
              data={data}
              columns={defaultColumns as any}
              rowKey="id"
              selectionMode="cell"
              keyboardNavigation
              sorting
              filtering={{ debounceMs: 150 }}
              showFilterMenu
              showColumnMenu
              gridId="excel-theme-scoped-bottom"
              chrome={{ rowNumbers: { position: 'left' } }}
            />
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Side-by-side proof that Excel-365 tokens are scoped. The top grid has `className="dg-theme-excel365"` and picks up Segoe UI, 20px rows, and the #f3f2f1 gutter; the bottom grid on the same page keeps the default theme. If the stylesheet ever regressed to `:root`, both grids would look identical.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Pre-applied `in` filter — demonstrates that the new `in` operator is wired
// through `initialFilter` so apps can hydrate a value-list predicate from
// persistence without opening the menu.
// ---------------------------------------------------------------------------

export const FilterMenu_PreAppliedInOperator: StoryObj = {
  name: 'FilterMenu / Pre-applied `in` Operator',
  render: () => {
    const data = useLargeEmployeeFixture(300);

    const initialFilter: FilterState = useMemo(
      () => ({
        logic: 'and',
        filters: [
          { field: 'department', operator: 'in', value: ['Engineering', 'Design', 'Sales'] },
        ],
      }),
      [],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Pre-applied `in` Filter</h2>
        <p style={styles.subtitle}>
          Hydrates with <code>department IN (Engineering, Design, Sales)</code> via
          <code> initialFilter</code>. Opening the Department filter menu shows three of the
          six possible values pre-checked, reflecting the <code>in</code>-operator round-trip
          the dropdown relies on.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            sorting
            filtering={{ debounceMs: 150 }}
            showFilterMenu
            showColumnMenu
            gridId="excel-in-operator-prehydrated"
            initialFilter={initialFilter}
          />
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Confirms the `in` operator round-trips cleanly: the grid hydrates from a pre-built `in` predicate and the Excel filter menu reflects the same checked subset when opened. `notIn` behaves symmetrically for "everything except these" shapes.',
      },
    },
  },
};
