/**
 * MUI status cell renderer for the datagrid.
 *
 * @module MuiStatusCell
 * @packageDocumentation
 */
import React from 'react';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import type { CellValue, StatusOption } from '@iasbuilt/datagrid-core';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { useSelectState } from '@iasbuilt/datagrid-react';
import { EditableSelect } from '../../components';
import { colorDot } from './MuiStatusCell.styles';

/**
 * MUI-based status cell renderer using Select with MenuItem and Chip display.
 */
export const MuiStatusCell = React.memo(function MuiStatusCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
}: CellRendererProps<TData>) {
  const options: StatusOption[] = column.options ?? [];
  const { draft, setDraft, open, setOpen } = useSelectState({ value, isEditing });
  const current = options.find((o) => o.value === draft);

  if (!isEditing) {
    return (
      <Chip
        label={current?.label ?? String(draft ?? '')}
        size="small"
        sx={{
          backgroundColor: current?.color ?? '#e5e7eb',
          color: '#111',
          fontSize: 12,
          height: 24,
        }}
      />
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
      {options.map((opt) => (
        <MenuItem key={opt.value} value={opt.value}>
          {opt.color && (
            <span style={colorDot(opt.color)} />
          )}
          {opt.label}
        </MenuItem>
      ))}
    </EditableSelect>
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
