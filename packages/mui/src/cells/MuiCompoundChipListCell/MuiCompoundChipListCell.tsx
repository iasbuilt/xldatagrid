/**
 * MUI compound chip list cell renderer for the datagrid.
 *
 * @module MuiCompoundChipListCell
 * @packageDocumentation
 */
import React, { useState, useEffect } from 'react';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import type { CellValue } from '@iasbuilt/datagrid-core';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';

interface ChipItem {
  id: string;
  label: string;
  [key: string]: unknown;
}

function parseChips(value: CellValue): ChipItem[] {
  if (Array.isArray(value)) {
    return value.map((item, i) => {
      if (typeof item === 'object' && item !== null && 'label' in item) {
        return item as ChipItem;
      }
      return { id: String(i), label: String(item) };
    });
  }
  return [];
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * MUI-based compound chip list cell renderer with inline editing.
 */
export const MuiCompoundChipListCell = React.memo(function MuiCompoundChipListCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: CellRendererProps<TData>) {
  const chips = parseChips(value);
  const [draft, setDraft] = useState<ChipItem[]>(chips);
  const [editingChipId, setEditingChipId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  useEffect(() => {
    if (isEditing) {
      setDraft(parseChips(value));
      setEditingChipId(null);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isEditing) {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, minHeight: 20 }}>
        {chips.length === 0 ? (
          <Box component="span" sx={{ color: 'text.secondary', fontSize: 12 }}>
            {column.placeholder ?? 'No items'}
          </Box>
        ) : (
          chips.map((chip) => (
            <Chip key={chip.id} label={chip.label} size="small" variant="outlined" sx={{ fontSize: 11 }} />
          ))
        )}
      </Box>
    );
  }

  const handleAddChip = () => {
    const newChip: ChipItem = { id: generateId(), label: 'New item' };
    const next = [...draft, newChip];
    setDraft(next);
    setEditingChipId(newChip.id);
    setEditingLabel(newChip.label);
  };

  const handleDeleteChip = (id: string) => {
    setDraft((prev) => prev.filter((c) => c.id !== id));
    if (editingChipId === id) setEditingChipId(null);
  };

  const commitChipEdit = (id: string) => {
    setDraft((prev) => prev.map((c) => (c.id === id ? { ...c, label: editingLabel } : c)));
    setEditingChipId(null);
  };

  const handleCommitAll = () => {
    if (editingChipId) {
      const finalDraft = draft.map((c) =>
        c.id === editingChipId ? { ...c, label: editingLabel } : c
      );
      onCommit(finalDraft);
    } else {
      onCommit(draft);
    }
  };

  return (
    <Box onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }} tabIndex={0} sx={{ outline: 'none' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
        {draft.map((chip) =>
          editingChipId === chip.id ? (
            <TextField
              key={chip.id}
              autoFocus
              value={editingLabel}
              onChange={(e) => setEditingLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitChipEdit(chip.id);
                if (e.key === 'Escape') setEditingChipId(null);
              }}
              onBlur={() => commitChipEdit(chip.id)}
              variant="standard"
              size="small"
              slotProps={{ input: { disableUnderline: true } }}
              sx={{ width: 80, fontSize: 11 }}
            />
          ) : (
            <Chip
              key={chip.id}
              label={chip.label}
              size="small"
              onClick={() => {
                setEditingChipId(chip.id);
                setEditingLabel(chip.label);
              }}
              onDelete={() => handleDeleteChip(chip.id)}
              sx={{ fontSize: 11 }}
            />
          )
        )}
        <Button size="small" variant="outlined" onClick={handleAddChip} sx={{ fontSize: 11, minWidth: 0, px: 1 }}>
          + Add
        </Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Button size="small" variant="contained" onClick={handleCommitAll} sx={{ fontSize: 11, minWidth: 0, px: 1 }}>
          Done
        </Button>
        <Button size="small" variant="text" onClick={onCancel} sx={{ fontSize: 11, minWidth: 0, px: 1 }}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
