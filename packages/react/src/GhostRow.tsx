/**
 * Ghost-row component for the datagrid.
 *
 * Renders an additional "placeholder" row at the top, bottom, or above the header
 * of the grid, allowing users to enter data for a new row inline. Supports
 * per-column and row-level validation, Tab/Enter/Escape keyboard navigation,
 * multi-cell and multi-row paste from the clipboard, and configurable default values.
 *
 * @module GhostRow
 */
import React, { useState, useRef, useCallback } from 'react';
import { ColumnDef, CellValue, GhostRowConfig, GhostRowPosition, ValidationResult, runValidators, mostSevere } from '@iasbuilt/datagrid-core';
import { GridModel } from '@iasbuilt/datagrid-core';
import * as styles from './GhostRow.styles';

/**
 * Props for the {@link GhostRow} component.
 *
 * @typeParam TData - Shape of the row data managed by the grid.
 */
export interface GhostRowProps<TData extends Record<string, unknown> = Record<string, unknown>> {
  columns: ColumnDef<TData>[];
  columnWidths: { width: number }[];
  rowHeight: number;
  topOffset: number;
  model: GridModel<TData>;
  config: boolean | GhostRowConfig<TData>;
  readOnly?: boolean;
  onRowAdd?: (data: Partial<TData>) => void;
  /** Where to render: 'top' | 'bottom' | 'above-header'. Default: 'bottom' */
  position?: GhostRowPosition;
  /** Whether the ghost row sticks when scrolling (only for 'top'|'bottom'). Default: false */
  sticky?: boolean;
}

/**
 * Renders a single "ghost" row that acts as an inline new-row entry form.
 *
 * Each visible column is presented as an editable input cell. The component
 * manages its own local value state, validates on change, and inserts a new
 * row into the grid model when the user commits (Enter on the last cell).
 * Tab navigates between cells, Escape resets the row, and pasting
 * tab-separated data can populate multiple cells or create multiple rows.
 *
 * @typeParam TData - Shape of the row data managed by the grid.
 * @param props - Ghost-row configuration and callbacks.
 * @returns A positioned row element with editable input cells.
 *
 * @example
 * ```tsx
 * <GhostRow
 *   columns={visibleColumns}
 *   columnWidths={widths}
 *   rowHeight={36}
 *   topOffset={totalHeight}
 *   model={gridModel}
 *   config={{ placeholder: 'Type to add...', position: 'bottom' }}
 *   onRowAdd={(data) => console.log('new row', data)}
 * />
 * ```
 */
