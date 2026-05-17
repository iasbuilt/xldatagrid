// ---------------------------------------------------------------------------
// Grid Interaction State — replaces 12 individual useState calls in DataGrid
// with a single useReducer backed by a pure reducer function.
// ---------------------------------------------------------------------------

// ---- Discriminated union types for sub-states ----

export type ColumnDragState =
  | { type: 'idle' }
  | { type: 'dragging'; field: string; overField: string | null };

export type ColumnGroupDragState =
  | { type: 'idle' }
  | { type: 'dragging'; groupId: string; overGroupId: string | null };

export type ResizeState =
  | { type: 'idle' }
  | { type: 'resizing'; field: string; startX: number; startWidth: number };

export type MenuState =
  | { type: 'closed' }
  | { type: 'context'; x: number; y: number; rowId: string | null; field: string | null }
  | { type: 'column'; field: string }
  | { type: 'columnVisibility' };

export type RowDragState =
  | { type: 'idle' }
  | { type: 'dragging'; sourceRowId: string; sourceIndex: number };

/**
 * Anchor rect captured at the moment the Excel filter dropdown opens.
 * Stored as plain numbers (rather than a live DOMRect) so the popup
 * positioning is decoupled from the header button's layout lifecycle.
 */
export interface FilterMenuAnchor {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export type FilterMenuState =
  | { type: 'closed' }
  | { type: 'open'; field: string; anchor: FilterMenuAnchor };

export type ConditionDialogState =
  | { type: 'closed' }
  | { type: 'open'; field: string };

// ---- Combined state ----

export interface GridInteractionState {
  menu: MenuState;
  columnDrag: ColumnDragState;
  columnGroupDrag: ColumnGroupDragState;
  resize: ResizeState;
  columnWidthOverrides: Record<string, number>;
  columnOrderOverride: string[] | null;
  columnGroupOrder: string[] | null;
  hiddenColumns: Set<string>;
  frozenOverrides: Record<string, 'left' | 'right' | null>;
  collapsedColumnGroups: Set<string>;
  // Phase-3 follow-up (issue #106): the four ex-useState holders that
  // also track "grid-domain interaction state" now live on the same
  // node as menu/columnDrag/resize so SPA-side derivations can read
  // them atomically alongside the rest.
  rowGroupExpanded: Set<string>;
  rowDrag: RowDragState;
  filterMenu: FilterMenuState;
  conditionDialog: ConditionDialogState;
}

export const initialGridInteractionState: GridInteractionState = {
  menu: { type: 'closed' },
  columnDrag: { type: 'idle' },
  columnGroupDrag: { type: 'idle' },
  resize: { type: 'idle' },
  columnWidthOverrides: {},
  columnOrderOverride: null,
  columnGroupOrder: null,
  hiddenColumns: new Set(),
  frozenOverrides: {},
  collapsedColumnGroups: new Set(),
  rowGroupExpanded: new Set(),
  rowDrag: { type: 'idle' },
  filterMenu: { type: 'closed' },
  conditionDialog: { type: 'closed' },
};

// ---- Action union ----

export type GridInteractionAction =
  | { type: 'open-context-menu'; x: number; y: number; rowId: string | null; field: string | null }
  | { type: 'open-column-menu'; field: string }
  | { type: 'open-column-visibility-menu' }
  | { type: 'close-menu' }
  | { type: 'start-column-drag'; field: string }
  | { type: 'update-column-drag-over'; overField: string }
  | { type: 'drop-column'; currentOrder: string[] }
  | { type: 'end-column-drag' }
  | { type: 'start-column-group-drag'; groupId: string }
  | { type: 'update-column-group-drag-over'; overGroupId: string }
  | { type: 'drop-column-group'; currentGroupOrder: string[] }
  | { type: 'end-column-group-drag' }
  | { type: 'start-resize'; field: string; startX: number; startWidth: number }
  | { type: 'end-resize' }
  | { type: 'set-column-width'; field: string; width: number }
  | { type: 'hide-column'; field: string }
  | { type: 'show-column'; field: string }
  | { type: 'freeze-column'; field: string; position: 'left' | 'right' }
  | { type: 'unfreeze-column'; field: string }
  | { type: 'toggle-column-group-collapse'; groupId: string }
  | { type: 'set-column-order'; order: string[] }
  | { type: 'set-column-group-order'; order: string[] }
  // Row grouping — caller-driven expand/collapse of grouped rows.
  | { type: 'toggle-row-group'; groupId: string }
  | { type: 'set-row-group-expanded'; expanded: Set<string> }
  // Row drag — active row-reorder session.
  | { type: 'start-row-drag'; sourceRowId: string; sourceIndex: number }
  | { type: 'end-row-drag' }
  // Excel-style column filter menu.
  | { type: 'open-filter-menu'; field: string; anchor: FilterMenuAnchor }
  | { type: 'close-filter-menu' }
  // "Custom filter…" condition dialog.
  | { type: 'open-condition-dialog'; field: string }
  | { type: 'close-condition-dialog' };

// ---- Helpers ----

function reorder(list: string[], from: string, to: string): string[] {
  const next = list.filter((item) => item !== from);
  const targetIdx = next.indexOf(to);
  if (targetIdx === -1) return list;
  next.splice(targetIdx, 0, from);
  return next;
}

// ---- Reducer ----

export function gridInteractionReducer(
  state: GridInteractionState,
  action: GridInteractionAction,
): GridInteractionState {
  switch (action.type) {
    // -- Menu actions --
    case 'open-context-menu':
      return {
        ...state,
        menu: { type: 'context', x: action.x, y: action.y, rowId: action.rowId, field: action.field },
      };

    case 'open-column-menu':
      return {
        ...state,
        menu: { type: 'column', field: action.field },
      };

    case 'open-column-visibility-menu':
      return {
        ...state,
        menu: { type: 'columnVisibility' },
      };

    case 'close-menu':
      // Short-circuit when no menu is open — returning prev state lets the
      // causl-backed `dispatch` skip the commit entirely (and useReducer
      // skips the re-render), avoiding noise commits like the menu-closes-
      // on-outside-click handler firing once per click in a no-op scenario.
      if (state.menu.type === 'closed') return state;
      return {
        ...state,
        menu: { type: 'closed' },
      };

    // -- Column drag actions --
    case 'start-column-drag':
      return {
        ...state,
        columnDrag: { type: 'dragging', field: action.field, overField: null },
      };

    case 'update-column-drag-over':
      if (state.columnDrag.type !== 'dragging') return state;
      return {
        ...state,
        columnDrag: { ...state.columnDrag, overField: action.overField },
      };

    case 'drop-column': {
      if (state.columnDrag.type !== 'dragging' || state.columnDrag.overField === null) {
        return { ...state, columnDrag: { type: 'idle' } };
      }
      const newOrder = reorder(
        action.currentOrder,
        state.columnDrag.field,
        state.columnDrag.overField,
      );
      return {
        ...state,
        columnDrag: { type: 'idle' },
        columnOrderOverride: newOrder,
      };
    }

    case 'end-column-drag':
      return {
        ...state,
        columnDrag: { type: 'idle' },
      };

    // -- Column group drag actions --
    case 'start-column-group-drag':
      return {
        ...state,
        columnGroupDrag: { type: 'dragging', groupId: action.groupId, overGroupId: null },
      };

    case 'update-column-group-drag-over':
      if (state.columnGroupDrag.type !== 'dragging') return state;
      return {
        ...state,
        columnGroupDrag: { ...state.columnGroupDrag, overGroupId: action.overGroupId },
      };

    case 'drop-column-group': {
      if (
        state.columnGroupDrag.type !== 'dragging' ||
        state.columnGroupDrag.overGroupId === null
      ) {
        return { ...state, columnGroupDrag: { type: 'idle' } };
      }
      const newGroupOrder = reorder(
        action.currentGroupOrder,
        state.columnGroupDrag.groupId,
        state.columnGroupDrag.overGroupId,
      );
      return {
        ...state,
        columnGroupDrag: { type: 'idle' },
        columnGroupOrder: newGroupOrder,
      };
    }

    case 'end-column-group-drag':
      return {
        ...state,
        columnGroupDrag: { type: 'idle' },
      };

    // -- Resize actions --
    case 'start-resize':
      return {
        ...state,
        resize: {
          type: 'resizing',
          field: action.field,
          startX: action.startX,
          startWidth: action.startWidth,
        },
      };

    case 'end-resize':
      return {
        ...state,
        resize: { type: 'idle' },
      };

    // -- Column width --
    case 'set-column-width':
      return {
        ...state,
        columnWidthOverrides: { ...state.columnWidthOverrides, [action.field]: action.width },
      };

    // -- Column visibility --
    case 'hide-column': {
      const next = new Set(state.hiddenColumns);
      next.add(action.field);
      return { ...state, hiddenColumns: next };
    }

    case 'show-column': {
      const next = new Set(state.hiddenColumns);
      next.delete(action.field);
      return { ...state, hiddenColumns: next };
    }

    // -- Frozen columns --
    case 'freeze-column':
      return {
        ...state,
        frozenOverrides: { ...state.frozenOverrides, [action.field]: action.position },
      };

    case 'unfreeze-column':
      return {
        ...state,
        frozenOverrides: { ...state.frozenOverrides, [action.field]: null },
      };

    // -- Column group collapse --
    case 'toggle-column-group-collapse': {
      const next = new Set(state.collapsedColumnGroups);
      if (next.has(action.groupId)) {
        next.delete(action.groupId);
      } else {
        next.add(action.groupId);
      }
      return { ...state, collapsedColumnGroups: next };
    }

    // -- Column order --
    case 'set-column-order':
      return {
        ...state,
        columnOrderOverride: action.order,
      };

    case 'set-column-group-order':
      return {
        ...state,
        columnGroupOrder: action.order,
      };

    // -- Row group expand/collapse --
    case 'toggle-row-group': {
      const next = new Set(state.rowGroupExpanded);
      if (next.has(action.groupId)) {
        next.delete(action.groupId);
      } else {
        next.add(action.groupId);
      }
      return { ...state, rowGroupExpanded: next };
    }

    case 'set-row-group-expanded':
      return { ...state, rowGroupExpanded: action.expanded };

    // -- Row drag --
    case 'start-row-drag':
      return {
        ...state,
        rowDrag: {
          type: 'dragging',
          sourceRowId: action.sourceRowId,
          sourceIndex: action.sourceIndex,
        },
      };

    case 'end-row-drag':
      // No-op short-circuit so the no-op end (e.g. a stray drop outside a
      // valid target) does not generate a dead causl commit.
      if (state.rowDrag.type === 'idle') return state;
      return { ...state, rowDrag: { type: 'idle' } };

    // -- Excel filter menu --
    case 'open-filter-menu':
      return {
        ...state,
        filterMenu: { type: 'open', field: action.field, anchor: action.anchor },
      };

    case 'close-filter-menu':
      if (state.filterMenu.type === 'closed') return state;
      return { ...state, filterMenu: { type: 'closed' } };

    // -- Condition dialog --
    case 'open-condition-dialog':
      return {
        ...state,
        conditionDialog: { type: 'open', field: action.field },
      };

    case 'close-condition-dialog':
      if (state.conditionDialog.type === 'closed') return state;
      return { ...state, conditionDialog: { type: 'closed' } };

    default:
      return state;
  }
}
