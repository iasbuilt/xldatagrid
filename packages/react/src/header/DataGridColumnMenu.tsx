/**
 * Per-column dropdown menu surfaced when the user clicks the column-
 * header chevron. Houses the hide / freeze / unfreeze affordances; the
 * column-filter dropdown lives in its own sibling component
 * (`DataGridColumnFilterMenu`) so this file stays scoped to layout
 * actions.
 *
 * The component is purely presentational — `menuState` from
 * `useGridInteraction` controls open/closed; clicks bubble back to the
 * parent via the callback props. Open state is gated on
 * `menuState.type === 'column'`, so opening any other menu type
 * automatically dismisses this one without bookkeeping code.
 *
 * @module DataGridColumnMenu
 */
import React from 'react';
import type { MenuState } from '../state';
import * as styles from './DataGridColumnMenu.styles';

/**
 * Props accepted by {@link DataGridColumnMenu}.
 *
 * `getColumnFrozen` is a pull-shaped resolver rather than a direct
 * `frozen` flag because the menu may be invoked on any column at any
 * time — passing the resolver lets the menu look up the live freeze
 * state at render rather than relying on a stale value snapshot.
 */
export interface DataGridColumnMenuProps {
  menuState: MenuState;
  headerHeight: number;
  hasColumnGroups: boolean;
  getColumnFrozen: (field: string) => 'left' | 'right' | null;
  onHide: (field: string) => void;
  onFreeze: (field: string) => void;
  onUnfreeze: (field: string) => void;
  onClose: () => void;
}

/**
 * Column menu component — short-circuits to `null` unless the
 * interaction state has the column menu open. See
 * {@link DataGridColumnMenuProps} for the contract.
 */
export function DataGridColumnMenu(props: DataGridColumnMenuProps) {
  const {
    menuState,
    headerHeight,
    hasColumnGroups,
    getColumnFrozen,
    onHide,
    onFreeze,
    onUnfreeze,
    onClose,
  } = props;

  if (menuState.type !== 'column') return null;

  const field = menuState.field;
  const frozen = getColumnFrozen(field);

  return (
    <div
      data-testid="column-header-menu"
      style={styles.columnHeaderMenu(headerHeight, hasColumnGroups)}
    >
      <div
        data-testid="column-menu-hide"
        style={styles.columnMenuItem}
        onClick={() => {
          onHide(field);
          onClose();
        }}
      >
        Hide Column
      </div>
      {frozen ? (
        <div
          data-testid="column-menu-unfreeze"
          style={styles.columnMenuItem}
          onClick={() => {
            onUnfreeze(field);
            onClose();
          }}
        >
          Unfreeze Column
        </div>
      ) : (
        <div
          data-testid="column-menu-freeze"
          style={styles.columnMenuItem}
          onClick={() => {
            onFreeze(field);
            onClose();
          }}
        >
          Freeze Column
        </div>
      )}
    </div>
  );
}
