/**
 * Drag-and-drop file handling hook for the datagrid.
 *
 * Manages the full lifecycle of file drops onto the grid: visual drag-over
 * feedback, file validation (type and size), row/cell creation via the
 * {@link GridModel}, simulated upload progress tracking, cancellation via
 * Escape, and retry of failed uploads. Supports three drop target
 * granularities -- grid-wide, column-level, and individual cell -- each with
 * independent configuration.
 *
 * @module use-drag-drop
 */
import { useCallback, useRef, useState } from 'react';
import { GridModel, FileDropConfig, DropTarget } from '@iasbuilt/datagrid-core';

/**
 * Reactive state exposed by the {@link useDragDrop} hook, representing the
 * current drag-over visual state, validation errors, and in-flight upload
 * progress for each dropped file.
 */
export interface DragDropState {
  /** `true` while files are being dragged over the grid container. */
  isDragging: boolean;
  /** The specific drop target (grid / column / cell) currently hovered, or `null`. */
  dropTarget: DropTarget | null;
  /** Validation errors for files that were rejected during the last drop. */
  errors: Array<{ file: File; reason: string }>;
  /** Map of file IDs to their upload status, progress percentage, and original `File` handle. */
  uploads: Map<string, { file: File; progress: number; status: 'uploading' | 'complete' | 'failed' }>;
}

/**
 * Complete return value of {@link useDragDrop}, bundling reactive state,
 * DOM event handlers, and an imperative retry function.
 */
export interface UseDragDropResult {
  /** Current drag/drop/upload state. */
  state: DragDropState;
  /** DOM event handlers to spread onto the grid container element. */
  handlers: {
    /** Handles `dragenter`; activates the drag-over visual state. */
    onDragEnter: (e: React.DragEvent, target?: DropTarget) => void;
    /** Handles `dragover`; throttled to ~60 fps to prevent excessive re-renders. */
    onDragOver: (e: React.DragEvent) => void;
    /** Handles `dragleave`; deactivates drag-over state when the cursor exits. */
    onDragLeave: (e: React.DragEvent) => void;
    /** Handles `drop`; validates files and creates rows/cells via the model. */
    onDrop: (e: React.DragEvent, target?: DropTarget) => void;
    /** Handles `keydown`; pressing Escape cancels in-progress uploads. */
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
  /** Retries a previously failed upload by its file ID. */
  retryUpload: (fileId: string) => void;
}

/** Monotonically increasing counter for generating unique file identifiers. */
let fileIdCounter = 0;

/**
 * Generates a unique string identifier for a dropped file.
 *
 * @returns A string of the form `"file-{n}"` where `n` is a monotonically
 *   increasing integer.
 */
function nextFileId(): string {
  return `file-${++fileIdCounter}`;
}

/**
 * Validates a single file against the provided accept-list and size constraints.
 *
 * Checks are performed in order: MIME type / extension matching first, then
 * maximum file size. Column-level overrides take precedence over the
 * top-level {@link FileDropConfig} values when present.
 *
 * @param file - The `File` object to validate.
 * @param config - Global file-drop configuration with accept patterns and
 *   size limits.
 * @param columnConfig - Optional column-level overrides for `accept` and
 *   `maxFileSize`.
 *
 * @returns A human-readable error string if validation fails, or `null` if
 *   the file is acceptable.
 */
function validateFile(
  file: File,
  config: FileDropConfig,
  columnConfig?: { accept?: string[]; maxFileSize?: number },
): string | null {
  // Resolve effective constraints: column-level overrides win over global.
  const accept = columnConfig?.accept ?? config.accept;
  const maxSize = columnConfig?.maxFileSize ?? config.maxFileSize;

  // Check MIME type / extension against the accept list.
  if (accept && accept.length > 0) {
    const allowed = accept.some(pattern => {
      // ".ext" patterns match by file extension.
      if (pattern.startsWith('.')) {
        return file.name.toLowerCase().endsWith(pattern.toLowerCase());
      }
      // "type/*" wildcard patterns match the MIME type prefix.
      if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -1);
        return file.type.startsWith(prefix);
      }
      // Exact MIME type match.
      return file.type === pattern;
    });
    if (!allowed) {
      return `File type "${file.type || 'unknown'}" is not allowed. Accepted: ${accept.join(', ')}`;
    }
  }

  // Enforce maximum file size.
  if (maxSize != null && file.size > maxSize) {
    return `File "${file.name}" exceeds maximum size of ${maxSize} bytes`;
  }

  return null;
}

