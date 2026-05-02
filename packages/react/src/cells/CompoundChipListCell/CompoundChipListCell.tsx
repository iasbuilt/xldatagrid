/**
 * CompoundChipListCell module for the datagrid component library.
 *
 * Provides a cell renderer for managing a list of compound chip objects, each carrying
 * an `id` and a user-editable `label`. In display mode, chips render as compact badges.
 * In edit mode, chips can be individually renamed (via click-to-edit), removed, or
 * created, with explicit "Done" and "Cancel" buttons to control commit/discard flow.
 *
 * @module CompoundChipListCell
 */
import React, { useState, useEffect } from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import * as styles from './CompoundChipListCell.styles';

/**
 * Represents a single chip item within the compound chip list.
 *
 * Each chip carries a unique identifier, a user-visible label, and may
 * include arbitrary additional properties for domain-specific metadata.
 */
export interface ChipItem {
  /** Unique identifier for the chip, used as a React key and for targeted updates. */
  id: string;
  /** The human-readable text displayed on the chip badge. */
  label: string;
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
 * A datagrid cell renderer for compound chip lists with inline label editing.
 *
 * Each chip is an object with an `id` and `label`. In display mode, chips appear
 * as static badges. In edit mode, clicking a chip opens an inline text input for
 * renaming; chips can be added via the "+ Add" button and removed individually.
 * Explicit "Done" and "Cancel" buttons govern the commit/discard lifecycle.
 *
 * @typeParam TData - Row data shape, defaults to `Record<string, unknown>`.
 *
 * @param props - The component props conforming to {@link CompoundChipListCellProps}.
 * @returns A React element rendering the chip list in either display or edit mode.
 *
 * @example
 * ```tsx
 * <CompoundChipListCell
 *   value={[{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]}
 *   row={rowData}
 *   column={columnDef}
 *   rowIndex={0}
 *   isEditing={true}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
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

  // Re-initialize the draft from the source value each time editing begins
  useEffect(() => {
    if (isEditing) {
      setDraft(parseChips(value));
      setEditingChipId(null);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Creates a new chip with a default label and immediately enters rename mode.
   */
  const handleAddChip = () => {
    const newChip: ChipItem = { id: generateId(), label: 'New item' };
    const next = [...draft, newChip];
    setDraft(next);
    // Immediately enter inline-edit for the newly created chip
    setEditingChipId(newChip.id);
    setEditingLabel(newChip.label);
  };

  /**
   * Removes a chip by its identifier and clears inline-edit state if it was active.
   *
   * @param id - The identifier of the chip to remove.
   */
  const handleDeleteChip = (id: string) => {
    const next = draft.filter((c) => c.id !== id);
    setDraft(next);
    // Reset inline-edit if the deleted chip was being edited
    if (editingChipId === id) setEditingChipId(null);
  };

  /**
   * Activates inline label editing for a specific chip when clicked in edit mode.
   *
   * @param chip - The chip item that was clicked.
   */
  const handleChipClick = (chip: ChipItem) => {
    if (!isEditing) return;
    setEditingChipId(chip.id);
    setEditingLabel(chip.label);
  };

  /**
   * Handles keyboard events within the inline chip label input.
   * Enter confirms the rename; Escape discards it.
   *
   * @param e - The keyboard event.
   * @param id - The identifier of the chip being renamed.
   */
  const handleLabelKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') commitChipEdit(id);
    if (e.key === 'Escape') setEditingChipId(null);
  };

  /**
   * Applies the current label input value to the target chip in the draft array.
   *
   * @param id - The identifier of the chip whose label should be updated.
   */
  const commitChipEdit = (id: string) => {
    setDraft((prev) =>
      prev.map((c) => (c.id === id ? { ...c, label: editingLabel } : c))
    );
    setEditingChipId(null);
  };

  /**
   * Commits the entire draft chip list, folding in any in-progress label edit first.
   */
  const handleCommitAll = () => {
    if (editingChipId) {
      // Save any in-progress chip edit first
      const finalDraft = draft.map((c) =>
        c.id === editingChipId ? { ...c, label: editingLabel } : c
      );
      onCommit(finalDraft);
    } else {
      onCommit(draft);
    }
  };

  /**
   * Handles top-level keyboard shortcuts for the edit container.
   * Escape cancels editing; Enter (when no chip is being renamed) commits.
   *
   * @param e - The keyboard event.
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter' && editingChipId === null) handleCommitAll();
  };

  // Display mode: render chips as static read-only badges
  if (!isEditing) {
    return (
      <div style={styles.displayContainer}>
        {chips.length === 0 ? (
          <span style={styles.placeholder}>{column.placeholder ?? 'No items'}</span>
        ) : (
          chips.map((chip) => (
            <span
              key={chip.id}
              style={styles.displayChip}
            >
              {chip.label}
            </span>
          ))
        )}
      </div>
    );
  }

  // Edit mode: render chips with inline rename input, remove buttons, and action bar
  return (
    <div onKeyDown={handleKeyDown} tabIndex={0} style={styles.editWrapper}>
      {/* Chip badges with click-to-edit and remove controls */}
      <div style={styles.editChipContainer}>
        {draft.map((chip) => (
          <span
            key={chip.id}
            style={styles.editChip(editingChipId === chip.id)}
          >
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
              <span
                onClick={() => handleChipClick(chip)}
                style={styles.chipLabelText}
              >
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
      {/* Action bar with Done and Cancel buttons */}
      <div style={styles.actionBar}>
        <button
          type="button"
          onClick={handleCommitAll}
          style={styles.actionButton}
        >
          Done
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={styles.actionButton}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}) as <TData = Record<string, unknown>>(props: CompoundChipListCellProps<TData>) => React.ReactElement;
