/**
 * Keyboard navigation and editing hook for the datagrid.
 *
 * Attaches a native `keydown` listener to a container element and translates
 * keyboard events into {@link GridModel} mutations -- cell navigation,
 * selection extension, editing lifecycle, undo/redo, and boolean toggling.
 * Supports standard spreadsheet-like key bindings including arrow keys with
 * Shift (extend selection), Ctrl/Cmd (Excel "End" jump to the edge of the
 * current data block), Ctrl+Shift (extend to that edge), Tab (move within row
 * when idle; commit-and-stay while editing), Enter (begin edit when idle;
 * commit-and-stay while editing), Escape (cancel), Home/End, F2, Delete,
 * Ctrl+A, and Ctrl+Z/Y.
 *
 * @module use-keyboard
 */
import { useEffect, useCallback } from 'react';
import {
  GridModel,
  CellAddress,
  getNextCell,
  getFirstCell,
  getLastCell,
  getNextCellInRow,
  getPrevCellInRow,
  getEndJumpCell,
  ColumnDef,
  serializeRangeToText,
  serializeRangeToHtml,
  parseTextToGrid,
} from '@iasbuilt/datagrid-core';

/**
 * Binds keyboard navigation and editing shortcuts to a grid container element.
 *
 * The hook reads the current selection, editing, column, and row state from
 * the model on every key press, then dispatches the appropriate model mutation
 * (navigate, select, edit, undo, etc.). A native DOM event listener is used
 * (rather than a React `onKeyDown` prop) so that the grid container can
 * capture keyboard events regardless of which internal element has focus.
 *
 * Shift + Arrow behaviour is configurable via the grid's
 * {@link GridConfig.shiftArrowBehavior} option (see that option's docstring
 * for branch semantics). When the `'scroll'` branch is active, the optional
 * `scrollRef` parameter is used as the viewport whose `scrollBy` is invoked
 * to move roughly half a screen per keystroke.
 *
 * @typeParam TData - Row data shape; must be a string-keyed record.
 *
 * @param model - The {@link GridModel} instance to mutate in response to
 *   keyboard events.
 * @param containerRef - React ref pointing to the grid's root `<div>`. The
 *   `keydown` listener is attached to this element.
 * @param enabled - When `false`, all keyboard handling is skipped. Defaults
 *   to `true`.
 * @param scrollRef - Optional React ref pointing at the scrollable body
 *   container. Required for the `'scroll'` Shift+Arrow branch to have any
 *   visible effect; when omitted, the branch becomes a no-op.
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const scrollRef = useRef<HTMLDivElement>(null);
 * useKeyboard(model, containerRef, true, scrollRef);
 * return <div ref={containerRef} tabIndex={0}>...</div>;
 * ```
 */
