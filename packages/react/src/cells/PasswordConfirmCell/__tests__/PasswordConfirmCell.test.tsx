import { vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import { PasswordConfirmCell, MISMATCH_MESSAGE } from '../PasswordConfirmCell';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const baseColumn: ColumnDef = {
  id: 'col1',
  field: 'password',
  title: 'Password',
  editable: true,
};

const noop = () => {};

const renderCell = (overrides: Partial<React.ComponentProps<typeof PasswordConfirmCell>> = {}) =>
  render(
    <PasswordConfirmCell
      value="secret"
      row={{}}
      column={baseColumn}
      rowIndex={0}
      isEditing={true}
      onCommit={noop}
      onCancel={noop}
      {...(overrides as any)}
    />,
  );

// ---------------------------------------------------------------------------
// PasswordConfirmCell
// ---------------------------------------------------------------------------

describe('PasswordConfirmCell', () => {
  describe('display mode', () => {
    it('masks the value with bullets', () => {
      renderCell({ isEditing: false, value: 'secret' });
      const text = screen.getByTestId('password-confirm-display').textContent ?? '';
      expect([...text].length).toBe('secret'.length);
      expect(text).not.toContain('secret');
    });

    it('renders an empty string for nullish values', () => {
      renderCell({ isEditing: false, value: null });
      expect(screen.getByTestId('password-confirm-display').textContent).toBe('');
    });

    it('reveals the value when the eye toggle is clicked', () => {
      renderCell({ isEditing: false, value: 'secret' });
      fireEvent.click(screen.getByTestId('password-confirm-eye-display'));
      expect(screen.getByTestId('password-confirm-display').textContent).toBe('secret');
    });
  });

  describe('edit mode — inputs & visibility', () => {
    it('renders two password inputs pre-filled with the current value', () => {
      renderCell({ value: 'secret' });
      expect((screen.getByTestId('password-confirm-input') as HTMLInputElement).value).toBe('secret');
      expect(
        (screen.getByTestId('password-confirm-input-confirm') as HTMLInputElement).value,
      ).toBe('secret');
    });

    it('both inputs default to type="password"', () => {
      renderCell({ value: 'secret' });
      expect((screen.getByTestId('password-confirm-input') as HTMLInputElement).type).toBe('password');
      expect(
        (screen.getByTestId('password-confirm-input-confirm') as HTMLInputElement).type,
      ).toBe('password');
    });

    it('eye toggle switches both inputs to type="text"', () => {
      renderCell({ value: 'secret' });
      fireEvent.click(screen.getByTestId('password-confirm-eye'));
      expect((screen.getByTestId('password-confirm-input') as HTMLInputElement).type).toBe('text');
      expect(
        (screen.getByTestId('password-confirm-input-confirm') as HTMLInputElement).type,
      ).toBe('text');
    });
  });

  describe('commit gating on match', () => {
    it('commits when both inputs match and Enter is pressed', () => {
      const onCommit = vi.fn();
      renderCell({ value: '', onCommit });
      fireEvent.change(screen.getByTestId('password-confirm-input'), {
        target: { value: 'matching' },
      });
      fireEvent.change(screen.getByTestId('password-confirm-input-confirm'), {
        target: { value: 'matching' },
      });
      fireEvent.keyDown(screen.getByTestId('password-confirm-input'), { key: 'Enter' });
      expect(onCommit).toHaveBeenCalledWith('matching');
    });

    it('does NOT commit when inputs differ; shows mismatch message', () => {
      const onCommit = vi.fn();
      renderCell({ value: '', onCommit });
      fireEvent.change(screen.getByTestId('password-confirm-input'), {
        target: { value: 'first' },
      });
      fireEvent.change(screen.getByTestId('password-confirm-input-confirm'), {
        target: { value: 'second' },
      });
      fireEvent.keyDown(screen.getByTestId('password-confirm-input'), { key: 'Enter' });
      expect(onCommit).not.toHaveBeenCalled();
      expect(screen.getByTestId('password-confirm-mismatch').textContent).toBe(MISMATCH_MESSAGE);
    });

    it('clears the mismatch message as soon as the user types again', () => {
      const onCommit = vi.fn();
      renderCell({ value: '', onCommit });
      fireEvent.change(screen.getByTestId('password-confirm-input'), {
        target: { value: 'a' },
      });
      fireEvent.change(screen.getByTestId('password-confirm-input-confirm'), {
        target: { value: 'b' },
      });
      fireEvent.keyDown(screen.getByTestId('password-confirm-input'), { key: 'Enter' });
      expect(screen.queryByTestId('password-confirm-mismatch')).not.toBeNull();

      fireEvent.change(screen.getByTestId('password-confirm-input-confirm'), {
        target: { value: 'a' },
      });
      // After the confirm input is fixed the error goes away and a subsequent
      // Enter press commits.
      expect(screen.queryByTestId('password-confirm-mismatch')).toBeNull();
      fireEvent.keyDown(screen.getByTestId('password-confirm-input'), { key: 'Enter' });
      expect(onCommit).toHaveBeenCalledWith('a');
    });

    it('calls onCancel on Escape', () => {
      const onCancel = vi.fn();
      renderCell({ onCancel });
      fireEvent.keyDown(screen.getByTestId('password-confirm-input'), { key: 'Escape' });
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('mismatch accessibility', () => {
    it('applies aria-invalid to both inputs when mismatched', () => {
      renderCell({ value: '' });
      fireEvent.change(screen.getByTestId('password-confirm-input'), {
        target: { value: 'x' },
      });
      fireEvent.change(screen.getByTestId('password-confirm-input-confirm'), {
        target: { value: 'y' },
      });
      fireEvent.keyDown(screen.getByTestId('password-confirm-input'), { key: 'Enter' });
      expect(screen.getByTestId('password-confirm-input').getAttribute('aria-invalid')).toBe('true');
      expect(
        screen.getByTestId('password-confirm-input-confirm').getAttribute('aria-invalid'),
      ).toBe('true');
    });

    it('mismatch message is announced with role="alert"', () => {
      renderCell({ value: '' });
      fireEvent.change(screen.getByTestId('password-confirm-input'), {
        target: { value: '1' },
      });
      fireEvent.change(screen.getByTestId('password-confirm-input-confirm'), {
        target: { value: '2' },
      });
      fireEvent.keyDown(screen.getByTestId('password-confirm-input'), { key: 'Enter' });
      const msg = screen.getByTestId('password-confirm-mismatch');
      expect(msg.getAttribute('role')).toBe('alert');
    });
  });
});
