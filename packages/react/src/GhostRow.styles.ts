import type { CSSProperties } from 'react';

import { GhostRowPosition } from '@iasbuilt/datagrid-core';

export const aboveHeaderPosition: CSSProperties = {
  display: 'flex',
  position: 'relative',
  width: '100%',
};

export const stickyPosition = (pos: 'top' | 'bottom'): CSSProperties => ({
  display: 'flex',
  position: 'sticky',
  ...(pos === 'top' ? { top: 0 } : { bottom: 0 }),
  zIndex: 1,
  width: '100%',
});

export const absolutePosition = (topOffset: number): CSSProperties => ({
  display: 'flex',
  position: 'absolute',
  top: topOffset,
  width: '100%',
});

export const row = (
  positionStyle: CSSProperties,
  rowHeight: number,
): CSSProperties => ({
  ...positionStyle,
  height: rowHeight,
  borderBottom: '1px solid var(--dg-border-color, #e2e8f0)',
  background: 'var(--dg-ghost-row-bg, #fafafa)',
  opacity: 0.7,
});

export const cell = (width: number, rowHeight: number): CSSProperties => ({
  width,
  minWidth: width,
  maxWidth: width,
  height: rowHeight,
  display: 'flex',
  alignItems: 'center',
  padding: 'var(--dg-cell-padding, 0 12px)',
  borderRight: '1px solid var(--dg-border-color, #e2e8f0)',
  boxSizing: 'border-box',
  position: 'relative',
});

export const input = (hasError: boolean): CSSProperties => ({
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  padding: 0,
  font: 'inherit',
  background: 'transparent',
  fontStyle: 'italic',
  color: hasError ? 'var(--dg-error-color, #ef4444)' : 'inherit',
});

export const errorMessage: CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 4,
  fontSize: 10,
  color: 'var(--dg-error-color, #ef4444)',
};