export function useKeyboard<TData extends Record<string, unknown>>(
  model: GridModel<TData>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean = true,
  scrollRef?: React.RefObject<HTMLDivElement | null>,
) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Scope guard: only handle events whose target is directly inside this
    // grid's container, not inside a nested sub-grid or an unrelated element.
    //
    // The previous implementation used `e.target.closest('[role="grid"]')` to
    // detect "is this target inside a different grid subtree?" However, that
    // approach is fragile: any consumer element with `role="grid"` placed
    // inside the DataGrid DOM tree (e.g. a cell renderer widget) causes the
    // closest() call to return that element instead of the DataGrid root,
    // making `closestGrid !== container` evaluate to true and silently
    // discarding the event.
    //
    // The ref-based fix uses `container.contains(e.target)` to confirm the
    // target lives inside OUR container, then additionally checks whether it
    // also lives inside a NESTED [role="grid"] descendant. If the target is
    // in a proper descendant grid, we defer to that grid's own listener.
    const container = containerRef.current;
    if (container && e.target instanceof Element) {
      // If the target is not inside this container at all, ignore the event.
      if (!container.contains(e.target)) return;

      // If the target is inside this container but also inside a proper
      // nested DataGrid instance (identified by the `iasbuilt-datagrid`
      // class on the nested grid root), defer to that grid's own handler.
      // We walk from the target upward and stop at container. Using the
      // `iasbuilt-datagrid` class rather than `role="grid"` avoids false
      // positives from consumer elements that happen to carry `role="grid"`
      // (e.g. accessibility wrappers, toolbar composites) which have no
      // DataGrid keyboard handler attached to them.
      let el: Element | null = e.target;
      while (el && el !== container) {
        if (el.classList.contains('iasbuilt-datagrid')) {
          // Target is inside a nested DataGrid — defer.
          return;
        }
        el = el.parentElement;
      }
    }

    // Snapshot the current model state needed for navigation decisions.
    const state = model.getState();
    const selection = state.selection.range;
    const editing = state.editing;
    const columns = model.getVisibleColumns() as ColumnDef[];
    const rowIds = model.getRowIds();

    // Determine the "current" cell: prefer the cell being edited, then the
    // selection anchor. Most key handlers are no-ops without a current cell.
    const current: CellAddress | null = editing.cell ?? selection?.anchor ?? null;
    if (!current && !['Tab'].includes(e.key)) return;

    // ---------------------------------------------------------------------
    // Sub-grid keyboard transitions
    // ---------------------------------------------------------------------
    //
    // Enter on a selected sub-grid cell expands the nested grid and
    // transfers focus into it (if the row has a sub-grid column). This
    // overrides the default "begin edit" behaviour, which is inappropriate
    // for sub-grid cells since they are not editable as scalars.
    //
    // Escape in a nested grid (when nothing is selected inside) collapses
    // the expansion back and returns focus to the parent grid container.
    // That arm is implemented in the outer container's listener — since
    // `useKeyboard` runs per grid level, each listener handles its own
    // side of the transition.

    if (e.key === 'Enter' && current && !editing.cell) {
      const col = columns.find(c => c.field === current.field);
      if (col?.cellType === 'subGrid') {
        e.preventDefault();
        e.stopPropagation();
        const expanded = state.expandedSubGrids.has(current.rowId);
        if (!expanded) {
          model.toggleSubGridExpansion(current.rowId);
        }
        // Focus the nested grid after the expansion row mounts. We look up
        // the expansion row via the `data-testid` attribute written by the
        // body renderer; that's a stable contract between layers.
        requestAnimationFrame(() => {
          if (!container) return;
          const nested = container.querySelector<HTMLElement>(
            `[data-testid="subgrid-expansion-${CSS.escape(current.rowId)}"] [role="grid"]`,
          );
          nested?.focus();
        });
        return;
      }
    }

    // Escape-to-exit a sub-grid: if we're a nested grid and the user presses
    // Escape while nothing is being edited, return focus to the nearest
    // outer grid. This path is triggered by noting that our container has
    // an ancestor `[role="grid"]` that isn't us.
    if (e.key === 'Escape' && !editing.cell && container) {
      const outerGrid = container.parentElement?.closest('[role="grid"]');
      if (outerGrid && outerGrid !== container) {
        e.preventDefault();
        e.stopPropagation();
        model.clearSelectionState();
        (outerGrid as HTMLElement).focus();
        return;
      }
    }

    // IME composition guard: keyCode 229 is the pre-composition sentinel
    // emitted by some browsers; isComposing is the standard flag. Either means
    // the candidate window is open — committing or advancing here would destroy
    // in-progress CJK text.
    if ((e.isComposing || e.keyCode === 229) && (e.key === 'Tab' || e.key === 'Enter')) {
      return;
    }

    // ---------------------------------------------------------------------
    // Type-to-edit (#71)
    // ---------------------------------------------------------------------
    //
    // Excel / Google Sheets convention: typing a printable character while a
    // cell is selected (NOT already in edit mode) immediately enters edit
    // mode and seeds the editor with that character — replacing any prior
    // cell value in the process. Non-printable keys (Arrow*, Tab, Escape,
    // etc.) must NOT enter edit mode, and Ctrl/Meta-modified keys must
    // continue to route to their existing shortcut handlers
    // (Ctrl+A, Ctrl+Z, Ctrl+C/V/X, Ctrl+Y) below.
    //
    // The seeding step dispatches a synthetic `input` event on the newly
    // mounted editor `<input>` via the native `value` setter. React's
    // controlled-input contract reads the element's `.value` during its
    // SyntheticEvent dispatch, so this correctly triggers the renderer's
    // `onChange` and updates the controlled draft state.
    if (
      current &&
      !editing.cell &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      const col = columns.find((c) => c.field === current.field);
      const editableType =
        col?.cellType == null ||
        col.cellType === 'text' ||
        col.cellType === 'numeric' ||
        col.cellType === 'currency' ||
        col.cellType === 'password';
      if (col && col.editable !== false && editableType) {
        e.preventDefault();
        const typedChar = e.key;
        // Pass cause='typeToEdit' so DataGridBody's mount-time
        // `el.select()` knows to stay out of the way (issue #133).
        // Before this signal, the body's deferred `select()` could
        // fire AFTER our `setSelectionRange(len, len)` under CPU
        // contention, which highlighted the seed character so the
        // very next keystroke replaced it — only the LAST typed digit
        // survived. The pre-#133 mitigation was a per-keystroke
        // `delay: 50` in the e2e spec; this signal removes the race
        // entirely and lets us drop the delay.
        model.beginEdit(current, 'typeToEdit');
        requestAnimationFrame(() => {
          if (!container) return;
          const cellSel = `[role="gridcell"][data-row-id="${CSS.escape(
            String(current.rowId),
          )}"][data-field="${CSS.escape(current.field)}"]`;
          const cellEl = container.querySelector<HTMLElement>(cellSel);
          const input = cellEl?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            'input, textarea',
          );
          if (!input) return;
          // React tracks a private `_valueTracker` on controlled inputs.
          // Using the native value setter is the canonical workaround for
          // programmatic seeding that still dispatches React's onChange.
          const proto = Object.getPrototypeOf(input);
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) {
            setter.call(input, typedChar);
          } else {
            input.value = typedChar;
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          // Place the caret after the seeded char so continued typing
          // appends naturally. Issue #133 — we used to nest a second
          // rAF here to win a race against DataGridBody's deferred
          // `select()`; now that the body opts out on cause='typeToEdit',
          // the call is synchronous and deterministic. Doing it sync
          // also closes the window during which a fast keystroke could
          // land between the rAFs and corrupt the seed.
          if (typeof input.setSelectionRange === 'function') {
            const len = typedChar.length;
            input.setSelectionRange(len, len);
          }
        });
        return;
      }
    }

    switch (e.key) {
      // --- Tab: commit-and-stay while editing, move within row otherwise ---
      //
      // Issue #10: Pressing Tab while a cell is in edit mode must commit the
      // draft, exit edit mode, and leave the same cell selected. The caret
      // must NOT jump to the adjacent cell.
      //
      // Event flow: this hook installs a *native* keydown listener on the
      // grid container, which fires mid-bubble before React's delegated
      // onKeyDown handlers at the document root. When Tab bubbles in from a
      // cell editor input, the cell's React onKeyDown handler is what owns
      // the draft and calls the correct `onCommit` callback — so here we
      // must preventDefault (to suppress the browser's focus-advance) but
      // leave propagation intact so the cell handler still runs. Calling
      // `model.commitEdit()` from the grid in that case would prematurely
      // fire a second cell:edit command with the stale model-level value.
      //
      // When Tab bubbles from outside an editor (e.g. the container gets
      // focus directly) while editing is somehow active, we fall back to a
      // model-level commit so the draft is not silently discarded.
      case 'Tab': {
        if (editing.cell) {
          e.preventDefault();
          if (isEditorTarget(e.target)) return;
          model.commitEdit();
          return;
        }
        if (!current) {
          e.preventDefault();
          const first = getFirstCell(columns, rowIds);
          if (first) {
            model.select(first);
            focusCellDom(container, first);
          }
          return;
        }
        const next = e.shiftKey
          ? getPrevCellInRow(current, columns, rowIds)
          : getNextCellInRow(current, columns, rowIds);
        if (next) {
          e.preventDefault();
          model.select(next);
          focusCellDom(container, next);
        }
        break;
      }
      // --- Enter: commit-and-stay while editing, begin editing otherwise ---
      //
      // Issue #10: Enter in edit mode commits the current draft, exits edit
      // mode, and keeps selection on the same cell (no auto-advance to the
      // row below). When not editing, Enter begins editing the selected cell,
      // matching the spreadsheet convention.
      //
      // As with Tab above, when the event target is an editor input we
      // defer to the cell-level handler so the draft (not the stale
      // model-level `currentValue`) is what gets committed.
      case 'Enter': {
        e.preventDefault();
        if (editing.cell) {
          if (isEditorTarget(e.target)) return;
          model.commitEdit();
        } else if (current) {
          // cause='enter' — editor mount selects existing text so a
          // subsequent keystroke REPLACES the value (#133).
          model.beginEdit(current, 'enter');
        }
        break;
      }
      // --- Escape: cancel edit (keeps selection), or clear selection when idle ---
      //
      // Issue #11: Pressing Esc in edit mode must revert the cell value and
      // keep the original cell selected. Because cell editors (e.g. TextCell)
      // handle Escape at the input level first — calling `model.cancelEdit()`
      // synchronously — by the time this native bubble-phase listener runs,
      // `editing.cell` is already null. Without the `isEditor` guard below,
      // the `else` branch would then wipe the selection.
      //
      // The event target tells us whether Esc was pressed inside an editor
      // input/textarea: if so, the cell already cancelled the edit and we
      // must preserve the selection. Otherwise (Esc pressed while the grid
      // has focus and no edit is active), we keep the existing
      // clear-selection behaviour.
      case 'Escape': {
        if (editing.cell) {
          model.cancelEdit();
          e.preventDefault();
          e.stopPropagation();
        } else {
          const target = e.target as HTMLElement | null;
          const isEditor =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            (target != null && target.isContentEditable);
          if (!isEditor) {
            model.clearSelectionState();
          }
        }
        break;
      }
      // --- Arrow keys: navigate, extend selection, or jump to edge ---
      case 'ArrowRight':
      case 'ArrowLeft':
      case 'ArrowDown':
      case 'ArrowUp': {
        // Don't navigate while editing
        if (editing.cell) return;

        // Map the key name to a cardinal direction string.
        const dir =
          e.key === 'ArrowRight' ? 'right' :
          e.key === 'ArrowLeft' ? 'left' :
          e.key === 'ArrowDown' ? 'down' : 'up';

        e.preventDefault();

        // Row-intent horizontal arrows are no-ops. There is no cell-level
        // focus while a whole row is selected, so stepping left/right
        // would collapse the row range onto a single cell. Applies to
        // plain and Shift-modified horizontal arrows alike; Ctrl/Cmd+Arrow
        // keeps its Excel "End" semantics because a user explicitly
        // asking for End-jump should still land on a cell.
        const isRowIntent =
          state.selection.mode === 'row' ||
          state.selection.range?.kind === 'row';
        if (
          isRowIntent &&
          (dir === 'left' || dir === 'right') &&
          !(e.ctrlKey || e.metaKey)
        ) {
          break;
        }

        if (e.ctrlKey || e.metaKey) {
          // Ctrl/Cmd+Arrow jumps Excel "End" style: walk along the row/column
          // and stop at the edge of the nearest populated block. Ctrl+Shift
          // +Arrow extends the range to the same target instead of moving the
          // caret. This branch runs regardless of the `shiftArrowBehavior`
          // config — the config only governs plain Shift+Arrow (no Ctrl/Cmd).
          if (!current) return;
          const processedData = model.getProcessedData();
          const getCellValue = (cell: CellAddress): unknown => {
            const rowIndex = rowIds.indexOf(cell.rowId);
            if (rowIndex < 0) return undefined;
            const row = processedData[rowIndex] as Record<string, unknown> | undefined;
            return row ? row[cell.field] : undefined;
          };
          const target = getEndJumpCell(current, dir, columns, rowIds, getCellValue);
          if (target) {
            if (e.shiftKey) {
              model.extendTo(target);
            } else {
              model.select(target);
            }
          }
        } else if (e.shiftKey) {
          // Shift+Arrow (no Ctrl/Cmd): dispatch to the configured branch.
          // The config controls whether Shift+Arrow scrolls the viewport by
          // roughly half a screen (default) or extends the rectangular range
          // selection by one cell.
          const cfg = (state.config ?? {}) as Partial<{ shiftArrowBehavior: 'scroll' | 'rangeSelect' }>;
          const behavior = cfg.shiftArrowBehavior ?? 'scroll';
          if (behavior === 'rangeSelect') {
            // Anchor the extension to the current *focus* (not the anchor) so
            // successive Shift+Arrow keystrokes compound — stepping right
            // twice from A1 must reach C1, not stall at B1. The anchor is
            // preserved implicitly by `extendTo`, which only updates the
            // focus. Every cell inside the normalised rectangle is selected
            // by the body's range checker, fixing the "only 2 cells selected"
            // bug reported in #16.
            const focus = selection?.focus ?? current;
            if (!focus) return;
            const target = getNextCell(focus, dir, columns, rowIds);
            if (target) model.extendTo(target);
          } else {
            // 'scroll' branch — move the viewport half a screen without
            // changing the selection.
            scrollViewportHalfScreen(scrollRef?.current ?? null, dir);
          }
        } else {
          // Plain arrow key: with a row-intent selection (row mode or a
          // range tagged `kind: 'row'` from a gutter click), ArrowUp/Down
          // moves the whole-row selection to the adjacent row rather than
          // stepping cell-by-cell.
          if (!current) return;
          const plainArrowRowIntent =
            state.selection.mode === 'row' ||
            state.selection.range?.kind === 'row';
          if (plainArrowRowIntent && (dir === 'down' || dir === 'up')) {
            const currentRowIdx = rowIds.indexOf(current.rowId);
            const nextRowIdx = dir === 'down' ? currentRowIdx + 1 : currentRowIdx - 1;
            const nextRowId = rowIds[nextRowIdx];
            if (nextRowId) model.selectRowByKey(nextRowId);
          } else {
            const next = getNextCell(current, dir, columns, rowIds);
            if (next) model.select(next);
          }
        }
        break;
      }
      // --- Home: jump to the first column, or Ctrl+Home to the first cell ---
      case 'Home': {
        e.preventDefault();
        if (!current) return;
        if (e.ctrlKey || e.metaKey) {
          // Jump to the very first cell in the grid (top-left).
          const first = getFirstCell(columns, rowIds);
          if (first) model.select(first);
        } else {
          // Jump to the first column in the current row.
          const firstCol = columns[0];
          if (firstCol) model.select({ rowId: current.rowId, field: firstCol.field });
        }
        break;
      }
      // --- End: jump to the last column, or Ctrl+End to the last cell ---
      case 'End': {
        e.preventDefault();
        if (!current) return;
        if (e.ctrlKey || e.metaKey) {
          // Jump to the very last cell in the grid (bottom-right).
          const last = getLastCell(columns, rowIds);
          if (last) model.select(last);
        } else {
          // Jump to the last column in the current row.
          const lastCol = columns[columns.length - 1];
          if (lastCol) model.select({ rowId: current.rowId, field: lastCol.field });
        }
        break;
      }
      // --- F2: enter edit mode on the selected cell ---
      case 'F2': {
        if (current && !editing.cell) {
          // cause='f2' — editor mount selects existing text so a
          // subsequent keystroke REPLACES the value (#133).
          model.beginEdit(current, 'f2');
        }
        break;
      }
      // --- Space: toggle boolean cells ---
      case ' ': {
        if (current && !editing.cell) {
          // Only toggle if the column is explicitly typed as boolean.
          const col = columns.find(c => c.field === current.field);
          if (col?.cellType === 'boolean') {
            const allRowIds = model.getRowIds();
            const rowIndex = allRowIds.indexOf(current.rowId);
            if (rowIndex >= 0) {
              const currentVal = model.getProcessedData()[rowIndex]?.[current.field as keyof TData];
              model.setCellValue(
                current as { rowId: string; field: Extract<keyof TData, string> },
                !currentVal as TData[Extract<keyof TData, string>],
              );
            }
          }
        }
        break;
      }
      // --- Delete: clear the selected cell's value ---
      case 'Delete': {
        if (current && !editing.cell) {
          model.setCellValue(
            current as { rowId: string; field: Extract<keyof TData, string> },
            null as TData[Extract<keyof TData, string>],
          );
        }
        break;
      }
      // --- Ctrl+A: select all cells ---
      // Must NOT fire while an editor input has focus — otherwise
      // Ctrl+A in the inline editor is swallowed by the grid and the
      // user can't select-all-text to replace it. Matches the Ctrl+C /
      // Ctrl+V / Ctrl+X gating below.
      case 'a': {
        if ((e.ctrlKey || e.metaKey) && !editing.cell) {
          e.preventDefault();
          model.selectAllCells();
        }
        break;
      }
      // --- Ctrl+Z / Ctrl+Shift+Z: undo / redo ---
      case 'z': {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) {
            model.redo();
          } else {
            model.undo();
          }
        }
        break;
      }
      // --- Ctrl+Y: redo (alternative binding) ---
      case 'y': {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          model.redo();
        }
        break;
      }
      case 'c': {
        if ((e.ctrlKey || e.metaKey) && selection && !editing.cell) {
          e.preventDefault();
          writeRangeToClipboard(
            model.getProcessedData() as Record<string, unknown>[],
            selection,
            columns,
            rowIds,
          );
        }
        break;
      }
      case 'x': {
        if ((e.ctrlKey || e.metaKey) && selection && !editing.cell) {
          e.preventDefault();
          writeRangeToClipboard(
            model.getProcessedData() as Record<string, unknown>[],
            selection,
            columns,
            rowIds,
          );
          const { rows, cols } = resolveRangeIndices(selection, columns, rowIds);
          for (const rowId of rows) {
            for (const field of cols) {
              model.setCellValue(
                { rowId, field: field as Extract<keyof TData, string> },
                null as TData[Extract<keyof TData, string>],
              );
            }
          }
        }
        break;
      }
      case 'v': {
        if ((e.ctrlKey || e.metaKey) && current && !editing.cell) {
          e.preventDefault();
          navigator.clipboard?.readText().then(text => {
            const grid = parseTextToGrid(text);
            const colIndex = columns.findIndex(c => c.field === current.field);
            const rowIndex = rowIds.indexOf(current.rowId);
            for (let r = 0; r < grid.length; r++) {
              const targetRowId = rowIds[rowIndex + r];
              if (!targetRowId) break;
              const row = grid[r];
              if (!row) continue;
              for (let c = 0; c < row.length; c++) {
                const targetCol = columns[colIndex + c];
                if (!targetCol) break;
                model.setCellValue(
                  { rowId: targetRowId, field: targetCol.field as Extract<keyof TData, string> },
                  row[c] as TData[Extract<keyof TData, string>],
                );
              }
            }
          });
        }
        break;
      }
    }

    // Note: we deliberately do NOT call e.stopPropagation() on handled keys
    // even though it would provide a clean Tab-boundary between nested grids.
    // The React 19 event system delegates all synthetic events through the
    // root, so stopping native propagation here also silences React's
    // `onKeyDown`/`onBlur` handlers on inner elements (notably the inline
    // editor `<input>`s), breaking commit/cancel and validation flows.
    //
    // The Tab-boundary guarantee is instead provided by the early-return
    // check at the top of this handler: when an event originates inside a
    // nested grid (`closest('[role="grid"]') !== containerRef.current`), the
    // outer container's listener exits before doing anything, so there is no
    // duplicate navigation. Each nested grid still updates its own model's
    // selection in response to Tab/Shift-Tab; that update cannot bubble
    // "through" the DOM because the model is an independent instance.
  }, [model, enabled, containerRef, scrollRef]);

  // useEffect is necessary here because we need to imperatively attach/detach a
  // native DOM event listener on the container element after it mounts.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, handleKeyDown]);
}