/**
 * Provides drag-and-drop file handling for a datagrid.
 *
 * Returns reactive state, a set of DOM event handlers to attach to the grid
 * container, and a `retryUpload` function for re-attempting failed uploads.
 * When files are dropped the hook validates each one, creates corresponding
 * rows or cell values via the {@link GridModel}, simulates upload progress,
 * and invokes the caller's `onFileDrop` / `onUploadComplete` callbacks.
 *
 * @remarks
 * The drag-enter/leave tracking uses a reference counter to handle nested
 * DOM elements correctly -- `dragenter` increments and `dragleave` decrements
 * so the drag-over state only clears when the cursor truly exits the
 * container boundary.
 *
 * @typeParam TData - Row data shape; must be a string-keyed record.
 *
 * @param model - The {@link GridModel} instance used to insert rows and set
 *   cell values when files are dropped.
 * @param config - Optional {@link FileDropConfig} controlling accepted file
 *   types, size limits, column-specific drop rules, and lifecycle callbacks.
 *
 * @returns A {@link UseDragDropResult} containing state, handlers, and the
 *   retry function.
 *
 * @example
 * ```tsx
 * const { state, handlers } = useDragDrop(model, {
 *   enabled: true,
 *   accept: ['image/*', '.pdf'],
 *   maxFileSize: 10_000_000,
 *   onFileDrop: (files, target) => console.log('Dropped', files, 'on', target),
 * });
 * return <div {...handlers}>{state.isDragging && <DropOverlay />}</div>;
 * ```
 */
