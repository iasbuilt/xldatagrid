/**
 * Red-phase contracts for Feature "cell text overflow + full-text reveal".
 *
 * Specification (Phase B will satisfy):
 *
 *   1. Each cell exposes `data-overflow-policy="<policy>"` matching the
 *      column's `overflow` value. When the column does not declare `overflow`,
 *      the grid applies a field-based default via `getDefaultOverflowPolicy`
 *      which falls back to `'truncate-end'`.
 *
 *   2. Per-policy rendering:
 *      - `truncate-end`     → CSS ellipsis on an inline wrapper
 *                             (`text-overflow: ellipsis; white-space: nowrap;
 *                              overflow: hidden`)
 *      - `truncate-middle`  → the DISPLAY text is the return value of
 *                             `truncateMiddle()`, so the visible text contains
 *                             a U+2026 somewhere in the middle while the
 *                             underlying raw value is still intact
 *      - `clamp-2`          → `-webkit-line-clamp: 2` (plus
 *                             `display:-webkit-box`, vertical box orientation,
 *                             hidden overflow)
 *      - `clamp-3`          → same as clamp-2 with `-webkit-line-clamp: 3`
 *      - `wrap`             → wraps to multiple lines
 *                             (`white-space: normal`; MUST NOT be `nowrap`)
 *      - `reveal-only`      → renders a compact affordance element carrying
 *                             `[data-reveal-affordance]`; the full value is
 *                             only shown via the hover tooltip
 *
 *   3. Cells measured as overflowing set `data-truncated="true"`; cells that
 *      fit set `data-truncated="false"`. jsdom does not implement layout, so
 *      these tests stub `scrollWidth`/`clientWidth` via `Object.defineProperty`
 *      to force a measurable overflow condition (mirrors the pattern used by
 *      `clipboard-integration.test.tsx` for clipboard stubs).
 *
 *   4. Reveal contract:
 *      - Truncated + no `note`    → hover tooltip shows the FULL raw value.
 *      - Truncated + `note`       → `note` wins (existing behaviour).
 *      - Not truncated            → no auto-tooltip (the hover-tooltip hook
 *                                   only fires when the display is clipped).
 *      - `overflow: 'wrap'`       → never sets `data-truncated="true"`.
 *      - `overflow: 'reveal-only'`→ ALWAYS shows the tooltip on hover
 *                                   regardless of measured truncation.
 *      - Keyboard focus on a truncated cell opens the tooltip after the
 *        same 400 ms delay (keyboard-only a11y).
 *      - Edit mode always reveals the full raw value in the inline input.
 *      - Ctrl+C copies the raw value, never the truncated display string.
 *
 * Every reference to the new `overflow` / `truncateMiddle` / data attributes
 * is guarded by `@ts-expect-error // Phase B will add` so the red phase
 * compiles cleanly and fails at assertion time, not compile time.
 */
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { vi } from 'vitest';
import { DataGrid } from '../DataGrid';
import { ColumnDef } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Asset = {
  id: string;
  asset_name: string;
  asset_tag: string;
  description: string;
  notes: string;
};

const LONG_NAME =
  'Studio A — Sony FX9 Cinema Camera Body Only with Original Box and Manual';
const LONG_TAG =
  '9X-A2D7-FB89-ZZ-2025-0001-EU-NORTH-LON-0007-AUX-SHIP-ID-42';
const LONG_DESCRIPTION =
  'Primary A-cam body used on Ep-005 and Ep-006; stored in hard-case shelf B-12 with silica gel and a Peli insert.';

function makeRows(): Asset[] {
  return [
    {
      id: '1',
      asset_name: LONG_NAME,
      asset_tag: LONG_TAG,
      description: LONG_DESCRIPTION,
      notes: LONG_DESCRIPTION,
    },
    {
      id: '2',
      asset_name: 'Short',
      asset_tag: 'SHORT-1',
      description: 'Short desc',
      notes: 'Short notes',
    },
  ];
}

// Shared helpers — mirrored from `hover-tooltip.test.tsx` so the red-phase
// assertions feel idiomatic against the existing test surface.

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
  const tips = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="tooltip"]'),
  );
  return (
    tips.find((t) => !t.hasAttribute('data-validation-target')) ?? null
  );
}

