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

describe('MuiRichTextCell', () => {
  it('renders markdown (bold + GFM strikethrough) in display mode', () => {
    render(<MuiRichTextCell {...makeProps({ value: '**bold** ~~gone~~' })} />);
    const rendered = screen.getByTestId('richtext-rendered');
    expect(rendered.querySelector('strong')?.textContent).toBe('bold');
    expect(rendered.querySelector('del')?.textContent).toBe('gone');
  });

  it('renders GFM tables', () => {
    const md = '| H |\n| - |\n| 1 |';
    render(<MuiRichTextCell {...makeProps({ value: md })} />);
    expect(screen.getByTestId('richtext-rendered').querySelector('table')).not.toBeNull();
  });

  it('shows contenteditable surface seeded with the markdown source in edit mode', () => {
    render(<MuiRichTextCell {...makeProps({ isEditing: true, value: '*hi*' })} />);
    // Two textbox-role elements live in edit mode: the contenteditable
    // (visual editor) and the textarea (raw-markdown mirror that the
    // XSS-hardening e2e contract drives via `fill()`). Scope to the
    // contenteditable by aria-label.
    const editor = screen.getByLabelText('Markdown editor');
    expect(editor).toBeInTheDocument();
    // Toggle is OFF by default, so the visible text strips delimiters; the
    // raw markdown is still carried forward as the commit value — see the
    // "commits draft markdown on blur" test.
    expect(editor.textContent).toBe('hi');
  });

  it('commits draft markdown on blur', () => {
    const onCommit = vi.fn();
    render(<MuiRichTextCell {...makeProps({ isEditing: true, value: '', onCommit })} />);
    const editor = screen.getByLabelText('Markdown editor');
    // Simulate native `input` — contenteditable's user-typed characters
    // propagate via the input event's `currentTarget.textContent`.
    editor.textContent = '**done**';
    fireEvent.input(editor, { target: { textContent: '**done**' } });
    fireEvent.blur(editor);
    expect(onCommit).toHaveBeenCalledWith('**done**');
  });

  it('exposes a raw-markdown textarea mirror that commits its value on blur', () => {
    const onCommit = vi.fn();
    render(<MuiRichTextCell {...makeProps({ isEditing: true, value: '', onCommit })} />);
    // The textarea is the canonical raw source of truth — XSS hardening
    // (`grid-xss.spec.ts`) fills hostile payloads here and asserts the
    // committed render is sanitised.
    const textarea = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    fireEvent.change(textarea, { target: { value: '**raw**' } });
    fireEvent.blur(textarea);
    expect(onCommit).toHaveBeenCalledWith('**raw**');
  });

  it('does not render any upload UI', () => {
    render(<MuiRichTextCell {...makeProps({ isEditing: true, value: '' })} />);
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /upload/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /attach/i })).toBeNull();
  });
});
