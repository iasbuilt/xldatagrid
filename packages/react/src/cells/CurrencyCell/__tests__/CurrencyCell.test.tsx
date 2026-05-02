import { vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import { CurrencyCell } from '../CurrencyCell';

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

// ---------------------------------------------------------------------------
// CurrencyCell
// ---------------------------------------------------------------------------

describe('CurrencyCell', () => {
  it('renders formatted currency value with $ symbol', () => {
    const { container } = render(
      <CurrencyCell value={1234.5} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.textContent).toContain('$');
    expect(container.textContent).toContain('1,234.50');
  });

  it('renders empty for null value', () => {
    const { container } = render(
      <CurrencyCell value={null} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('span')?.textContent).toBe('');
  });

  it('renders right-aligned', () => {
    const { container } = render(
      <CurrencyCell value={100} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('span')?.style.textAlign).toBe('right');
  });

  it('renders negative value in red by default', () => {
    const { container } = render(
      <CurrencyCell value={-50} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('span')?.style.color).toBe('red');
  });

  it('does not render negative in red when format includes no-red', () => {
    const col = { ...baseColumn, format: 'no-red' };
    const { container } = render(
      <CurrencyCell value={-50} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('span')?.style.color).not.toBe('red');
  });

  it('shows numeric input in edit mode', () => {
    const { container } = render(
      <CurrencyCell value={100} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('input')).toBeTruthy();
  });

  it('pre-fills edit input with raw numeric value', () => {
    const { container } = render(
      <CurrencyCell value={99.99} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('99.99');
  });

  it('calls onCommit with parsed number on Enter', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <CurrencyCell value={0} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(500);
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <CurrencyCell value={0} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={onCancel} />
    );
    fireEvent.keyDown(container.querySelector('input')!, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('commits on blur', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <CurrencyCell value={0} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '250.5' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(250.5);
  });

  it('rejects non-numeric input in edit mode', () => {
    const { container } = render(
      <CurrencyCell value={0} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '1abc' } });
    expect((input as HTMLInputElement).value).toBe('0');
  });

  it('uses custom currency symbol from format', () => {
    const col = { ...baseColumn, format: 'EUR:€' };
    const { container } = render(
      <CurrencyCell value={42} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.textContent).toContain('€');
  });

  it('displays two decimal places', () => {
    const { container } = render(
      <CurrencyCell value={10} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.textContent).toContain('10.00');
  });

  it('calls onCommit with null for empty input', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <CurrencyCell value={5} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it('positive value is not red', () => {
    const { container } = render(
      <CurrencyCell value={10} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('span')?.style.color).not.toBe('red');
  });
});
