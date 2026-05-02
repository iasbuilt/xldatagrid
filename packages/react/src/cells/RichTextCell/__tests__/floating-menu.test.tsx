/**
 * Failing TDD specs for `RichTextCell`'s floating formatting toolbar.
 *
 * Feature A of the rich-text revamp replaces the existing inline toolbar
 * (rendered as a DOM descendant of the cell) with a viewport-aware floating
 * menu portaled to `document.body`. This spec encodes the invariants the
 * production implementation must satisfy:
 *
 *   1. The toolbar must be rendered via `createPortal` to `document.body`.
 *      It must expose `role="toolbar"` and `data-floating-menu` so existing
 *      selectors and accessibility tools continue to work, and it must NOT
 *      be a descendant of the cell element — mirroring the pattern used by
 *      `ContextMenu.tsx` so transformed ancestors can't hijack
 *      `position: fixed`.
 *
 *   2. Placement must be viewport-aware: above the cell by default, flipping
 *      below when the cell sits within `menuHeight + 8` of the viewport top,
 *      aligning right when the cell's right edge is within 100px of the
 *      viewport right edge, and aligning left when the cell's left edge is
 *      within 100px of the viewport left edge. Placement/alignment are
 *      surfaced on the toolbar node as `data-placement` (`above` | `below`)
 *      and `data-align` (`left` | `right`) so integration tests and Playwright
 *      specs can assert against computed layout choices without re-deriving
 *      geometry.
 *
 *   3. The menu must reposition on `scroll` and `resize`. A stable
 *      position-recalc entry point must be wired to `window` scroll/resize
 *      listeners so the spec can spy on `getBoundingClientRect` calls as the
 *      proxy for a re-layout.
 *
 * These tests are RED today — the current implementation renders the toolbar
 * inline inside the cell (see `RichTextCell.tsx` lines ~225-295) and has no
 * portal / placement logic at all.
 */
import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { RichTextCell } from '../RichTextCell';
import type { ColumnDef, CellValue } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Shared helpers (aligned with `RichTextCell.test.tsx`)
// ---------------------------------------------------------------------------

function makeColumn(overrides: Partial<ColumnDef> = {}): ColumnDef {
  return { id: 'col1', field: 'col1', title: 'Column 1', ...overrides };
}

function makeProps(overrides: {
  value?: CellValue;
  column?: Partial<ColumnDef>;
  isEditing?: boolean;
  onCommit?: (v: CellValue) => void;
  onCancel?: () => void;
}) {
  return {
    value: overrides.value ?? null,
    row: {},
    column: makeColumn(overrides.column),
    rowIndex: 0,
    isEditing: overrides.isEditing ?? false,
    onCommit: overrides.onCommit ?? vi.fn(),
    onCancel: overrides.onCancel ?? vi.fn(),
  };
}

/**
 * Installs a deterministic `getBoundingClientRect` on every HTMLElement so
 * placement assertions run under a known viewport geometry. Returns a
 * restore function the test's `afterEach` hook can call.
 */
function stubCellRect(rect: Partial<DOMRect>): () => void {
  const original = HTMLElement.prototype.getBoundingClientRect;
  const full: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...(rect as DOMRect),
  };
  HTMLElement.prototype.getBoundingClientRect = function stubbed() {
    return full;
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
}

function getFloatingMenu(): HTMLElement {
  const node = document.body.querySelector<HTMLElement>(
    '[role="toolbar"][data-floating-menu]',
  );
  if (!node) {
    throw new Error(
      'Expected a `[role="toolbar"][data-floating-menu]` element to exist in document.body',
    );
  }
  return node;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RichTextCell — floating formatting menu (Feature A)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the toolbar via portal to document.body (not a descendant of the cell)', () => {
    const { container } = render(
      <RichTextCell {...makeProps({ isEditing: true, value: '**hello**' })} />,
    );

    const menu = getFloatingMenu();
    expect(menu).toBeInTheDocument();
    // The component's own render root is the cell subtree. The toolbar must
    // NOT be inside it — it must live under document.body via a portal.
    expect(container.contains(menu)).toBe(false);
  });

  it('flips to `data-placement="below"` when the cell sits near the viewport top', () => {
    // Cell top < menuHeight + 8 → no room above → menu flips below.
    const restore = stubCellRect({
      top: 0,
      bottom: 30,
      left: 100,
      right: 300,
      width: 200,
      height: 30,
    });
    try {
      render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);
      const menu = getFloatingMenu();
      expect(menu.getAttribute('data-placement')).toBe('below');
    } finally {
      restore();
    }
  });

  it('uses `data-placement="above"` when the cell is mid-viewport', () => {
    // Plenty of room above → default placement is above the cell.
    const restore = stubCellRect({
      top: 400,
      bottom: 430,
      left: 100,
      right: 300,
      width: 200,
      height: 30,
    });
    try {
      render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);
      const menu = getFloatingMenu();
      expect(menu.getAttribute('data-placement')).toBe('above');
    } finally {
      restore();
    }
  });

  it('aligns right when the cell would overflow the viewport right edge', () => {
    // window.innerWidth defaults to 1024 under jsdom — pin the cell close to
    // that edge so right-overflow is guaranteed.
    const vw = window.innerWidth;
    const restore = stubCellRect({
      top: 400,
      bottom: 430,
      left: vw - 80,
      right: vw - 10, // within the 100px right-edge buffer
      width: 70,
      height: 30,
    });
    try {
      render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);
      const menu = getFloatingMenu();
      expect(menu.getAttribute('data-align')).toBe('right');
    } finally {
      restore();
    }
  });

  it('aligns left when the cell is flush with the viewport left edge', () => {
    const restore = stubCellRect({
      top: 400,
      bottom: 430,
      left: 5, // within the 100px left-edge buffer
      right: 75,
      width: 70,
      height: 30,
    });
    try {
      render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);
      const menu = getFloatingMenu();
      expect(menu.getAttribute('data-align')).toBe('left');
    } finally {
      restore();
    }
  });

  it('recomputes position on window `scroll` events', () => {
    const restore = stubCellRect({
      top: 400,
      bottom: 430,
      left: 100,
      right: 300,
      width: 200,
      height: 30,
    });
    try {
      render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);

      // Swap in a spy AFTER initial render so we only count scroll-driven
      // recalculations. The production implementation is expected to call
      // `getBoundingClientRect` (or a function that ultimately delegates to
      // it) inside the scroll handler.
      const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');

      window.dispatchEvent(new Event('scroll'));

      expect(
        spy,
        'scroll event must trigger a position recomputation via getBoundingClientRect',
      ).toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('recomputes position on window `resize` events', () => {
    const restore = stubCellRect({
      top: 400,
      bottom: 430,
      left: 100,
      right: 300,
      width: 200,
      height: 30,
    });
    try {
      render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);

      const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
      window.dispatchEvent(new Event('resize'));

      expect(
        spy,
        'resize event must trigger a position recomputation via getBoundingClientRect',
      ).toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('does not render the toolbar when the cell is not in edit mode', () => {
    render(<RichTextCell {...makeProps({ isEditing: false, value: '**hi**' })} />);
    expect(
      document.body.querySelector('[role="toolbar"][data-floating-menu]'),
    ).toBeNull();
    // Sanity: the display-mode renderer is still shown.
    expect(screen.getByTestId('richtext-rendered')).toBeInTheDocument();
  });
});
