/**
 * UploadCell module for the datagrid component library.
 *
 * Provides a cell renderer for file attachment fields. Displays the current file name
 * as a clickable download link (delegating to an optional column-level download handler)
 * and offers both a button-triggered file picker and drag-and-drop support for uploading
 * or replacing the attached file.
 *
 * @module UploadCell
 */
import React, { useState, useRef } from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import * as styles from './UploadCell.styles';

/**
 * Props accepted by the {@link UploadCell} component.
 *
 * @typeParam TData - The shape of a single row in the datagrid. Defaults to a generic record.
 */
interface UploadCellProps<TData = Record<string, unknown>> {
  /** The raw cell value, expected to be a file name string or null/undefined. */
  value: CellValue;
  /** The full row data object that this cell belongs to. */
  row: TData;
  /** Column definition providing `placeholder` text and an optional `onDownload` handler. */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible datagrid. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /** Callback to persist the new file name when a file is selected or dropped. */
  onCommit: (value: CellValue) => void;
  /** Callback to discard changes and exit edit mode. */
  onCancel: () => void;
}

/**
 * A datagrid cell renderer for file upload fields with drag-and-drop support.
 *
 * Always renders an upload/replace button and a hidden file input. When a file name
 * is present, it appears as a download link. The cell supports drag-and-drop file
 * assignment with visual feedback (dashed border highlight). On file selection or drop,
 * the file's name is committed as the new cell value.
 *
 * @remarks
 * The download callback is extracted from the column definition via a typed cast to
 * `{ onDownload?: (fileName: string) => void }`, since the core `ColumnDef` type does
 * not natively include a download handler.
 *
 * @typeParam TData - Row data shape, defaults to `Record<string, unknown>`.
 *
 * @param props - The component props conforming to {@link UploadCellProps}.
 * @returns A React element showing the file link/placeholder, upload button, and drop zone.
 *
 * @example
 * ```tsx
 * <UploadCell
 *   value="report.pdf"
 *   row={rowData}
 *   column={columnDef}
 *   rowIndex={0}
 *   isEditing={false}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const UploadCell = React.memo(function UploadCell<TData = Record<string, unknown>>({
  value,
  column,
  onCommit,
}: UploadCellProps<TData>) {
  // Coerce the cell value to a string file name
  const fileName = value != null ? String(value) : '';
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract the optional download handler via a typed cast on the column definition
  const onDownload = (column as unknown as { onDownload?: (fileName: string) => void }).onDownload;

  /**
   * Processes a selected or dropped file by committing its name as the cell value.
   *
   * @param file - The File object from the input or drop event.
   */
  const handleFileChange = (file: File) => {
    onCommit(file.name);
  };

  /**
   * Handles the native file input's change event and resets the input afterwards
   * so the same file can be re-selected.
   *
   * @param e - The change event from the hidden file input.
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileChange(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  /**
   * Handles the drop event by extracting the first file and committing it.
   *
   * @param e - The drag event containing the dropped files.
   */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChange(file);
  };

  /**
   * Activates the drag-over visual indicator when a file is dragged over the cell.
   *
   * @param e - The drag event.
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  /**
   * Deactivates the drag-over visual indicator when the dragged file leaves the cell.
   */
  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={styles.dropZone(isDragging)}
    >
      {/* File name as a download link, or placeholder text when no file is attached */}
      {fileName ? (
        <a
          href="#"
          role="link"
          aria-label={`Download ${fileName}`}
          onClick={(e) => {
            e.preventDefault();
            onDownload?.(fileName);
          }}
          style={styles.fileLink}
        >
          {fileName}
        </a>
      ) : (
        <span style={styles.placeholder}>
          {column.placeholder ?? 'No file'}
        </span>
      )}
      {/* Upload/Replace button that triggers the hidden file input */}
      <button
        type="button"
        aria-label="Upload file"
        onClick={() => fileInputRef.current?.click()}
        style={styles.uploadButton}
      >
        {fileName ? 'Replace' : 'Upload'}
      </button>
      {/* Hidden file input element, opened programmatically by the button */}
      <input
        ref={fileInputRef}
        type="file"
        aria-label="File input"
        onChange={handleInputChange}
        style={styles.hiddenInput}
      />
    </div>
  );
}) as <TData = Record<string, unknown>>(props: UploadCellProps<TData>) => React.ReactElement;