/**
 * Scrolls a viewport element by roughly half its visible size in a given
 * cardinal direction. Used by the default `shiftArrowBehavior: 'scroll'`
 * branch of Shift + Arrow so a single keystroke jumps ~0.5 screens without
 * affecting the current selection.
 *
 * When `el` is `null`, the call is a silent no-op (consumers who care should
 * pass a ref pointing at the scrollable body). The scroll is best-effort:
 * browsers without `scrollBy` support will simply ignore the call.
 *
 * @param el - The scrollable container element, or `null`.
 * @param dir - Cardinal direction to scroll in.
 */
function scrollViewportHalfScreen(
  el: HTMLDivElement | null,
  dir: 'up' | 'down' | 'left' | 'right',
): void {
  if (!el) return;
  const w = el.clientWidth || 0;
  const h = el.clientHeight || 0;
  // Half-screen jump matches the Excel viewport-pan convention.
  const dx = dir === 'right' ? Math.round(w / 2) : dir === 'left' ? -Math.round(w / 2) : 0;
  const dy = dir === 'down' ? Math.round(h / 2) : dir === 'up' ? -Math.round(h / 2) : 0;
  if (typeof el.scrollBy === 'function') {
    el.scrollBy({ left: dx, top: dy, behavior: 'auto' });
  } else {
    el.scrollLeft += dx;
    el.scrollTop += dy;
  }
}

