import {
  gridInteractionReducer,
  initialGridInteractionState,
  type GridInteractionState,
} from '../../state';

const reduce = gridInteractionReducer;
const init = initialGridInteractionState;

describe('gridInteractionReducer', () => {
  // ---- Initial state ----

  it('has all sub-states idle / closed by default', () => {
    expect(init.menu).toEqual({ type: 'closed' });
    expect(init.columnDrag).toEqual({ type: 'idle' });
    expect(init.columnGroupDrag).toEqual({ type: 'idle' });
    expect(init.resize).toEqual({ type: 'idle' });
    expect(init.columnWidthOverrides).toEqual({});
    expect(init.columnOrderOverride).toBeNull();
    expect(init.columnGroupOrder).toBeNull();
    expect(init.hiddenColumns).toEqual(new Set());
    expect(init.frozenOverrides).toEqual({});
    expect(init.collapsedColumnGroups).toEqual(new Set());
    expect(init.rowGroupExpanded).toEqual(new Set());
    expect(init.rowDrag).toEqual({ type: 'idle' });
    expect(init.filterMenu).toEqual({ type: 'closed' });
    expect(init.conditionDialog).toEqual({ type: 'closed' });
  });

  // ---- Menu actions ----

  describe('menu', () => {
    it('open-context-menu sets menu to context type with coordinates', () => {
      const next = reduce(init, {
        type: 'open-context-menu',
        x: 100,
        y: 200,
        rowId: 'row-1',
        field: 'name',
      });
      expect(next.menu).toEqual({
        type: 'context',
        x: 100,
        y: 200,
        rowId: 'row-1',
        field: 'name',
      });
    });

    it('open-column-menu sets menu to column type', () => {
      const next = reduce(init, { type: 'open-column-menu', field: 'age' });
      expect(next.menu).toEqual({ type: 'column', field: 'age' });
    });

    it('open-column-visibility-menu sets menu to columnVisibility type', () => {
      const next = reduce(init, { type: 'open-column-visibility-menu' });
      expect(next.menu).toEqual({ type: 'columnVisibility' });
    });

    it('close-menu resets menu to closed', () => {
      const withMenu = reduce(init, { type: 'open-column-menu', field: 'age' });
      const next = reduce(withMenu, { type: 'close-menu' });
      expect(next.menu).toEqual({ type: 'closed' });
    });

    it('opening a menu closes a previously open menu', () => {
      const withContext = reduce(init, {
        type: 'open-context-menu',
        x: 10,
        y: 20,
        rowId: null,
        field: null,
      });
      expect(withContext.menu.type).toBe('context');

      const withColumn = reduce(withContext, { type: 'open-column-menu', field: 'name' });
      expect(withColumn.menu).toEqual({ type: 'column', field: 'name' });
    });
  });

  // ---- Column drag ----

  describe('column drag', () => {
    it('start-column-drag transitions from idle to dragging', () => {
      const next = reduce(init, { type: 'start-column-drag', field: 'name' });
      expect(next.columnDrag).toEqual({ type: 'dragging', field: 'name', overField: null });
    });

    it('update-column-drag-over updates the overField', () => {
      const dragging = reduce(init, { type: 'start-column-drag', field: 'name' });
      const next = reduce(dragging, { type: 'update-column-drag-over', overField: 'age' });
      expect(next.columnDrag).toEqual({ type: 'dragging', field: 'name', overField: 'age' });
    });

    it('update-column-drag-over is a no-op when not dragging', () => {
      const next = reduce(init, { type: 'update-column-drag-over', overField: 'age' });
      expect(next.columnDrag).toEqual({ type: 'idle' });
    });

    it('drop-column computes new column order and resets drag to idle', () => {
      let state = reduce(init, { type: 'start-column-drag', field: 'b' });
      state = reduce(state, { type: 'update-column-drag-over', overField: 'd' });
      state = reduce(state, {
        type: 'drop-column',
        currentOrder: ['a', 'b', 'c', 'd', 'e'],
      });
      expect(state.columnDrag).toEqual({ type: 'idle' });
      expect(state.columnOrderOverride).toEqual(['a', 'c', 'b', 'd', 'e']);
    });

    it('drop-column with no overField resets drag without changing order', () => {
      let state = reduce(init, { type: 'start-column-drag', field: 'b' });
      state = reduce(state, {
        type: 'drop-column',
        currentOrder: ['a', 'b', 'c'],
      });
      expect(state.columnDrag).toEqual({ type: 'idle' });
      expect(state.columnOrderOverride).toBeNull();
    });

    it('end-column-drag resets drag to idle without changing order', () => {
      let state = reduce(init, { type: 'start-column-drag', field: 'name' });
      state = reduce(state, { type: 'update-column-drag-over', overField: 'age' });
      state = reduce(state, { type: 'end-column-drag' });
      expect(state.columnDrag).toEqual({ type: 'idle' });
      expect(state.columnOrderOverride).toBeNull();
    });
  });

  // ---- Column group drag ----

  describe('column group drag', () => {
    it('start-column-group-drag transitions to dragging', () => {
      const next = reduce(init, { type: 'start-column-group-drag', groupId: 'g1' });
      expect(next.columnGroupDrag).toEqual({ type: 'dragging', groupId: 'g1', overGroupId: null });
    });

    it('update-column-group-drag-over updates overGroupId', () => {
      let state = reduce(init, { type: 'start-column-group-drag', groupId: 'g1' });
      state = reduce(state, { type: 'update-column-group-drag-over', overGroupId: 'g2' });
      expect(state.columnGroupDrag).toEqual({
        type: 'dragging',
        groupId: 'g1',
        overGroupId: 'g2',
      });
    });

    it('update-column-group-drag-over is a no-op when not dragging', () => {
      const next = reduce(init, { type: 'update-column-group-drag-over', overGroupId: 'g2' });
      expect(next.columnGroupDrag).toEqual({ type: 'idle' });
    });

    it('drop-column-group computes new group order and resets drag', () => {
      let state = reduce(init, { type: 'start-column-group-drag', groupId: 'g3' });
      state = reduce(state, { type: 'update-column-group-drag-over', overGroupId: 'g1' });
      state = reduce(state, {
        type: 'drop-column-group',
        currentGroupOrder: ['g1', 'g2', 'g3', 'g4'],
      });
      expect(state.columnGroupDrag).toEqual({ type: 'idle' });
      expect(state.columnGroupOrder).toEqual(['g3', 'g1', 'g2', 'g4']);
    });

    it('drop-column-group with no overGroupId resets drag without changing order', () => {
      let state = reduce(init, { type: 'start-column-group-drag', groupId: 'g1' });
      state = reduce(state, {
        type: 'drop-column-group',
        currentGroupOrder: ['g1', 'g2'],
      });
      expect(state.columnGroupDrag).toEqual({ type: 'idle' });
      expect(state.columnGroupOrder).toBeNull();
    });

    it('end-column-group-drag resets drag without changing order', () => {
      let state = reduce(init, { type: 'start-column-group-drag', groupId: 'g1' });
      state = reduce(state, { type: 'update-column-group-drag-over', overGroupId: 'g2' });
      state = reduce(state, { type: 'end-column-group-drag' });
      expect(state.columnGroupDrag).toEqual({ type: 'idle' });
      expect(state.columnGroupOrder).toBeNull();
    });
  });

  // ---- Column width ----

  describe('set-column-width', () => {
    it('adds a width override for a column', () => {
      const next = reduce(init, { type: 'set-column-width', field: 'name', width: 200 });
      expect(next.columnWidthOverrides).toEqual({ name: 200 });
    });

    it('updates an existing width override', () => {
      let state = reduce(init, { type: 'set-column-width', field: 'name', width: 200 });
      state = reduce(state, { type: 'set-column-width', field: 'name', width: 300 });
      expect(state.columnWidthOverrides).toEqual({ name: 300 });
    });

    it('preserves other width overrides', () => {
      let state = reduce(init, { type: 'set-column-width', field: 'name', width: 200 });
      state = reduce(state, { type: 'set-column-width', field: 'age', width: 100 });
      expect(state.columnWidthOverrides).toEqual({ name: 200, age: 100 });
    });
  });

  // ---- Column visibility ----

  describe('hide-column / show-column', () => {
    it('hide-column adds field to hiddenColumns', () => {
      const next = reduce(init, { type: 'hide-column', field: 'age' });
      expect(next.hiddenColumns.has('age')).toBe(true);
    });

    it('show-column removes field from hiddenColumns', () => {
      let state = reduce(init, { type: 'hide-column', field: 'age' });
      state = reduce(state, { type: 'show-column', field: 'age' });
      expect(state.hiddenColumns.has('age')).toBe(false);
    });

    it('show-column on non-hidden field is a no-op', () => {
      const next = reduce(init, { type: 'show-column', field: 'age' });
      expect(next.hiddenColumns.has('age')).toBe(false);
    });

    it('does not mutate the original set', () => {
      const first = reduce(init, { type: 'hide-column', field: 'a' });
      const second = reduce(first, { type: 'hide-column', field: 'b' });
      expect(first.hiddenColumns.has('b')).toBe(false);
      expect(second.hiddenColumns.has('a')).toBe(true);
      expect(second.hiddenColumns.has('b')).toBe(true);
    });
  });

  // ---- Frozen columns ----

  describe('freeze-column / unfreeze-column', () => {
    it('freeze-column sets frozen override to the given position', () => {
      const next = reduce(init, { type: 'freeze-column', field: 'name', position: 'left' });
      expect(next.frozenOverrides).toEqual({ name: 'left' });
    });

    it('unfreeze-column sets frozen override to null', () => {
      let state = reduce(init, { type: 'freeze-column', field: 'name', position: 'right' });
      state = reduce(state, { type: 'unfreeze-column', field: 'name' });
      expect(state.frozenOverrides).toEqual({ name: null });
    });
  });

  // ---- Column group collapse ----

  describe('toggle-column-group-collapse', () => {
    it('adds group to collapsed set when not present', () => {
      const next = reduce(init, { type: 'toggle-column-group-collapse', groupId: 'g1' });
      expect(next.collapsedColumnGroups.has('g1')).toBe(true);
    });

    it('removes group from collapsed set when already present', () => {
      let state = reduce(init, { type: 'toggle-column-group-collapse', groupId: 'g1' });
      state = reduce(state, { type: 'toggle-column-group-collapse', groupId: 'g1' });
      expect(state.collapsedColumnGroups.has('g1')).toBe(false);
    });

    it('does not mutate the original set', () => {
      const first = reduce(init, { type: 'toggle-column-group-collapse', groupId: 'g1' });
      const second = reduce(first, { type: 'toggle-column-group-collapse', groupId: 'g1' });
      expect(first.collapsedColumnGroups.has('g1')).toBe(true);
      expect(second.collapsedColumnGroups.has('g1')).toBe(false);
    });
  });

  // ---- set-column-order ----

  describe('set-column-order', () => {
    it('sets the column order override', () => {
      const next = reduce(init, { type: 'set-column-order', order: ['c', 'b', 'a'] });
      expect(next.columnOrderOverride).toEqual(['c', 'b', 'a']);
    });
  });

  // ---- Row group expand/collapse ----

  describe('row group expand/collapse', () => {
    it('toggle-row-group adds a group key when absent', () => {
      const next = reduce(init, { type: 'toggle-row-group', groupId: 'g1' });
      expect(next.rowGroupExpanded.has('g1')).toBe(true);
    });

    it('toggle-row-group removes the group key when present', () => {
      let state = reduce(init, { type: 'toggle-row-group', groupId: 'g1' });
      state = reduce(state, { type: 'toggle-row-group', groupId: 'g1' });
      expect(state.rowGroupExpanded.has('g1')).toBe(false);
    });

    it('toggle-row-group does not mutate the original set', () => {
      const first = reduce(init, { type: 'toggle-row-group', groupId: 'g1' });
      const second = reduce(first, { type: 'toggle-row-group', groupId: 'g2' });
      expect(first.rowGroupExpanded.has('g2')).toBe(false);
      expect(second.rowGroupExpanded.has('g1')).toBe(true);
      expect(second.rowGroupExpanded.has('g2')).toBe(true);
    });

    it('set-row-group-expanded replaces the expanded set', () => {
      const next = reduce(init, {
        type: 'set-row-group-expanded',
        expanded: new Set(['a', 'b']),
      });
      expect(next.rowGroupExpanded).toEqual(new Set(['a', 'b']));
    });
  });

  // ---- Row drag ----

  describe('row drag', () => {
    it('start-row-drag transitions to dragging with source info', () => {
      const next = reduce(init, {
        type: 'start-row-drag',
        sourceRowId: 'row-7',
        sourceIndex: 7,
      });
      expect(next.rowDrag).toEqual({
        type: 'dragging',
        sourceRowId: 'row-7',
        sourceIndex: 7,
      });
    });

    it('end-row-drag resets to idle when dragging', () => {
      let state = reduce(init, {
        type: 'start-row-drag',
        sourceRowId: 'row-7',
        sourceIndex: 7,
      });
      state = reduce(state, { type: 'end-row-drag' });
      expect(state.rowDrag).toEqual({ type: 'idle' });
    });

    it('end-row-drag from idle is a no-op (returns same state ref)', () => {
      const next = reduce(init, { type: 'end-row-drag' });
      expect(next).toBe(init);
    });
  });

  // ---- Filter menu ----

  describe('filter menu', () => {
    const anchor = { top: 10, left: 20, bottom: 30, right: 40 };

    it('open-filter-menu sets filterMenu to open with field + anchor', () => {
      const next = reduce(init, { type: 'open-filter-menu', field: 'email', anchor });
      expect(next.filterMenu).toEqual({ type: 'open', field: 'email', anchor });
    });

    it('close-filter-menu resets filterMenu to closed when open', () => {
      let state = reduce(init, { type: 'open-filter-menu', field: 'email', anchor });
      state = reduce(state, { type: 'close-filter-menu' });
      expect(state.filterMenu).toEqual({ type: 'closed' });
    });

    it('close-filter-menu from closed is a no-op (returns same state ref)', () => {
      const next = reduce(init, { type: 'close-filter-menu' });
      expect(next).toBe(init);
    });

    it('opening a filter menu for another field replaces the previous one', () => {
      let state = reduce(init, { type: 'open-filter-menu', field: 'email', anchor });
      state = reduce(state, { type: 'open-filter-menu', field: 'name', anchor });
      expect(state.filterMenu).toEqual({ type: 'open', field: 'name', anchor });
    });
  });

  // ---- Condition dialog ----

  describe('condition dialog', () => {
    it('open-condition-dialog sets dialog to open for a field', () => {
      const next = reduce(init, { type: 'open-condition-dialog', field: 'amount' });
      expect(next.conditionDialog).toEqual({ type: 'open', field: 'amount' });
    });

    it('close-condition-dialog resets to closed when open', () => {
      let state = reduce(init, { type: 'open-condition-dialog', field: 'amount' });
      state = reduce(state, { type: 'close-condition-dialog' });
      expect(state.conditionDialog).toEqual({ type: 'closed' });
    });

    it('close-condition-dialog from closed is a no-op (returns same state ref)', () => {
      const next = reduce(init, { type: 'close-condition-dialog' });
      expect(next).toBe(init);
    });
  });

  // ---- State isolation ----

  describe('state isolation', () => {
    it('menu actions do not affect drag state', () => {
      let state = reduce(init, { type: 'start-column-drag', field: 'name' });
      state = reduce(state, { type: 'open-context-menu', x: 0, y: 0, rowId: null, field: null });
      expect(state.columnDrag).toEqual({ type: 'dragging', field: 'name', overField: null });
    });

    it('drag actions do not affect menu state', () => {
      let state = reduce(init, { type: 'open-column-menu', field: 'name' });
      state = reduce(state, { type: 'start-column-drag', field: 'age' });
      expect(state.menu).toEqual({ type: 'column', field: 'name' });
    });
  });
});
