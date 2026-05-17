/**
 * CompoundChipListCell module for the datagrid component library.
 *
 * Provides a cell renderer for managing a list of compound chip objects, each
 * carrying an `id`, user-editable `label`, and optional `color`. In display
 * mode, chips render as compact badges with a small color sub-chip (a coloured
 * dot) next to the label. In edit mode, chips can be individually renamed,
 * removed, recoloured via a popover color picker, or created.
 *
 * The color picker exposes a per-user palette via the column-level
 * {@link PaletteAdapter} contract: consumers wire their own storage
 * (cookie/localStorage/backend) so the grid itself stays storage-agnostic.
 *
 * @module CompoundChipListCell
 */
import React, { useState, useEffect, useMemo } from 'react';
import type { CellValue, ColumnDef, PaletteAdapter } from '@iasbuilt/datagrid-core';
import * as styles from './CompoundChipListCell.styles';
import {
  ColorPickerPopover,
  applyCustomColorToPalette,
  createInMemoryPaletteAdapter,
  DEFAULT_THEME_COLORS,
} from './ColorPickerPopover';

/**
 * Represents a single chip item within the compound chip list.
 *
 * Each chip carries a unique identifier, a user-visible label, an optional
 * color (hex/rgb), and may include arbitrary additional properties for
 * domain-specific metadata.
 */
export interface ChipItem {
  /** Unique identifier for the chip, used as a React key and for targeted updates. */
  id: string;
  /** The human-readable text displayed on the chip badge. */
  label: string;
  /** Optional color shown as a small sub-chip next to the label. */
  color?: string;
  /** Arbitrary extra properties attached to the chip for domain-specific use. */
  [key: string]: unknown;
}

/**
 * Props accepted by the {@link CompoundChipListCell} component.
 *
 * @typeParam TData - The shape of a single row in the datagrid. Defaults to a generic record.
 */
interface CompoundChipListCellProps<TData = Record<string, unknown>> {
  /** The raw cell value, expected to be an array of objects with at least a `label` property. */
  value: CellValue;
  /** The full row data object that this cell belongs to. */
  row: TData;
  /** Column definition providing metadata such as `placeholder` text. */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible datagrid. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /** Callback to persist the updated chip array when editing completes. */
  onCommit: (value: CellValue) => void;
  /** Callback to discard changes and exit edit mode. */
  onCancel: () => void;
}

/**
 * Normalizes a {@link CellValue} into an array of {@link ChipItem} objects.
 *
 * Array elements that are plain objects with a `label` field are cast directly;
 * scalar elements receive a generated `id` derived from their array index.
 *
 * @param value - The raw cell value to parse.
 * @returns A normalized array of chip items.
 */
function parseChips(value: CellValue): ChipItem[] {
  if (Array.isArray(value)) {
    return value.map((item, i) => {
      // Preserve structured chip objects; wrap primitives with a synthetic id
      if (typeof item === 'object' && item !== null && 'label' in item) {
        return item as ChipItem;
      }
      return { id: String(i), label: String(item) };
    });
  }
  return [];
}

/**
 * Generates a short random identifier string for new chip items.
 *
 * @returns A 7-character alphanumeric identifier.
 */
function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * A datagrid cell renderer for compound chip lists with inline label editing
 * and per-chip color selection via a popover picker.
 *
 * @typeParam TData - Row data shape, defaults to `Record<string, unknown>`.
 */
