/**
 * MUI list cell renderer for the datagrid.
 *
 * @module MuiListCell
 * @packageDocumentation
 */
import React from 'react';
import MenuItem from '@mui/material/MenuItem';
import type { CellValue } from '@iasbuilt/datagrid-core';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { useSelectState } from '@iasbuilt/datagrid-react';
import { DisplayTypography, EditableSelect } from '../../components';

/**
 * MUI-based list cell renderer using Select with MenuItem.
 */
export const MuiListCell = React.memo(function MuiListCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
}: CellRendererProps<TData>) {
  const options = column.options ?? [];
  const { draft, setDraft, open, setOpen } = useSelectState({ value, isEditing });
  const displayLabel = options.find((o: { value: string }) => o.value === String(draft ?? ''))?.label ?? (draft != null ? String(draft) : '');

  if (!isEditing) {
    return (
      <DisplayTypography value={displayLabel} placeholder={column.placeholder ?? 'Select...'} noWrap />
    );
  }

  return (
    <EditableSelect
      value={draft != null ? String(draft) : ''}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft as CellValue)}
    >
      {options.map((opt: { value: string; label: string }) => (
        <MenuItem key={opt.value} value={opt.value}>
          {opt.label}
        </MenuItem>
      ))}
      {options.length === 0 && (
        <MenuItem disabled value="">
          No options
        </MenuItem>
      )}
    </EditableSelect>
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
