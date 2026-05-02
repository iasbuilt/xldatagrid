/**
 * Tests for the chrome-resolver named-object overload (PR5).
 *
 * The grid accepts two calling conventions for every chrome row-level
 * presentation resolver (`getRowBorder`, `getRowBackground`,
 * `getChromeCellContent`) — see {@link ChromeRowResolver}:
 *
 *   * Positional (backward-compatible, historical wire format):
 *     `(row, rowId, rowIndex) => TResult`
 *   * Named-object (self-documenting, extensible):
 *     `({ row, rowId, rowIndex, column? }) => TResult`
 *
 * The grid dispatches at runtime via `fn.length` (the resolver's declared
 * arity). These tests lock in:
 *
 *   1. The named-object form produces the same observable effect as the
 *      positional form for every resolver slot.
 *   2. The positional form keeps working unchanged (backward compatibility).
 *   3. Call-argument shape: when invoked by the grid, the named-object form
 *      receives `{ row, rowId, rowIndex }` with correct field values.
 *   4. Type-level narrowing: a named-object resolver typed against a
 *      concrete `TData` narrows `ctx.row` to that row shape.
 *
 * Compile-only assertions live alongside the runtime specs so a regression
 * in the overload types is caught at the same place the runtime contract
 * lives.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type {
  ChromeColumnsConfig,
  ChromeRowResolverContext,
  RowBorderStyle,
  ChromeCellContent,
  ColumnDef,
} from '@iasbuilt/datagrid-core';
import { DataGrid } from '../DataGrid';

type TestRow = { id: string; name: string; value: number };

function makeData(count = 3): TestRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: `Row ${i + 1}`,
    value: i,
  }));
}

const columns = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'value', field: 'value', title: 'Value' },
];

// ────────────────────────────────────────────────────────────────────────────
// Compile-time assertions — the overload types must accept both call shapes
// with full narrowing of `row`.
// ────────────────────────────────────────────────────────────────────────────

type _CtxForRow = ChromeRowResolverContext<TestRow>;

// Named-object resolver typed against a concrete row; `ctx.row` narrows.
const _namedBackground: NonNullable<ChromeColumnsConfig<TestRow>['getRowBackground']> = (
  ctx: ChromeRowResolverContext<TestRow>,
) => {
  const _name: string = ctx.row.name;
  const _value: number = ctx.row.value;
  const _rowId: string = ctx.rowId;
  const _rowIndex: number = ctx.rowIndex;
  // `column` is optional on the context; its presence is opt-in.
  const _column: ColumnDef<TestRow> | undefined = ctx.column;
  void _name;
  void _value;
  void _rowId;
  void _rowIndex;
  void _column;
  return null;
};
void _namedBackground;

// Positional resolver still works (backward compat).
const _positionalBackground: NonNullable<ChromeColumnsConfig<TestRow>['getRowBackground']> = (
  row,
  rowId,
  rowIndex,
) => {
  const _name: string = row.name;
  void _name;
  void rowId;
  void rowIndex;
  return null;
};
void _positionalBackground;

// Named-object resolver returning a structured result (getRowBorder).
const _namedBorder: NonNullable<ChromeColumnsConfig<TestRow>['getRowBorder']> = ({ row }) => {
  return row.value > 0 ? ({ color: '#000' } satisfies RowBorderStyle) : null;
};
void _namedBorder;

// Named-object resolver returning chrome-cell content.
const _namedContent: NonNullable<ChromeColumnsConfig<TestRow>['getChromeCellContent']> = ({
  row,
  rowIndex,
}) => {
  return { text: `${rowIndex}:${row.name}` } satisfies ChromeCellContent;
};
void _namedContent;

// The `ColumnDef` generic on `ctx.column` must carry `TData` through.
function _ctxColumnNarrows(ctx: _CtxForRow): void {
  if (ctx.column) {
    // `field` is `keyof TestRow & string` — compile-time narrowing.
    const _field: 'id' | 'name' | 'value' = ctx.column.field;
    void _field;
  }
}
void _ctxColumnNarrows;

// ────────────────────────────────────────────────────────────────────────────
// Runtime behaviour
// ────────────────────────────────────────────────────────────────────────────

describe('chrome resolver named-object overload', () => {
  it('named-object form produces the same background as positional form', () => {
    // Positional: paint row 0 with '#aaccee'.
    const { unmount } = render(
      <DataGrid
        data={makeData(2)}
        columns={columns as any}
        rowKey="id"
        chrome={{
          rowNumbers: true,
          getRowBackground: (row, rowId, rowIndex) =>
            rowIndex === 0 ? '#aaccee' : null,
        }}
      />,
    );
    // Pick row containers via the `[role="row"]` qualifier — without it
    // the selector also matches the chrome-column row-number cell, which
    // carries its own `data-row-id` attribute for click routing.
    const positionalRow0 = document.querySelector(
      '[data-row-id="1"][role="row"]',
    ) as HTMLElement | null;
    const positionalRow0Bg = positionalRow0?.style?.background;
    unmount();

    // Named-object: same behaviour.
    render(
      <DataGrid
        data={makeData(2)}
        columns={columns as any}
        rowKey="id"
        chrome={{
          rowNumbers: true,
          getRowBackground: ({ rowIndex }) => (rowIndex === 0 ? '#aaccee' : null),
        }}
      />,
    );
    const namedRow0 = document.querySelector(
      '[data-row-id="1"][role="row"]',
    ) as HTMLElement | null;
    const namedRow0Bg = namedRow0?.style?.background;

    // Both backgrounds are the same non-empty value — the named-object form
    // flowed through the same painting path.
    expect(positionalRow0Bg).toBeTruthy();
    expect(namedRow0Bg).toBe(positionalRow0Bg);
  });

  it('positional form keeps working unchanged', () => {
    // Declared with all three positional parameters so the arity matches
    // the historical wire format. The dispatcher identifies a positional
    // resolver by looking at the first parameter's structural prefix —
    // here, `row` (an identifier, not `{`) triggers the positional branch.
    //
    // We use a raw function + manual invocation capture so the resolver's
    // `toString()` source preserves the positional shape verbatim (some
    // spy wrappers stringify as `(...args) => …`, which would also
    // dispatch as positional but would obscure the intent of this test).
    const calls: Array<{ argCount: number; row: TestRow; rowId: string; rowIndex: number }> = [];
    const positional = function positional(
      row: TestRow,
      rowId: string,
      rowIndex: number,
    ): string | null {
      calls.push({ argCount: arguments.length, row, rowId, rowIndex });
      return row.value === 0 ? '#eeeeee' : null;
    };

    render(
      <DataGrid
        data={makeData(3)}
        columns={columns as any}
        rowKey="id"
        chrome={{ rowNumbers: true, getRowBackground: positional }}
      />,
    );

    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      // Three positional args were passed — the grid's wire format is
      // unchanged for positional resolvers.
      expect(c.argCount).toBe(3);
      expect(typeof c.row).toBe('object');
      expect(typeof c.rowId).toBe('string');
      expect(typeof c.rowIndex).toBe('number');
      // The first argument is the row itself, not a context wrapper.
      expect(c.row).not.toHaveProperty('row');
      expect(c.row).toHaveProperty('id');
    }
  });

  it('single-arg positional form `(row) => …` keeps working (back-compat)', () => {
    // A very common historical shape: the resolver declares only `row`
    // and ignores the extra args. The dispatcher must NOT treat this as
    // a named-object resolver — the consumer expects `row` to be the
    // data row, not a context wrapper.
    const calls: Array<{ argCount: number; firstArg: unknown }> = [];
    const positionalOneArg = function positionalOneArg(row: TestRow): string | null {
      calls.push({ argCount: arguments.length, firstArg: row });
      return row.value === 0 ? '#cafe00' : null;
    };

    render(
      <DataGrid
        data={makeData(2)}
        columns={columns as any}
        rowKey="id"
        chrome={{
          rowNumbers: true,
          getRowBackground: positionalOneArg as NonNullable<
            ChromeColumnsConfig<TestRow>['getRowBackground']
          >,
        }}
      />,
    );

    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      // Three positional args are always passed; the resolver simply
      // ignores the trailing two. Crucially, the first argument is the
      // row itself — not a context object.
      expect(c.argCount).toBe(3);
      expect(c.firstArg).toHaveProperty('value');
      expect(c.firstArg).not.toHaveProperty('row');
    }
  });

  it('named-object form receives {row, rowId, rowIndex} at each call site', () => {
    // A destructured-object resolver — the dispatcher's toString-prefix
    // detection triggers the named-object branch.
    //
    // We record each invocation via a manual capture array rather than
    // `vi.fn()` so the function's stringified source preserves the
    // destructuring pattern (some mock wrappers stringify as `(...args)`
    // or `function spy()`, which would mask the real shape and defeat
    // the dispatch detection this test is locking in).
    const calls: Array<{ argCount: number; ctx: ChromeRowResolverContext<TestRow> }> = [];
    const named = function named(
      { row, rowId, rowIndex }: ChromeRowResolverContext<TestRow>
    ): string | null {
      // `arguments` is only available on non-arrow functions, which is also
      // what lets us reliably assert the invocation arity in this test.
      calls.push({ argCount: arguments.length, ctx: { row, rowId, rowIndex } });
      return rowIndex === 0 ? '#ff0000' : null;
    };

    render(
      <DataGrid
        data={makeData(2)}
        columns={columns as any}
        rowKey="id"
        chrome={{ rowNumbers: true, getRowBackground: named }}
      />,
    );

    expect(calls.length).toBeGreaterThan(0);
    // Every invocation receives exactly one argument (the ctx object), never
    // three positional arguments.
    for (const c of calls) {
      expect(c.argCount).toBe(1);
      expect(c.ctx).toBeTypeOf('object');
      expect(c.ctx).toHaveProperty('row');
      expect(c.ctx).toHaveProperty('rowId');
      expect(c.ctx).toHaveProperty('rowIndex');
      expect(typeof c.ctx.row).toBe('object');
      expect(typeof c.ctx.row.id).toBe('string');
      expect(typeof c.ctx.row.name).toBe('string');
      expect(typeof c.ctx.rowId).toBe('string');
      expect(typeof c.ctx.rowIndex).toBe('number');
    }

    // And the specific values flowed through: the first row invocation gets
    // rowIndex === 0 and row.id === '1'.
    const firstCall = calls.find((c) => c.ctx.rowIndex === 0);
    expect(firstCall).toBeDefined();
    expect((firstCall!.ctx.row as TestRow).id).toBe('1');
    expect(firstCall!.ctx.rowId).toBe('1');
  });

  it('named-object getChromeCellContent paints the returned text into the chrome gutter', () => {
    render(
      <DataGrid
        data={makeData(2)}
        columns={columns as any}
        rowKey="id"
        chrome={{
          rowNumbers: true,
          getChromeCellContent: ({ row }) => ({ text: `N:${row.name}` }),
        }}
      />,
    );

    // Every row emits its custom text.
    expect(screen.getByText('N:Row 1')).toBeInTheDocument();
    expect(screen.getByText('N:Row 2')).toBeInTheDocument();
  });

  it('named-object getRowBorder honours the returned border style', () => {
    render(
      <DataGrid
        data={makeData(2)}
        columns={columns as any}
        rowKey="id"
        chrome={{
          rowNumbers: true,
          getRowBorder: ({ rowIndex }) =>
            rowIndex === 1 ? { color: '#ff00ff', width: 2 } : null,
        }}
      />,
    );

    // The second row's container picks up the declared border colour.
    // `[role="row"]` excludes chrome-column row-number cells.
    const row1 = document.querySelector(
      '[data-row-id="2"][role="row"]',
    ) as HTMLElement | null;
    expect(row1).not.toBeNull();
    // The border is applied via inline style; its exact property depends on
    // the internal style factory, but the declared colour must show up
    // somewhere in the computed style string.
    const styleAttr = row1!.getAttribute('style') ?? '';
    expect(styleAttr.toLowerCase()).toMatch(/#ff00ff|rgb\(255,\s*0,\s*255\)/);
  });

  it('untyped spread-argument resolvers fall back to the positional form', () => {
    // `(...args) => …` has `length === 0`, which the grid dispatches via the
    // positional path — documented fallback for runtime-untyped callers.
    const spread = vi.fn<(...args: unknown[]) => string | null>((...args) => {
      // Three positional arguments: row, rowId, rowIndex.
      return args.length === 3 ? '#00ff00' : null;
    });

    render(
      <DataGrid
        data={makeData(1)}
        columns={columns as any}
        rowKey="id"
        chrome={{
          rowNumbers: true,
          // Cast required because `(...args) => …` doesn't match either
          // overload narrowly — this is precisely the untyped case the
          // fallback is designed for.
          getRowBackground: spread as NonNullable<
            ChromeColumnsConfig<TestRow>['getRowBackground']
          >,
        }}
      />,
    );

    expect(spread).toHaveBeenCalled();
    for (const call of spread.mock.calls) {
      expect(call.length).toBe(3);
    }
  });
});
