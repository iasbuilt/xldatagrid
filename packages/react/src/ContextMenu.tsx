/**
 * Context-menu overlay for the datagrid.
 *
 * Renders a floating menu triggered by right-click on rows or column headers.
 * Supports nested sub-menus (via `children` on menu items), keyboard dismiss
 * (Escape), outside-click dismiss, and viewport-boundary repositioning so the
 * menu never overflows the screen.
 *
 * ## The problem this module solves
 *
 * A datagrid is frequently embedded inside containers that apply CSS
 * `transform`, `filter`, or `perspective` — virtualized scroll wrappers,
 * animated modals, drag overlays, `will-change` optimizations, and so on.
 * Per the CSS spec, any of those properties turns the ancestor into the
 * containing block for descendants with `position: fixed`. The menu that
 * logically "should" appear at the cursor then resolves its `top`/`left`
 * relative to the transformed ancestor's origin instead of the viewport,
 * so it visually lands far from the click — typically hugging the far
 * left of the window.
 *
 * Two structural choices prevent that:
 *
 * 1. **Portal to `document.body`.** The menu DOM node is re-parented under
 *    `document.body` via `createPortal`, so no transformed ancestor sits
 *    between it and the viewport. `position: fixed` then resolves against
 *    the viewport as intended. Any future refactor that inlines the menu
 *    back into the grid subtree will regress this bug — hence the
 *    regression tests guarding the portal invariant.
 *
 * 2. **Re-seed position from `state.x/y` inside a layout effect.** The
 *    initial `useState({ x: state.x, y: state.y })` call captures the
 *    coordinates at mount time, which — because the component is kept
 *    mounted across opens — is the default `(0, 0)`. Each subsequent
 *    right-click feeds new coordinates through `state`, and the layout
 *    effect overwrites the local `position` state from those fresh
 *    coordinates before the browser paints. Doing this in
 *    `useLayoutEffect` (rather than `useEffect`) guarantees the menu
 *    never flashes at the stale `(0, 0)` during the first committed
 *    frame after opening.
 *
 * ## Viewport-edge avoidance
 *
 * After the menu mounts, the layout effect reads the rendered node's
 * `getBoundingClientRect()` and compares it against `window.innerWidth /
 * innerHeight`. If the menu would overflow the right or bottom edge, the
 * anchor is pulled back just enough to keep it fully visible; negative
 * coordinates are clamped to zero. This happens synchronously before
 * paint, so the user never sees the clipped state.
 *
 * ## Submenu positioning rules
 *
 * Sub-menus are rendered as descendants of their parent `<div>` entry and
 * positioned with plain absolute CSS defined in `ContextMenu.styles`. They
 * open on mouse-enter and close on mouse-leave with a short debounce to
 * tolerate diagonal pointer travel across the arrow gap. They inherit the
 * top-level menu's portal indirectly (everything below the top-level menu
 * is inside `document.body`), so they do not need their own portal.
 *
 * @module ContextMenu
 */
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ContextMenuItemDef } from '@iasbuilt/datagrid-core';
import * as styles from './ContextMenu.styles';

/**
 * SSR-safe `useLayoutEffect`: falls back to `useEffect` when `window` is
 * undefined so server renders don't emit the React layout-effect warning.
 *
 * The positioning logic in this module specifically requires the synchronous
 * layout-effect timing in the browser — see the file-level docstring for why
 * `useEffect` is not sufficient. On the server the hook effectively becomes
 * a no-op because `state.open` is always false for the initial render.
 */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Describes the open/closed state and screen position of a context menu,
 * along with the grid cell coordinates (row and field) that triggered it.
 *
 * This object is owned by the parent component (typically the grid root)
 * and is passed to {@link ContextMenu} via the `state` prop. Because the
 * `ContextMenu` component is kept mounted and re-renders whenever `state`
 * changes, the `x`/`y` coordinates here are the canonical source of truth
 * for where the menu should appear on each open — the component's internal
 * `position` state is deliberately re-seeded from these fields inside a
 * layout effect on every open.
 */
export interface ContextMenuState {
  /** Whether the menu is currently visible. */
  open: boolean;
  /** Horizontal screen coordinate (px) where the menu was triggered. */
  x: number;
  /** Vertical screen coordinate (px) where the menu was triggered. */
  y: number;
  /** Row ID of the cell that was right-clicked, or `null` for header context menus. */
  rowId: string | null;
  /** Column field of the cell that was right-clicked, or `null` if not column-specific. */
  field: string | null;
}

