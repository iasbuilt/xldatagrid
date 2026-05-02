/**
 * TagsCell module for the datagrid component library.
 *
 * Provides a cell renderer that displays and edits a collection of tags as inline badges.
 * In display mode, tags appear as read-only colored pills. In edit mode, users can type
 * new tags (committed via Enter or comma), remove existing tags with backspace or the
 * remove button, and confirm the full set by pressing Enter on an empty input or blurring.
 *
 * @module TagsCell
 */
import React, { useState, useRef, useEffect } from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
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
 * Renders tags as small colored badges in both display and edit modes. During editing,
 * an inline text input allows adding tags via Enter or comma keystrokes. Tags are
 * deduplicated on insertion and can be removed individually or via backspace.
 *
 * @typeParam TData - Row data shape, defaults to `Record<string, unknown>`.
 *
 * @param props - The component props conforming to {@link TagsCellProps}.
 * @returns A React element showing tag badges and, when editing, an inline input.
 *
 * @example
 * ```tsx
 * <TagsCell
 *   value={['react', 'typescript']}
 *   row={rowData}
 *   column={columnDef}
 *   rowIndex={0}
 *   isEditing={false}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const TagsCell = React.memo(function TagsCell<TData = Record<string, unknown>>({
  value,
  isEditing,
  onCommit,
  onCancel,
}: TagsCellProps<TData>) {
  // Parse the incoming value once for display mode rendering
  const initialTags = parseTags(value);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset local state and focus the input whenever the cell enters edit mode
  useEffect(() => {
    if (isEditing) {
      setTags(parseTags(value));
      setInput('');
      inputRef.current?.focus();
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

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
   * Removes a specific tag from the set and commits immediately if not in edit mode.
   *
   * @param tag - The tag string to remove.
   * @returns The updated tag array after removal.
   */
  const removeTag = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    // Auto-commit removals that happen outside of active editing (e.g. badge close button)
    if (!isEditing) onCommit(next);
    return next;
  };

  /**
   * Handles keyboard interactions within the tag input field.
   *
   * Enter and comma add the current input as a tag. An empty Enter commits the entire
   * set. Backspace on an empty input removes the last tag. Escape cancels editing.
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
   * Renders a single tag badge with optional remove button.
   *
   * @param tag - The tag text to display.
   * @param removable - Whether to show the close/remove button.
   * @returns A styled `<span>` element representing the tag.
   */
  const tagBadge = (tag: string, removable: boolean) => (
    <span
      key={tag}
      style={styles.tagBadge}
    >
      {tag}
      {removable && (
        <button
          type="button"
          aria-label={`Remove tag ${tag}`}
          onMouseDown={(e) => {
            // Prevent blur on the input so the cell stays in edit mode
            e.preventDefault();
            removeTag(tag);
          }}
          style={styles.tagRemoveButton}
        >
          &times;
        </button>
      )}
    </span>
  );

  // Display mode: render tags as non-removable badges
  if (!isEditing) {
    return (
      <span style={styles.displayContainer}>
        {initialTags.map((tag) => tagBadge(tag, false))}
      </span>
    );
  }

  // Edit mode: render removable badges plus an inline input for adding new tags
  return (
    <span style={styles.editContainer}>
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
