/**
 * MUI numeric cell renderer for the datagrid.
 *
 * @module MuiNumericCell
 * @packageDocumentation
 */
import React from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import { formatNumber, isNumberFormatSpec } from '@iasbuilt/datagrid-core';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { useDraftState } from '@iasbuilt/datagrid-react';
import { EditableTextField } from '../../components';

/**
 * Resolves a numeric cell value to its display string, honouring the
 * Excel-style {@link NumberFormatSpec} shapes added for issue #92 as well
 * as the legacy `'thousands'` shorthand.
 */
function formatNumeric(value: CellValue, format: ColumnDef['format']): string {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return '';
  if (isNumberFormatSpec(format)) return formatNumber(num, format);
  return String(num);
}

/**
 * MUI-based numeric cell renderer with right-aligned display and constrained input.
 */
export const MuiNumericCell = React.memo(function MuiNumericCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: CellRendererProps<TData>) {
  const displayValue = formatNumeric(value, column.format);
  const rawValue = value === null || value === undefined ? '' : String(value);
  // Optional dual-unit sub-cell (issue #92) — derived from the primary
  // value via a pure conversion formula on every render.
  const numericValue = (() => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  })();
  const secondary = column.secondaryUnit;
  const secondaryDisplay = secondary && numericValue !== null
    ? `${formatNumeric(secondary.conversion(numericValue), secondary.format) || String(secondary.conversion(numericValue))} ${secondary.label}`
    : null;

  const clamp = (num: number): number => {
    let result = num;
    if (column.min !== undefined) result = Math.max(column.min, result);
    if (column.max !== undefined) result = Math.min(column.max, result);
    return result;
  };

  const commitTransform = (raw: string): unknown => {
    if (raw === '') return null;
    const num = parseFloat(raw);
    return isNaN(num) ? null : clamp(num);
  };

  const { draft, setDraft, inputRef, handleKeyDown, handleBlur } = useDraftState({
    initialValue: rawValue,
    isEditing,
    onCommit: onCommit as (value: unknown) => void,
    onCancel,
    deferFocus: true,
    selectOnFocus: true,
    transformCommit: commitTransform,
  });

  if (!isEditing) {
    if (secondaryDisplay !== null) {
      return (
        <Box
          data-testid="numeric-dual-unit"
          sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '100%', lineHeight: 1.15 }}
        >
          <Typography variant="body2" sx={{ textAlign: 'right', width: '100%' }} data-testid="numeric-primary">
            {displayValue}
          </Typography>
          <Typography
            variant="caption"
            sx={{ textAlign: 'right', width: '100%', opacity: 0.65 }}
            data-testid="numeric-secondary"
          >
            {secondaryDisplay}
          </Typography>
        </Box>
      );
    }
    return (
      <Typography variant="body2" sx={{ textAlign: 'right', width: '100%' }}>
        {displayValue}
      </Typography>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (/^-?\d*\.?\d*$/.test(raw)) setDraft(raw);
  };

  const handleKeyDownCustom = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = clamp((parseFloat(draft) || 0) + 1);
      setDraft(String(next));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = clamp((parseFloat(draft) || 0) - 1);
      setDraft(String(next));
    } else {
      handleKeyDown(e);
    }
  };

  return (
    <EditableTextField
      inputRef={inputRef as React.Ref<HTMLInputElement>}
      value={draft}
      onChange={handleChange}
      onKeyDown={handleKeyDownCustom}
      onBlur={handleBlur}
      htmlInputSlotProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }}
    />
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
