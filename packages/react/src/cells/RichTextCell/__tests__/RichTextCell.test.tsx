import { vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

import { RichTextCell } from '../RichTextCell';
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

function getRendered() {
  return screen.getByTestId('richtext-rendered');
}

// ---------------------------------------------------------------------------
// Display mode: markdown rendering via react-markdown + remark-gfm
// ---------------------------------------------------------------------------

describe('RichTextCell — display (GFM rendering)', () => {
  it('renders bold markdown as <strong>', () => {
    render(<RichTextCell {...makeProps({ value: '**Bold text**' })} />);
    const rendered = getRendered();
    const strong = rendered.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('Bold text');
  });

  it('renders italic markdown as <em>', () => {
    render(<RichTextCell {...makeProps({ value: '*italic text*' })} />);
    const em = getRendered().querySelector('em');
    expect(em?.textContent).toBe('italic text');
  });

  it('renders strikethrough (GFM) as <del>', () => {
    render(<RichTextCell {...makeProps({ value: '~~gone~~' })} />);
    const del = getRendered().querySelector('del');
    expect(del?.textContent).toBe('gone');
  });

  it('renders unordered lists', () => {
    render(<RichTextCell {...makeProps({ value: '- one\n- two\n- three' })} />);
    const items = getRendered().querySelectorAll('ul > li');
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain('one');
  });

  it('renders ordered lists', () => {
    render(<RichTextCell {...makeProps({ value: '1. alpha\n2. beta' })} />);
    const items = getRendered().querySelectorAll('ol > li');
    expect(items).toHaveLength(2);
  });

  it('renders task lists (GFM) with checkboxes', () => {
    render(<RichTextCell {...makeProps({ value: '- [ ] todo\n- [x] done' })} />);
    const checkboxes = getRendered().querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
  });

  it('renders code blocks inside <pre><code>', () => {
    render(<RichTextCell {...makeProps({ value: '```js\nconst x = 1;\n```' })} />);
    const code = getRendered().querySelector('pre > code');
    expect(code?.textContent).toContain('const x = 1;');
  });

  it('renders inline code', () => {
    render(<RichTextCell {...makeProps({ value: 'use `npm install` now' })} />);
    const code = getRendered().querySelector(':scope > p > code, :scope p code');
    expect(code?.textContent).toBe('npm install');
  });

  it('renders tables (GFM)', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |';
    render(<RichTextCell {...makeProps({ value: md })} />);
    const table = getRendered().querySelector('table');
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll('thead th')).toHaveLength(2);
    expect(table?.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('renders explicit links with href', () => {
    render(<RichTextCell {...makeProps({ value: '[Home](https://example.com)' })} />);
    const anchor = getRendered().querySelector('a') as HTMLAnchorElement | null;
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('https://example.com');
    expect(anchor?.textContent).toBe('Home');
  });

  it('renders placeholder when value is null', () => {
    render(<RichTextCell {...makeProps({ value: null, column: { placeholder: 'No content' } })} />);
    expect(screen.getByText('No content')).toBeInTheDocument();
  });

  it('renders placeholder when value is empty string', () => {
    render(<RichTextCell {...makeProps({ value: '' })} />);
    expect(screen.getByText(/no content/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edit mode
// ---------------------------------------------------------------------------

describe('RichTextCell — edit mode', () => {
  it('shows textarea in edit mode with markdown source', () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: '**hello**' })} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('**hello**');
  });

  it('commits updated markdown on blur (round-trips through props)', () => {
    const onCommit = vi.fn();
    render(<RichTextCell {...makeProps({ isEditing: true, value: '**a**', onCommit })} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '**b**' } });
    fireEvent.blur(textarea);
    expect(onCommit).toHaveBeenCalledWith('**b**');
  });

  it('round-trips: draft entered as markdown commits as the same markdown string', () => {
    const onCommit = vi.fn();
    const md = '# Title\n\n- item\n- **bold**\n\n| h | v |\n| - | - |\n| 1 | 2 |';
    render(<RichTextCell {...makeProps({ isEditing: true, value: '', onCommit })} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: md } });
    fireEvent.blur(textarea);
    expect(onCommit).toHaveBeenCalledWith(md);
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    render(<RichTextCell {...makeProps({ isEditing: true, value: '', onCancel })} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('Ctrl+B wraps the current selection in bold markers', () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: 'hello world' })} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, 5); // "hello"
    fireEvent.keyDown(textarea, { key: 'b', ctrlKey: true });
    expect(textarea.value).toBe('**hello** world');
  });

  it('Ctrl+I wraps the current selection in italic markers', () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: 'hello world' })} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(6, 11); // "world"
    fireEvent.keyDown(textarea, { key: 'i', ctrlKey: true });
    expect(textarea.value).toBe('hello *world*');
  });

  it('Ctrl+K inserts a markdown link', () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: 'docs' })} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, 4);
    fireEvent.keyDown(textarea, { key: 'k', ctrlKey: true });
    expect(textarea.value).toBe('[docs](https://)');
  });

  it('does NOT render any upload UI', () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);
    // No file input anywhere.
    expect(document.querySelector('input[type="file"]')).toBeNull();
    // No common upload button affordances.
    expect(screen.queryByRole('button', { name: /upload/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /attach/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /image/i })).toBeNull();
  });

  it('exposes a formatting toolbar with bold/italic/link controls', () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);
    const toolbar = screen.getByRole('toolbar', { name: /rich text formatting/i });
    expect(within(toolbar).getByRole('button', { name: /bold/i })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: /italic/i })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: /insert link/i })).toBeInTheDocument();
  });
});
