/**
 * Red-phase contracts for Feature 5: cell hover tooltips.
 *
 * Specification (Phase B will satisfy):
 *   1. Hovering any data cell shows a tooltip after a ~400 ms delay.
 *   2. The tooltip displays the cell's rendered text by default, OR the value
 *      of `ColumnDef.note` (string or `(row) => string`) when provided. When
 *      both are available, `note` wins.
 *   3. The tooltip is rendered through a `createPortal` to `document.body` —
 *      it must NOT live inside the cell's DOM subtree. This mirrors the
 *      portal pattern used by `ContextMenu` (viewport-clamped, transparent
 *      to ancestor `transform`/`filter`).
 *   4. ARIA: the tooltip has `role="tooltip"`; the hovered cell gets
 *      `aria-describedby="<tooltip-id>"` while visible; the attribute is
 *      removed on hide.
 *   5. Dismissal: mouseleave, Escape, scroll anywhere in the document, or
 *      focus change all dismiss. A pending timer must be cleared on
 *      mouseleave so a quick bounce never "remembers" an open intent.
 *
 * All tests use `vi.useFakeTimers()` so we can advance time past the 400 ms
 * delay deterministically.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import { DataGrid } from '../DataGrid';
import { ColumnDef } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type Row = { id: string; name: string; city: string };

function makeData(): Row[] {
  return [
    { id: '1', name: 'Alice', city: 'London' },
    { id: '2', name: 'Bob', city: 'Paris' },
  ];
}

const baseColumns: ColumnDef<Row>[] = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'city', field: 'city', title: 'City' },
];

// The 400ms delay the spec prescribes. The green phase may tune it; keep the
// tests advancing time past a safe bound so small jitter does not flake.
const HOVER_DELAY_MS = 400;

function findCell(rowId: string, field: string): HTMLElement {
  const cell = screen
    .getAllByRole('gridcell')
    .find(
      (c) =>
        c.getAttribute('data-row-id') === rowId &&
        c.getAttribute('data-field') === field,
    );
  if (!cell) {
    throw new Error(`gridcell for row=${rowId} field=${field} not found`);
  }
  return cell;
}

function findTooltip(): HTMLElement | null {
  // The hover tooltip is a sibling of existing portals; find it by role.
  // We purposely query `document.body` directly to prove it is NOT a
  // descendant of any cell (contract #3).
  const tips = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="tooltip"]'),
  );
  // Filter out the validation tooltip (different module): it carries a
  // `data-validation-target` attribute that hover tooltips never have.
  return (
    tips.find((t) => !t.hasAttribute('data-validation-target')) ?? null
  );
}

// ---------------------------------------------------------------------------
// Delay + default content
// ---------------------------------------------------------------------------

describe('hover tooltip — delay and default content', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows no tooltip before the delay elapses', () => {
    render(
      <DataGrid data={makeData()} columns={baseColumns} rowKey="id" />,
    );
    const cell = findCell('1', 'name');
    fireEvent.mouseEnter(cell);
    // Advance just short of the delay — tooltip must still be absent.
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS - 50);
    });
    expect(findTooltip()).toBeNull();
  });

  it('shows a portaled tooltip with the cell text content after the delay elapses', () => {
    const { container } = render(
      <DataGrid data={makeData()} columns={baseColumns} rowKey="id" />,
    );
    const cell = findCell('1', 'name');
    fireEvent.mouseEnter(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
    });
    const tip = findTooltip();
    expect(tip).not.toBeNull();
    // Contract #1 + #2: default content is the cell's rendered text.
    expect(tip!.textContent).toContain('Alice');
    // Contract #3: portal to document.body, NOT inside the grid subtree.
    expect(container.contains(tip)).toBe(false);
    expect(document.body.contains(tip!)).toBe(true);
    // Contract #4: correct role.
    expect(tip!.getAttribute('role')).toBe('tooltip');
  });
});

// ---------------------------------------------------------------------------
// ColumnDef.note — string and function forms win over content
// ---------------------------------------------------------------------------

describe('hover tooltip — ColumnDef.note override', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays the note string instead of the cell text when `note` is a string', () => {
    const columns: ColumnDef<Row>[] = [
      {
        id: 'name',
        field: 'name',
        title: 'Name',
        note: 'The legal full name of the person.',
      },
      { id: 'city', field: 'city', title: 'City' },
    ];
    render(<DataGrid data={makeData()} columns={columns} rowKey="id" />);
    const cell = findCell('1', 'name');
    fireEvent.mouseEnter(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
    });
    const tip = findTooltip();
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('The legal full name of the person.');
    // The cell value ("Alice") MUST NOT appear — note wins over content.
    expect(tip!.textContent).not.toContain('Alice');
  });

  it('invokes a function `note` with the row and displays the returned string', () => {
    const noteFn = vi.fn((row: Row) => `Resident of ${row.city}`);
    const columns: ColumnDef<Row>[] = [
      {
        id: 'name',
        field: 'name',
        title: 'Name',
        note: noteFn,
      },
      { id: 'city', field: 'city', title: 'City' },
    ];
    render(<DataGrid data={makeData()} columns={columns} rowKey="id" />);
    const cell = findCell('2', 'name');
    fireEvent.mouseEnter(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
    });
    const tip = findTooltip();
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('Resident of Paris');
    // The resolver must have seen the row from the hovered cell (Bob / Paris).
    expect(noteFn).toHaveBeenCalled();
    const firstArg = noteFn.mock.calls[0]![0];
    expect(firstArg.city).toBe('Paris');
  });
});

// ---------------------------------------------------------------------------
// aria-describedby wiring
// ---------------------------------------------------------------------------

describe('hover tooltip — aria-describedby', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets aria-describedby on the cell while visible and removes it on hide', () => {
    render(
      <DataGrid data={makeData()} columns={baseColumns} rowKey="id" />,
    );
    const cell = findCell('1', 'name');
    expect(cell.hasAttribute('aria-describedby')).toBe(false);

    fireEvent.mouseEnter(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
    });
    const tip = findTooltip();
    expect(tip).not.toBeNull();
    const tipId = tip!.getAttribute('id');
    // The tooltip must carry a stable id the cell can reference.
    expect(tipId).toBeTruthy();
    expect(cell.getAttribute('aria-describedby')).toBe(tipId);

    // Dismiss on mouseleave and re-check.
    fireEvent.mouseLeave(cell);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(findTooltip()).toBeNull();
    expect(cell.hasAttribute('aria-describedby')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dismissal pathways
// ---------------------------------------------------------------------------

describe('hover tooltip — dismissal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dismisses on Escape', () => {
    render(
      <DataGrid data={makeData()} columns={baseColumns} rowKey="id" />,
    );
    const cell = findCell('1', 'name');
    fireEvent.mouseEnter(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
    });
    expect(findTooltip()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(findTooltip()).toBeNull();
  });

  it('dismisses on mouseleave after the tooltip is already visible', () => {
    render(
      <DataGrid data={makeData()} columns={baseColumns} rowKey="id" />,
    );
    const cell = findCell('1', 'name');
    fireEvent.mouseEnter(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
    });
    expect(findTooltip()).not.toBeNull();
    fireEvent.mouseLeave(cell);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(findTooltip()).toBeNull();
  });

  it('clears a pending timer on mouseleave before the delay elapses', () => {
    render(
      <DataGrid data={makeData()} columns={baseColumns} rowKey="id" />,
    );
    const cell = findCell('1', 'name');
    fireEvent.mouseEnter(cell);
    // Leave BEFORE the 400 ms delay — the scheduled show must be cancelled.
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS - 100);
    });
    fireEvent.mouseLeave(cell);
    // Advance well past what would have been the show time.
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS * 2);
    });
    expect(findTooltip()).toBeNull();
  });

  it('dismisses on document scroll', () => {
    render(
      <DataGrid data={makeData()} columns={baseColumns} rowKey="id" />,
    );
    const cell = findCell('1', 'name');
    fireEvent.mouseEnter(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
    });
    expect(findTooltip()).not.toBeNull();
    // A scroll anywhere on the page should dismiss — matches Office-style
    // behaviour where the tooltip anchor is no longer trustworthy after a
    // scroll moves the underlying cell.
    fireEvent.scroll(document);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(findTooltip()).toBeNull();
  });

  it('dismisses on focus change (blur of the hovered cell / focusin elsewhere)', () => {
    render(
      <>
        <DataGrid data={makeData()} columns={baseColumns} rowKey="id" />
        <button type="button" data-testid="after">after</button>
      </>,
    );
    const cell = findCell('1', 'name');
    fireEvent.mouseEnter(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
    });
    expect(findTooltip()).not.toBeNull();
    // Focus moves outside the grid — the tooltip should not outlive it.
    const after = screen.getByTestId('after');
    after.focus();
    fireEvent.focus(after);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(findTooltip()).toBeNull();
  });
});
