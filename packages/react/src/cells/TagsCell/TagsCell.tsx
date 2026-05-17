/**
 * TagsCell module for the datagrid component library.
 *
 * Provides a cell renderer that displays and edits a collection of tags as inline
 * chips. The cell operates in one of two modes, decided per column:
 *
 *   1. **Free-text mode** (default — no `column.options`): users type new tags
 *      into an inline input. Tags are committed via Enter or comma. Backspace on
 *      an empty input removes the last tag. This is the original `tags` cell
 *      semantics.
 *
 *   2. **Multi-select mode** (when `column.options` is provided): users pick
 *      one or more values from a checkbox dropdown rendered below the cell —
 *      the multi-select counterpart of the dropdown ({@link StatusCell}) cell.
 *      Clicking outside the dropdown commits. Each chip has an inline `×` to
 *      remove without re-opening the picker, both in display and edit modes.
 *      `column.allowFreeText: true` additionally renders a free-text input
 *      inside the picker so ad-hoc tags can still be added on the same surface.
 *
 * Both modes serialise the cell value as `string[]` (or the option `value`
 * strings for multi-select), accept JSON-encoded arrays and comma-separated
 * legacy strings on read, and emit a plain string array on commit.
 *
 * @module TagsCell
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { CellValue, ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';
import * as styles from './TagsCell.styles';

/**
 * Props accepted by the {@link TagsCell} component.
 *
 * @typeParam TData - The shape of a single row in the datagrid. Defaults to a generic record.
 */
interface TagsCellProps<TData = Record<string, unknown>> {
  /** The raw cell value, which may be a string array, JSON-encoded array, or comma-separated string. */
  value: CellValue;
  /** The full row data object that this cell belongs to. */
  row: TData;
  /** Column definition providing metadata such as options and placeholder text. */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible datagrid. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /** Callback to persist the updated tag array when editing completes. */
  onCommit: (value: CellValue) => void;
  /** Callback to discard changes and exit edit mode. */
  onCancel: () => void;
}

/**
 * Normalizes a {@link CellValue} into an array of tag strings.
 *
 * Accepts arrays (mapped to strings), JSON-encoded arrays, or plain comma-separated
 * strings and returns a consistent `string[]` representation.
 *
 * @param value - The raw cell value to parse.
 * @returns An array of trimmed, non-empty tag strings.
 */
