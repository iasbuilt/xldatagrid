import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TransposedGrid } from '../TransposedGrid';
import type { TransposedField } from '@iasbuilt/datagrid-core';

describe('TransposedGrid', () => {
  const fields: TransposedField[] = [
    { id: 'name', label: 'Name', cellType: 'text' },
    { id: 'email', label: 'Email', cellType: 'text' },
    { id: 'active', label: 'Active', cellType: 'boolean', defaultValue: false },
  ];

  test('renders without crashing', () => {
    const { container } = render(
      <TransposedGrid fields={fields} entityKeys={['entity1']} />,
    );
    expect(container.querySelector('[role="grid"]')).toBeInTheDocument();
  });

  test('renders text field labels in first column', () => {
    render(<TransposedGrid fields={fields} entityKeys={['entity1']} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  test('renders rows for all fields including boolean', () => {
    const { container } = render(
      <TransposedGrid fields={fields} entityKeys={['entity1']} />,
    );
    // Each field becomes a row; boolean rows render with their cellType renderer
    const rows = container.querySelectorAll('[role="row"][data-row-id]');
    expect(rows.length).toBe(3);
    expect(rows[0]?.getAttribute('data-row-id')).toBe('name');
    expect(rows[1]?.getAttribute('data-row-id')).toBe('email');
    expect(rows[2]?.getAttribute('data-row-id')).toBe('active');
  });

  test('renders entity column headers', () => {
    render(<TransposedGrid fields={fields} entityKeys={['entity1', 'entity2']} />);
    expect(screen.getByText('entity1')).toBeInTheDocument();
    expect(screen.getByText('entity2')).toBeInTheDocument();
  });

  test('applies values from props', () => {
    const values = {
      name: { entity1: 'John' },
      email: { entity1: 'john@example.com' },
    };
    render(
      <TransposedGrid fields={fields} entityKeys={['entity1']} values={values} />,
    );
    expect(screen.getByText('John')).toBeInTheDocument();
  });

  test('renders with custom field column label', () => {
    render(
      <TransposedGrid
        fields={fields}
        entityKeys={['entity1']}
        fieldColumnLabel="Property"
      />,
    );
    expect(screen.getByText('Property')).toBeInTheDocument();
  });

  test('renders with empty fields', () => {
    const { container } = render(
      <TransposedGrid fields={[]} entityKeys={['entity1']} />,
    );
    expect(container.querySelector('[role="grid"]')).toBeInTheDocument();
  });

  // Issue #18 sub-feature 1: when `useChromeFieldColumn` is enabled the field
  // name column is rendered via the chrome API rather than as a data column.
  describe('useChromeFieldColumn (issue #18)', () => {
    test('renders field labels inside the chrome gutter, not a data column', () => {
      const { container } = render(
        <TransposedGrid
          fields={fields}
          entityKeys={['entity1']}
          useChromeFieldColumn
        />,
      );
      // The chrome row-number cells should contain the field labels.
      const chromeCells = container.querySelectorAll(
        '[data-testid="chrome-row-number"]',
      );
      expect(chromeCells.length).toBe(3);
      expect(
        within(chromeCells[0] as HTMLElement).getByTestId(
          'chrome-row-content-text',
        ).textContent,
      ).toBe('Name');
      expect(
        within(chromeCells[1] as HTMLElement).getByTestId(
          'chrome-row-content-text',
        ).textContent,
      ).toBe('Email');
    });

    test('omits the __field_label data column when enabled', () => {
      const { container } = render(
        <TransposedGrid
          fields={fields}
          entityKeys={['entity1']}
          useChromeFieldColumn
        />,
      );
      // The header should NOT contain a "Field" label (default) since that
      // column is absent in chrome mode.
      const headers = container.querySelectorAll('[role="columnheader"]');
      const titles = Array.from(headers).map(h => h.textContent);
      expect(titles).not.toContain('Field');
    });
  });

  // Issue #18 sub-feature 2: per-row variance — each row picks its own editor.
  describe('per-row cellType variance (issue #18)', () => {
    test('applies the booleanSelected renderer for boolean-Selected fields', () => {
      const mixed: TransposedField[] = [
        { id: 'name', label: 'Name', cellType: 'text' },
        { id: 'active', label: 'Active', cellType: 'booleanSelected', defaultValue: true },
      ];
      render(<TransposedGrid fields={mixed} entityKeys={['entity1']} />);
      // The "Selected" label comes from the BooleanSelectedCell display mode.
      expect(screen.getByText('Selected')).toBeInTheDocument();
    });
  });
});
