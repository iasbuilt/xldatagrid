/**
 * Unit tests for {@link MuiRichTextCell}'s ALT+ENTER soft line break
 * (issue #97 — Excel parity).
 *
 * The MUI variant carries two synchronised editing surfaces — a
 * contenteditable visual editor and a textarea raw-source mirror — both
 * wired to the same keydown handler. ALT+ENTER must insert `\n` on
 * whichever surface holds focus; plain ENTER commits; SHIFT+ENTER falls
 * through to native behaviour so existing multi-line workflows are
 * unaffected.
 */
import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { MuiRichTextCell } from '../MuiRichTextCell';
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
  } as const;
}

describe('MuiRichTextCell — ALT+ENTER soft line break (#97)', () => {
  it('ALT+ENTER on the textarea mirror inserts a CommonMark hard break at the caret without committing', () => {
    const onCommit = vi.fn();
    render(
      <MuiRichTextCell {...makeProps({ isEditing: true, value: 'line1', onCommit })} />,
    );
    const textarea = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true });

    // Two trailing spaces + `\n` is the standard CommonMark hard-break
    // encoding; `react-markdown` renders this as `<br>` without a plugin.
    expect(textarea.value).toBe('line1  \n');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('plain ENTER on the textarea mirror commits the draft', () => {
    const onCommit = vi.fn();
    render(
      <MuiRichTextCell {...makeProps({ isEditing: true, value: '', onCommit })} />,
    );
    const textarea = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'line1\nline2' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('line1\nline2');
  });

  it('SHIFT+ENTER on the textarea mirror does NOT commit', () => {
    const onCommit = vi.fn();
    render(
      <MuiRichTextCell {...makeProps({ isEditing: true, value: 'x', onCommit })} />,
    );
    const textarea = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('plain ENTER on the contenteditable surface commits the draft', () => {
    const onCommit = vi.fn();
    render(
      <MuiRichTextCell {...makeProps({ isEditing: true, value: '', onCommit })} />,
    );
    const editor = screen.getByLabelText('Markdown editor');
    editor.textContent = '**done**';
    fireEvent.input(editor, { target: { textContent: '**done**' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('**done**');
  });

  it('ALT+ENTER on the contenteditable surface does NOT commit', () => {
    const onCommit = vi.fn();
    render(
      <MuiRichTextCell {...makeProps({ isEditing: true, value: '', onCommit })} />,
    );
    const editor = screen.getByLabelText('Markdown editor');
    editor.textContent = 'hello';
    fireEvent.input(editor, { target: { textContent: 'hello' } });

    fireEvent.keyDown(editor, { key: 'Enter', altKey: true });

    expect(onCommit).not.toHaveBeenCalled();
  });
});
