/**
 * Unit tests for the editable status-dropdown contract (see GitHub #93).
 *
 * Covers the new column-config callbacks added in #93:
 *   - `onAddOption(label)` — surfaces a per-dropdown "Add new…" input that
 *     appends a returned {@link StatusOption} on Enter / Add click.
 *   - `canDeleteOption(option)` — sync or async authorisation gate for the
 *     per-option × button and the keyboard Delete shortcut.
 *   - `onDeleteOption(option)` — side-effect; on resolve the option is
 *     removed from the visible list.
 *
 * These complement the legacy `StatusCell.test.tsx` selection/keyboard
 * coverage — that file pre-dates #93 and should continue to pass unchanged.
 */
import { vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react';
import type { ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';
import { StatusCell } from '../cells/StatusCell/StatusCell';

const noop = () => {};

const baseOptions: StatusOption[] = [
  { value: 'active', label: 'Active', color: '#22c55e' },
  { value: 'inactive', label: 'Inactive', color: '#ef4444' },
];

function makeColumn(extra: Partial<ColumnDef> = {}): ColumnDef {
  return {
    id: 'col1',
    field: 'name',
    title: 'Name',
    editable: true,
    options: baseOptions,
    ...extra,
  };
}

describe('StatusCell — editable dropdown (#93)', () => {
  describe('add option', () => {
    it('does not render the Add input when onAddOption is absent', () => {
      render(
        <StatusCell
          value="active"
          row={{}}
          column={makeColumn()}
          rowIndex={0}
          isEditing={true}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      expect(screen.queryByTestId('add-option-input')).toBeNull();
    });

    it('renders the Add input when onAddOption is provided', () => {
      const onAddOption = vi.fn(async (label: string) => ({ value: label, label }));
      render(
        <StatusCell
          value="active"
          row={{}}
          column={makeColumn({ onAddOption })}
          rowIndex={0}
          isEditing={true}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      expect(screen.getByTestId('add-option-input')).toBeTruthy();
      expect(screen.getByTestId('add-option-submit')).toBeTruthy();
    });

    it('invokes onAddOption and appends the new option on Enter', async () => {
      const onAddOption = vi.fn(
        async (label: string): Promise<StatusOption> => ({ value: label.toLowerCase(), label }),
      );
      render(
        <StatusCell
          value="active"
          row={{}}
          column={makeColumn({ onAddOption })}
          rowIndex={0}
          isEditing={true}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      const input = screen.getByTestId('add-option-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Archived' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(onAddOption).toHaveBeenCalledWith('Archived');
      });
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /Archived/ })).toBeTruthy();
      });
      // Input cleared after a successful add.
      expect((screen.getByTestId('add-option-input') as HTMLInputElement).value).toBe('');
    });

    it('invokes onAddOption when the Add button is clicked', async () => {
      const onAddOption = vi.fn(
        async (label: string): Promise<StatusOption> => ({ value: label, label }),
      );
      render(
        <StatusCell
          value="active"
          row={{}}
          column={makeColumn({ onAddOption })}
          rowIndex={0}
          isEditing={true}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      const input = screen.getByTestId('add-option-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'NewOne' } });
      fireEvent.mouseDown(screen.getByTestId('add-option-submit'));

      await waitFor(() => {
        expect(onAddOption).toHaveBeenCalledWith('NewOne');
      });
    });

    it('rejects empty / whitespace-only labels without invoking the callback', () => {
      const onAddOption = vi.fn(async (l: string) => ({ value: l, label: l }));
      render(
        <StatusCell
          value="active"
          row={{}}
          column={makeColumn({ onAddOption })}
          rowIndex={0}
          isEditing={true}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      const input = screen.getByTestId('add-option-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onAddOption).not.toHaveBeenCalled();
    });
  });

  describe('delete option', () => {
    it('does not render the × button when canDeleteOption is absent', () => {
      render(
        <StatusCell
          value="active"
          row={{}}
          column={makeColumn({ onDeleteOption: vi.fn() })}
          rowIndex={0}
          isEditing={true}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      expect(screen.queryByTestId('delete-option-active')).toBeNull();
    });

    it('does not render the × button when onDeleteOption is absent', async () => {
      await act(async () => {
        render(
          <StatusCell
            value="active"
            row={{}}
            column={makeColumn({ canDeleteOption: () => true })}
            rowIndex={0}
            isEditing={true}
            onCommit={noop}
            onCancel={noop}
          />,
        );
        // Flush the canDeleteOption resolution microtasks before asserting.
        await Promise.resolve();
      });
      // No deletion side effect → no UI affordance even if canDelete=true.
      expect(screen.queryByTestId('delete-option-active')).toBeNull();
      expect(screen.queryByTestId('delete-option-inactive')).toBeNull();
    });

    it('renders × button only for options the consumer authorises', async () => {
      const canDeleteOption = (opt: StatusOption) => opt.value === 'inactive';
      const onDeleteOption = vi.fn(async () => {});
      render(
        <StatusCell
          value="active"
          row={{}}
          column={makeColumn({ canDeleteOption, onDeleteOption })}
          rowIndex={0}
          isEditing={true}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('delete-option-inactive')).toBeTruthy();
      });
      expect(screen.queryByTestId('delete-option-active')).toBeNull();
    });

    it('resolves async canDeleteOption results', async () => {
      const canDeleteOption = vi.fn(
        async (opt: StatusOption) => opt.value === 'active',
      );
      const onDeleteOption = vi.fn(async () => {});
      render(
        <StatusCell
          value="active"
          row={{}}
          column={makeColumn({ canDeleteOption, onDeleteOption })}
          rowIndex={0}
          isEditing={true}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('delete-option-active')).toBeTruthy();
      });
      expect(screen.queryByTestId('delete-option-inactive')).toBeNull();
      expect(canDeleteOption).toHaveBeenCalled();
    });

    it('fires onDeleteOption and removes the option on × click', async () => {
      const onDeleteOption = vi.fn(async () => {});
      const canDeleteOption = () => true;
      render(
        <StatusCell
          value="active"
          row={{}}
          column={makeColumn({ canDeleteOption, onDeleteOption })}
          rowIndex={0}
          isEditing={true}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      await waitFor(() => screen.getByTestId('delete-option-inactive'));

      await act(async () => {
        fireEvent.mouseDown(screen.getByTestId('delete-option-inactive'));
      });

      await waitFor(() => {
        expect(onDeleteOption).toHaveBeenCalledWith(
          expect.objectContaining({ value: 'inactive' }),
        );
      });
      await waitFor(() => {
        expect(screen.queryByRole('option', { name: /Inactive/ })).toBeNull();
      });
    });

    it('Delete key removes the active option when authorised', async () => {
      const onDeleteOption = vi.fn(async () => {});
      const canDeleteOption = () => true;
      render(
        <StatusCell
          value="active"
          row={{}}
          column={makeColumn({ canDeleteOption, onDeleteOption })}
          rowIndex={0}
          isEditing={true}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      await waitFor(() => screen.getByTestId('delete-option-active'));
      const listbox = screen.getByRole('listbox');
      fireEvent.keyDown(listbox, { key: 'Delete' });
      await waitFor(() => {
        expect(onDeleteOption).toHaveBeenCalledWith(
          expect.objectContaining({ value: 'active' }),
        );
      });
    });

    it('Delete key is a no-op when canDeleteOption returns false', async () => {
      const onDeleteOption = vi.fn(async () => {});
      const canDeleteOption = () => false;
      render(
        <StatusCell
          value="active"
          row={{}}
          column={makeColumn({ canDeleteOption, onDeleteOption })}
          rowIndex={0}
          isEditing={true}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      // Wait for the permission check to resolve before pressing Delete.
      await waitFor(() => {
        // No × buttons should render.
        expect(screen.queryByTestId('delete-option-active')).toBeNull();
      });
      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Delete' });
      expect(onDeleteOption).not.toHaveBeenCalled();
    });
  });
});