/**
 * Stub element layout so jsdom reports overflow. jsdom does not do layout,
 * so `scrollWidth` and `clientWidth` are always 0. We define them once on
 * `Element.prototype` for the duration of a test and restore afterwards.
 *
 * `scrollWidth > clientWidth` is the canonical browser signal the grid uses
 * to set `data-truncated="true"` (Phase B implementation detail, but the
 * contract here is the attribute surfaced to consumers).
 */
function stubOverflow(opts: { scroll: number; client: number }): () => void {
  const descScroll = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollWidth',
  );
  const descClient = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientWidth',
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      return opts.scroll;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return opts.client;
    },
  });
  return () => {
    if (descScroll) {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', descScroll);
    } else {
      // @ts-expect-error — delete typed as any on DOM prototypes
      delete HTMLElement.prototype.scrollWidth;
    }
    if (descClient) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', descClient);
    } else {
      // @ts-expect-error — delete typed as any on DOM prototypes
      delete HTMLElement.prototype.clientWidth;
    }
  };
}

const HOVER_DELAY_MS = 400;

// ---------------------------------------------------------------------------
// data-overflow-policy wiring
// ---------------------------------------------------------------------------

describe('cell overflow — data-overflow-policy attribute', () => {
  it('matches the column overflow value when explicitly set', () => {
    const columns: ColumnDef<Asset>[] = [
      {
        id: 'asset_name',
        field: 'asset_name',
        title: 'Name',
        // @ts-expect-error — Phase B will add `overflow` to ColumnDef
        overflow: 'truncate-end',
      },
      {
        id: 'asset_tag',
        field: 'asset_tag',
        title: 'Tag',
        // @ts-expect-error — Phase B will add `overflow` to ColumnDef
        overflow: 'truncate-middle',
      },
      {
        id: 'description',
        field: 'description',
        title: 'Description',
        // @ts-expect-error — Phase B will add `overflow` to ColumnDef
        overflow: 'clamp-2',
      },
    ];
    render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
    expect(findCell('1', 'asset_name').getAttribute('data-overflow-policy')).toBe(
      'truncate-end',
    );
    expect(findCell('1', 'asset_tag').getAttribute('data-overflow-policy')).toBe(
      'truncate-middle',
    );
    expect(findCell('1', 'description').getAttribute('data-overflow-policy')).toBe(
      'clamp-2',
    );
  });

  it('falls back to the field-based default when overflow is undefined', () => {
    const columns: ColumnDef<Asset>[] = [
      { id: 'asset_name', field: 'asset_name', title: 'Name' },
      { id: 'asset_tag', field: 'asset_tag', title: 'Tag' },
      { id: 'description', field: 'description', title: 'Description' },
    ];
    render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
    // asset_name, asset_tag, description are all spec-listed fields.
    expect(findCell('1', 'asset_name').getAttribute('data-overflow-policy')).toBe(
      'truncate-end',
    );
    expect(findCell('1', 'asset_tag').getAttribute('data-overflow-policy')).toBe(
      'truncate-middle',
    );
    expect(findCell('1', 'description').getAttribute('data-overflow-policy')).toBe(
      'clamp-2',
    );
  });

  it('falls back to truncate-end for fields not in the default map', () => {
    const columns: ColumnDef<Asset>[] = [
      // `notes` IS in the clamp-2 map, but `id` is not listed anywhere.
      { id: 'id', field: 'id', title: 'ID' },
    ];
    render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
    expect(findCell('1', 'id').getAttribute('data-overflow-policy')).toBe(
      'truncate-end',
    );
  });
});

// ---------------------------------------------------------------------------
// Per-policy rendering
// ---------------------------------------------------------------------------

