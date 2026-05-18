/**
 * Per-row controls cell rendered inside the optional chrome controls
 * column (the leftmost "actions" gutter).
 *
 * Each {@link ControlAction} declared in the grid's `chrome.controls`
 * config renders as a button whose icon / label comes from the action
 * itself; `onClick` is invoked with the row id + row index so the
 * consumer can route to row-scoped operations (delete, expand,
 * inspect, …). The cell stops event propagation on the button so a
 * row-level `onClick` (selection, master-detail) does not also fire.
 *
 * @module ChromeControlsCell
 */
import React from 'react';
import type { CSSProperties } from 'react';
import type { ControlAction } from '@iasbuilt/datagrid-core';
import * as styles from './ChromeColumn.styles';

/**
 * Props accepted by {@link ChromeControlsCell}. The width / height
 * dimensions are passed down from the parent grid so the cell can
 * resize alongside the rest of the chrome layout without measuring
 * the DOM.
 */
export interface ChromeControlsCellProps {
  actions: ControlAction[];
  rowId: string;
  rowIndex: number;
  width: number;
  height: number;
}

const containerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  overflow: 'hidden',
  maxWidth: '100%',
  width: '100%',
};

/**
 * Renders the controls gutter for a single row. See
 * {@link ChromeControlsCellProps} for the contract.
 */
export function ChromeControlsCell(props: ChromeControlsCellProps) {
  const { actions, rowId, rowIndex, width, height } = props;

  return (
    <div
      style={styles.controlsCell(width, height)}
      role="cell"
      data-testid="chrome-controls-cell"
      aria-label="Row controls"
    >
      <div style={containerStyle}>
        {actions.map(action => {
          const content = action.render
            ? (action.render(rowId, rowIndex) as React.ReactNode)
            : action.label;

          return (
            <button
              key={action.key}
              style={styles.actionButton}
              aria-label={action.label}
              data-testid={`chrome-action-${action.key}`}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick?.(rowId, rowIndex);
              }}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
