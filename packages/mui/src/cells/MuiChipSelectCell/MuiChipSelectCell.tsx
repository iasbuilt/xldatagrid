/**
 * MUI chip select cell renderer for the datagrid.
 *
 * @module MuiChipSelectCell
 * @packageDocumentation
 */
import React from 'react';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { useArrayState } from '@iasbuilt/datagrid-react';
import { EditableAutocomplete } from '../../components';

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.startsWith('[')) {
    try { return JSON.parse(value); } catch { /* fall through */ }
  }
  if (value != null && value !== '') return [String(value)];
  return [];
}

/**
 * MUI-based chip select cell renderer using Autocomplete multiple with Chip.
 */
export const MuiChipSelectCell = React.memo(function MuiChipSelectCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: CellRendererProps<TData>) {
  const options = column.options ?? [];
  const selected = parseArray(value);
  const { items: draft, setItems: setDraft } = useArrayState<string>({ value, isEditing, parse: parseArray });

  const labelFor = (val: string) => options.find((o: { value: string; label: string }) => o.value === val)?.label ?? val;

  if (!isEditing) {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {selected.length === 0 ? (
          <Box component="span" sx={{ color: 'text.secondary', fontSize: 12 }}>
            {column.placeholder ?? 'Select...'}
          </Box>
        ) : (
          selected.map((val) => (
            <Chip key={val} label={labelFor(val)} size="small" color="primary" variant="outlined" sx={{ fontSize: 11 }} />
          ))
        )}
      </Box>
    );
  }

  const availableOptions = options.map((o: { value: string }) => o.value);

  return (
    <EditableAutocomplete<string>
      multiple
      value={draft}
      onChange={(_e, newValue) => setDraft(newValue)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter' && !(e.target as HTMLInputElement).value) onCommit(draft);
      }}
      options={availableOptions}
      getOptionLabel={labelFor}
      placeholder={column.placeholder ?? 'Select...'}
    />
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
