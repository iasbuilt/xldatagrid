/**
 * Regression-lock scenarios for the chrome composition layering that the
 * hardening plan called out but Agent D did not cover (Agent D ended up
 * focused on TS-error cleanup + the memoization invariant). These four
 * tests pin the compose order + resolver call-site boundaries that
 * `DataGridBody` relies on, so later refactors cannot quietly change the
 * visible layer stack.
 *
 * Layers (as encoded in `DataGridBody.styles.cell` and `renderCell`):
 *   1. consumer `getRowBackground`  → painted on the row *container*
 *   2. Shift+Arrow range tint       → painted on each range cell via the
 *                                      `--dg-range-bg` token (alpha-blended)
 *   3. primary selection outline    → `2px solid var(--dg-selection-border)`
 *                                      applied as an `outline` on the focus cell
 *   4. frozen-column background     → `var(--dg-header-bg)`; wins over (1)/(2)
 *                                      for the pinned cell itself
 *
 * `getChromeCellContent` is invoked only from `renderRowNumberCell`, and
 * only for *data* rows — never for row-group header / aggregate rows.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import { DataGrid } from '../DataGrid';
import type { ChromeCellContent } from '@iasbuilt/datagrid-core';

type Row = { id: string; dept: string; name: string; salary: number };

function makeRows(): Row[] {
  return [
    { id: '1', dept: 'Eng', name: 'Alice', salary: 100 },
    { id: '2', dept: 'Eng', name: 'Bob', salary: 110 },
    { id: '3', dept: 'Sales', name: 'Charlie', salary: 90 },
    { id: '4', dept: 'Sales', name: 'Diana', salary: 95 },
  ];
}

const baseColumns = [
  { id: 'dept', field: 'dept' as const, title: 'Dept' },
  { id: 'name', field: 'name' as const, title: 'Name' },
  { id: 'salary', field: 'salary' as const, title: 'Salary' },
];

function getGrid() {
  return screen.getByRole('grid');
}

function getCell(rowId: string, field: string): HTMLElement {
  const cell = document.querySelector(
    `[data-row-id="${rowId}"][data-field="${field}"][role="gridcell"]`,
  );
  if (!cell) throw new Error(`Cell not found: ${rowId}/${field}`);
  return cell as HTMLElement;
}

function getRowContainer(rowId: string): HTMLElement {
  const row = document.querySelector(
    `[data-row-id="${rowId}"][role="row"]`,
  );
  if (!row) throw new Error(`Row container not found: ${rowId}`);
  return row as HTMLElement;
}

// ---------------------------------------------------------------------------
// Scenario 1 — selected + ranged cell
// ---------------------------------------------------------------------------

describe('chrome composition — selected + ranged cell', () => {
  it('composes range background with selection outline on the focus cell (neither replaces the other)', () => {
    render(
      <DataGrid
        data={makeRows()}
        columns={baseColumns}
        rowKey="id"
        selectionMode="range"
        shiftArrowBehavior="rangeSelect"
      />,
    );

    // Click the anchor, then Shift+Right to build a 1x2 range.
    fireEvent.click(getCell('1', 'dept'));
    fireEvent.keyDown(getGrid(), { key: 'ArrowRight', shiftKey: true });

    const anchor = getCell('1', 'dept');
    const focus = getCell('1', 'name');

    // Both cells are inside the range — both carry the range tint on their
    // background. The range layer is applied via the `--dg-range-bg` token
    // which is alpha-blended, so it composes rather than replaces whatever
    // is underneath.
    expect(anchor.style.background).toContain('--dg-range-bg');
    expect(focus.style.background).toContain('--dg-range-bg');

    // The primary-selection outline lives on a *different* CSS property
    // (`outline`) from the range tint (`background`), so the two layers
    // coexist on the anchor cell without conflict. If a future refactor
    // folded selection into `background` (or range into `outline`) this
    // test would fail — that is intentional: the two layers must stay on
    // separate properties so consumer content remains visible underneath.
    expect(anchor.style.outline).toContain('2px solid');
    expect(anchor.style.outline).toContain('--dg-selection-border');

    // Cells outside the range have no range tint and no selection outline.
    // They still paint the row-resting token (`--dg-row-bg` / `--dg-row-bg-alt`)
    // so `getComputedStyle` probes resolve to a concrete colour (the #70
    // row-number vs data luminance check depends on this). Visually identical
    // to the row container's zebra stripe.
    const outside = getCell('2', 'salary');
    expect(outside.style.background).not.toContain('--dg-range-bg');
    expect(outside.style.background).toMatch(/--dg-row-bg/);
    expect(outside.style.outline === '' || outside.style.outline === 'none').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — frozen column + consumer background
// ---------------------------------------------------------------------------

describe('chrome composition — frozen column + consumer row background', () => {
  it('keeps frozen-column styling while the consumer row background paints the row container', () => {
    const getRowBackground = vi.fn((row: Row) =>
      row.id === '1' ? '#abcdef' : null,
    );
    const frozenColumns = [
      { id: 'dept', field: 'dept' as const, title: 'Dept', frozen: 'left' as const },
      { id: 'name', field: 'name' as const, title: 'Name' },
      { id: 'salary', field: 'salary' as const, title: 'Salary' },
    ];

    render(
      <DataGrid
        data={makeRows()}
        columns={frozenColumns}
        rowKey="id"
        chrome={{ getRowBackground }}
      />,
    );

    // Consumer bg paints the row container — visible through the two
    // non-frozen cells in that row.
    const row1 = getRowContainer('1');
    expect(row1.style.background).toMatch(/#abcdef|rgb\(171,\s*205,\s*239\)/i);

    // Frozen cell: sticky, pinned to the left edge, and retains the
    // frozen-column header-token background (NOT the consumer colour).
    // `styles.cell` elects `frozenBg` over `opts.background`, so the pinned
    // column stays legible when a consumer row colour is very dark or very
    // bright.
    const frozenCell = getCell('1', 'dept');
    expect(frozenCell.style.position).toBe('sticky');
    expect(frozenCell.style.left).toBe('0px');
    expect(frozenCell.style.zIndex).toBe('2');
    expect(frozenCell.style.background).toContain('--dg-header-bg');
    // Critically: the frozen cell must NOT carry the consumer colour
    // itself — otherwise the frozen tint would lose to an arbitrary
    // consumer value and pin columns would become unreadable.
    expect(frozenCell.style.background).not.toMatch(/#abcdef|rgb\(171,\s*205,\s*239\)/i);

    // Non-frozen cell in the same row: transparent cell, no sticky
    // positioning, consumer colour shows through via the row container.
    const nonFrozenCell = getCell('1', 'name');
    expect(nonFrozenCell.style.position).not.toBe('sticky');
    expect(nonFrozenCell.style.background).toBe('');

    // Resolver invoked once per rendered row (memoization means it is not
    // re-called on unrelated re-renders, but a first render must at
    // minimum visit every data row).
    const rowIdsSeen = getRowBackground.mock.calls.map((c) => c[1]);
    expect(new Set(rowIdsSeen)).toEqual(new Set(['1', '2', '3', '4']));
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — grouped path (resolver fires for leaves, not group headers)
// ---------------------------------------------------------------------------

describe('chrome composition — grouped path', () => {
  it('invokes getChromeCellContent for leaf data rows only, not for group-header rows', () => {
    const getChromeCellContent = vi.fn<
      (row: Row, rowId: string, rowIndex: number) => ChromeCellContent | null
    >(() => null);

    render(
      <DataGrid
        data={makeRows()}
        columns={baseColumns}
        rowKey="id"
        grouping={{ rows: { fields: ['dept'], expanded: true } }}
        chrome={{ rowNumbers: true, getChromeCellContent }}
      />,
    );

    // Two group headers (Eng + Sales) must be present…
    const groupHeaders = screen.queryAllByTestId('group-header-row');
    expect(groupHeaders.length).toBe(2);

    // …and the resolver must have been invoked exactly once per leaf row
    // (4 rows total) — *not* once per row including the two group headers
    // (which would be 6). A future regression that plumbed
    // getChromeCellContent through the group-header render path would
    // spike the call count to 6 and this test would fail.
    expect(getChromeCellContent).toHaveBeenCalledTimes(4);

    // Verify each invocation received a real data row (never a
    // synthetic group-summary object).
    const rowsPassed = getChromeCellContent.mock.calls.map((c) => c[0]);
    for (const row of rowsPassed) {
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('dept');
      expect(row).toHaveProperty('salary');
    }
    const idsPassed = rowsPassed.map((r) => r.id).sort();
    expect(idsPassed).toEqual(['1', '2', '3', '4']);
  });

  it('row-number chrome cell renders only for leaf rows in a grouped grid', () => {
    render(
      <DataGrid
        data={makeRows()}
        columns={baseColumns}
        rowKey="id"
        grouping={{ rows: { fields: ['dept'], expanded: true } }}
        chrome={{
          rowNumbers: true,
          getChromeCellContent: (row: Row): ChromeCellContent => ({
            text: `#${row.id}`,
          }),
        }}
      />,
    );

    // 4 leaf rows → 4 chrome-row-number cells. If the row-number gutter
    // leaked into group headers we would see 6 cells here.
    const chromeCells = screen.getAllByTestId('chrome-row-number');
    expect(chromeCells.length).toBe(4);

    // Each chrome cell carries the consumer-supplied text — confirming
    // the resolver ran against every rendered chrome cell, not only a
    // subset.
    const texts = chromeCells.map((c) =>
      within(c).getByTestId('chrome-row-content-text').textContent,
    );
    expect(texts.sort()).toEqual(['#1', '#2', '#3', '#4']);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — readonly grid still builds ranges + fires resolvers
// ---------------------------------------------------------------------------

describe('chrome composition — readonly grid', () => {
  it('Shift+Arrow still builds a range overlay when readOnly is true', () => {
    render(
      <DataGrid
        data={makeRows()}
        columns={baseColumns}
        rowKey="id"
        readOnly
        selectionMode="range"
        shiftArrowBehavior="rangeSelect"
      />,
    );

    fireEvent.click(getCell('1', 'dept'));
    fireEvent.keyDown(getGrid(), { key: 'ArrowRight', shiftKey: true });

    // readOnly gates editing, not selection — both cells receive the range
    // tint the same way as in a writable grid.
    expect(getCell('1', 'dept').style.background).toContain('--dg-range-bg');
    expect(getCell('1', 'name').style.background).toContain('--dg-range-bg');

    // A cell outside the 1x2 range carries no range tint — the readOnly
    // flag must not accidentally paint every cell with the range overlay.
    // It still paints the row-resting token so computed-style probes resolve
    // to a concrete colour; visually it matches the row container's zebra.
    const outside = getCell('2', 'salary').style.background;
    expect(outside).not.toContain('--dg-range-bg');
    expect(outside).toMatch(/--dg-row-bg/);
  });

  it('chrome resolvers still fire on a readOnly grid', () => {
    const getRowBackground = vi.fn((row: Row) =>
      row.id === '2' ? '#fffaaa' : null,
    );
    const getChromeCellContent = vi.fn<
      (row: Row, rowId: string, rowIndex: number) => ChromeCellContent | null
    >(() => null);

    render(
      <DataGrid
        data={makeRows()}
        columns={baseColumns}
        rowKey="id"
        readOnly
        chrome={{ rowNumbers: true, getRowBackground, getChromeCellContent }}
      />,
    );

    // Background resolver paints row 2.
    const row2 = getRowContainer('2');
    expect(row2.style.background).toMatch(/#fffaaa|rgb\(255,\s*250,\s*170\)/i);

    // Both resolvers were invoked for every data row.
    expect(getRowBackground.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(getChromeCellContent.mock.calls.length).toBeGreaterThanOrEqual(4);

    // Cell editability is disabled (readonly), but selection still works.
    // The frozen-cell click dispatches to selection regardless of
    // editability, which is the contract readonly preserves.
    const cell = getCell('1', 'dept');
    expect(cell.style.cursor).toBe('default');
  });
});