describe('cell overflow — per-policy rendering', () => {
  it('truncate-end sets ellipsis + nowrap + hidden overflow on the text wrapper', () => {
    const columns: ColumnDef<Asset>[] = [
      {
        id: 'asset_name',
        field: 'asset_name',
        title: 'Name',
        width: 80,
        // @ts-expect-error — Phase B will add `overflow` to ColumnDef
        overflow: 'truncate-end',
      },
    ];
    render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
    const cell = findCell('1', 'asset_name');
    // The inline text wrapper is the element with the overflow styles —
    // either the cell itself or a direct child. Pick whichever carries the
    // relevant rule and assert all three ellipsis-style rules on it.
    const target =
      cell.querySelector<HTMLElement>('[data-cell-text]') ?? cell;
    const style = target.style;
    expect(style.textOverflow).toBe('ellipsis');
    expect(style.whiteSpace).toBe('nowrap');
    expect(style.overflow).toBe('hidden');
  });

  it('truncate-middle renders the text via truncateMiddle (ellipsis sits in the middle)', () => {
    const columns: ColumnDef<Asset>[] = [
      {
        id: 'asset_tag',
        field: 'asset_tag',
        title: 'Tag',
        width: 80,
        // @ts-expect-error — Phase B will add `overflow` to ColumnDef
        overflow: 'truncate-middle',
      },
    ];
    render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
    const cell = findCell('1', 'asset_tag');
    const visible = (cell.textContent ?? '').trim();
    // Middle truncation: ellipsis must appear and the first / last chars of
    // the raw tag must still be present (prefix + suffix preserved).
    expect(visible).toContain('\u2026');
    expect(visible.startsWith(LONG_TAG.charAt(0))).toBe(true);
    expect(visible.endsWith(LONG_TAG.charAt(LONG_TAG.length - 1))).toBe(true);
    // And the visible text is strictly shorter than the raw value.
    expect(visible.length).toBeLessThan(LONG_TAG.length);
  });

  it('clamp-2 applies -webkit-line-clamp: 2 with -webkit-box + vertical orient + hidden', () => {
    const columns: ColumnDef<Asset>[] = [
      {
        id: 'description',
        field: 'description',
        title: 'Description',
        // @ts-expect-error — Phase B will add `overflow` to ColumnDef
        overflow: 'clamp-2',
      },
    ];
    render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
    const cell = findCell('1', 'description');
    const target =
      cell.querySelector<HTMLElement>('[data-cell-text]') ?? cell;
    expect(target.style.display).toBe('-webkit-box');
    // The property name for -webkit-line-clamp is accessed via the
    // vendor-prefixed camelCase on CSSStyleDeclaration.
    expect(target.style.getPropertyValue('-webkit-line-clamp')).toBe('2');
    expect(target.style.getPropertyValue('-webkit-box-orient')).toBe('vertical');
    expect(target.style.overflow).toBe('hidden');
  });

  it('clamp-3 applies -webkit-line-clamp: 3', () => {
    const columns: ColumnDef<Asset>[] = [
      {
        id: 'description',
        field: 'description',
        title: 'Description',
        // @ts-expect-error — Phase B will add `overflow` to ColumnDef
        overflow: 'clamp-3',
      },
    ];
    render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
    const cell = findCell('1', 'description');
    const target =
      cell.querySelector<HTMLElement>('[data-cell-text]') ?? cell;
    expect(target.style.getPropertyValue('-webkit-line-clamp')).toBe('3');
  });

  it('wrap sets white-space: normal (NOT nowrap)', () => {
    const columns: ColumnDef<Asset>[] = [
      {
        id: 'description',
        field: 'description',
        title: 'Description',
        // @ts-expect-error — Phase B will add `overflow` to ColumnDef
        overflow: 'wrap',
      },
    ];
    render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
    const cell = findCell('1', 'description');
    const target =
      cell.querySelector<HTMLElement>('[data-cell-text]') ?? cell;
    expect(target.style.whiteSpace).not.toBe('nowrap');
    // Lenient: accept either `normal` or an unset value but not explicitly
    // `nowrap`. Phase B is likely to set `normal` + `word-break: break-word`.
    expect(['normal', '', 'pre-wrap']).toContain(target.style.whiteSpace);
  });

  it('reveal-only renders a compact affordance marker', () => {
    const columns: ColumnDef<Asset>[] = [
      {
        id: 'description',
        field: 'description',
        title: 'Description',
        // @ts-expect-error — Phase B will add `overflow` to ColumnDef
        overflow: 'reveal-only',
      },
    ];
    render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
    const cell = findCell('1', 'description');
    // A marker element inside the cell indicates reveal-only mode. The
    // exact tag/class is implementation-defined; the contract is the
    // data attribute.
    const affordance = cell.querySelector('[data-reveal-affordance]');
    expect(affordance).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// data-truncated measurement
// ---------------------------------------------------------------------------

describe('cell overflow — data-truncated attribute', () => {
  it('is "true" when measured overflow exists and the policy allows truncation', () => {
    const restore = stubOverflow({ scroll: 500, client: 80 });
    try {
      const columns: ColumnDef<Asset>[] = [
        {
          id: 'asset_name',
          field: 'asset_name',
          title: 'Name',
          width: 80,
          // @ts-expect-error — Phase B will add `overflow`
          overflow: 'truncate-end',
        },
      ];
      render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
      const cell = findCell('1', 'asset_name');
      expect(cell.getAttribute('data-truncated')).toBe('true');
    } finally {
      restore();
    }
  });

  it('is "false" when content fits inside the cell', () => {
    const restore = stubOverflow({ scroll: 40, client: 200 });
    try {
      const columns: ColumnDef<Asset>[] = [
        {
          id: 'asset_name',
          field: 'asset_name',
          title: 'Name',
          width: 200,
          // @ts-expect-error — Phase B will add `overflow`
          overflow: 'truncate-end',
        },
      ];
      render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
      const cell = findCell('2', 'asset_name'); // "Short"
      expect(cell.getAttribute('data-truncated')).toBe('false');
    } finally {
      restore();
    }
  });

  it('never sets data-truncated="true" when overflow is "wrap"', () => {
    const restore = stubOverflow({ scroll: 500, client: 80 });
    try {
      const columns: ColumnDef<Asset>[] = [
        {
          id: 'description',
          field: 'description',
          title: 'Description',
          // @ts-expect-error — Phase B will add `overflow`
          overflow: 'wrap',
        },
      ];
      render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
      const cell = findCell('1', 'description');
      expect(cell.getAttribute('data-truncated')).not.toBe('true');
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Reveal via hover tooltip
// ---------------------------------------------------------------------------

describe('cell overflow — hover tooltip reveals raw value', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the FULL raw value in the tooltip when truncated and no note is set', () => {
    const restore = stubOverflow({ scroll: 500, client: 80 });
    try {
      const columns: ColumnDef<Asset>[] = [
        {
          id: 'asset_name',
          field: 'asset_name',
          title: 'Name',
          width: 80,
          // @ts-expect-error — Phase B will add `overflow`
          overflow: 'truncate-end',
        },
      ];
      render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
      const cell = findCell('1', 'asset_name');
      fireEvent.mouseEnter(cell);
      act(() => {
        vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
      });
      const tip = findTooltip();
      expect(tip).not.toBeNull();
      // Critical: the tooltip text equals the RAW value, not the
      // truncated display string.
      expect(tip!.textContent).toContain(LONG_NAME);
    } finally {
      restore();
    }
  });

  it('honours ColumnDef.note over the full raw value when both apply', () => {
    const restore = stubOverflow({ scroll: 500, client: 80 });
    try {
      const columns: ColumnDef<Asset>[] = [
        {
          id: 'asset_name',
          field: 'asset_name',
          title: 'Name',
          width: 80,
          note: 'The human-readable asset label.',
          // @ts-expect-error — Phase B will add `overflow`
          overflow: 'truncate-end',
        },
      ];
      render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
      const cell = findCell('1', 'asset_name');
      fireEvent.mouseEnter(cell);
      act(() => {
        vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
      });
      const tip = findTooltip();
      expect(tip).not.toBeNull();
      expect(tip!.textContent).toContain('The human-readable asset label.');
      // And critically, the raw value must NOT appear — note wins.
      expect(tip!.textContent).not.toContain(LONG_NAME);
    } finally {
      restore();
    }
  });

  it('does not auto-fire a tooltip when the cell is not truncated', () => {
    const restore = stubOverflow({ scroll: 40, client: 200 });
    try {
      const columns: ColumnDef<Asset>[] = [
        {
          id: 'asset_name',
          field: 'asset_name',
          title: 'Name',
          width: 200,
          // @ts-expect-error — Phase B will add `overflow`
          overflow: 'truncate-end',
        },
      ];
      render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
      // Row 2 ("Short") — not truncated; hovering should yield no tooltip
      // from the overflow-reveal path.
      const cell = findCell('2', 'asset_name');
      fireEvent.mouseEnter(cell);
      act(() => {
        vi.advanceTimersByTime(HOVER_DELAY_MS + 200);
      });
      expect(findTooltip()).toBeNull();
    } finally {
      restore();
    }
  });

  it('always shows the tooltip on hover when overflow is "reveal-only"', () => {
    // Force measured overflow OFF — reveal-only ignores measurement.
    const restore = stubOverflow({ scroll: 40, client: 200 });
    try {
      const columns: ColumnDef<Asset>[] = [
        {
          id: 'description',
          field: 'description',
          title: 'Description',
          width: 200,
          // @ts-expect-error — Phase B will add `overflow`
          overflow: 'reveal-only',
        },
      ];
      render(<DataGrid data={makeRows()} columns={columns} rowKey="id" />);
      const cell = findCell('1', 'description');
      fireEvent.mouseEnter(cell);
      act(() => {
        vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
      });
      const tip = findTooltip();
      expect(tip).not.toBeNull();
      expect(tip!.textContent).toContain(LONG_DESCRIPTION);
    } finally {
      restore();
    }
  });

  it('opens the tooltip on keyboard focus of a truncated cell after the same delay', () => {
    const restore = stubOverflow({ scroll: 500, client: 80 });
    try {
      const columns: ColumnDef<Asset>[] = [
        {
          id: 'asset_name',
          field: 'asset_name',
          title: 'Name',
          width: 80,
          // @ts-expect-error — Phase B will add `overflow`
          overflow: 'truncate-end',
        },
      ];
      render(
        <DataGrid
          data={makeRows()}
          columns={columns}
          rowKey="id"
          keyboardNavigation
        />,
      );
      const cell = findCell('1', 'asset_name');
      cell.focus();
      fireEvent.focus(cell);
      act(() => {
        vi.advanceTimersByTime(HOVER_DELAY_MS + 50);
      });
      const tip = findTooltip();
      expect(tip).not.toBeNull();
      expect(tip!.textContent).toContain(LONG_NAME);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Edit mode + copy reveal the raw value
// ---------------------------------------------------------------------------

describe('cell overflow — edit mode and copy use the raw value', () => {
  it('edit mode populates the input with the FULL raw value, not the truncated display', () => {
    const restore = stubOverflow({ scroll: 500, client: 80 });
    try {
      const columns: ColumnDef<Asset>[] = [
        {
          id: 'asset_name',
          field: 'asset_name',
          title: 'Name',
          width: 80,
          editable: true,
          // @ts-expect-error — Phase B will add `overflow`
          overflow: 'truncate-end',
        },
      ];
      render(
        <DataGrid
          data={makeRows()}
          columns={columns}
          rowKey="id"
          selectionMode="cell"
        />,
      );
      const cell = findCell('1', 'asset_name');
      fireEvent.doubleClick(cell);
      const input = within(cell).getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe(LONG_NAME);
    } finally {
      restore();
    }
  });

  it('Ctrl+C copies the raw value, not the truncated display string', () => {
    const restore = stubOverflow({ scroll: 500, client: 80 });
    try {
      const writes: string[] = [];
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: vi.fn(async (text: string) => {
            writes.push(text);
          }),
          readText: vi.fn(async () => writes[writes.length - 1] ?? ''),
          write: vi.fn(async (items: ClipboardItem[]) => {
            for (const item of items) {
              if (item.types.includes('text/plain')) {
                writes.push(
                  await (await item.getType('text/plain')).text(),
                );
              }
            }
          }),
          read: vi.fn(async () => []),
        },
        writable: true,
        configurable: true,
      });

      const columns: ColumnDef<Asset>[] = [
        {
          id: 'asset_name',
          field: 'asset_name',
          title: 'Name',
          width: 80,
          // @ts-expect-error — Phase B will add `overflow`
          overflow: 'truncate-end',
        },
      ];
      const { container } = render(
        <DataGrid
          data={makeRows()}
          columns={columns}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
        />,
      );
      const grid = container.querySelector('[role="grid"]') as HTMLElement;
      grid.focus();
      const cell = findCell('1', 'asset_name');
      fireEvent.click(cell);
      fireEvent.keyDown(grid, {
        key: 'c',
        code: 'KeyC',
        ctrlKey: true,
        bubbles: true,
      });
      // Allow the clipboard microtask queue to drain.
      return Promise.resolve().then(() => {
        const copied = writes[writes.length - 1] ?? '';
        expect(copied).toBe(LONG_NAME);
        expect(copied).not.toContain('\u2026');
      });
    } finally {
      restore();
    }
  });
});
