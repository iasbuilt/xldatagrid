import { vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import { TagsCell } from '../TagsCell';

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
// TagsCell
// ---------------------------------------------------------------------------

describe('TagsCell', () => {
  it('renders tags in display mode', () => {
    render(
      <TagsCell value={['alpha', 'beta']} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
  });

  it('renders empty for null value', () => {
    const { container } = render(
      <TagsCell value={null} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('span')?.textContent).toBe('');
  });

  it('shows input field in edit mode', () => {
    const { container } = render(
      <TagsCell value={['alpha']} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('input')).toBeTruthy();
  });

  it('adds tag on Enter key', () => {
    const { container } = render(
      <TagsCell value={[]} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'newtag' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('newtag')).toBeTruthy();
  });

  it('adds tag on comma key', () => {
    const { container } = render(
      <TagsCell value={[]} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'tagone' } });
    fireEvent.keyDown(input, { key: ',' });
    expect(screen.getByText('tagone')).toBeTruthy();
  });

  it('prevents duplicate tags', () => {
    const { container } = render(
      <TagsCell value={['existing']} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'existing' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const tags = screen.getAllByText('existing');
    expect(tags.length).toBe(1);
  });

  it('removes last tag on Backspace when input is empty', () => {
    const { container } = render(
      <TagsCell value={['first', 'second']} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(screen.queryByText('second')).toBeNull();
    expect(screen.getByText('first')).toBeTruthy();
  });

  it('removes specific tag via close button', () => {
    render(
      <TagsCell value={['alpha', 'beta']} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const removeBtn = screen.getByRole('button', { name: /remove tag alpha/i });
    fireEvent.mouseDown(removeBtn);
    expect(screen.queryByText('alpha')).toBeNull();
    expect(screen.getByText('beta')).toBeTruthy();
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <TagsCell value={[]} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={onCancel} />
    );
    fireEvent.keyDown(container.querySelector('input')!, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCommit with tag array on blur', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <TagsCell value={['a']} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    fireEvent.blur(container.querySelector('input')!);
    expect(onCommit).toHaveBeenCalledWith(['a']);
  });

  it('parses comma-separated string value', () => {
    render(
      <TagsCell value="foo,bar,baz" row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByText('foo')).toBeTruthy();
    expect(screen.getByText('bar')).toBeTruthy();
    expect(screen.getByText('baz')).toBeTruthy();
  });

  it('does not show remove buttons in display mode', () => {
    render(
      <TagsCell value={['alpha']} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('commits added tag on blur when input has pending text', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <TagsCell value={[]} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'pending' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(['pending']);
  });

  it('clears input after adding a tag', () => {
    const { container } = render(
      <TagsCell value={[]} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tag1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
  });

  it('does not remove on Backspace when input has text', () => {
    const { container } = render(
      <TagsCell value={['keep']} row={{}} column={baseColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: 'typing' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(screen.getByText('keep')).toBeTruthy();
  });
});
