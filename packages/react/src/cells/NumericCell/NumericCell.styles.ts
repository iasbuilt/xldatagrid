import type { CSSProperties } from 'react';

export const displayValue: CSSProperties = {
  display: 'block',
  textAlign: 'right',
};

/**
 * Outer container for the dual-unit numeric cell (issue #92): stacks the
 * primary value and the secondary derived value vertically, preserving the
 * column's right-alignment.
 */
export const dualUnitContainer: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  lineHeight: 1.15,
  width: '100%',
};

/**
 * Visual styling for the secondary (derived) value line in a dual-unit cell.
 * Smaller and muted so it reads as supporting information.
 */
export const secondaryValue: CSSProperties = {
  display: 'block',
  textAlign: 'right',
  fontSize: '0.8em',
  opacity: 0.65,
};

export const editInput: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 0,
  outline: 'none',
  textAlign: 'right',
  boxSizing: 'border-box',
};
