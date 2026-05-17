import { vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react';
import type { ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';
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

const multiSelectOptions: StatusOption[] = [
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'design', label: 'Design' },
  { value: 'qa', label: 'QA' },
];

const multiSelectColumn: ColumnDef = {
  ...baseColumn,
  options: multiSelectOptions,
};

// ---------------------------------------------------------------------------
// TagsCell — free-text mode (legacy contract)
// ---------------------------------------------------------------------------

describe('TagsCell (free-text mode)', () => {
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

  it('removes specific tag via close button in edit mode', () => {
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

  it('display-mode chips expose a × remove button (issue #94)', () => {
    // Issue #94 spec: each chip has an inline × to remove without opening
    // the editor. Previously remove buttons rendered only in edit mode.
    render(
      <TagsCell value={['alpha']} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByRole('button', { name: /remove tag alpha/i })).toBeTruthy();
  });

  it('display-mode × auto-commits the new tag set (issue #94)', () => {
    // Removing a chip outside of edit mode should call onCommit immediately
    // so the row data updates without forcing the user into the editor.
    const onCommit = vi.fn();
    render(
      <TagsCell value={['alpha', 'beta']} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={onCommit} onCancel={noop} />
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: /remove tag alpha/i }));
    expect(onCommit).toHaveBeenCalledWith(['beta']);
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

// ---------------------------------------------------------------------------
// TagsCell — multi-select mode (issue #94)
// ---------------------------------------------------------------------------

describe('TagsCell (multi-select mode, issue #94)', () => {
  it('renders option labels (not raw values) as chips when options are provided', () => {
    // The column's option list maps a stored value (`frontend`) to a label
    // (`Frontend`). Display mode should resolve via the option list.
    const col: ColumnDef = {
      ...baseColumn,
      options: [{ value: 'frontend', label: 'Frontend' }],
    };
    render(
      <TagsCell value={['frontend']} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByText('Frontend')).toBeTruthy();
  });

  it('opens a checkbox listbox in edit mode with one option per column.options entry', () => {
    render(
      <TagsCell value={[]} row={{}} column={multiSelectColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const listbox = screen.getByRole('listbox');
    expect(listbox.getAttribute('aria-multiselectable')).toBe('true');
    // One <label role="option"> per option, each containing a checkbox.
    const options = within(listbox).getAllByRole('option');
    expect(options.length).toBe(multiSelectOptions.length);
    expect(within(listbox).getAllByRole('checkbox').length).toBe(multiSelectOptions.length);
  });

  it('toggles a checkbox into the draft selection without exiting edit mode', () => {
    render(
      <TagsCell value={[]} row={{}} column={multiSelectColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const frontendOption = screen.getByTestId('tag-option-frontend');
    const cb = within(frontendOption).getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);
    // A chip with the option label appears in the draft chip row.
    expect(screen.getByTestId('tag-chip-frontend')).toBeTruthy();
  });

  it('shows currently selected options as pre-checked when re-entering edit mode', () => {
    render(
      <TagsCell value={['frontend', 'design']} row={{}} column={multiSelectColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const frontendCb = within(screen.getByTestId('tag-option-frontend')).getByRole('checkbox') as HTMLInputElement;
    const designCb = within(screen.getByTestId('tag-option-design')).getByRole('checkbox') as HTMLInputElement;
    const backendCb = within(screen.getByTestId('tag-option-backend')).getByRole('checkbox') as HTMLInputElement;
    expect(frontendCb.checked).toBe(true);
    expect(designCb.checked).toBe(true);
    expect(backendCb.checked).toBe(false);
  });

  it('commits the current selection when the user clicks outside the cell', () => {
    const onCommit = vi.fn();
    render(
      <div>
        <TagsCell value={[]} row={{}} column={multiSelectColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
        <button>outside</button>
      </div>
    );
    // Pick two options first.
    fireEvent.click(within(screen.getByTestId('tag-option-frontend')).getByRole('checkbox'));
    fireEvent.click(within(screen.getByTestId('tag-option-backend')).getByRole('checkbox'));
    // Click outside the cell — emulates the user committing by moving focus
    // elsewhere on the page.
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(onCommit).toHaveBeenCalledWith(['frontend', 'backend']);
  });

  it('display-mode × removes a chip and auto-commits the new set', () => {
    const onCommit = vi.fn();
    render(
      <TagsCell value={['frontend', 'backend']} row={{}} column={multiSelectColumn} rowIndex={0} isEditing={false} onCommit={onCommit} onCancel={noop} />
    );
    // Remove button uses the option's human label for accessibility.
    const removeBtn = screen.getByRole('button', { name: /remove tag frontend/i });
    fireEvent.mouseDown(removeBtn);
    expect(onCommit).toHaveBeenCalledWith(['backend']);
  });

  it('does not render the free-text input by default in multi-select mode', () => {
    const { container } = render(
      <TagsCell value={[]} row={{}} column={multiSelectColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    // Picker has checkboxes only; no `type="text"` input.
    expect(container.querySelector('input[type="text"]')).toBeNull();
  });

  it('renders an optional free-text input when column.allowFreeText is true', () => {
    const col: ColumnDef = { ...multiSelectColumn, allowFreeText: true };
    const { container } = render(
      <TagsCell value={[]} row={{}} column={col} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('input[type="text"]')).toBeTruthy();
  });

  it('uncheck removes the value from the draft selection', () => {
    render(
      <TagsCell value={['frontend']} row={{}} column={multiSelectColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const cb = within(screen.getByTestId('tag-option-frontend')).getByRole('checkbox') as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
    expect(screen.queryByTestId('tag-chip-frontend')).toBeNull();
  });
});
