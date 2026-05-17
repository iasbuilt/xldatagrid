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
  | { type: 'set-column-group-order'; order: string[] };

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

    default:
      return state;
  }
}
