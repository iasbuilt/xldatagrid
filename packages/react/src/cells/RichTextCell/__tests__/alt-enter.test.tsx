/**
 * Unit tests for {@link RichTextCell}'s ALT+ENTER soft line break shortcut
 * (issue #97 — Excel parity).
 *
 * The rich-text editor stores plain markdown as a string, so a "soft line
 * break" is just a `\n` spliced at the caret. The keydown handler must:
 *
 *   - ALT+ENTER:   insert `\n` at the caret; do NOT commit; the textarea
 *                  value reflects the new newline and the caret advances.
 *   - SHIFT+ENTER: do NOT call onCommit — keep the prior native textarea
 *                  semantics (a `\n` is inserted by the browser/jsdom
 *                  default action), so user multi-line workflows keep
 *                  working without regression.
 *   - ENTER:       commit the current draft (the new edit-end gesture
 *                  introduced alongside ALT+ENTER, so Excel users get a
 *                  predictable commit gesture).
 */
import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { RichTextCell } from '../RichTextCell';
import type { ColumnDef, CellValue } from '@iasbuilt/datagrid-core';

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

describe('RichTextCell — ALT+ENTER soft line break (#97)', () => {
  it('ALT+ENTER inserts a CommonMark hard line break at the caret without committing', async () => {
    const onCommit = vi.fn();
    render(
      <RichTextCell {...makeProps({ isEditing: true, value: 'line1', onCommit })} />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true });

    // Wait for the rAF caret restore; the value is updated synchronously in
    // setDraft → re-render so the assertion below resolves after a microtask.
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    // CommonMark hard break = two trailing spaces + `\n`. The display
    // surface renders this as a `<br>` without needing remark-breaks.
    expect(textarea.value).toBe('line1  \n');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ALT+ENTER inserts the hard break at the caret position (mid-string)', async () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: 'abXYef' })} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(2, 4); // select "XY"

    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true });
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    // The selection is replaced by the hard-break sequence, mirroring
    // textarea insert-replace semantics.
    expect(textarea.value).toBe('ab  \nef');
  });

  it('plain ENTER commits the current draft', () => {
    const onCommit = vi.fn();
    render(
      <RichTextCell {...makeProps({ isEditing: true, value: 'hello', onCommit })} />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello world' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('hello world');
  });

  it('SHIFT+ENTER does NOT commit (prior multi-line behaviour preserved)', () => {
    const onCommit = vi.fn();
    render(<RichTextCell {...makeProps({ isEditing: true, value: 'x', onCommit })} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ALT+ENTER does NOT trigger onCancel', async () => {
    const onCancel = vi.fn();
    render(<RichTextCell {...makeProps({ isEditing: true, value: '', onCancel })} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();

    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true });
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('two ALT+ENTER presses produce two hard breaks and final commit round-trips them', async () => {
    const onCommit = vi.fn();
    render(<RichTextCell {...makeProps({ isEditing: true, value: '', onCommit })} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'a' } });
    textarea.focus();
    textarea.setSelectionRange(1, 1);
    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true });
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    // After the first hard-break insertion the textarea now holds `a  \n`.
    fireEvent.change(textarea, { target: { value: 'a  \nb' } });
    textarea.setSelectionRange(5, 5);
    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true });
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    fireEvent.change(textarea, { target: { value: 'a  \nb  \nc' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('a  \nb  \nc');
  });
});
