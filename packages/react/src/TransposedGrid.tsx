/**
 * TransposedGrid React component.
 *
 * Renders a form-mode datagrid where rows represent fields and columns
 * represent entities. The first column displays frozen field labels;
 * subsequent columns are editable inputs whose cell type varies per row.
 *
 * @module TransposedGrid
 */

import React, { useMemo, useCallback } from 'react';
import type { TransposedField, CellValue } from '@iasbuilt/datagrid-core';
import { createTransposedConfig } from '@iasbuilt/datagrid-core';
import { DataGrid, type CellRendererProps } from './DataGrid';
import { cellRendererMap, TextCell } from './cells';

/**
 * Props accepted by the {@link TransposedGrid} component.
 */
export interface TransposedGridProps {
  /** Field definitions (become rows). */
  fields: TransposedField[];
  /** Entity column keys. */
  entityKeys: string[];
  /** Current values: Record<fieldId, Record<entityKey, value>>. */
  values?: Record<string, Record<string, unknown>>;
  /** Called when a value changes. */
  onValueChange?: (fieldId: string, entityKey: string, value: CellValue) => void;
  /** Label for the field name column. */
  fieldColumnLabel?: string;
  /** Width of the field label column. */
  fieldColumnWidth?: number;
  /** Width of each entity column. */
  entityColumnWidth?: number;
  /**
   * When `true`, the field-name column is rendered as the row-number chrome
   * gutter (via `chrome.getChromeCellContent`) rather than as an ordinary
   * data column. Routes the field labels through the chrome API introduced
   * in issue #14 so that the "key" column is structurally identified as
   * chrome, matching the Excel-style form model.
   */
  useChromeFieldColumn?: boolean;
  /**
   * Optional overrides for the cell renderer map. When omitted, the built-in
   * {@link cellRendererMap} is used so that every supported `CellType` — text,
   * numeric, booleanSelected, passwordConfirm, etc. — renders out of the box.
   * Any entries supplied here are merged on top of the defaults.
   */
  cellRenderers?: Record<string, React.ComponentType<CellRendererProps<Record<string, unknown>>>>;
  /** Theme. */
  theme?: 'light' | 'dark' | Record<string, string>;
}

/**
 * A transposed (form-mode) grid where rows represent fields and columns
 * represent entities.
 *
 * Wraps the standard {@link DataGrid} component, building the configuration
 * via {@link createTransposedConfig} and mapping external `values` into the
 * internal data representation.
 */
export function TransposedGrid(props: TransposedGridProps) {
  const {
    fields,
    entityKeys,
    values = {},
    onValueChange,
    fieldColumnLabel,
    fieldColumnWidth,
    entityColumnWidth,
    useChromeFieldColumn,
    cellRenderers: cellRenderersOverride,
    theme,
  } = props;

  // Merge caller overrides on top of the built-in renderer map so that every
  // supported CellType — including `booleanSelected` and `passwordConfirm`
  // introduced for issue #18 — renders without the caller having to import
  // the map themselves. When the field-label column is rendered as an
  // ordinary data column, we also override that column so it always renders
  // as plain text regardless of the rowType (a row whose cellType is e.g.
  // `booleanSelected` should NOT render the field label through the
  // booleanSelected renderer — that would try to coerce the label string to
  // a boolean glyph).
  const mergedCellRenderers = useMemo(() => {
    const base: Record<string, React.ComponentType<CellRendererProps<Record<string, unknown>>>> = {
      ...(cellRendererMap as Record<string, React.ComponentType<CellRendererProps<Record<string, unknown>>>>),
      ...(cellRenderersOverride ?? {}),
    };
    // Wrap every renderer so the `__field_label` column falls back to the
    // plain text renderer — the cellType for that column is dictated by the
    // row's rowType (e.g. `booleanSelected`), which would otherwise try to
    // coerce the label string to a boolean glyph.
    const wrapped: Record<string, React.ComponentType<CellRendererProps<Record<string, unknown>>>> = {};
    for (const [key, Renderer] of Object.entries(base)) {
      const LabelAware: React.ComponentType<CellRendererProps<Record<string, unknown>>> = (
        p: CellRendererProps<Record<string, unknown>>,
      ) => {
        if (p.column.field === '__field_label') {
          return <TextCell {...p} />;
        }
        return <Renderer {...p} />;
      };
      wrapped[key] = LabelAware;
    }
    return wrapped;
  }, [cellRenderersOverride]);

  // Build transposed config for columns and rowTypes
  const config = useMemo(
    () =>
      createTransposedConfig({
        fields,
        entityKeys,
        fieldColumnLabel,
        fieldColumnWidth,
        entityColumnWidth,
        useChromeFieldColumn,
      }),
    [fields, entityKeys, fieldColumnLabel, fieldColumnWidth, entityColumnWidth, useChromeFieldColumn],
  );

  // Build data from fields and values
  const data = useMemo(() => {
    return fields.map(field => {
      const row: Record<string, unknown> = {
        __field_label: field.label,
        __field_id: field.id,
        __field_config: field,
      };
      for (const key of entityKeys) {
        row[key] = values[field.id]?.[key] ?? field.defaultValue ?? null;
      }
      return row;
    });
  }, [fields, entityKeys, values]);

  // Handle cell value changes
  const handleCellEdit = useCallback(
    (_rowKey: string, fieldName: string, value: CellValue) => {
      if (fieldName === '__field_label' || fieldName === '__field_id') return;
      // Find the field by rowKey (__field_id)
      const fieldDef = fields.find(f => f.id === _rowKey);
      if (fieldDef && onValueChange) {
        onValueChange(fieldDef.id, fieldName, value);
      }
    },
    [fields, onValueChange],
  );

  return (
    <DataGrid
      columns={config.columns}
      data={data}
      rowKey={'__field_id'}
      pivotMode="row"
      rowTypes={config.rowTypes}
      selectionMode="cell"
      keyboardNavigation={true}
      chrome={config.chrome}
      cellRenderers={mergedCellRenderers}
      theme={theme}
      onCellEdit={handleCellEdit}
    />
  );
}
