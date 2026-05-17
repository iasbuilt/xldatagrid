import type { CSSProperties } from 'react';

export const tagBadge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  padding: '1px 6px',
  borderRadius: 10,
  background: '#dbeafe',
  color: '#1e40af',
  fontSize: 12,
  whiteSpace: 'nowrap',
};

export const tagRemoveButton: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
  fontSize: 12,
  color: '#1e40af',
};

export const displayContainer: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
};

export const editContainer: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  alignItems: 'flex-start',
  minWidth: 80,
  position: 'relative',
};

export const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  alignItems: 'center',
};

export const placeholder: CSSProperties = {
  color: '#9ca3af',
  fontSize: 12,
};

export const tagInput: CSSProperties = {
  border: 'none',
  outline: 'none',
  minWidth: 60,
  flex: 1,
};

/**
 * Floating picker panel rendered when a multi-select TagsCell is in edit mode.
 * Mirrors the {@link ChipSelectCell} dropdown so the two cells share a visual
 * vocabulary — same offset, shadow, and option metrics.
 */
export const dropdown: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  zIndex: 1000,
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  padding: '4px 0',
  minWidth: 160,
  maxHeight: 240,
  overflowY: 'auto',
};

export const optionLabel = (checked: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: 13,
  background: checked ? '#eff6ff' : 'none',
});

export const checkbox: CSSProperties = {
  margin: 0,
};

export const optionSwatch = (color: string): CSSProperties => ({
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color,
});
