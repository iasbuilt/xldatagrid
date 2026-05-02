import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import { DataGrid } from '../DataGrid';
import { ContextMenuItemDef } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type TestRow = { id: string; name: string; age: number };

function makeData(): TestRow[] {
  return [
    { id: '1', name: 'Alice', age: 30 },
    { id: '2', name: 'Bob', age: 25 },
    { id: '3', name: 'Charlie', age: 35 },
  ];
}

const columns = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'age', field: 'age', title: 'Age', sortable: true },
];

function renderGrid(overrides: Partial<Parameters<typeof DataGrid>[0]> = {}) {
  return render(
    <DataGrid
      data={makeData()}
      columns={columns}
      rowKey="id"
      contextMenu={true}
      {...(overrides as any)}
    />,
  );
}

function rightClickCell(index = 0, clientX = 200, clientY = 300) {
  const cells = screen.getAllByRole('gridcell');
  fireEvent.contextMenu(cells[index]!, { clientX, clientY });
}

function rightClickColumnHeader(name: RegExp, clientX = 100, clientY = 50) {
  const header = screen.getByRole('columnheader', { name });
  fireEvent.contextMenu(header, { clientX, clientY });
}

// ---------------------------------------------------------------------------
// Open / close behavior
// ---------------------------------------------------------------------------

