import type { CSSProperties } from 'react';

export const dropZone = (isDragging: boolean): CSSProperties => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  border: isDragging ? '2px dashed #2563eb' : '2px dashed transparent',
  borderRadius: 4,
  padding: isDragging ? 4 : 0,
  transition: 'border-color 0.15s',
});

export const fileLink: CSSProperties = {
  fontSize: 13,
  color: '#2563eb',
  textDecoration: 'underline',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const placeholder: CSSProperties = {
  color: '#9ca3af',
  fontSize: 13,
  flex: 1,
};

export const uploadButton: CSSProperties = {
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: '#f9fafb',
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 11,
  whiteSpace: 'nowrap',
};

export const retryButton: CSSProperties = {
  border: '1px solid #fecaca',
  borderRadius: 4,
  background: '#fef2f2',
  color: '#b91c1c',
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 11,
  whiteSpace: 'nowrap',
};

export const hiddenInput: CSSProperties = {
  display: 'none',
};

export const statusUploading: CSSProperties = {
  fontSize: 11,
  color: '#2563eb',
  marginLeft: 4,
};

export const statusError: CSSProperties = {
  fontSize: 11,
  color: '#b91c1c',
  marginLeft: 4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 160,
};

export const statusSuccess: CSSProperties = {
  fontSize: 11,
  color: '#15803d',
  marginLeft: 4,
};

export const progressBar = (pct: number): CSSProperties => ({
  position: 'absolute',
  bottom: 0,
  left: 0,
  height: 2,
  width: `${Math.min(100, Math.max(0, pct))}%`,
  background: '#2563eb',
  transition: 'width 0.15s',
});