/**
 * Default closed state for a context menu, used as the reset value after
 * the menu is dismissed and as the initial value for consumers that hold
 * the menu state in `useState` at the grid level.
 *
 * The `(0, 0)` seed here is why the layout effect inside {@link ContextMenu}
 * must re-seed from the current `state.x/state.y` on every open: without
 * that re-seed, the first render following an open would paint the menu at
 * the origin before the effect could correct it.
 */
export const initialContextMenuState: ContextMenuState = {
  open: false,
  x: 0,
  y: 0,
  rowId: null,
  field: null,
};

/**
 * Props for the {@link ContextMenu} component.
 *
 * The parent owns the `state` object and is expected to mutate it in
 * response to `contextmenu` events on grid cells or headers. `items` may
 * change between opens; sub-menus are derived from each item's `children`.
 */
export interface ContextMenuProps {
  /** Current open/closed state and trigger coordinates. */
  state: ContextMenuState;
  /** Flat list of menu-item definitions to render. */
  items: ContextMenuItemDef[];
  /** Callback invoked when the menu should close (outside click, Escape, or item action). */
  onClose: () => void;
}

/**
 * Renders the top-level context menu as a fixed-position overlay.
 *
 * On each open, the component measures its own bounding rect against the
 * viewport and shifts the position so the menu stays fully visible. Registers
 * document-level listeners for outside clicks and the Escape key to dismiss.
 *
 * The component **must** render through a `document.body` portal and **must**
 * re-seed its local position state inside a layout effect on every open —
 * see the file-level docstring for the full rationale. Reverting either of
 * those choices will reproduce the transformed-ancestor bug, which the
 * accompanying test suite is designed to catch.
 *
 * @param props - Menu state, item definitions, and close callback.
 * @param props.state - Current open/closed flag, trigger coordinates, and the
 *   grid-cell context (row id and field) that caused the right-click.
 * @param props.items - Menu-item definitions rendered at the top level of
 *   the menu. Nested sub-menus are declared via each item's `children`.
 * @param props.onClose - Invoked when the menu should dismiss — fires on
 *   Escape, on outside click, and after any leaf item's action executes.
 * @returns The portaled menu element, or `null` when `state.open` is false.
 */
