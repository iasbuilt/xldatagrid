/**
 * UploadCell module for the datagrid component library.
 *
 * Provides a cell renderer for file attachment fields. Displays the current
 * attachment as a clickable download link (delegating to a column-level
 * `onDownload` handler) and offers both a button-triggered file picker and
 * drag-and-drop support for uploading or replacing the attached file.
 *
 * **Backend wiring (issue #91).** The cell is the grid-side surface only —
 * the actual storage / dedupe / scoped-inheritance logic lives in the
 * consumer's attachment service (e.g. the iasbuilt/webapp attachment system
 * from istracked/webapp#155). Consumers wire the cell to their backend by
 * supplying a column-level {@link ColumnDef.onAttach | onAttach} handler.
 * The cell:
 *
 *   1. Validates the picked / dropped file against `column.accept` and
 *      `column.maxSize` and short-circuits with an error if rejected.
 *   2. Surfaces an in-flight indicator (text + progress bar) while the
 *      handler is awaiting.
 *   3. On success: commits the returned {@link AttachmentRef} as the cell
 *      value and shows a transient success state.
 *   4. On failure: surfaces the rejection message, keeps the prior cell
 *      value intact, and exposes a "Retry" affordance so the same file
 *      can be re-attempted without re-picking.
 *
 * If no `onAttach` is wired, the cell falls back to the legacy behaviour
 * (commits the file name string) — preserving backward compatibility with
 * pre-#91 consumers.
 *
 * @module UploadCell
 */
import React, { useCallback, useRef, useState } from 'react';
import type {
  AttachmentRef,
  CellValue,
  ColumnDef,
  UploadAttachContext,
  UploadAttachHandler,
} from '@iasbuilt/datagrid-core';
import * as styles from './UploadCell.styles';

/**
 * Props accepted by the {@link UploadCell} component.
 *
 * @typeParam TData - The shape of a single row in the datagrid. Defaults to a generic record.
 */
interface UploadCellProps<TData = Record<string, unknown>> {
  /** The raw cell value — string (legacy), {@link AttachmentRef}, or null/undefined. */
  value: CellValue;
  /** The full row data object that this cell belongs to. */
  row: TData;
  /** Column definition providing `placeholder`, `onAttach`, `onDownload`, etc. */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible datagrid. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /** Callback to persist the new value (AttachmentRef on success, string in legacy mode). */
  onCommit: (value: CellValue) => void;
  /** Callback to discard changes and exit edit mode. */
  onCancel: () => void;
  /** Optional stable grid identifier — forwarded for parity with peer cells. */
  gridId?: string;
  /** Row identifier for this cell — used to build the CellAddress passed to onAttach. */
  rowId?: string;
}

/** Internal upload-lifecycle state for the cell. */
type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string; progress: number }
  | { kind: 'error'; fileName: string; message: string; file: File }
  | { kind: 'success'; fileName: string };

/**
 * Resolves the display name + (optional) attachment id from the cell value.
 *
 * Accepts the three legal shapes:
 *   - `null` / `undefined` / `''` → empty cell.
 *   - `string` → legacy "just the filename" value.
 *   - `AttachmentRef` (object with `id`) → post-onAttach value.
 */
function resolveDisplay(value: CellValue): { name: string; ref: AttachmentRef | null } {
  if (value == null || value === '') return { name: '', ref: null };
  if (typeof value === 'string') return { name: value, ref: null };
  if (typeof value === 'object' && value !== null && 'id' in (value as object)) {
    const ref = value as unknown as AttachmentRef;
    return { name: ref.name ?? ref.id, ref };
  }
  return { name: String(value), ref: null };
}

/**
 * Validates a single file against the column-level `accept` / `maxSize`
 * constraints. Returns a non-null error message when the file is rejected.
 */
function validate(file: File, column: { accept?: string[]; maxSize?: number }): string | null {
  if (column.maxSize != null && file.size > column.maxSize) {
    return `File exceeds max size (${column.maxSize} bytes)`;
  }
  if (column.accept && column.accept.length > 0) {
    const lowerName = file.name.toLowerCase();
    const ok = column.accept.some((spec) => {
      const s = spec.toLowerCase();
      if (s.startsWith('.')) return lowerName.endsWith(s);
      if (s.endsWith('/*')) return file.type.toLowerCase().startsWith(s.slice(0, -1));
      return file.type.toLowerCase() === s;
    });
    if (!ok) return `File type not accepted (got "${file.type || file.name}")`;
  }
  return null;
}

/**
 * A datagrid cell renderer for file upload fields with drag-and-drop support
 * and a typed `onAttach` hook for backend wiring.
 *
 * @typeParam TData - Row data shape, defaults to `Record<string, unknown>`.
 */
