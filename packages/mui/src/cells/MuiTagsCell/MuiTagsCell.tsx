/**
 * MUI tags cell renderer for the datagrid.
 *
 * @module MuiTagsCell
 * @packageDocumentation
 */
import React from 'react';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { useArrayState } from '@iasbuilt/datagrid-react';
import { EditableAutocomplete } from '../../components';

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

/**
 * MUI-based tags cell renderer using Autocomplete with Chip display.
 */
export const MuiTagsCell = React.memo(function MuiTagsCell<TData = Record<string, unknown>>({
  value,
  isEditing,
  onCommit,
  onCancel,
}: CellRendererProps<TData>) {
  const { items: tags, setItems: setTags } = useArrayState<string>({ value, isEditing, parse: parseTags });
  const initialTags = parseTags(value);

  if (!isEditing) {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {initialTags.map((tag) => (
          <Chip key={tag} label={tag} size="small" sx={{ fontSize: 12 }} />
        ))}
      </Box>
    );
  }

  return (
    <EditableAutocomplete<string>
      multiple
      freeSolo
      value={tags}
      onChange={(_e, newValue) => setTags(newValue)}
      onBlur={() => onCommit(tags)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      options={[]}
      placeholder="Add tag..."
    />
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