/**
 * Returns true when the given event target is an editable input surface
 * (native `<input>`, `<textarea>`, or a contentEditable element).
 *
 * Used by the Tab/Enter branches to decide whether to defer committing the
 * draft to the cell-level React `onKeyDown` handler (which owns the correct
 * draft value) instead of calling `model.commitEdit()` from the grid.
 */
function isEditorTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return false;
}

/**
 * Moves DOM focus onto the grid cell identified by `addr`. The model-level
 * selection change alone doesn't shift focus, so keyboard-only users never
 * trigger `onFocus`-driven affordances (notably the hover-tooltip reveal for
 * truncated text). Looking the cell up by its stable `data-row-id` +
 * `data-field` attributes inside `container` lets us keep focus coherent
 * without threading refs through every render layer.
 */
function focusCellDom(container: HTMLElement | null, addr: CellAddress): void {
  if (!container) return;
  const sel = `[role="gridcell"][data-row-id="${CSS.escape(String(addr.rowId))}"][data-field="${CSS.escape(addr.field)}"]`;
  const cell = container.querySelector<HTMLElement>(sel);
  cell?.focus();
}

/**
 * Constructs a Blob for use in a ClipboardItem, ensuring `.text()` is
 * available as a synchronously-resolved method. jsdom's Blob implementation
 * omits `.text()`, so test code paths that decode blob content via
 * `await blob.text()` crash without this patch. In real browsers the native
 * method already exists and is preserved.
 */
