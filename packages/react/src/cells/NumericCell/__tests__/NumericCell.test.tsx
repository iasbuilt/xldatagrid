import { vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import { NumericCell } from '../NumericCell';

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
// NumericCell
// ---------------------------------------------------------------------------

describe('NumericCell', () => {
  it('renders number right-aligned in display mode', () => {
    const { container } = render(
      <NumericCell value={42} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    const span = container.querySelector('span');
    expect(span?.style.textAlign).toBe('right');
    expect(span?.textContent).toBe('42');
  });

  it('renders empty for null value', () => {
    const { container } = render(
      <NumericCell value={null} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('span')?.textContent).toBe('');
  });

  it('shows input when isEditing=true', () => {
    const { container } = render(
      <NumericCell value={10} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('input')).toBeTruthy();
  });

  it('pre-fills input with current value', () => {
    const { container } = render(
      <NumericCell value={99} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('99');
  });

  it('calls onCommit with parsed number on Enter', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <NumericCell value={0} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '123' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(123);
  });

  // Issue #10: Enter commits-and-stays — we verify the event's default and
  // propagation are suppressed so the grid-level handler cannot re-enter edit.
  it('stops propagation and prevents default on Enter (issue #10)', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <NumericCell value={0} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '123' } });
    const evt = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const stopProp = vi.spyOn(evt, 'stopPropagation');
    const prevDef = vi.spyOn(evt, 'preventDefault');
    input.dispatchEvent(evt);
    expect(onCommit).toHaveBeenCalledWith(123);
    expect(stopProp).toHaveBeenCalled();
    expect(prevDef).toHaveBeenCalled();
  });

  // Issue #10: Tab commits the parsed number and suppresses native
  // focus-advance + grid-level Tab handling.
  it('commits parsed number on Tab and does not advance focus (issue #10)', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <NumericCell value={0} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={onCancel} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '77' } });
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    const stopProp = vi.spyOn(evt, 'stopPropagation');
    const prevDef = vi.spyOn(evt, 'preventDefault');
    input.dispatchEvent(evt);
    expect(onCommit).toHaveBeenCalledWith(77);
    expect(onCancel).not.toHaveBeenCalled();
    expect(prevDef).toHaveBeenCalled();
    expect(stopProp).toHaveBeenCalled();
  });

  // Issue #10: Shift+Tab must behave the same as Tab — commit-and-stay.
  it('commits on Shift+Tab (issue #10)', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <NumericCell value={0} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '42' } });
    const evt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    const prevDef = vi.spyOn(evt, 'preventDefault');
    input.dispatchEvent(evt);
    expect(onCommit).toHaveBeenCalledWith(42);
    expect(prevDef).toHaveBeenCalled();
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <NumericCell value={0} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={onCancel} />
    );
    fireEvent.keyDown(container.querySelector('input')!, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('increments value on ArrowUp', () => {
    const { container } = render(
      <NumericCell value={5} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect((input as HTMLInputElement).value).toBe('6');
  });

  it('decrements value on ArrowDown', () => {
    const { container } = render(
      <NumericCell value={5} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect((input as HTMLInputElement).value).toBe('4');
  });

  it('respects max constraint on ArrowUp', () => {
    const col = { ...baseColumn, max: 5 };
    const { container } = render(
      <NumericCell value={5} row={{}} column={col} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect((input as HTMLInputElement).value).toBe('5');
  });

  it('respects min constraint on ArrowDown', () => {
    const col = { ...baseColumn, min: 0 };
    const { container } = render(
      <NumericCell value={0} row={{}} column={col} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect((input as HTMLInputElement).value).toBe('0');
  });

  it('rejects non-numeric input (letters)', () => {
    const { container } = render(
      <NumericCell value={0} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '12abc' } });
    // Non-numeric change should be rejected; value stays as-is from state
    expect((input as HTMLInputElement).value).toBe('0');
  });

  it('calls onCommit with null for empty input', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <NumericCell value={5} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it('formats with thousands separator when format="thousands"', () => {
    const col = { ...baseColumn, format: 'thousands' };
    const { container } = render(
      <NumericCell value={1234567} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('span')?.textContent).toMatch(/1[,.]234[,.]567/);
  });

  it('commits on blur', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <NumericCell value={0} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '77' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(77);
  });

  it('clamps entered value above max', () => {
    const onCommit = vi.fn();
    const col = { ...baseColumn, max: 100 };
    const { container } = render(
      <NumericCell value={0} row={{}} column={col} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(100);
  });

  it('clamps entered value below min', () => {
    const onCommit = vi.fn();
    const col = { ...baseColumn, min: 10 };
    const { container } = render(
      <NumericCell value={50} row={{}} column={col} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(10);
  });
});
