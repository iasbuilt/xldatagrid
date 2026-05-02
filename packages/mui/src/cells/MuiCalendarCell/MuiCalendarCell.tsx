/**
 * MUI calendar cell renderer for the datagrid.
 *
 * @module MuiCalendarCell
 * @packageDocumentation
 */
import React from 'react';
import Typography from '@mui/material/Typography';
import type { CellValue } from '@iasbuilt/datagrid-core';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { useDraftState } from '@iasbuilt/datagrid-react';
import { EditableTextField } from '../../components';

function parseDate(value: CellValue): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function toIsoDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * MUI-based calendar cell renderer using a native date input via MUI TextField.
 */
export const MuiCalendarCell = React.memo(function MuiCalendarCell<TData = Record<string, unknown>>({
  value,
  isEditing,
  onCommit,
  onCancel,
}: CellRendererProps<TData>) {
  const date = parseDate(value);
  const isoValue = date ? toIsoDateString(date) : '';

  const { draft, setDraft, inputRef, handleKeyDown, handleBlur } = useDraftState({
    initialValue: isoValue,
    isEditing,
    onCommit: onCommit as (value: unknown) => void,
    onCancel,
    deferFocus: true,
    transformCommit: (d) => d || null,
  });

  if (!isEditing) {
    return (
      <Typography variant="body2" noWrap title={formatDate(date)}>
        {formatDate(date) || (
          <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>
            Pick a date
          </Typography>
        )}
      </Typography>
    );
  }

  return (
    <EditableTextField
      inputRef={inputRef as React.Ref<HTMLInputElement>}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      type="date"
    />
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
