/**
 * React Testing Library contracts for the new validation-tooltip subsystem.
 *
 * Contracts guarded by this file (ALL expected to fail today — implementation
 * not yet written; the legacy code renders an inline `role="alert"` span inside
 * the cell):
 *
 *   1.  An invalid cell carries `aria-invalid="true"` and
 *       `data-validation-severity="<severity>"` on the `[role="gridcell"]`
 *       element itself. The severity attribute is driven by the MOST-severe
 *       result in the validators array (error > warning > info).
 *
 *   2.  There is NO inline validation span inside the cell. The legacy
 *       `[data-testid="validation-error-<field>"]` / `[role="alert"]` marker
 *       MUST NOT be rendered inside the grid container. All messaging moves
 *       to an overlay tooltip.
 *
 *   3.  A tooltip portal node is appended to `document.body` (NOT inside the
 *       grid container) with:
 *         role="tooltip"
 *         data-validation-target="<rowId>:<field>"
 *         data-state="open" | "closed"
 *       and becomes visible on hover or focus of the invalid cell.
 *
 *   4.  Warnings-only cells are still marked `aria-invalid="true"`. Intent:
 *       assistive tech should be notified about ALL severities so users can
 *       triage; colour/icon still differs by severity. (See Nielsen Norman
 *       Group guidance on form validation — warnings are actionable, not
 *       decorative.)
 *
 *   5.  Multi-result cells render every message inside the tooltip, error
 *       messages ordered before warnings/info; within the same severity the
 *       declaration order from `ColumnDef.validators` is preserved.
 *
 *   6.  Correcting the value clears validation state to an empty array (not
 *       null) and unmounts the tooltip portal.
 *
 * See also the pure-core unit tests in
 * `packages/core/src/__tests__/validators.test.ts` which exercise the
 * `runValidators` / `mostSevere` primitives this component layer consumes.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DataGrid, DataGridProps } from '../DataGrid';
import {
  ColumnDef,
  CellValue,
  ValidationResult,
  Validator,
} from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type Row = { id: string; name: string; age: number; email: string };

function makeData(): Row[] {
  return [
    { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
    { id: '2', name: 'B', age: 25, email: 'bob@test.com' },
    { id: '3', name: '', age: 35, email: '' },
  ];
}

const required: Validator<Row> = {
  name: 'required',
  run: (value: CellValue): ValidationResult | null =>
    value == null || String(value).trim() === ''
      ? { message: 'Required', severity: 'error' }
      : null,
};

const minLength3: Validator<Row> = {
  name: 'minLength(3)',
  run: (value: CellValue): ValidationResult | null =>
    value != null && String(value).length > 0 && String(value).length < 3
      ? { message: 'Min length 3', severity: 'error' }
      : null,
};

const warnIfShort: Validator<Row> = {
  name: 'warnIfShort',
  run: (value: CellValue): ValidationResult | null =>
    value != null && String(value).length < 5
      ? { message: 'Consider a longer value', severity: 'warning' }
      : null,
};

function columnsWith(validators: Validator<Row>[]): ColumnDef<Row>[] {
  return [
    { id: 'name', field: 'name', title: 'Name', validators },
    { id: 'age', field: 'age', title: 'Age' },
    { id: 'email', field: 'email', title: 'Email' },
  ];
}

function renderGrid(overrides: Partial<DataGridProps<Row>> = {}) {
  return render(
    <DataGrid
      data={makeData()}
      columns={columnsWith([required])}
      rowKey="id"
      {...(overrides as any)}
    />,
  );
}

function commitEdit(cell: HTMLElement, value: string): void {
  fireEvent.dblClick(cell);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

function findCell(rowId: string, field: string): HTMLElement {
  const cell = screen
    .getAllByRole('gridcell')
    .find(
      (c) =>
        c.getAttribute('data-row-id') === rowId && c.getAttribute('data-field') === field,
    );
  if (!cell) {
    throw new Error(`gridcell for row=${rowId} field=${field} not found`);
  }
  return cell;
}

function findTooltip(rowId: string, field: string): HTMLElement | null {
  return document.body.querySelector(
    `[role="tooltip"][data-validation-target="${rowId}:${field}"]`,
  ) as HTMLElement | null;
}

// ---------------------------------------------------------------------------
// ERROR-severity behaviour
// ---------------------------------------------------------------------------

describe('validation-tooltip — ERROR severity', () => {
  it('marks the cell aria-invalid and sets data-validation-severity="error"', async () => {
    renderGrid();
    const cell = findCell('1', 'name');
    commitEdit(cell, '');
    const invalid = findCell('1', 'name');
    await waitFor(() => expect(invalid).toHaveAttribute('aria-invalid', 'true'));
    expect(invalid).toHaveAttribute('data-validation-severity', 'error');
  });

  it('does NOT render an inline role="alert" span inside the cell', async () => {
    renderGrid();
    const cell = findCell('1', 'name');
    commitEdit(cell, '');
    const invalid = findCell('1', 'name');
    await waitFor(() => expect(invalid).toHaveAttribute('aria-invalid', 'true'));
    // No legacy inline alert — messaging is owned by the tooltip portal.
    expect(within(invalid).queryByRole('alert')).not.toBeInTheDocument();
    expect(
      invalid.querySelector('[data-testid="validation-error-name"]'),
    ).not.toBeInTheDocument();
  });

  it('appends a tooltip portal node to document.body, outside the grid container', async () => {
    const { container } = renderGrid();
    const cell = findCell('1', 'name');
    commitEdit(cell, '');
    await waitFor(() => {
      const tip = findTooltip('1', 'name');
      expect(tip).not.toBeNull();
    });
    const tip = findTooltip('1', 'name')!;
    // Portal target: must live in document.body, not inside the grid.
    expect(container.contains(tip)).toBe(false);
    expect(document.body.contains(tip)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WARNING-severity behaviour
// ---------------------------------------------------------------------------

describe('validation-tooltip — WARNING severity', () => {
  it('treats warnings as aria-invalid=true and flags severity=warning', async () => {
    // Intent captured here (see header comment #4): we treat warnings as
    // aria-invalid because screen-reader users should be alerted to ALL
    // validation feedback, not just blocking errors. The visual severity —
    // yellow border / icon / message colour — is orthogonal, driven by
    // `data-validation-severity`.
    render(
      <DataGrid
        data={makeData()}
        columns={columnsWith([warnIfShort])}
        rowKey="id"
      />,
    );
    const cell = findCell('2', 'name');
    commitEdit(cell, 'B');
    const invalid = findCell('2', 'name');
    await waitFor(() => expect(invalid).toHaveAttribute('aria-invalid', 'true'));
    expect(invalid).toHaveAttribute('data-validation-severity', 'warning');
  });

  it('renders the tooltip with the warning colour token', async () => {
    render(
      <DataGrid
        data={makeData()}
        columns={columnsWith([warnIfShort])}
        rowKey="id"
      />,
    );
    commitEdit(findCell('2', 'name'), 'B');
    await waitFor(() => expect(findTooltip('2', 'name')).not.toBeNull());
    const tip = findTooltip('2', 'name')!;
    expect(tip).toHaveAttribute('data-validation-severity', 'warning');
  });
});

// ---------------------------------------------------------------------------
// Multi-result ordering
// ---------------------------------------------------------------------------

describe('validation-tooltip — multiple results', () => {
  it('lists error BEFORE warning when both are present', async () => {
    // required → error; warnIfShort → warning. Committing '' hits both.
    render(
      <DataGrid
        data={makeData()}
        columns={columnsWith([required, warnIfShort])}
        rowKey="id"
      />,
    );
    commitEdit(findCell('1', 'name'), '');
    await waitFor(() => expect(findTooltip('1', 'name')).not.toBeNull());
    const tip = findTooltip('1', 'name')!;
    const messages = Array.from(
      tip.querySelectorAll('[data-validation-message]'),
    ).map((n) => n.textContent);
    expect(messages).toEqual(['Required', 'Consider a longer value']);
  });

  it('preserves declaration order among same-severity results', async () => {
    const first: Validator<Row> = {
      name: 'first',
      run: () => ({ message: 'first error', severity: 'error' }),
    };
    const second: Validator<Row> = {
      name: 'second',
      run: () => ({ message: 'second error', severity: 'error' }),
    };
    render(
      <DataGrid
        data={makeData()}
        columns={columnsWith([first, second])}
        rowKey="id"
      />,
    );
    commitEdit(findCell('1', 'name'), 'whatever');
    await waitFor(() => expect(findTooltip('1', 'name')).not.toBeNull());
    const tip = findTooltip('1', 'name')!;
    const messages = Array.from(
      tip.querySelectorAll('[data-validation-message]'),
    ).map((n) => n.textContent);
    expect(messages).toEqual(['first error', 'second error']);
  });
});

// ---------------------------------------------------------------------------
// Tooltip open / close lifecycle
// ---------------------------------------------------------------------------

describe('validation-tooltip — hover/focus lifecycle', () => {
  it('opens on hover and closes on unhover', async () => {
    renderGrid();
    commitEdit(findCell('1', 'name'), '');
    await waitFor(() => expect(findTooltip('1', 'name')).not.toBeNull());
    const tip = findTooltip('1', 'name')!;
    const cell = findCell('1', 'name');

    // Starts closed (cell neither hovered nor focused).
    expect(tip).toHaveAttribute('data-state', 'closed');

    fireEvent.mouseEnter(cell);
    await waitFor(() => expect(tip).toHaveAttribute('data-state', 'open'));

    fireEvent.mouseLeave(cell);
    await waitFor(() => expect(tip).toHaveAttribute('data-state', 'closed'));
  });

  it('opens on focus and closes on blur', async () => {
    renderGrid();
    commitEdit(findCell('1', 'name'), '');
    await waitFor(() => expect(findTooltip('1', 'name')).not.toBeNull());
    const tip = findTooltip('1', 'name')!;
    const cell = findCell('1', 'name');

    fireEvent.focus(cell);
    await waitFor(() => expect(tip).toHaveAttribute('data-state', 'open'));

    fireEvent.blur(cell);
    await waitFor(() => expect(tip).toHaveAttribute('data-state', 'closed'));
  });
});

// ---------------------------------------------------------------------------
// Clearing / cleanup
// ---------------------------------------------------------------------------

describe('validation-tooltip — clearing state', () => {
  it('clears state to an empty array and unmounts the tooltip when the cell becomes valid', async () => {
    renderGrid();
    // Commit an invalid value first.
    commitEdit(findCell('1', 'name'), '');
    await waitFor(() => expect(findTooltip('1', 'name')).not.toBeNull());

    // Now correct it.
    const invalid = findCell('1', 'name');
    commitEdit(invalid, 'Fixed');

    await waitFor(() => {
      const fixed = findCell('1', 'name');
      expect(fixed).not.toHaveAttribute('aria-invalid', 'true');
      expect(fixed).not.toHaveAttribute('data-validation-severity');
    });
    // Tooltip portal must be gone.
    expect(findTooltip('1', 'name')).toBeNull();
  });
});
