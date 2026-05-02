/**
 * Failing TDD specs for `RichTextCell`'s "Show formatting" toggle.
 *
 * Feature B introduces a Word-style "Show ¶" affordance to the floating
 * toolbar (see `floating-menu.test.tsx` for the portal/placement contract).
 * The toggle governs whether raw markdown delimiters are visible to the
 * user while they edit:
 *
 *   - Default state (OFF, `aria-pressed="false"`): delimiters stay hidden.
 *     Typing `**bold**` renders as a live `<strong>` node with no `**`
 *     visible to the user — i.e. the editor behaves like a WYSIWYG surface
 *     backed by markdown rather than a plain textarea.
 *
 *   - Toggled ON (`aria-pressed="true"`): raw delimiters are shown ALONGSIDE
 *     the rendered formatting, mirroring MS Word's "Show ¶" pilcrow mode.
 *     The user can see and edit the exact markdown characters without
 *     losing the live preview.
 *
 *   - The toggle state must persist across blur/focus cycles within a single
 *     edit session; flipping in and out of focus does not reset it.
 *
 * These tests are RED today — `RichTextCell.tsx` has a "Preview" toggle, not
 * a "Show formatting" toggle, and its edit surface is a plain textarea with
 * no live rendering of markdown.
 */
import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { RichTextCell } from '../RichTextCell';
import type { ColumnDef, CellValue } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Shared helpers (aligned with `RichTextCell.test.tsx`)
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

/**
 * Types a string into the editor surface. The production implementation is
 * expected to use a contenteditable / hybrid renderer rather than a plain
 * `<textarea>`, so this helper resolves both the `textbox`-role surface and
 * any `contenteditable="true"` fallback.
 */
function getEditorSurface(): HTMLElement {
  const byRole = screen.queryByRole('textbox');
  if (byRole) return byRole as HTMLElement;
  const editable = document.querySelector<HTMLElement>('[contenteditable="true"]');
  if (editable) return editable;
  throw new Error('No editor surface (textbox role or contenteditable) found');
}

/**
 * Inserts `text` into the editor surface regardless of whether the production
 * surface is a `<textarea>`, `<input>`, or contenteditable region. The
 * assertion layer below does not care HOW the characters arrive — only that
 * the visible output reflects the described behaviour afterwards.
 */
function typeIntoEditor(text: string) {
  const el = getEditorSurface();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    fireEvent.change(el, { target: { value: text } });
  } else {
    el.textContent = text;
    fireEvent.input(el, { target: { textContent: text } });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RichTextCell — "Show formatting" toggle (Feature B)', () => {
  it('exposes a toggle button with accessible name "Show formatting", default aria-pressed="false"', () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);
    const toggle = screen.getByRole('button', { name: /show formatting/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('with toggle OFF, typing `**bold**` renders <strong>bold</strong> with NO `**` visible', () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);
    typeIntoEditor('**bold**');

    // A live <strong> element must be present in the editor surface.
    const strong = document.querySelector('strong');
    expect(strong, 'expected a live <strong> element while editing').not.toBeNull();
    expect(strong?.textContent).toBe('bold');

    // The user-visible text of the editor must NOT contain the literal `**`
    // delimiters — they should be hidden while the toggle is OFF. We scope
    // the scan to the portaled toolbar's companion editor rather than the
    // whole body so toolbar icons/tooltips can't false-positive us.
    const surface = getEditorSurface();
    const visible = surface.textContent ?? '';
    expect(visible).not.toContain('**');
    expect(visible).toContain('bold');
  });

  it('toggling ON flips aria-pressed and reveals the raw `**` delimiters alongside <strong>', () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);
    typeIntoEditor('**bold**');
    const toggle = screen.getByRole('button', { name: /show formatting/i });
    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    // Raw delimiters are now visible in the editor surface.
    const surface = getEditorSurface();
    const visible = surface.textContent ?? '';
    expect(visible).toContain('**');
    expect(visible).toContain('bold');

    // The live <strong> rendering is still present — delimiters live
    // ALONGSIDE the rendered formatting, not instead of it.
    const strong = document.querySelector('strong');
    expect(strong, 'expected <strong> to remain rendered while delimiters are shown').not.toBeNull();
    expect(strong?.textContent).toBe('bold');
  });

  it('toggling back OFF hides the delimiters again', () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);
    typeIntoEditor('**bold**');
    const toggle = screen.getByRole('button', { name: /show formatting/i });

    fireEvent.click(toggle); // ON
    fireEvent.click(toggle); // back OFF

    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    const visible = getEditorSurface().textContent ?? '';
    expect(visible).not.toContain('**');
    expect(visible).toContain('bold');

    const strong = document.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('bold');
  });

  it('toggle state persists across blur/focus within the same edit session', () => {
    render(<RichTextCell {...makeProps({ isEditing: true, value: '' })} />);
    typeIntoEditor('**bold**');
    const toggle = screen.getByRole('button', { name: /show formatting/i });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    // Simulate a blur/focus cycle on the editor surface — e.g. the user
    // clicks a toolbar button and tabs back into the editor. The toggle
    // state must NOT reset to OFF.
    const surface = getEditorSurface();
    fireEvent.blur(surface);
    fireEvent.focus(surface);

    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(getEditorSurface().textContent ?? '').toContain('**');
  });
});