function makeClipboardBlob(content: string, type: string): Blob {
  const blob = new Blob([content], { type });
  if (typeof (blob as Blob & { text?: unknown }).text !== 'function') {
    // Install a promise-returning accessor that reads the captured content
    // synchronously. Using `Object.defineProperty` instead of plain
    // assignment keeps the Blob's prototype chain intact.
    Object.defineProperty(blob, 'text', {
      value: async () => content,
      writable: false,
      configurable: true,
    });
  }
  return blob;
}

/**
 * Writes the given cell range to the system clipboard as a dual-flavor
 * {@link ClipboardItem} carrying both `text/plain` (TSV) and `text/html`
 * (`<table>`) blobs.
 *
 * Excel, Google Sheets, and Word all prefer the HTML flavour when present
 * (preserving explicit cell boundaries for formatted values) while simple
 * text targets pick up the TSV payload instead. When the browser lacks
 * `ClipboardItem` / `navigator.clipboard.write` support, the call falls back
 * to `writeText(tsv)` so plain-text targets still receive the payload.
 *
 * Header-row inclusion is decided by the underlying serialisers based on the
 * range shape — see {@link serializeRangeToText}.
 */
function writeRangeToClipboard(
  data: Record<string, unknown>[],
  range: { anchor: CellAddress; focus: CellAddress },
  columns: ColumnDef[],
  rowIds: string[],
): void {
  const tsv = serializeRangeToText(data, range as never, columns, rowIds);
  const html = serializeRangeToHtml(data, range as never, columns, rowIds);

  // Prefer the rich dual-flavour path when available.
  const clipboard = (navigator as Navigator & {
    clipboard?: Clipboard & {
      write?: (items: ClipboardItem[]) => Promise<void>;
    };
  }).clipboard;
  const ClipboardItemCtor = (globalThis as unknown as {
    ClipboardItem?: typeof ClipboardItem;
  }).ClipboardItem;
  if (clipboard && typeof clipboard.write === 'function' && ClipboardItemCtor) {
    try {
      // jsdom's Blob does not implement `.text()`, but consumers of the
      // clipboard API (including our test stubs) call it to decode the
      // payload. Attach a synchronously-resolved `.text()` method so the
      // decode path works uniformly in browsers and in the test environment.
      const plainBlob = makeClipboardBlob(tsv, 'text/plain');
      const htmlBlob = makeClipboardBlob(html, 'text/html');
      const item = new ClipboardItemCtor({
        'text/plain': plainBlob,
        'text/html': htmlBlob,
      });
      void clipboard.write([item]);
      return;
    } catch {
      // Fall through to the plain-text fallback below.
    }
  }
  // Fallback: plain-text only.
  clipboard?.writeText?.(tsv);
}