export function GhostRow<TData extends Record<string, unknown>>(props: GhostRowProps<TData>) {
  // `readOnly` is part of the public props contract but the ghost row itself
  // ignores it — the host grid is the source of truth for read-only gating
  // (it never invokes `onRowAdd` on a read-only grid). Underscore-prefix tells
  // the linter the destructure is intentional.
  const { columns, columnWidths, rowHeight, topOffset, model, config, readOnly: _readOnly, onRowAdd, position: positionProp, sticky: stickyProp } = props;

  // Normalise the config: boolean `true` becomes an empty config object
  const ghostConfig: GhostRowConfig<TData> = typeof config === 'object' ? config : {};

  /**
   * Coerce raw string values from `<input type="text">` into the typed
   * value the column's `cellType` declares. Required since the core's
   * `dataNode` invariant (`@causl/core` ≥ 0.2.1) rejects commits
   * containing strings in numeric/boolean columns — paired with
   * `iasbuilt/xldatagrid#104` (typed `setCellValue<F>`) to close the
   * "gigantic salary" bug class at every entry point.
   */
  const coerceRowFields = (raw: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...raw };
    for (const c of columns) {
      const f = c.field;
      const v = raw[f];
      if (v == null || v === '') continue;
      if (c.cellType === 'numeric' || c.cellType === 'currency') {
        const n = Number(v);
        if (Number.isFinite(n)) out[f] = n;
      } else if (c.cellType === 'boolean') {
        out[f] = v === true || v === 'true' || v === '1' || v === 'on';
      }
    }
    return out;
  };
  // Merge positional/sticky preferences with defaults
  const position: GhostRowPosition = positionProp ?? ghostConfig.position ?? 'bottom';
  const sticky = stickyProp ?? ghostConfig.sticky ?? false;
  const placeholder = ghostConfig.placeholder ?? 'Add new row...';
  const defaultValues = ghostConfig.defaultValues ?? {};
  const validateRow = ghostConfig.validate;

  // Initialise cell values from column-level defaults, then config-level defaults
  const [values, setValues] = useState<Record<string, CellValue>>(() => {
    const init: Record<string, CellValue> = {};
    for (const col of columns) {
      if (col.defaultValue !== undefined) {
        init[col.field] = col.defaultValue as CellValue;
      } else if ((defaultValues as Record<string, unknown>)[col.field] !== undefined) {
        init[col.field] = (defaultValues as Record<string, unknown>)[col.field] as CellValue;
      }
    }
    return init;
  });

  // The currently-edited field tracker exists for its *setter* — the field
  // value itself was previously consumed by an `isEditing` check that no
  // longer fires (the input element is always rendered). Underscored to
  // silence `no-unused-vars` while keeping the explicit type annotation as
  // documentation of what the setter accepts.
  const [_editingField, setEditingField] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Reset ghost row state back to initial defaults after a successful insert or Escape
  const resetGhostRow = useCallback(() => {
    const init: Record<string, CellValue> = {};
    for (const col of columns) {
      if (col.defaultValue !== undefined) {
        init[col.field] = col.defaultValue as CellValue;
      } else if ((defaultValues as Record<string, unknown>)[col.field] !== undefined) {
        init[col.field] = (defaultValues as Record<string, unknown>)[col.field] as CellValue;
      }
    }
    setValues(init);
    setEditingField(null);
    setValidationErrors({});
  }, [columns, defaultValues]);

  // Determine whether the user has typed anything into the ghost row
  const hasContent = useCallback(() => {
    return Object.values(values).some(v => v != null && v !== '');
  }, [values]);

  // Run all column and row validators, then insert the row if validation passes
  const validateAndCreate = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    // Per-column validators
    for (const col of columns) {
      const val = values[col.field];
      if (col.validators && col.validators.length > 0) {
        const results = runValidators(val ?? null, col.validators, {
          row: values as unknown as TData,
          rowId: 'ghost',
          field: col.field,
        });
        const errResult = results.find((r: ValidationResult) => r.severity === 'error');
        if (errResult) {
          errors[col.field] = errResult.message;
        }
      }
    }

    // Row-level validate
    if (validateRow) {
      const msg = validateRow(values as Partial<TData>);
      if (msg) {
        // Apply to first column as generic error
        const firstCol = columns[0];
        if (firstCol) errors[firstCol.field] = msg;
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return false;
    }

    // Create the row, coercing string `<input>` values per cellType.
    const rowData = coerceRowFields({ ...defaultValues, ...values });
    rowData.id = rowData.id ?? `ghost-${Date.now()}`;
    const dataLen = model.getProcessedData().length;
    model.insertRow(dataLen, rowData);
    onRowAdd?.(rowData as Partial<TData>);
    resetGhostRow();
    return true;
  }, [columns, values, validateRow, defaultValues, model, onRowAdd, resetGhostRow]);

  // Update a single cell's value and clear its validation error when the input becomes valid
  const handleCellChange = useCallback((field: string, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));

    // Clear validation error for this field on valid input
    const col = columns.find(c => c.field === field);
    if (col?.validators && col.validators.length > 0) {
      const results = runValidators(value as CellValue, col.validators, {
        row: { ...values, [field]: value } as unknown as TData,
        rowId: 'ghost',
        field,
      });
      const severe = mostSevere(results);
      if (!severe || severe.severity !== 'error') {
        setValidationErrors(prev => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    } else {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [columns, values]);

  // Handle Tab (move between cells), Enter (commit or advance), and Escape (reset)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, field: string) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const idx = columns.findIndex(c => c.field === field);
      const nextIdx = e.shiftKey ? idx - 1 : idx + 1;
      if (nextIdx >= 0 && nextIdx < columns.length) {
        const nextCol = columns[nextIdx];
        if (nextCol) {
          setEditingField(nextCol.field);
          // Focus will be set by effect
          setTimeout(() => {
            inputRefs.current[nextCol.field]?.focus();
          }, 0);
        }
      }
    } else if (e.key === 'Enter') {
      const idx = columns.findIndex(c => c.field === field);
      const isLast = idx === columns.length - 1;
      if (isLast && hasContent()) {
        validateAndCreate();
      } else {
        // Move to next cell
        const nextIdx = idx + 1;
        if (nextIdx < columns.length) {
          const nextCol = columns[nextIdx];
          if (nextCol) {
            setEditingField(nextCol.field);
            setTimeout(() => {
              inputRefs.current[nextCol.field]?.focus();
            }, 0);
          }
        }
      }
      e.stopPropagation();
    } else if (e.key === 'Escape') {
      resetGhostRow();
      e.stopPropagation();
    }
  }, [columns, hasContent, validateAndCreate, resetGhostRow]);

  // Handle clipboard paste: single-row tab-separated data fills cells to the right;
  // multi-row data inserts each line as a separate row via the grid model.
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>, field: string) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const lines = text.split('\n').filter(l => l.length > 0);
    if (lines.length <= 1 && !text.includes('\t')) return; // Single cell paste handled normally

    e.preventDefault();
    const fieldIdx = columns.findIndex(c => c.field === field);

    if (lines.length === 1) {
      // Single row, multiple columns
      const firstLine = lines[0];
      if (!firstLine) return;
      const cells = firstLine.split('\t');
      const newValues = { ...values };
      cells.forEach((cell, i) => {
        const colIdx = fieldIdx + i;
        const col = columns[colIdx];
        if (col) {
          newValues[col.field] = cell.trim();
        }
      });
      setValues(newValues);
    } else {
      // Multi-row paste: first row goes into ghost row, remaining create additional rows
      const firstLine = lines[0];
      if (!firstLine) return;
      const firstRowCells = firstLine.split('\t');
      const firstRowData: Record<string, unknown> = { ...defaultValues };
      firstRowCells.forEach((cell, i) => {
        const colIdx = fieldIdx + i;
        const col = columns[colIdx];
        if (col) {
          firstRowData[col.field] = cell.trim();
        }
      });
      const firstCoerced = coerceRowFields(firstRowData);
      firstCoerced.id = firstCoerced.id ?? `ghost-${Date.now()}`;
      const dataLen = model.getProcessedData().length;
      model.insertRow(dataLen, firstCoerced);
      onRowAdd?.(firstCoerced as Partial<TData>);

      // Additional rows
      for (let r = 1; r < lines.length; r++) {
        const line = lines[r];
        if (!line) continue;
        const cells = line.split('\t');
        const rowData: Record<string, unknown> = { ...defaultValues };
        cells.forEach((cell, i) => {
          const colIdx = fieldIdx + i;
          const col = columns[colIdx];
          if (col) {
            rowData[col.field] = cell.trim();
          }
        });
        const coerced = coerceRowFields(rowData);
        coerced.id = coerced.id ?? `ghost-${Date.now()}-${r}`;
        const currentLen = model.getProcessedData().length;
        model.insertRow(currentLen, coerced);
        onRowAdd?.(coerced as Partial<TData>);
      }

      resetGhostRow();
    }
  }, [columns, values, defaultValues, model, onRowAdd, resetGhostRow]);

  // Map column cell types to HTML input types for the ghost-row input elements
  const getInputType = useCallback((col: ColumnDef<TData>): string => {
    switch (col.cellType) {
      case 'numeric':
      case 'currency':
        return 'number';
      case 'boolean':
        return 'checkbox';
      case 'calendar':
        return 'date';
      default:
        return 'text';
    }
  }, []);

  // Compute positioning: above-header uses normal flow; top/bottom use sticky or absolute
  const positionStyle: React.CSSProperties =
    position === 'above-header'
      ? styles.aboveHeaderPosition
      : sticky
        ? styles.stickyPosition(position as 'top' | 'bottom')
        : styles.absolutePosition(topOffset);

  return (
    <div
      style={styles.row(positionStyle, rowHeight)}
      role="row"
      data-testid="ghost-row"
      data-ghost-position={position}
      data-ghost-sticky={sticky || undefined}
      aria-label="Add new row"
    >
      {columns.map((col, colIdx) => {
        const width = columnWidths[colIdx]?.width ?? 150;
        const value = values[col.field];
        const error = validationErrors[col.field];
        const colPlaceholder = col.placeholder ?? placeholder;
        const inputType = getInputType(col);

        return (
          <div
            key={col.field}
            style={styles.cell(width, rowHeight)}
            role="gridcell"
            data-field={col.field}
            data-testid={`ghost-cell-${col.field}`}
            onClick={() => {
              if (col.editable !== false) {
                setEditingField(col.field);
              }
            }}
          >
            <input
              ref={el => { inputRefs.current[col.field] = el; }}
              type={inputType}
              value={value != null ? String(value) : ''}
              placeholder={colPlaceholder}
              style={styles.input(!!error)}
              aria-invalid={!!error}
              aria-label={`${col.title ?? col.field} ghost cell`}
              onChange={e => {
                handleCellChange(col.field, e.target.value);
              }}
              onKeyDown={e => handleKeyDown(e, col.field)}
              onPaste={e => handlePaste(e, col.field)}
              onFocus={() => setEditingField(col.field)}
            />
            {error && (
              <span
                data-testid={`ghost-error-${col.field}`}
                style={styles.errorMessage}
                role="alert"
              >
                {error}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
