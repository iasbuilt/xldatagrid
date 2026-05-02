import React from 'react';
import type { CSSProperties } from 'react';
import type { ControlAction } from '@iasbuilt/datagrid-core';
import * as styles from './ChromeColumn.styles';

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
