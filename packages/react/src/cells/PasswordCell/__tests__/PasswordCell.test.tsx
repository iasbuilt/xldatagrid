import { vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import { PasswordCell } from '../PasswordCell';

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
// PasswordCell
// ---------------------------------------------------------------------------

describe('PasswordCell', () => {
  it('renders masked dots in display mode', () => {
    const { container } = render(
      <PasswordCell value="secret" row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    // Mask char is bullet \u2022; displayed length matches value length
    const text = container.querySelector('span span')?.textContent ?? '';
    expect([...text].length).toBe('secret'.length);
    expect(text).not.toContain('secret');
  });

  it('renders empty display for null value', () => {
    const { container } = render(
      <PasswordCell value={null} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('span span')?.textContent).toBe('');
  });

  it('shows reveal toggle button in display mode', () => {
    render(
      <PasswordCell value="secret" row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByRole('button', { name: /reveal|show/i })).toBeTruthy();
  });

  it('reveals value when toggle button clicked', () => {
    const { container } = render(
      <PasswordCell value="secret" row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    fireEvent.click(screen.getByText('Show'));
    expect(container.querySelector('span span')?.textContent).toBe('secret');
  });

  it('hides value again after second toggle', () => {
    const { container } = render(
      <PasswordCell value="secret" row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    fireEvent.click(screen.getByText('Show'));
    fireEvent.click(screen.getByText('Hide'));
    const text = container.querySelector('span span')?.textContent ?? '';
    expect(text).not.toContain('secret');
  });

  it('shows password input when isEditing=true', () => {
    const { container } = render(
      <PasswordCell value="secret" row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('input[type="password"]')).toBeTruthy();
  });

  it('calls onCommit on Enter', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <PasswordCell value="secret" row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'newpass' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('newpass');
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <PasswordCell value="secret" row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={onCancel} />
    );
    fireEvent.keyDown(container.querySelector('input')!, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCommit on blur', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <PasswordCell value="old" row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'blurred' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('blurred');
  });

  it('pre-fills input with current value in edit mode', () => {
    const { container } = render(
      <PasswordCell value="abc123" row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('abc123');
  });

  it('masked length equals value string length', () => {
    const { container } = render(
      <PasswordCell value="12345" row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    const text = container.querySelector('span span')?.textContent ?? '';
    expect([...text].length).toBe(5);
  });

  it('toggle button label changes between Show and Hide', () => {
    render(
      <PasswordCell value="pw" row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByText('Show')).toBeTruthy();
    fireEvent.click(screen.getByText('Show'));
    expect(screen.getByText('Hide')).toBeTruthy();
  });

  it('aria-label changes between reveal and hide states', () => {
    render(
      <PasswordCell value="pw" row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toMatch(/reveal/i);
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-label')).toMatch(/hide/i);
  });

  it('input type is password (not text) in edit mode', () => {
    const { container } = render(
      <PasswordCell value="pw" row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('input')?.type).toBe('password');
  });
});
