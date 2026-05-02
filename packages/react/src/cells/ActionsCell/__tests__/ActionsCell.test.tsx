import { vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import { ActionsCell } from '../ActionsCell';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const baseColumn: ColumnDef = {
  id: 'col1',
  field: 'name',
  title: 'Name',
  editable: true,
};

const noop = () => {};

const makeActionsColumn = (actions: Array<{
  label: string;
  onClick: (row: unknown) => void;
  disabled?: boolean | ((row: unknown) => boolean);
  tooltip?: string;
}>) => ({ ...baseColumn, actions } as any);

// ---------------------------------------------------------------------------
// ActionsCell
// ---------------------------------------------------------------------------

describe('ActionsCell', () => {
  it('renders action buttons', () => {
    const col = makeActionsColumn([
      { label: 'Edit', onClick: noop },
      { label: 'Delete', onClick: noop },
    ]);
    render(
      <ActionsCell value={null} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('calls action onClick with row data', () => {
    const onClick = vi.fn();
    const row = { id: 1, name: 'test' };
    const col = makeActionsColumn([{ label: 'Do it', onClick }]);
    render(
      <ActionsCell value={null} row={row} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
    expect(onClick).toHaveBeenCalledWith(row);
  });

  it('disabled button is not clickable', () => {
    const onClick = vi.fn();
    const col = makeActionsColumn([{ label: 'Disabled', onClick, disabled: true }]);
    render(
      <ActionsCell value={null} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    const btn = screen.getByRole('button', { name: 'Disabled' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('supports disabled as a function', () => {
    const onClick = vi.fn();
    const col = makeActionsColumn([
      { label: 'Conditional', onClick, disabled: (r: any) => r.locked === true },
    ]);
    render(
      <ActionsCell value={null} row={{ locked: true }} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect((screen.getByRole('button', { name: 'Conditional' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables button when disabled function returns false', () => {
    const col = makeActionsColumn([
      { label: 'Active', onClick: noop, disabled: () => false },
    ]);
    render(
      <ActionsCell value={null} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect((screen.getByRole('button', { name: 'Active' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows tooltip on hover', () => {
    const col = makeActionsColumn([{ label: 'Info', onClick: noop, tooltip: 'More details' }]);
    render(
      <ActionsCell value={null} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByRole('tooltip')).toBeTruthy();
    expect(screen.getByRole('tooltip').textContent).toBe('More details');
  });

  it('hides tooltip on mouse leave', () => {
    const col = makeActionsColumn([{ label: 'Info', onClick: noop, tooltip: 'Tip text' }]);
    render(
      <ActionsCell value={null} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    const btn = screen.getByRole('button', { name: 'Info' });
    fireEvent.mouseEnter(btn);
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders nothing when no actions and no options', () => {
    const { container } = render(
      <ActionsCell value={null} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('falls back to column.options when no actions defined', () => {
    const col = {
      ...baseColumn,
      options: [{ value: 'view', label: 'View' }],
    };
    render(
      <ActionsCell value={null} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
  });

  it('disabled option from column.options renders disabled', () => {
    const col = {
      ...baseColumn,
      options: [{ value: 'del', label: 'Delete', disabled: true }],
    };
    render(
      <ActionsCell value={null} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders multiple tooltips independently', () => {
    const col = makeActionsColumn([
      { label: 'A', onClick: noop, tooltip: 'Tip A' },
      { label: 'B', onClick: noop, tooltip: 'Tip B' },
    ]);
    render(
      <ActionsCell value={null} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'A' }));
    expect(screen.getByRole('tooltip').textContent).toBe('Tip A');
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'A' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'B' }));
    expect(screen.getByRole('tooltip').textContent).toBe('Tip B');
  });

  it('buttons have aria-label matching their label', () => {
    const col = makeActionsColumn([{ label: 'Archive', onClick: noop }]);
    render(
      <ActionsCell value={null} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByRole('button', { name: 'Archive' }).getAttribute('aria-label')).toBe('Archive');
  });

  it('does not crash when value is not null', () => {
    const col = makeActionsColumn([{ label: 'Go', onClick: noop }]);
    render(
      <ActionsCell value="ignored" row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy();
  });
});
