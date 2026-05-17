/**
 * MUI upload cell renderer for the datagrid.
 *
 * Mirrors the contract exposed by the plain React `UploadCell`: when a
 * column declares an `onAttach` handler (see issue #91), file picks and
 * drops are routed through the handler, the in-flight state is shown via
 * `LinearProgress`, and errors surface with a retry affordance. When no
 * handler is wired, the cell falls back to the legacy "commit filename"
 * behaviour for backward compatibility.
 *
 * @module MuiUploadCell
 * @packageDocumentation
 */
import React, { useCallback, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type {
  AttachmentRef,
  CellValue,
  ColumnDef,
  UploadAttachContext,
  UploadAttachHandler,
} from '@iasbuilt/datagrid-core';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { hiddenFileInput } from './MuiUploadCell.styles';

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string; progress: number }
  | { kind: 'error'; fileName: string; message: string; file: File }
  | { kind: 'success'; fileName: string };

function resolveDisplay(value: CellValue): { name: string; ref: AttachmentRef | null } {
  if (value == null || value === '') return { name: '', ref: null };
  if (typeof value === 'string') return { name: value, ref: null };
  if (typeof value === 'object' && value !== null && 'id' in (value as object)) {
    const ref = value as unknown as AttachmentRef;
    return { name: ref.name ?? ref.id, ref };
  }
  return { name: String(value), ref: null };
}

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
 * MUI-based upload cell renderer using Button with LinearProgress indicator.
 */
export const MuiUploadCell = React.memo(function MuiUploadCell<TData = Record<string, unknown>>({
  value,
  row,
  column,
  rowId,
  onCommit,
}: CellRendererProps<TData>) {
  const { name: fileName, ref: currentRef } = resolveDisplay(value);
  const [isDragging, setIsDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onAttach = (column as ColumnDef<TData> & { onAttach?: UploadAttachHandler<TData> })
    .onAttach;
  const onDownload = (column as ColumnDef<TData> & {
    onDownload?: (ref: AttachmentRef | string) => void;
  }).onDownload;

  const runUpload = useCallback(
    async (file: File) => {
      const err = validate(file, column as { accept?: string[]; maxSize?: number });
      if (err) {
        setState({ kind: 'error', fileName: file.name, message: err, file });
        return;
      }
      if (!onAttach) {
        // Legacy path — preserve backward compatibility with pre-#91.
        setState({ kind: 'uploading', fileName: file.name, progress: 0 });
        setTimeout(() => {
          setState({ kind: 'success', fileName: file.name });
          onCommit(file.name);
        }, 200);
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

  const handleRetry = () => {
    if (state.kind === 'error') void runUpload(state.file);
  };

  const acceptAttr = column.accept && column.accept.length > 0 ? column.accept.join(',') : undefined;

  return (
    <Box
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      data-upload-state={state.kind}
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        border: isDragging ? '2px dashed' : '2px dashed transparent',
        borderColor: isDragging ? 'primary.main' : 'transparent',
        borderRadius: 1,
        p: isDragging ? 0.5 : 0,
        transition: 'border-color 0.15s',
      }}
    >
      {fileName ? (
        <Typography
          component="a"
          href="#"
          variant="body2"
          onClick={(e) => {
            e.preventDefault();
            onDownload?.(currentRef ?? fileName);
          }}
          sx={{
            color: 'primary.main',
            textDecoration: 'underline',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fileName}
        </Typography>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          {column.placeholder ?? 'No file'}
        </Typography>
      )}

      {state.kind === 'uploading' && (
        <Typography
          variant="caption"
          role="status"
          aria-live="polite"
          data-testid="mui-upload-cell-uploading"
          sx={{ color: 'primary.main' }}
        >
          Uploading {state.fileName}…
        </Typography>
      )}
      {state.kind === 'error' && (
        <Typography
          variant="caption"
          role="alert"
          data-testid="mui-upload-cell-error"
          title={state.message}
          sx={{ color: 'error.main', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {state.message}
        </Typography>
      )}
      {state.kind === 'success' && (
        <Typography
          variant="caption"
          role="status"
          data-testid="mui-upload-cell-success"
          sx={{ color: 'success.main' }}
        >
          Uploaded
        </Typography>
      )}

      <Button
        size="small"
        variant="outlined"
        onClick={() => fileInputRef.current?.click()}
        disabled={state.kind === 'uploading'}
        sx={{ fontSize: 11, minWidth: 0, px: 1, whiteSpace: 'nowrap' }}
      >
        {fileName ? 'Replace' : 'Upload'}
      </Button>
      {state.kind === 'error' && (
        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={handleRetry}
          aria-label="Retry upload"
          sx={{ fontSize: 11, minWidth: 0, px: 1, whiteSpace: 'nowrap' }}
        >
          Retry
        </Button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        aria-label="File input"
        accept={acceptAttr}
        onChange={handleInputChange}
        style={hiddenFileInput}
      />
      {state.kind === 'uploading' && (
        <LinearProgress
          variant={state.progress > 0 ? 'determinate' : 'indeterminate'}
          value={state.progress}
          sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2 }}
        />
      )}
    </Box>
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