export function ContextMenu({ state, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: state.x, y: state.y });

  // Re-seed position from `state.x/y` and clamp to the viewport on every
  // open. Runs synchronously before paint so the user never sees the stale
  // `(0, 0)` seed that the initial `useState` captured, and never sees the
  // menu overflowing the right or bottom edge before a follow-up effect
  // could correct it. The clamp consults the rendered node's
  // `getBoundingClientRect`, which on the very first frame reflects the
  // menu's content-driven size — pulling `x` back by `rect.width` on the
  // right edge, and `y` back by `rect.height` on the bottom edge, then
  // flooring both at zero so the menu cannot escape into negative
  // coordinates on a narrow viewport.
  useIsomorphicLayoutEffect(() => {
    if (!state.open) return;

    let x = state.x;
    let y = state.y;

    const menu = menuRef.current;
    if (menu) {
      const rect = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (x + rect.width > vw) {
        x = vw - rect.width;
      }
      if (y + rect.height > vh) {
        y = vh - rect.height;
      }
      if (x < 0) x = 0;
      if (y < 0) y = 0;
    }

    setPosition({ x, y });
  }, [state.open, state.x, state.y]);

  // Dismiss the menu when the user presses any mouse button outside of it.
  // The `mousedown` phase is deliberate — using `click` would let the first
  // click that dismisses the menu also trigger whatever lay beneath it,
  // which is surprising. The listener is attached only while the menu is
  // open and is torn down in the cleanup to keep the global state tidy.
  useEffect(() => {
    if (!state.open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [state.open, onClose]);

  // Keyboard dismissal: Escape closes the menu regardless of which element
  // holds focus. As with the outside-click handler, the listener is only
  // active while the menu is open so it doesn't interfere with other
  // consumers of Escape on the page.
  useEffect(() => {
    if (!state.open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.open, onClose]);

  if (!state.open) return null;

  const ctx = { rowId: state.rowId, field: state.field };

  // Render into document.body so ancestor CSS `transform`/`filter`/`perspective`
  // (e.g. virtualized grid containers) can't hijack our `position: fixed` —
  // without the portal, a transformed ancestor becomes the containing block
  // and `top/left` are measured from the ancestor's origin instead of the
  // viewport, causing the menu to jump to the far-left of the window. The
  // regression test in `__tests__/context-menu-position.test.tsx` wraps the
  // grid in a `transform: translateX(1px)` div to lock this behaviour in.
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      data-testid="context-menu"
      style={styles.menu(position.x, position.y)}
    >
      {items.map((item) => (
        <ContextMenuEntry
          key={item.key}
          item={item}
          ctx={ctx}
          onClose={onClose}
        />
      ))}
    </div>,
    document.body,
  );
}

/**
 * Props for an individual context-menu row (used internally by
 * {@link ContextMenu}).
 *
 * `ContextMenuEntry` is recursive: if `item.children` is non-empty it
 * renders each child through the same component, which is how nested
 * sub-menus are built. `ctx` is forwarded unchanged through the whole
 * tree so every visibility/disabled predicate sees the same triggering
 * cell, and `onClose` is the top-level close callback so any leaf item
 * can dismiss the entire menu stack.
 */
interface ContextMenuEntryProps {
  /** The menu-item definition to render. */
  item: ContextMenuItemDef;
  /** Cell context (row and field) from the triggering right-click. */
  ctx: { rowId: string | null; field: string | null };
  /** Callback to close the entire menu tree after an action fires. */
  onClose: () => void;
}

/**
 * Renders a single context-menu entry, including optional icon, label, keyboard
 * shortcut hint, danger styling, divider, and a nested sub-menu that opens on hover.
 *
 * Visibility and disabled state can be static booleans or functions evaluated
 * against the cell context, enabling dynamic menu composition.
 *
 * Sub-menu anchoring is intentionally CSS-driven: the sub-menu `<div>` sits
 * inside the parent entry as a sibling of the row content, and `styles.submenu`
 * handles its horizontal offset. Because the entire menu tree is already inside
 * the `document.body` portal spawned by {@link ContextMenu}, no additional
 * portal is needed here for `position: fixed` to behave correctly.
 */
function ContextMenuEntry({ item, ctx, onClose }: ContextMenuEntryProps) {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const entryRef = useRef<HTMLDivElement>(null);
  // Debounce timer to prevent sub-menu flicker on rapid mouse-leave/enter
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Evaluate visibility: function or static boolean
  const isVisible = typeof item.visible === 'function'
    ? item.visible(ctx)
    : item.visible !== false;

  // Evaluate disabled state: function or static boolean
  const isDisabled = typeof item.disabled === 'function'
    ? item.disabled(ctx)
    : item.disabled === true;

  const hasChildren = item.children && item.children.length > 0;

  // Open the sub-menu on entry hover and cancel any pending close so that a
  // quick mouse-out/mouse-in bounce across the arrow gap doesn't produce a
  // visible flicker.
  const handleMouseEnter = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    if (hasChildren) {
      setSubmenuOpen(true);
    }
  }, [hasChildren]);

  // Leaving the entry schedules a delayed close rather than closing
  // immediately. The 150 ms window is long enough for the pointer to cross
  // the gap into the sub-menu, where the sub-menu's own `onMouseEnter`
  // cancels the pending timer and keeps it open.
  const handleMouseLeave = useCallback(() => {
    if (hasChildren) {
      hoverTimeout.current = setTimeout(() => setSubmenuOpen(false), 150);
    }
  }, [hasChildren]);

  if (!isVisible) return null;

  return (
    <>
      <div
        ref={entryRef}
        role="menuitem"
        aria-disabled={isDisabled || undefined}
        data-testid={`context-menu-item-${item.key}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => {
          if (isDisabled) return;
          if (hasChildren) return; // submenu items don't fire onClick directly
          item.onClick(ctx);
          onClose();
        }}
        style={styles.menuItem(isDisabled, !!item.danger)}
      >
        {item.icon && (
          <span
            data-testid={`context-menu-icon-${item.key}`}
            style={styles.icon}
          >
            {item.icon}
          </span>
        )}
        <span style={styles.label}>{item.label}</span>
        {item.shortcut && (
          <span
            data-testid={`context-menu-shortcut-${item.key}`}
            style={styles.shortcut}
          >
            {item.shortcut}
          </span>
        )}
        {hasChildren && (
          <span style={styles.submenuArrow}>&#9654;</span>
        )}
      </div>
      {item.dividerAfter && (
        <div
          data-testid="context-menu-separator"
          style={styles.divider}
          role="separator"
        />
      )}
      {hasChildren && submenuOpen && (
        <div
          role="menu"
          data-testid={`context-menu-submenu-${item.key}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={styles.submenu}
        >
          {item.children!.map((child) => (
            <ContextMenuEntry
              key={child.key}
              item={child}
              ctx={ctx}
              onClose={onClose}
            />
          ))}
        </div>
      )}
    </>
  );
}
