import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { CalendarCell } from '../CalendarCell';
import type { ColumnDef, CellValue } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeColumn(overrides: Partial<ColumnDef> = {}): ColumnDef {
  return { id: 'col1', field: 'col1', title: 'Column 1', ...overrides };
}

function makeProps(overrides: {
  value?: CellValue;
  column?: Partial<ColumnDef>;
  isEditing?: boolean;
  onCommit?: (v: CellValue) => void;
  onCancel?: () => void;
}) {
  return {
    value: overrides.value ?? null,
    row: {},
    column: makeColumn(overrides.column),
    rowIndex: 0,
    isEditing: overrides.isEditing ?? false,
    onCommit: overrides.onCommit ?? vi.fn(),
    onCancel: overrides.onCancel ?? vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// CalendarCell
// ---------------------------------------------------------------------------

describe('CalendarCell', () => {
  it('renders a formatted date string in display mode', () => {
    render(<CalendarCell {...makeProps({ value: '2026-06-15' })} />);
    // Should contain year at minimum
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('renders placeholder text when value is null', () => {
    render(<CalendarCell {...makeProps({ value: null })} />);
    expect(screen.getByText(/pick a date/i)).toBeInTheDocument();
  });

  it('renders placeholder text when value is empty string', () => {
    render(<CalendarCell {...makeProps({ value: '' })} />);
    expect(screen.getByText(/pick a date/i)).toBeInTheDocument();
  });

  it('does not show calendar dropdown when not editing', () => {
    render(<CalendarCell {...makeProps({ isEditing: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows calendar dropdown when isEditing is true', () => {
    render(<CalendarCell {...makeProps({ isEditing: true, value: '2026-06-15' })} />);
    expect(screen.getByRole('dialog', { name: /date picker/i })).toBeInTheDocument();
  });

  it('renders month navigation buttons', () => {
    render(<CalendarCell {...makeProps({ isEditing: true, value: '2026-06-15' })} />);
    expect(screen.getByRole('button', { name: /previous month/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next month/i })).toBeInTheDocument();
  });

  it('navigates to previous month on < click', () => {
    render(<CalendarCell {...makeProps({ isEditing: true, value: '2026-06-15' })} />);
    expect(screen.getByText(/June 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    expect(screen.getByText(/May 2026/)).toBeInTheDocument();
  });

  it('navigates to next month on > click', () => {
    render(<CalendarCell {...makeProps({ isEditing: true, value: '2026-06-15' })} />);
    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    expect(screen.getByText(/July 2026/)).toBeInTheDocument();
  });

  it('wraps from December to January when navigating next', () => {
    render(<CalendarCell {...makeProps({ isEditing: true, value: '2026-06-15' })} />);
    // Navigate forward 7 months to get to January 2027
    const next = screen.getByRole('button', { name: /next month/i });
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(screen.getByText('January 2027')).toBeInTheDocument();
  });

  it('wraps from January to December when navigating previous', () => {
    render(<CalendarCell {...makeProps({ isEditing: true, value: '2026-06-15' })} />);
    // Navigate back 6 months to get to December 2025
    const prev = screen.getByRole('button', { name: /previous month/i });
    fireEvent.click(prev);
    fireEvent.click(prev);
    fireEvent.click(prev);
    fireEvent.click(prev);
    fireEvent.click(prev);
    fireEvent.click(prev);
    expect(screen.getByText('December 2025')).toBeInTheDocument();
  });

  it('calls onCommit with ISO date string when a day is clicked', () => {
    const onCommit = vi.fn();
    render(<CalendarCell {...makeProps({ isEditing: true, value: '2026-06-15', onCommit })} />);
    // Click day 10
    fireEvent.click(screen.getByRole('button', { name: '10' }));
    expect(onCommit).toHaveBeenCalledWith(expect.stringContaining('2026-06'));
  });

  it('calls onCancel on Escape key', () => {
    const onCancel = vi.fn();
    const { container } = render(<CalendarCell {...makeProps({ isEditing: true, value: '2026-06-15', onCancel })} />);
    fireEvent.keyDown(container.firstChild as Element, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
