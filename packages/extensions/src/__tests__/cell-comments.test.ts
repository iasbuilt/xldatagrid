import { createCellComments, CellCommentsConfig, CommentThread } from '../cell-comments';
import type { GridEvent, CellAddress } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currentUser = { id: 'u1', displayName: 'Alice' };

function makeConfig(overrides: Partial<CellCommentsConfig> = {}): CellCommentsConfig {
  return { enabled: true, currentUser, ...overrides };
}

function makeThread(cell: CellAddress): CommentThread {
  return {
    id: `thread-${cell.rowId}-${cell.field}`,
    cell,
    comments: [
      {
        id: 'c1',
        threadId: `thread-${cell.rowId}-${cell.field}`,
        parentId: null,
        author: 'Alice',
        authorId: 'u1',
        body: 'Hello',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: null,
        resolved: false,
      },
    ],
    resolved: false,
  };
}

function fireContextMenu(ext: ReturnType<typeof createCellComments>, cell: CellAddress | null) {
  const hooks = ext.hooks?.({} as any) ?? [];
  const hook = hooks[0]!;
  const items: any[] = [];
  const event: GridEvent = {
    type: 'contextMenu:open',
    timestamp: Date.now(),
    payload: { cell, items },
  };
  hook.handler(event);
  return items;
}

// ---------------------------------------------------------------------------
// Extension structure
// ---------------------------------------------------------------------------

describe('createCellComments', () => {
  it('returns an ExtensionDefinition with id cell-comments', () => {
    const ext = createCellComments(makeConfig());
    expect(ext.id).toBe('cell-comments');
  });

  it('returns version 0.1.0', () => {
    const ext = createCellComments(makeConfig());
    expect(ext.version).toBe('0.1.0');
  });

  it('has a hooks function', () => {
    const ext = createCellComments(makeConfig());
    expect(typeof ext.hooks).toBe('function');
  });

  it('has an init function', () => {
    const ext = createCellComments(makeConfig());
    expect(typeof ext.init).toBe('function');
  });

  it('has a destroy function', () => {
    const ext = createCellComments(makeConfig());
    expect(typeof ext.destroy).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Initial threads
// ---------------------------------------------------------------------------

describe('createCellComments: initial threads', () => {
  it('loads initial threads without throwing', () => {
    const thread = makeThread({ rowId: 'r1', field: 'name' });
    expect(() =>
      createCellComments(makeConfig({ threads: [thread] }))
    ).not.toThrow();
  });

  it('accepts multiple initial threads', () => {
    const threads = [
      makeThread({ rowId: 'r1', field: 'name' }),
      makeThread({ rowId: 'r2', field: 'age' }),
    ];
    expect(() =>
      createCellComments(makeConfig({ threads }))
    ).not.toThrow();
  });

  it('works when threads is undefined', () => {
    expect(() => createCellComments(makeConfig({ threads: undefined }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Context menu contribution
// ---------------------------------------------------------------------------

describe('createCellComments: context menu', () => {
  it('adds "Add comment..." item when enabled and cell is provided', () => {
    const ext = createCellComments(makeConfig());
    const items = fireContextMenu(ext, { rowId: 'r1', field: 'name' });
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe('Add comment...');
    expect(items[0]!.key).toBe('add-comment');
  });

  it('does not add menu item when cell is null', () => {
    const ext = createCellComments(makeConfig());
    const items = fireContextMenu(ext, null);
    expect(items).toHaveLength(0);
  });

  it('does not add menu item when extension is disabled', () => {
    const ext = createCellComments(makeConfig({ enabled: false }));
    const items = fireContextMenu(ext, { rowId: 'r1', field: 'name' });
    expect(items).toHaveLength(0);
  });

  it('menu item has order 900', () => {
    const ext = createCellComments(makeConfig());
    const items = fireContextMenu(ext, { rowId: 'r1', field: 'name' });
    expect(items[0]!.order).toBe(900);
  });

  it('menu item onClick does not throw', () => {
    const ext = createCellComments(makeConfig());
    const items = fireContextMenu(ext, { rowId: 'r1', field: 'name' });
    expect(() => items[0]!.onClick()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Hooks registration
// ---------------------------------------------------------------------------

describe('createCellComments: hooks', () => {
  it('registers one hook on contextMenu:open', () => {
    const ext = createCellComments(makeConfig());
    const hooks = ext.hooks?.({} as any) ?? [];
    expect(hooks).toHaveLength(1);
    expect(hooks[0]!.event).toBe('contextMenu:open');
    expect(hooks[0]!.phase).toBe('on');
  });
});

// ---------------------------------------------------------------------------
// Destroy
// ---------------------------------------------------------------------------

describe('createCellComments: destroy', () => {
  it('calls destroy without throwing', () => {
    const thread = makeThread({ rowId: 'r1', field: 'name' });
    const ext = createCellComments(makeConfig({ threads: [thread] }));
    expect(() => ext.destroy?.({} as any)).not.toThrow();
  });

  it('destroy can be called multiple times without error', () => {
    const ext = createCellComments(makeConfig());
    expect(() => {
      ext.destroy?.({} as any);
      ext.destroy?.({} as any);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

describe('getThread / hasComments placeholders', () => {
  it('getThread returns undefined', async () => {
    const { getThread } = await import('../cell-comments');
    expect(getThread({ rowId: 'r1', field: 'name' })).toBeUndefined();
  });

  it('hasComments returns false', async () => {
    const { hasComments } = await import('../cell-comments');
    expect(hasComments({ rowId: 'r1', field: 'name' })).toBe(false);
  });
});