export const CompoundChipListCell = React.memo(function CompoundChipListCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: CompoundChipListCellProps<TData>) {
  // Parse chips from the raw value for display-mode rendering
  const chips = parseChips(value);
  const [draft, setDraft] = useState<ChipItem[]>(chips);
  const [editingChipId, setEditingChipId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [pickerChipId, setPickerChipId] = useState<string | null>(null);

  // Resolve the palette adapter exactly once per cell instance so the
  // in-memory fallback maintains its store across picker open/close cycles.
  // Resolution precedence: column-supplied adapter > per-cell in-memory.
  const paletteAdapter: PaletteAdapter = useMemo(
    () => (column.paletteAdapter ?? createInMemoryPaletteAdapter()),
    [column.paletteAdapter],
  );

  const themeColors = column.defaultThemeColors ?? DEFAULT_THEME_COLORS;
  const allowCustomColor = column.allowCustomColor !== false;

  // Re-initialize the draft from the source value each time editing begins
  useEffect(() => {
    if (isEditing) {
      setDraft(parseChips(value));
      setEditingChipId(null);
      setPickerChipId(null);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Adds a chip and immediately enters rename mode for the new chip. */
  const handleAddChip = () => {
    const newChip: ChipItem = { id: generateId(), label: 'New item' };
    setDraft((prev) => [...prev, newChip]);
    setEditingChipId(newChip.id);
    setEditingLabel(newChip.label);
  };

  /** Removes a chip from the draft array. */
  const handleDeleteChip = (id: string) => {
    setDraft((prev) => prev.filter((c) => c.id !== id));
    if (editingChipId === id) setEditingChipId(null);
    if (pickerChipId === id) setPickerChipId(null);
  };

  /** Activates inline label editing for a specific chip. */
  const handleChipClick = (chip: ChipItem) => {
    if (!isEditing) return;
    setEditingChipId(chip.id);
    setEditingLabel(chip.label);
  };

  /** Handles keyboard events within the inline chip label input. */
  const handleLabelKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') commitChipEdit(id);
    if (e.key === 'Escape') setEditingChipId(null);
  };

  /** Applies the current label input value to the target chip. */
  const commitChipEdit = (id: string) => {
    setDraft((prev) =>
      prev.map((c) => (c.id === id ? { ...c, label: editingLabel } : c)),
    );
    setEditingChipId(null);
  };

  /**
   * Updates the color of a chip and, when the color is a brand-new custom
   * value (i.e. not already in the theme set or the persisted palette),
   * routes it through the palette adapter's `write` hook so the user's
   * recently-used list reflects it on the next picker open.
   */
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

  /** Commits the entire draft chip list, folding any in-progress edit first. */
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

  /** Container-level shortcuts: Escape cancels, Enter commits (when idle). */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (pickerChipId) {
        setPickerChipId(null);
        return;
      }
      onCancel();
    }
    if (e.key === 'Enter' && editingChipId === null && pickerChipId === null) {
      handleCommitAll();
    }
  };

  /**
   * Renders the small color sub-chip beside a chip label. In display mode
   * it's a static dot; in edit mode it's a button that opens the picker.
   */
  const renderColorSubChip = (chip: ChipItem, interactive: boolean) => {
    const hasColor = typeof chip.color === 'string' && chip.color.length > 0;
    const commonStyle: React.CSSProperties = {
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
          style={commonStyle}
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
        style={{ ...commonStyle, padding: 0, cursor: 'pointer' }}
      />
    );
  };

  // Display mode: render chips as static read-only badges with color sub-chip
  if (!isEditing) {
    return (
      <div style={styles.displayContainer}>
        {chips.length === 0 ? (
          <span style={styles.placeholder}>{column.placeholder ?? 'No items'}</span>
        ) : (
          chips.map((chip) => (
            <span key={chip.id} style={styles.displayChip}>
              {renderColorSubChip(chip, false)}
              {chip.label}
            </span>
          ))
        )}
      </div>
    );
  }

  // Edit mode: render chips with inline rename input + color picker controls
  return (
    <div onKeyDown={handleKeyDown} tabIndex={0} style={styles.editWrapper}>
      <div style={styles.editChipContainer}>
        {draft.map((chip) => (
          <span
            key={chip.id}
            style={{ ...styles.editChip(editingChipId === chip.id), position: 'relative' }}
          >
            {renderColorSubChip(chip, true)}
            {editingChipId === chip.id ? (
              <input
                autoFocus
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                onKeyDown={(e) => handleLabelKeyDown(e, chip.id)}
                onBlur={() => commitChipEdit(chip.id)}
                style={styles.chipLabelInput}
              />
            ) : (
              <span onClick={() => handleChipClick(chip)} style={styles.chipLabelText}>
                {chip.label}
              </span>
            )}
            <button
              type="button"
              aria-label={`Remove ${chip.label}`}
              onClick={() => handleDeleteChip(chip.id)}
              style={styles.removeButton}
            >
              ×
            </button>
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
          </span>
        ))}
        <button
          type="button"
          aria-label="Add item"
          onClick={handleAddChip}
          style={styles.addButton}
        >
          + Add
        </button>
      </div>
      <div style={styles.actionBar}>
        <button type="button" onClick={handleCommitAll} style={styles.actionButton}>
          Done
        </button>
        <button type="button" onClick={onCancel} style={styles.actionButton}>
          Cancel
        </button>
      </div>
    </div>
  );
}) as <TData = Record<string, unknown>>(props: CompoundChipListCellProps<TData>) => React.ReactElement;