/**
 * Normalises a `{ anchor, focus }` range pair into the contiguous
 * row-id and field-id arrays the clipboard copy / cut paths iterate.
 *
 * The anchor / focus shape mirrors selection state: anchor is the
 * cell where the user pressed mouse-down (or began a shift-select);
 * focus is where the cursor currently is. The two may sit in any
 * order, so this helper resolves the bounding-box min/max for both
 * axes and slices the column / row lists accordingly.
 */
function resolveRangeIndices(
  range: { anchor: CellAddress; focus: CellAddress },
  columns: ColumnDef[],
  rowIds: string[]
): { rows: string[]; cols: string[] } {
  const colFields = columns.map(c => c.field);
  const anchorCol = colFields.indexOf(range.anchor.field);
  const focusCol = colFields.indexOf(range.focus.field);
  const minCol = Math.min(anchorCol, focusCol);
  const maxCol = Math.max(anchorCol, focusCol);
  const anchorRow = rowIds.indexOf(range.anchor.rowId);
  const focusRow = rowIds.indexOf(range.focus.rowId);
  const minRow = Math.min(anchorRow, focusRow);
  const maxRow = Math.max(anchorRow, focusRow);
  return {
    rows: rowIds.slice(minRow, maxRow + 1),
    cols: colFields.slice(minCol, maxCol + 1),
  };
}