export function useDragDrop<TData extends Record<string, unknown>>(
  model: GridModel<TData>,
  config?: FileDropConfig,
): UseDragDropResult {
  const [state, setState] = useState<DragDropState>({
    isDragging: false,
    dropTarget: null,
    errors: [],
    uploads: new Map(),
  });

  // Reference counter for nested dragenter/dragleave events.  Browsers fire
  // these events on every child element, so a simple boolean would flicker.
  const dragOverCountRef = useRef(0);

  // Timestamp of the last processed dragover event, used for throttling.
  const lastDragOverRef = useRef(0);

  // Mutable map of pending uploads, kept outside React state so that
  // setTimeout callbacks always reference the latest version.
  const pendingFilesRef = useRef<Map<string, { file: File; progress: number; status: 'uploading' | 'complete' | 'failed' }>>(new Map());

  // Optional callback for batch completion notification.
  const onDropCompleteRef = useRef<((results: Array<{ fileId: string; success: boolean }>) => void) | null>(null);

  /**
   * Handles `dragenter`: increments the enter/leave counter and activates
   * the drag-over visual state.
   */
  const onDragEnter = useCallback((e: React.DragEvent, target?: DropTarget) => {
    e.preventDefault();
    e.stopPropagation();
    if (!config?.enabled) return;
    // Reject drops on read-only grids.
    if ((model.getState().config as any).readOnly) return;

    dragOverCountRef.current++;
    const dropTarget = target ?? { type: 'grid' as const };
    setState(prev => ({ ...prev, isDragging: true, dropTarget }));
  }, [config, model]);

  /**
   * Handles `dragover`: prevents the browser default (which would reject the
   * drop) and throttles processing to ~60 fps to avoid excessive re-renders.
   */
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!config?.enabled) return;

    // Throttle drag over to prevent rapid re-renders (16ms ~ 60fps)
    const now = Date.now();
    if (now - lastDragOverRef.current < 16) return;
    lastDragOverRef.current = now;
  }, [config]);

  /**
   * Handles `dragleave`: decrements the enter/leave counter and clears the
   * drag-over state only when the counter reaches zero (cursor has truly
   * left the container).
   */
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!config?.enabled) return;

    dragOverCountRef.current--;
    if (dragOverCountRef.current <= 0) {
      dragOverCountRef.current = 0;
      setState(prev => ({ ...prev, isDragging: false, dropTarget: null }));
    }
  }, [config]);

  /**
   * Core file processing pipeline: validates each file, inserts rows or
   * sets cell values via the model, tracks upload progress, and fires
   * lifecycle callbacks.
   */
  const processFiles = useCallback((files: File[], target: DropTarget) => {
    if (!config) return;

    const errors: Array<{ file: File; reason: string }> = [];
    const validFiles: Array<{ file: File; id: string }> = [];

    // Get column-specific config if targeting a column
    const columnConfig = target.field ? config.columnDrop?.[target.field] : undefined;

    // Column-level rejection: if targeting a column not in columnDrop config,
    // and we have columnDrop configured, reject files on unconfigured columns
    if (target.type === 'column' && config.columnDrop && target.field && !config.columnDrop[target.field]) {
      for (const file of files) {
        errors.push({ file, reason: `Column "${target.field}" does not accept file drops` });
      }
      setState(prev => ({ ...prev, isDragging: false, dropTarget: null, errors }));
      return;
    }

    // Validate every dropped file against type and size constraints.
    for (const file of files) {
      const error = validateFile(file, config, columnConfig);
      if (error) {
        errors.push({ file, reason: error });
      } else {
        validFiles.push({ file, id: nextFileId() });
      }
    }

    // Start uploads for valid files by creating entries in the upload map.
    const newUploads = new Map(state.uploads);
    for (const { file, id } of validFiles) {
      newUploads.set(id, { file, progress: 0, status: 'uploading' });
    }
    pendingFilesRef.current = new Map(newUploads);

    setState(prev => ({
      ...prev,
      isDragging: false,
      dropTarget: null,
      errors,
      uploads: newUploads,
    }));

    // Process each valid file: create rows or set cell values depending
    // on the drop target granularity.
    for (const { file, id } of validFiles) {
      // Grid-level drop: create a new row populated with file metadata.
      if (target.type === 'grid') {
        const rowData: Record<string, unknown> = {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          lastModified: file.lastModified,
        };
        model.insertRow(model.getProcessedData().length, rowData);
      } else if (target.type === 'column' && target.field) {
        // Column-level drop: optionally create a row seeded with the file
        // name in the target column.
        const createRow = columnConfig?.createRow !== false;
        if (createRow) {
          const rowData: Record<string, unknown> = {
            [target.field]: file.name,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          };
          model.insertRow(model.getProcessedData().length, rowData);
        }
      } else if (target.type === 'cell' && target.field && target.rowId) {
        // Cell-level drop: set the cell value to the file name.
        model.setCellValue({ rowId: target.rowId, field: target.field }, file.name);

        // Check if this is a sub-grid cell that needs a nested row.
        if (config.cellDrop?.subGridField && target.field === config.cellDrop.subGridField) {
          // For sub-grid cells, insert a nested row with parent linkage.
          const nestedData: Record<string, unknown> = {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            parentRowId: target.rowId,
          };
          model.insertRow(model.getProcessedData().length, nestedData);
        }
      }

      // Notify the caller that upload has started for this file.
      config.onUploadProgress?.(id, 0);

      // Mark upload complete asynchronously (simulated -- real uploads would
      // stream progress updates here).
      setTimeout(() => {
        const uploads = new Map(pendingFilesRef.current);
        const entry = uploads.get(id);
        if (entry && entry.status === 'uploading') {
          uploads.set(id, { ...entry, progress: 100, status: 'complete' });
          pendingFilesRef.current = uploads;
          setState(prev => ({ ...prev, uploads: new Map(uploads) }));
          config.onUploadComplete?.(id, { success: true });
        }
      }, 0);
    }

    // Fire the aggregate onFileDrop callback with all valid files.
    const allFiles = validFiles.map(vf => vf.file);
    if (allFiles.length > 0) {
      config.onFileDrop?.(allFiles, target);
    }

    // Fire onDropComplete when all uploads finish (simulated via setTimeout).
    if (onDropCompleteRef.current && validFiles.length > 0) {
      setTimeout(() => {
        const results = validFiles.map(vf => ({ fileId: vf.id, success: true }));
        onDropCompleteRef.current?.(results);
      }, 0);
    }
  }, [config, model, state.uploads]);

  /**
   * Handles the `drop` event: extracts files from the `DataTransfer` and
   * delegates to {@link processFiles}.
   */
  const onDrop = useCallback((e: React.DragEvent, target?: DropTarget) => {
    e.preventDefault();
    e.stopPropagation();
    if (!config?.enabled) return;
    // Reject drops on read-only grids.
    if ((model.getState().config as any).readOnly) return;

    // Reset the enter/leave counter since the drop concludes the gesture.
    dragOverCountRef.current = 0;
    const files = Array.from(e.dataTransfer?.files ?? []);
    const dropTarget = target ?? { type: 'grid' as const };

    processFiles(files, dropTarget);
  }, [config, model, processFiles]);

  /**
   * Keyboard handler that cancels in-progress uploads when Escape is pressed.
   * Iterates over pending uploads and marks any that are still `'uploading'`
   * as `'failed'`.
   */
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Cancel in-progress uploads
      const uploads = new Map(pendingFilesRef.current);
      let cancelled = false;
      for (const [id, entry] of uploads) {
        if (entry.status === 'uploading') {
          uploads.set(id, { ...entry, status: 'failed' });
          cancelled = true;
        }
      }
      if (cancelled) {
        pendingFilesRef.current = uploads;
        setState(prev => ({ ...prev, uploads: new Map(uploads) }));
      }
    }
  }, []);

  /**
   * Re-attempts a previously failed upload by resetting its status to
   * `'uploading'` and simulating completion asynchronously.
   *
   * @param fileId - The unique identifier of the failed upload to retry.
   */
  const retryUpload = useCallback((fileId: string) => {
    const uploads = new Map(pendingFilesRef.current);
    const entry = uploads.get(fileId);
    // Only retry uploads that are in a failed state.
    if (!entry || entry.status !== 'failed') return;

    // Reset the entry to uploading and update state.
    uploads.set(fileId, { ...entry, progress: 0, status: 'uploading' });
    pendingFilesRef.current = uploads;
    setState(prev => ({ ...prev, uploads: new Map(uploads) }));

    // Simulate retry completing asynchronously.
    setTimeout(() => {
      const current = new Map(pendingFilesRef.current);
      const e = current.get(fileId);
      if (e && e.status === 'uploading') {
        current.set(fileId, { ...e, progress: 100, status: 'complete' });
        pendingFilesRef.current = current;
        setState(prev => ({ ...prev, uploads: new Map(current) }));
        config?.onUploadComplete?.(fileId, { success: true });
      }
    }, 0);
  }, [config]);

  return {
    state,
    handlers: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
      onKeyDown,
    },
    retryUpload,
  };
}