export const UploadCell = React.memo(function UploadCell<TData = Record<string, unknown>>({
  value,
  row,
  column,
  rowId,
  onCommit,
}: UploadCellProps<TData>) {
  const { name: fileName, ref: currentRef } = resolveDisplay(value);

  const [isDragging, setIsDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolve the optional column-level callbacks. We accept either the typed
  // `onAttach` / `onDownload` fields on ColumnDef or a legacy cast for
  // consumers still on the pre-#91 contract.
  const onAttach = (column as ColumnDef<TData> & { onAttach?: UploadAttachHandler<TData> })
    .onAttach;
  const onDownload = (column as ColumnDef<TData> & {
    onDownload?: (ref: AttachmentRef | string) => void;
  }).onDownload;

  /**
   * Performs the upload by invoking the column's `onAttach` handler, surfaces
   * the in-flight + outcome state, and commits the returned ref on success.
   * Falls back to the legacy "commit filename" behaviour when no handler is
   * wired.
   */
  const runUpload = useCallback(
    async (file: File) => {
      // Pre-flight validation
      const err = validate(file, column as { accept?: string[]; maxSize?: number });
      if (err) {
        setState({ kind: 'error', fileName: file.name, message: err, file });
        return;
      }
      // No handler wired → preserve legacy behaviour (commit the filename).
      if (!onAttach) {
        onCommit(file.name);
        setState({ kind: 'success', fileName: file.name });
        return;
      }
      setState({ kind: 'uploading', fileName: file.name, progress: 0 });
      const ctx: UploadAttachContext<TData> = {
        cell: { rowId: rowId ?? '', field: column.field },
        column,
        row,
      };
      try {
        const ref = await onAttach(file, ctx, (loaded, total) => {
          const pct = total && total > 0 ? Math.round((loaded / total) * 100) : 0;
          setState((prev) =>
            prev.kind === 'uploading' ? { ...prev, progress: pct } : prev,
          );
        });
        onCommit(ref as unknown as CellValue);
        setState({ kind: 'success', fileName: ref.name ?? file.name });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setState({ kind: 'error', fileName: file.name, message, file });
      }
    },
    [column, onAttach, onCommit, row, rowId],
  );

  /** Handle picker selection — resets the input so the same file can be re-picked. */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void runUpload(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void runUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleRetry = () => {
    if (state.kind === 'error') void runUpload(state.file);
  };

  const acceptAttr = column.accept && column.accept.length > 0 ? column.accept.join(',') : undefined;

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={styles.dropZone(isDragging)}
      data-upload-state={state.kind}
    >
      {/* File name as a download link, or placeholder text when no file is attached */}
      {fileName ? (
        <a
          href="#"
          role="link"
          aria-label={`Download ${fileName}`}
          onClick={(e) => {
            e.preventDefault();
            onDownload?.(currentRef ?? fileName);
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

      {/* Status badges — visible inline so e2e + AT can introspect them. */}
      {state.kind === 'uploading' && (
        <span
          role="status"
          aria-live="polite"
          data-testid="upload-cell-uploading"
          style={styles.statusUploading}
        >
          Uploading {state.fileName}…
        </span>
      )}
      {state.kind === 'error' && (
        <span
          role="alert"
          data-testid="upload-cell-error"
          title={state.message}
          style={styles.statusError}
        >
          {state.message}
        </span>
      )}
      {state.kind === 'success' && (
        <span
          role="status"
          data-testid="upload-cell-success"
          style={styles.statusSuccess}
        >
          Uploaded
        </span>
      )}

      {/* Upload / Replace button */}
      <button
        type="button"
        aria-label="Upload file"
        onClick={() => fileInputRef.current?.click()}
        disabled={state.kind === 'uploading'}
        style={styles.uploadButton}
      >
        {fileName ? 'Replace' : 'Upload'}
      </button>

      {/* Retry — only visible after a failed upload */}
      {state.kind === 'error' && (
        <button
          type="button"
          aria-label="Retry upload"
          onClick={handleRetry}
          style={styles.retryButton}
        >
          Retry
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        aria-label="File input"
        accept={acceptAttr}
        onChange={handleInputChange}
        style={styles.hiddenInput}
      />

      {/* Determinate progress bar while uploading */}
      {state.kind === 'uploading' && (
        <div role="progressbar" aria-label="Upload progress" style={styles.progressBar(state.progress)} />
      )}
    </div>
  );
}) as <TData = Record<string, unknown>>(props: UploadCellProps<TData>) => React.ReactElement;
