import { vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import {
  BooleanSelectedCell,
  SELECTED_LABEL,
  UNSELECTED_LABEL,
} from '../BooleanSelectedCell';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const editableColumn: ColumnDef = {
  id: 'col1',
  field: 'active',
  title: 'Active',
  editable: true,
};

const readonlyColumn: ColumnDef = {
  id: 'col1',
  field: 'active',
  title: 'Active',
  editable: false,
};

const noop = () => {};

// ---------------------------------------------------------------------------
// BooleanSelectedCell
// ---------------------------------------------------------------------------

describe('BooleanSelectedCell', () => {
  describe('display labels', () => {
    it('renders the word "Selected" when value is true', () => {
      render(
        <BooleanSelectedCell
          value={true}
          row={{}}
          column={editableColumn}
          rowIndex={0}
          isEditing={false}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      expect(screen.getByText(SELECTED_LABEL)).toBeDefined();
    });

    it('renders an em-dash when value is false', () => {
      const { container } = render(
        <BooleanSelectedCell
          value={false}
          row={{}}
          column={editableColumn}
          rowIndex={0}
          isEditing={false}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      const label = container.querySelector('[data-testid="boolean-selected-label"]');
      expect(label?.textContent).toBe(UNSELECTED_LABEL);
      expect(UNSELECTED_LABEL).toBe('\u2014');
    });

    it('renders an empty label for null values', () => {
      const { container } = render(
        <BooleanSelectedCell
          value={null}
          row={{}}
          column={editableColumn}
          rowIndex={0}
          isEditing={false}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      const label = container.querySelector('[data-testid="boolean-selected-label"]');
      expect(label?.textContent).toBe('');
    });
  });

  describe('toggle behaviour', () => {
    it('commits the opposite value on click when editable', () => {
      const onCommit = vi.fn();
      render(
        <BooleanSelectedCell
          value={true}
          row={{}}
          column={editableColumn}
          rowIndex={0}
          isEditing={false}
          onCommit={onCommit}
          onCancel={noop}
        />,
      );
      fireEvent.click(screen.getByTestId('boolean-selected-cell'));
      expect(onCommit).toHaveBeenCalledWith(false);
    });

    it('commits true when a false cell is clicked', () => {
      const onCommit = vi.fn();
      render(
        <BooleanSelectedCell
          value={false}
          row={{}}
          column={editableColumn}
          rowIndex={0}
          isEditing={false}
          onCommit={onCommit}
          onCancel={noop}
        />,
      );
      fireEvent.click(screen.getByTestId('boolean-selected-cell'));
      expect(onCommit).toHaveBeenCalledWith(true);
    });

    it('does not commit on click when column is not editable', () => {
      const onCommit = vi.fn();
      render(
        <BooleanSelectedCell
          value={true}
          row={{}}
          column={readonlyColumn}
          rowIndex={0}
          isEditing={false}
          onCommit={onCommit}
          onCancel={noop}
        />,
      );
      fireEvent.click(screen.getByTestId('boolean-selected-cell'));
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('toggles on Space key', () => {
      const onCommit = vi.fn();
      render(
        <BooleanSelectedCell
          value={false}
          row={{}}
          column={editableColumn}
          rowIndex={0}
          isEditing={false}
          onCommit={onCommit}
          onCancel={noop}
        />,
      );
      fireEvent.keyDown(screen.getByTestId('boolean-selected-cell'), { key: ' ' });
      expect(onCommit).toHaveBeenCalledWith(true);
    });

    it('toggles on Enter key', () => {
      const onCommit = vi.fn();
      render(
        <BooleanSelectedCell
          value={true}
          row={{}}
          column={editableColumn}
          rowIndex={0}
          isEditing={false}
          onCommit={onCommit}
          onCancel={noop}
        />,
      );
      fireEvent.keyDown(screen.getByTestId('boolean-selected-cell'), { key: 'Enter' });
      expect(onCommit).toHaveBeenCalledWith(false);
    });
  });

  describe('accessibility', () => {
    it('exposes aria-checked=true when value is true', () => {
      render(
        <BooleanSelectedCell
          value={true}
          row={{}}
          column={editableColumn}
          rowIndex={0}
          isEditing={false}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
    });

    it('exposes aria-checked=false when value is false', () => {
      render(
        <BooleanSelectedCell
          value={false}
          row={{}}
          column={editableColumn}
          rowIndex={0}
          isEditing={false}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
    });

    it('exposes aria-checked=mixed when value is null', () => {
      render(
        <BooleanSelectedCell
          value={null}
          row={{}}
          column={editableColumn}
          rowIndex={0}
          isEditing={false}
          onCommit={noop}
          onCancel={noop}
        />,
      );
      expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('mixed');
    });
  });
});
