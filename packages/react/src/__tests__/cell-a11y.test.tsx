/**
 * Accessibility regressions for {@link BooleanSelectedCell} and
 * {@link PasswordConfirmCell}.
 *
 * WS-F locks in two concrete contracts:
 *   - BooleanSelectedCell exposes a visible keyboard-focus affordance when
 *     focused and commits via Space (parity with a native checkbox).
 *   - PasswordConfirmCell wires its mismatch alert back to both inputs via
 *     `aria-describedby`, uses `autoComplete="new-password"` on both inputs,
 *     and gives each input a distinct non-empty `id` so form tooling can
 *     target them unambiguously.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import type { ColumnDef } from '@iasbuilt/datagrid-core';

import { BooleanSelectedCell } from '../cells/BooleanSelectedCell/BooleanSelectedCell';
import { PasswordConfirmCell } from '../cells/PasswordConfirmCell/PasswordConfirmCell';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const editableColumn: ColumnDef = {
  id: 'col1',
  field: 'active',
  title: 'Active',
  editable: true,
};

const noop = () => {};

// ---------------------------------------------------------------------------
// BooleanSelectedCell
// ---------------------------------------------------------------------------

describe('BooleanSelectedCell a11y', () => {
  it('exposes a visible focus affordance when focused', () => {
    render(
      <BooleanSelectedCell
        value={true}
        row={{}}
        column={editableColumn}
        rowIndex={0}
        isEditing={false}
        onCommit={noop}
        onCancel={noop}
      />,
    );

    const el = screen.getByTestId('boolean-selected-cell') as HTMLElement;
    expect(el.tabIndex).toBe(0);

    act(() => {
      el.focus();
    });

    // After focus the element must expose a non-empty outline style so
    // keyboard users can see where they are. We check the inline style
    // property directly because jsdom does not resolve :focus-visible
    // pseudo selectors.
    const outline = el.style.outline;
    expect(outline).toBeTruthy();
    expect(outline).not.toBe('none');
  });

  it('fires onChange/onCommit when Space is pressed (native-checkbox parity)', () => {
    const onCommit = vi.fn();
    render(
      <BooleanSelectedCell
        value={false}
        row={{}}
        column={editableColumn}
        rowIndex={0}
        isEditing={false}
        onCommit={onCommit}
        onCancel={noop}
      />,
    );

    const el = screen.getByTestId('boolean-selected-cell');
    fireEvent.keyDown(el, { key: ' ' });
    expect(onCommit).toHaveBeenCalledWith(true);
  });
});

// ---------------------------------------------------------------------------
// PasswordConfirmCell
// ---------------------------------------------------------------------------

describe('PasswordConfirmCell a11y', () => {
  it('links the mismatch alert to both inputs via aria-describedby', () => {
    render(
      <PasswordConfirmCell
        value=""
        row={{}}
        column={editableColumn}
        rowIndex={0}
        isEditing={true}
        onCommit={noop}
        onCancel={noop}
      />,
    );

    const input1 = screen.getByTestId('password-confirm-input') as HTMLInputElement;
    const input2 = screen.getByTestId(
      'password-confirm-input-confirm',
    ) as HTMLInputElement;

    // Trigger a mismatch: type different values and press Enter.
    fireEvent.change(input1, { target: { value: 'abc' } });
    fireEvent.change(input2, { target: { value: 'xyz' } });
    fireEvent.keyDown(input1, { key: 'Enter' });

    const alert = screen.getByTestId('password-confirm-mismatch') as HTMLElement;
    const alertId = alert.getAttribute('id');
    expect(alertId).toBeTruthy();
    expect(alertId).not.toBe('');

    const describedBy1 = input1.getAttribute('aria-describedby') ?? '';
    const describedBy2 = input2.getAttribute('aria-describedby') ?? '';
    expect(describedBy1.split(/\s+/)).toContain(alertId);
    expect(describedBy2.split(/\s+/)).toContain(alertId);
  });

  it('both inputs set autoComplete="new-password" with distinct non-empty ids', () => {
    render(
      <PasswordConfirmCell
        value=""
        row={{}}
        column={editableColumn}
        rowIndex={0}
        isEditing={true}
        onCommit={noop}
        onCancel={noop}
      />,
    );

    const input1 = screen.getByTestId('password-confirm-input') as HTMLInputElement;
    const input2 = screen.getByTestId(
      'password-confirm-input-confirm',
    ) as HTMLInputElement;

    expect(input1.getAttribute('autocomplete')).toBe('new-password');
    expect(input2.getAttribute('autocomplete')).toBe('new-password');

    const id1 = input1.getAttribute('id');
    const id2 = input2.getAttribute('id');
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });
});