function parseTags(value: CellValue): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.length > 0) {
    // Attempt JSON deserialization first for structured data; fall back to comma splitting
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
 * A datagrid cell renderer for tag collections.
 *
 * See the module docstring for the two operating modes (free-text and
 * options-driven multi-select).
 *
 * @typeParam TData - Row data shape, defaults to `Record<string, unknown>`.
 *
 * @param props - The component props conforming to {@link TagsCellProps}.
 * @returns A React element showing tag chips and, when editing, either an
 *   inline text input or a checkbox picker depending on the column config.
 *
 * @example
 * Free-text mode:
 * ```tsx
 * <TagsCell value={['react', 'typescript']} column={{ id, field, title }} ... />
 * ```
 *
 * @example
 * Multi-select mode:
 * ```tsx
 * <TagsCell
 *   value={['frontend', 'urgent']}
 *   column={{
 *     id, field, title,
 *     options: [
 *       { value: 'frontend', label: 'Frontend' },
 *       { value: 'backend', label: 'Backend' },
 *       { value: 'urgent', label: 'Urgent', color: '#ef4444' },
 *     ],
 *   }}
 *   ...
 * />
 * ```
 */
export const TagsCell = React.memo(function TagsCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: TagsCellProps<TData>) {
  // Pick the operating mode based on whether the column carries an option list.
  // Options-driven mode renders a checkbox picker instead of a free-text input.
  const options: StatusOption[] = column.options ?? [];
  const isMultiSelect = options.length > 0;

  // Parse the incoming value once for display mode rendering.
  // useMemo keeps the array stable across re-renders so the chip key set
  // does not thrash when only display props change.
  const initialTags = useMemo(() => parseTags(value), [value]);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Outer container ref — used by multi-select mode to detect outside clicks
  // (which auto-commit, matching the {@link ChipSelectCell} contract).
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset local state whenever the cell enters edit mode. We also focus
  // the free-text input here; multi-select mode does not auto-focus the
  // picker because the picker uses checkboxes and label-clicks instead of
  // a single focusable target.
  useEffect(() => {
    if (isEditing) {
      setTags(parseTags(value));
      setInput('');
      if (!isMultiSelect) inputRef.current?.focus();
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Multi-select mode: clicking outside the cell while editing commits the
  // current selection — same UX as the checkbox-dropdown {@link ChipSelectCell}.
  useEffect(() => {
    if (!isEditing || !isMultiSelect) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCommit(tags);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isEditing, isMultiSelect, tags, onCommit]);

  /**
   * Appends a tag to the current set if it is non-empty and not already present.
   *
   * @param raw - The raw user input string to add as a tag.
   * @returns The updated tag array (unchanged if the tag was a duplicate or empty).
   */
  const addTag = (raw: string) => {
    const trimmed = raw.trim();
    // Prevent empty or duplicate tags from being added
    if (trimmed && !tags.includes(trimmed)) {
      const next = [...tags, trimmed];
      setTags(next);
      return next;
    }
    return tags;
  };

  /**
   * Removes a specific tag from the set.
   *
   * In display mode the removal auto-commits so the chip × works without
   * forcing the user into edit mode (per the issue spec). In edit mode the
   * removal stays local and is committed alongside the rest of the draft.
   *
   * @param tag - The tag string to remove.
   * @returns The updated tag array after removal.
   */
  const removeTag = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    if (!isEditing) onCommit(next);
    return next;
  };

  /**
   * Toggles a single option value in the multi-select draft.
   *
   * @param val - The option value to add or remove.
   */
  const toggleOption = (val: string) => {
    setTags((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  };

  /**
   * Handles keyboard interactions within the free-text tag input field.
   *
   * Enter and comma add the current input as a tag. An empty Enter commits the
   * entire set. Backspace on an empty input removes the last tag. Escape cancels.
   *
   * @param e - The keyboard event from the input element.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const next = addTag(input);
      setInput('');
      if (e.key === 'Enter' && !input.trim()) {
        // Empty Enter commits the current tag set
        onCommit(next);
      }
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      // Remove the last tag when backspacing from an empty input
      const next = tags.slice(0, -1);
      setTags(next);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  /**
   * Renders a single tag chip with optional remove button.
   *
   * @param tag - The raw tag value to display.
   * @param removable - Whether to show the close/remove button.
   * @returns A styled `<span>` element representing the chip.
   */
  const tagBadge = (tag: string, removable: boolean) => {
    // In multi-select mode resolve the user-facing label and colour from the
    // option list; fall back to the raw value for unknown / ad-hoc tags.
    const opt = isMultiSelect ? options.find((o) => o.value === tag) : undefined;
    const label = opt?.label ?? tag;
    const style = opt?.color ? { ...styles.tagBadge, background: opt.color, color: '#fff' } : styles.tagBadge;
    return (
      <span
        key={tag}
        data-testid={`tag-chip-${tag}`}
        style={style}
      >
        {label}
        {removable && (
          <button
            type="button"
            aria-label={`Remove tag ${label}`}
            data-testid={`tag-remove-${tag}`}
            onMouseDown={(e) => {
              // Prevent blur on the input so the cell stays in edit mode
              e.preventDefault();
              removeTag(tag);
            }}
            style={opt?.color ? { ...styles.tagRemoveButton, color: '#fff' } : styles.tagRemoveButton}
          >
            &times;
          </button>
        )}
      </span>
    );
  };

  // ---------------------------------------------------------------------
  // Display mode
  // ---------------------------------------------------------------------
  // Issue #94 calls for chips to be removable without opening the editor.
  // Display chips therefore expose the × button too (auto-commit on click).
  if (!isEditing) {
    return (
      <span ref={containerRef} style={styles.displayContainer}>
        {initialTags.map((tag) => tagBadge(tag, true))}
      </span>
    );
  }

  // ---------------------------------------------------------------------
  // Edit mode — multi-select picker (options-driven)
  // ---------------------------------------------------------------------
  if (isMultiSelect) {
    return (
      <div ref={containerRef} style={styles.editContainer}>
        {/* Selected chips render inline above the picker so the user can see */}
        {/* the current draft and remove items without opening menu items. */}
        <span style={styles.chipRow}>
          {tags.length === 0 ? (
            <span style={styles.placeholder}>
              {column.placeholder ?? 'Select...'}
            </span>
          ) : (
            tags.map((tag) => tagBadge(tag, true))
          )}
        </span>
        <div
          role="listbox"
          aria-label={`Select ${column.title ?? column.field}`}
          aria-multiselectable="true"
          style={styles.dropdown}
        >
          {options.map((opt) => {
            const checked = tags.includes(opt.value);
            return (
              <label
                key={opt.value}
                role="option"
                aria-selected={checked}
                data-testid={`tag-option-${opt.value}`}
                style={styles.optionLabel(checked)}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOption(opt.value)}
                  style={styles.checkbox}
                />
                {/* Colour swatch echoes the chip colour so the picker reads */}
                {/* the same as the rendered chip set. */}
                {opt.color && (
                  <span style={styles.optionSwatch(opt.color)} />
                )}
                {opt.label}
              </label>
            );
          })}
          {/* When the column also opts into free-text entry, a small input is */}
          {/* surfaced under the picker so users can add ad-hoc values without */}
          {/* leaving the same surface. */}
          {column.allowFreeText && (
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag(input);
                  setInput('');
                } else if (e.key === 'Escape') {
                  onCancel();
                }
              }}
              style={styles.tagInput}
              placeholder="Add tag..."
            />
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Edit mode — free-text input (legacy / no-options columns)
  // ---------------------------------------------------------------------
  return (
    <span ref={containerRef} style={styles.editContainer}>
      {tags.map((tag) => tagBadge(tag, true))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // On blur, add any pending input as a tag and commit the full set
          const next = input.trim() ? addTag(input) : tags;
          setInput('');
          onCommit(next);
        }}
        style={styles.tagInput}
        placeholder="Add tag..."
      />
    </span>
  );
}) as <TData = Record<string, unknown>>(props: TagsCellProps<TData>) => React.ReactElement;
