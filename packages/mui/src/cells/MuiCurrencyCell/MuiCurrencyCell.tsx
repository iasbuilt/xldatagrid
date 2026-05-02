/**
 * MUI currency cell renderer for the datagrid.
 *
 * @module MuiCurrencyCell
 * @packageDocumentation
 */
import React from 'react';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import type { CellValue } from '@iasbuilt/datagrid-core';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { useDraftState } from '@iasbuilt/datagrid-react';
import { EditableTextField } from '../../components';

function parseCurrencyFormat(format?: string): { symbol: string; negativeRed: boolean } {
  if (!format) return { symbol: '$', negativeRed: true };
  const parts = format.split(':');
  const code = parts[0];
  const sym = parts[1];
  return {
    symbol: sym ?? code ?? '$',
    negativeRed: !format.includes('no-red'),
  };
}

function formatDisplay(value: CellValue, symbol: string): string {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return '';
  const abs = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `-${symbol}${abs}` : `${symbol}${abs}`;
}

/**
 * MUI-based currency cell renderer with InputAdornment for the currency symbol.
 */
export const MuiCurrencyCell = React.memo(function MuiCurrencyCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: CellRendererProps<TData>) {
  const { symbol, negativeRed } = parseCurrencyFormat(column.format);
  const numericValue = value === null || value === undefined ? '' : String(value);

  const commitTransform = (raw: string): unknown => {
    if (raw === '' || raw === '-') return null;
    const num = parseFloat(raw);
    return isNaN(num) ? null : num;
  };

  const { draft, setDraft, inputRef, handleKeyDown, handleBlur } = useDraftState({
    initialValue: numericValue,
    isEditing,
    onCommit: onCommit as (value: unknown) => void,
    onCancel,
    deferFocus: true,
    selectOnFocus: true,
    transformCommit: commitTransform,
  });

  if (!isEditing) {
    const num = Number(value);
    const isNegative = !isNaN(num) && num < 0;
    return (
      <Typography
        variant="body2"
        sx={{
          textAlign: 'right',
          width: '100%',
          color: isNegative && negativeRed ? 'error.main' : undefined,
        }}
      >
        {formatDisplay(value, symbol)}
      </Typography>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (/^-?\d*\.?\d*$/.test(raw)) setDraft(raw);
  };

  return (
    <EditableTextField
      inputRef={inputRef as React.Ref<HTMLInputElement>}
      value={draft}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      inputSlotProps={{
        disableUnderline: true,
        startAdornment: <InputAdornment position="start">{symbol}</InputAdornment>,
      }}
      htmlInputSlotProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }}
    />
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