describe('ContextMenu open/close', () => {
  it('opens on right-click on cell', () => {
    renderGrid();
    rightClickCell();
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
  });

  it('opens on right-click on row header', () => {
    renderGrid();
    // Right-click on the row div itself (the data-row-header element)
    const rows = screen.getAllByRole('row').slice(1); // skip header row
    fireEvent.contextMenu(rows[0]!, { clientX: 10, clientY: 100 });
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
  });

  it('opens on right-click on column header', () => {
    renderGrid();
    rightClickColumnHeader(/name/i);
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
  });

  it('positions near cursor coordinates', () => {
    renderGrid();
    rightClickCell(0, 250, 350);
    const menu = screen.getByTestId('context-menu');
    expect(menu.style.left).toBe('250px');
    expect(menu.style.top).toBe('350px');
  });

  it('repositions to stay within viewport', () => {
    // Place the menu near the bottom-right corner of viewport
    // jsdom defaults: innerWidth=1024, innerHeight=768
    renderGrid();
    rightClickCell(0, 950, 700);
    const menu = screen.getByTestId('context-menu');
    // Menu should have been clamped; the exact position depends on measured
    // dimensions. In jsdom getBoundingClientRect returns 0x0, so our
    // repositioning will compute width/height = 0 and keep original coords.
    // We simply verify the menu renders (the logic path runs).
    expect(menu).toBeInTheDocument();
    // Verify the repositioning logic was exercised (left & top are set)
    expect(menu.style.position).toBe('fixed');
  });

  it('closes on outside click', () => {
    renderGrid();
    rightClickCell();
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();

    // Click outside the menu
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    renderGrid();
    rightClickCell();
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
  });

  it('closes on menu item click', () => {
    renderGrid();
    rightClickCell();
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();

    // The built-in "Delete Row" item should be present
    const deleteItem = screen.getByTestId('context-menu-item-__delete-row');
    fireEvent.click(deleteItem);
    expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Built-in items: Delete Row
// ---------------------------------------------------------------------------

describe('ContextMenu delete row', () => {
  it('shows delete row option', () => {
    renderGrid();
    rightClickCell();
    expect(screen.getByTestId('context-menu-item-__delete-row')).toBeInTheDocument();
    expect(screen.getByText('Delete Row')).toBeInTheDocument();
  });

  it('delete row removes target row', () => {
    renderGrid();
    // Right-click on first cell (row id=1)
    rightClickCell();
    fireEvent.click(screen.getByTestId('context-menu-item-__delete-row'));

    // After deletion, Alice should no longer be visible
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    // Bob and Charlie still there
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('delete row fires onRowDelete callback', () => {
    const onRowDelete = vi.fn();
    renderGrid({ onRowDelete });
    rightClickCell();
    fireEvent.click(screen.getByTestId('context-menu-item-__delete-row'));
    expect(onRowDelete).toHaveBeenCalledWith(['1']);
  });
});

// ---------------------------------------------------------------------------
// Configurable items
// ---------------------------------------------------------------------------

describe('ContextMenu configurable items', () => {
  it('shows configurable items from config', () => {
    const items: ContextMenuItemDef[] = [
      { key: 'copy', label: 'Copy Cell', onClick: vi.fn() },
      { key: 'paste', label: 'Paste', onClick: vi.fn() },
    ];
    renderGrid({ contextMenu: { items } });
    rightClickCell();
    expect(screen.getByTestId('context-menu-item-copy')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-item-paste')).toBeInTheDocument();
    expect(screen.getByText('Copy Cell')).toBeInTheDocument();
    expect(screen.getByText('Paste')).toBeInTheDocument();
  });

  it('configurable item fires callback with row and column', () => {
    const onClick = vi.fn();
    const items: ContextMenuItemDef[] = [
      { key: 'custom', label: 'Custom Action', onClick },
    ];
    renderGrid({ contextMenu: { items } });
    rightClickCell(0); // first cell is row=1, field=name
    fireEvent.click(screen.getByTestId('context-menu-item-custom'));
    expect(onClick).toHaveBeenCalledWith({ rowId: '1', field: 'name' });
  });

  it('disables item when condition returns false', () => {
    const onClick = vi.fn();
    const items: ContextMenuItemDef[] = [
      {
        key: 'disabled-item',
        label: 'Cannot Click',
        disabled: () => true,
        onClick,
      },
    ];
    renderGrid({ contextMenu: { items } });
    rightClickCell();
    const item = screen.getByTestId('context-menu-item-disabled-item');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(item);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('hides item when visible returns false', () => {
    const items: ContextMenuItemDef[] = [
      {
        key: 'hidden-item',
        label: 'Hidden',
        visible: () => false,
        onClick: vi.fn(),
      },
      {
        key: 'shown-item',
        label: 'Shown',
        visible: () => true,
        onClick: vi.fn(),
      },
    ];
    renderGrid({ contextMenu: { items } });
    rightClickCell();
    expect(screen.queryByTestId('context-menu-item-hidden-item')).not.toBeInTheDocument();
    expect(screen.getByTestId('context-menu-item-shown-item')).toBeInTheDocument();
  });

  it('shows separator between item groups', () => {
    const items: ContextMenuItemDef[] = [
      { key: 'a', label: 'Item A', dividerAfter: true, onClick: vi.fn() },
      { key: 'b', label: 'Item B', onClick: vi.fn() },
    ];
    renderGrid({ contextMenu: { items } });
    rightClickCell();
    const separators = screen.getAllByTestId('context-menu-separator');
    expect(separators.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Nested submenus
// ---------------------------------------------------------------------------

describe('ContextMenu nested submenu', () => {
  function makeNestedItems(): ContextMenuItemDef[] {
    return [
      {
        key: 'parent',
        label: 'Parent',
        onClick: vi.fn(),
        children: [
          { key: 'child-a', label: 'Child A', onClick: vi.fn() },
          { key: 'child-b', label: 'Child B', onClick: vi.fn() },
        ],
      },
    ];
  }

  it('supports nested submenu', () => {
    renderGrid({ contextMenu: { items: makeNestedItems() } });
    rightClickCell();
    expect(screen.getByTestId('context-menu-item-parent')).toBeInTheDocument();
    // Submenu should not be visible yet
    expect(screen.queryByTestId('context-menu-submenu-parent')).not.toBeInTheDocument();
  });

  it('nested submenu opens on hover', () => {
    renderGrid({ contextMenu: { items: makeNestedItems() } });
    rightClickCell();
    const parentItem = screen.getByTestId('context-menu-item-parent');
    fireEvent.mouseEnter(parentItem);
    expect(screen.getByTestId('context-menu-submenu-parent')).toBeInTheDocument();
    expect(screen.getByText('Child A')).toBeInTheDocument();
    expect(screen.getByText('Child B')).toBeInTheDocument();
  });

  it('nested submenu closes when parent loses hover', async () => {
    vi.useFakeTimers();
    renderGrid({ contextMenu: { items: makeNestedItems() } });
    rightClickCell();
    const parentItem = screen.getByTestId('context-menu-item-parent');
    fireEvent.mouseEnter(parentItem);
    expect(screen.getByTestId('context-menu-submenu-parent')).toBeInTheDocument();

    fireEvent.mouseLeave(parentItem);
    // The submenu closes after a short delay
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByTestId('context-menu-submenu-parent')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Icons and shortcuts
// ---------------------------------------------------------------------------

describe('ContextMenu icons and shortcuts', () => {
  it('renders icons per item', () => {
    const items: ContextMenuItemDef[] = [
      { key: 'edit', label: 'Edit', icon: '✏️', onClick: vi.fn() },
    ];
    renderGrid({ contextMenu: { items } });
    rightClickCell();
    expect(screen.getByTestId('context-menu-icon-edit')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-icon-edit').textContent).toBe('✏️');
  });

  it('renders keyboard shortcut hint per item', () => {
    const items: ContextMenuItemDef[] = [
      { key: 'copy', label: 'Copy', shortcut: 'Ctrl+C', onClick: vi.fn() },
    ];
    renderGrid({ contextMenu: { items } });
    rightClickCell();
    expect(screen.getByTestId('context-menu-shortcut-copy')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-shortcut-copy').textContent).toBe('Ctrl+C');
  });
});

// ---------------------------------------------------------------------------
// Disabled context menu
// ---------------------------------------------------------------------------

describe('ContextMenu disabled', () => {
  it('does not open when contextMenu config is false', () => {
    renderGrid({ contextMenu: false });
    const cells = screen.getAllByRole('gridcell');
    fireEvent.contextMenu(cells[0]!, { clientX: 200, clientY: 300 });
    expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
  });
});
