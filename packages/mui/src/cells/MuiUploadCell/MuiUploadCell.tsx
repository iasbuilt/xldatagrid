/**
 * MUI upload cell renderer for the datagrid.
 *
 * @module MuiUploadCell
 * @packageDocumentation
 */
import React, { useState, useRef } from 'react';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { hiddenFileInput } from './MuiUploadCell.styles';

/**
 * MUI-based upload cell renderer using Button with LinearProgress indicator.
 */
export const MuiUploadCell = React.memo(function MuiUploadCell<TData = Record<string, unknown>>({
  value,
  column,
  onCommit,
}: CellRendererProps<TData>) {
  const fileName = value != null ? String(value) : '';
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDownload = (column as unknown as { onDownload?: (fileName: string) => void }).onDownload;

  const handleFileChange = (file: File) => {
    setUploading(true);
    // Simulate brief upload delay for visual feedback
    setTimeout(() => {
      setUploading(false);
      onCommit(file.name);
    }, 300);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileChange(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChange(file);
  };

  return (
    <Box
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      sx={{
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
            onDownload?.(fileName);
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
      <Button
        size="small"
        variant="outlined"
        onClick={() => fileInputRef.current?.click()}
        sx={{ fontSize: 11, minWidth: 0, px: 1, whiteSpace: 'nowrap' }}
      >
        {fileName ? 'Replace' : 'Upload'}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        aria-label="File input"
        onChange={handleInputChange}
        style={hiddenFileInput}
      />
      {uploading && (
        <LinearProgress sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2 }} />
      )}
    </Box>
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
