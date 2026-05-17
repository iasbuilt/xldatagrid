import type { CSSProperties } from 'react';

export const container: CSSProperties = { position: 'relative', display: 'inline-block' };

export const badgeButton = (editing: boolean): CSSProperties => ({
  cursor: editing ? 'pointer' : 'default',
});

export const badge = (color?: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 12,
  fontSize: 12,
  background: color ?? '#e5e7eb',
  color: '#111',
});

export const colorDot = (color: string): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
});

export const dropdown: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  zIndex: 1000,
  background: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  minWidth: 140,
  outline: 'none',
};

export const optionRow = (active: boolean): CSSProperties => ({
  padding: '6px 10px',
  cursor: 'pointer',
  background: active ? '#f3f4f6' : undefined,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
});

export const optionSwatch = (color: string): CSSProperties => ({
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
});

// ---------------------------------------------------------------------------
// Editable-dropdown affordances (see GitHub #93)
// ---------------------------------------------------------------------------

/** Trailing × button shown per-option when delete is authorised. */
export const deleteButton: CSSProperties = {
  marginLeft: 6,
  padding: '0 4px',
  border: 'none',
  background: 'transparent',
  color: '#6b7280',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  borderRadius: 4,
};

/** Container row for the inline "Add new…" affordance. */
export const addRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 6px 6px 10px',
  borderTop: '1px solid #e5e7eb',
  background: '#fafafa',
};

export const addInput: CSSProperties = {
  flex: 1,
  padding: '4px 6px',
  fontSize: 12,
  border: '1px solid #d1d5db',
  borderRadius: 4,
  outline: 'none',
};

export const addButton = (enabled: boolean): CSSProperties => ({
  padding: '4px 8px',
  fontSize: 12,
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: enabled ? '#2563eb' : '#e5e7eb',
  color: enabled ? '#fff' : '#9ca3af',
  cursor: enabled ? 'pointer' : 'not-allowed',
});
