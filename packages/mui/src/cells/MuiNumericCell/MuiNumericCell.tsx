/**
 * MUI numeric cell renderer for the datagrid.
 *
 * @module MuiNumericCell
 * @packageDocumentation
 */
import React from 'react';
import Typography from '@mui/material/Typography';
import type { CellValue } from '@iasbuilt/datagrid-core';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { useDraftState } from '@iasbuilt/datagrid-react';
import { EditableTextField } from '../../components';

function formatNumeric(value: CellValue, useThousands: boolean): string {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return '';
  return useThousands ? num.toLocaleString() : String(num);
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
  const useThousands = column.format === 'thousands';
  const displayValue = formatNumeric(value, useThousands);
  const rawValue = value === null || value === undefined ? '' : String(value);

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
