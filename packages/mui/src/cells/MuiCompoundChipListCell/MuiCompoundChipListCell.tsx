/**
 * MUI compound chip list cell renderer for the datagrid.
 *
 * Mirrors the behaviour of the framework-neutral
 * {@link CompoundChipListCell} from `@iasbuilt/datagrid-react` but renders
 * the chip and edit affordances with `@mui/material` primitives. The color
 * picker popover is reused from the React package so both variants share a
 * single behavioural contract (palette adapter, hex normalization, theme
 * swatches).
 *
 * @module MuiCompoundChipListCell
 * @packageDocumentation
 */
import React, { useState, useEffect, useMemo } from 'react';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import type { CellValue, PaletteAdapter } from '@iasbuilt/datagrid-core';
import {
  type CellRendererProps,
  ColorPickerPopover,
  applyCustomColorToPalette,
  createInMemoryPaletteAdapter,
  DEFAULT_THEME_COLORS,
} from '@iasbuilt/datagrid-react';

interface ChipItem {
  id: string;
  label: string;
  color?: string;
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
 * MUI-based compound chip list cell renderer with inline editing and a
 * per-chip color picker.
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
  const [pickerChipId, setPickerChipId] = useState<string | null>(null);

  const paletteAdapter: PaletteAdapter = useMemo(
    () => (column.paletteAdapter ?? createInMemoryPaletteAdapter()),
    [column.paletteAdapter],
  );

  const themeColors = column.defaultThemeColors ?? DEFAULT_THEME_COLORS;
  const allowCustomColor = column.allowCustomColor !== false;

  useEffect(() => {
    if (isEditing) {
      setDraft(parseChips(value));
      setEditingChipId(null);
      setPickerChipId(null);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderColorSubChip = (chip: ChipItem, interactive: boolean) => {
    const hasColor = typeof chip.color === 'string' && chip.color.length > 0;
    const baseStyle: React.CSSProperties = {
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: '50%',
      marginRight: 4,
      verticalAlign: 'middle',
      border: hasColor ? '1px solid rgba(0,0,0,0.15)' : '1px dashed #9ca3af',
      background: hasColor ? chip.color : 'transparent',
    };
    if (!interactive) {
      return (
        <span
          aria-label={hasColor ? `Color ${chip.color}` : 'No color'}
          data-color-sub-chip
          data-chip-id={chip.id}
          data-color={chip.color ?? ''}
          style={baseStyle}
        />
      );
    }
    return (
      <button
        type="button"
        aria-label={hasColor ? `Change color (currently ${chip.color})` : 'Pick color'}
        data-color-sub-chip
        data-chip-id={chip.id}
        data-color={chip.color ?? ''}
        onClick={(e) => {
          e.stopPropagation();
          setPickerChipId((prev) => (prev === chip.id ? null : chip.id));
        }}
        style={{ ...baseStyle, padding: 0, cursor: 'pointer' }}
      />
    );
  };

  if (!isEditing) {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, minHeight: 20 }}>
        {chips.length === 0 ? (
          <Box component="span" sx={{ color: 'text.secondary', fontSize: 12 }}>
            {column.placeholder ?? 'No items'}
          </Box>
        ) : (
          chips.map((chip) => (
            // Render the color sub-chip OUTSIDE the MUI Chip so its
            // semantic <span>/<button> isn't rewritten by Chip's `icon` slot
            // (Chip clones the icon and strips event handlers/role data).
            <Box
              key={chip.id}
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
            >
              {renderColorSubChip(chip, false)}
              <Chip label={chip.label} size="small" variant="outlined" sx={{ fontSize: 11 }} />
            </Box>
          ))
        )}
      </Box>
    );
  }

  const handleAddChip = () => {
    const newChip: ChipItem = { id: generateId(), label: 'New item' };
    setDraft((prev) => [...prev, newChip]);
    setEditingChipId(newChip.id);
    setEditingLabel(newChip.label);
  };

  const handleDeleteChip = (id: string) => {
    setDraft((prev) => prev.filter((c) => c.id !== id));
    if (editingChipId === id) setEditingChipId(null);
    if (pickerChipId === id) setPickerChipId(null);
  };

  const commitChipEdit = (id: string) => {
    setDraft((prev) => prev.map((c) => (c.id === id ? { ...c, label: editingLabel } : c)));
    setEditingChipId(null);
  };

  const handlePickColor = async (chipId: string, color: string) => {
    setDraft((prev) => prev.map((c) => (c.id === chipId ? { ...c, color } : c)));
    setPickerChipId(null);
    const inTheme = themeColors.some((t) => t.toLowerCase() === color.toLowerCase());
    if (inTheme) return;
    try {
      const current = await paletteAdapter.read();
      const next = applyCustomColorToPalette(current, color);
      await paletteAdapter.write(next);
    } catch {
      // Swallow adapter errors so a broken backend doesn't crash editing.
    }
  };

  const handleCommitAll = () => {
    if (editingChipId) {
      const finalDraft = draft.map((c) =>
        c.id === editingChipId ? { ...c, label: editingLabel } : c,
      );
      onCommit(finalDraft);
    } else {
      onCommit(draft);
    }
  };

  return (
    <Box
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          if (pickerChipId) {
            setPickerChipId(null);
            return;
          }
          onCancel();
        }
      }}
      tabIndex={0}
      sx={{ outline: 'none' }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
        {draft.map((chip) => (
          <Box
            key={chip.id}
            sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            {/* Sub-chip lives OUTSIDE the Chip — see display-mode comment for the why. */}
            {renderColorSubChip(chip, true)}
            {editingChipId === chip.id ? (
              <TextField
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
                label={chip.label}
                size="small"
                onClick={() => {
                  setEditingChipId(chip.id);
                  setEditingLabel(chip.label);
                }}
                onDelete={() => handleDeleteChip(chip.id)}
                sx={{ fontSize: 11 }}
              />
            )}
            {pickerChipId === chip.id ? (
              <ColorPickerPopover
                currentColor={chip.color ?? null}
                themeColors={themeColors}
                paletteAdapter={paletteAdapter}
                allowCustomColor={allowCustomColor}
                onPick={(color) => handlePickColor(chip.id, color)}
                onClose={() => setPickerChipId(null)}
              />
            ) : null}
          </Box>
        ))}
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
