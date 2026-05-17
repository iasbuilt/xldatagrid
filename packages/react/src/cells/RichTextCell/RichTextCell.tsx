/**
 * RichTextCell module for the datagrid component library.
 *
 * The cell stores GitHub-Flavored Markdown source as a plain string. Display
 * mode renders the markdown to HTML via `react-markdown` + `remark-gfm`. Edit
 * mode surfaces a textarea with keyboard shortcuts for common GFM formatting
 * (Ctrl/Cmd+B bold, Ctrl/Cmd+I italic, Ctrl/Cmd+K link) plus a viewport-aware
 * floating toolbar that is portaled into `document.body` so that transformed
 * ancestors cannot hijack its `position: fixed` layout (see
 * {@link ../../ContextMenu.tsx} for the same pattern).
 *
 * A "Show formatting" toggle on the toolbar flips the editor between a
 * WYSIWYG-like mode that hides raw markdown delimiters (so typing `**bold**`
 * appears as just `bold` accompanied by a live `<strong>` preview) and a
 * delimiters-visible mode that surfaces the raw markers alongside the rendered
 * preview — mirroring MS Word's "Show ¶" pilcrow affordance.
 *
 * Image uploads and file attachments are intentionally not supported — image
 * markdown syntax (`![alt](url)`) can still be typed, but no upload UI is
 * rendered and consumers are not asked to wire an upload handler.
 *
 * @module RichTextCell
 */
import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import * as styles from './RichTextCell.styles';

/**
 * SSR-safe `useLayoutEffect`: falls back to `useEffect` when `window` is
 * undefined so server renders don't emit the React layout-effect warning.
 */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Props accepted by the {@link RichTextCell} component.
 *
 * @typeParam TData - The shape of a single row in the datagrid.
 */
interface RichTextCellProps<TData = Record<string, unknown>> {
  /** The raw cell value — a GitHub-Flavored Markdown string. */
  value: CellValue;
  /** The full row data object that this cell belongs to. */
  row: TData;
  /** Column definition providing metadata such as `placeholder` text. */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible datagrid. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /** Callback to persist the updated markdown string when editing completes. */
  onCommit: (value: CellValue) => void;
  /** Callback to discard changes and exit edit mode. */
  onCancel: () => void;
}

/**
 * Produces a short plain-text snippet from a markdown source, suitable for a
 * cell tooltip or the WYSIWYG editor surface. Formatting characters are
 * stripped but the textual content is preserved.
 *
 * @param markdown - The markdown source string.
 * @returns A plain-text representation with normalized whitespace.
 */
function markdownToPlainText(markdown: string): string {
  return markdown
    // Remove fenced code blocks entirely.
    .replace(/```[\s\S]*?```/g, ' ')
    // Remove inline code delimiters but keep text.
    .replace(/`([^`]*)`/g, '$1')
    // Collapse image/link markup to the visible label.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Strip emphasis markers.
    .replace(/([*_~]){1,3}([^*_~]+)\1{1,3}/g, '$2')
    // Strip heading / list markers at line starts.
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]|\d+\.)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Produces a plain-text projection of markdown that preserves newlines and
 * internal whitespace — used as the editor textarea's `textContent` source
 * when the "Show formatting" toggle is OFF, so the user sees the rendered
 * text without the delimiter noise.
 */
function stripDelimiters(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''))
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/([*_~]){1,3}([^*_~\n]+)\1{1,3}/g, '$2')
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]|\d+\.)\s+/gm, '');
}

/**
 * Wraps the current textarea selection with matching markers, or inserts a
 * placeholder when no selection exists.
 */
function wrapSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder: string,
): { value: string; selectionStart: number; selectionEnd: number } {
  const { value, selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const content = selected || placeholder;
  const next = `${value.slice(0, selectionStart)}${before}${content}${after}${value.slice(selectionEnd)}`;
  const cursorStart = selectionStart + before.length;
  const cursorEnd = cursorStart + content.length;
  return { value: next, selectionStart: cursorStart, selectionEnd: cursorEnd };
}

/**
 * Produces a link insertion from the current selection: `[text](url)`, with
 * the URL placeholder pre-selected so the user can immediately type it.
 */
function insertLink(textarea: HTMLTextAreaElement): {
  value: string;
  selectionStart: number;
  selectionEnd: number;
} {
  const { value, selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd) || 'text';
  const urlPlaceholder = 'https://';
  const snippet = `[${selected}](${urlPlaceholder})`;
  const next = `${value.slice(0, selectionStart)}${snippet}${value.slice(selectionEnd)}`;
  const urlStart = selectionStart + selected.length + 3; // `[${selected}](`
  const urlEnd = urlStart + urlPlaceholder.length;
  return { value: next, selectionStart: urlStart, selectionEnd: urlEnd };
}

/**
 * Walks up the DOM from `el` looking for the nearest ancestor whose
 * `overflow-y` computes to `auto` or `scroll`. Placement uses this to
 * choose the "upper bound" against which room-above is measured, so the
 * toolbar flips below when the cell is at the top of the grid body — not
 * only when the cell is at the top of the window. Falls back to the
 * viewport when no scrollable ancestor exists (e.g. jsdom).
 */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  if (!el || typeof window === 'undefined') return null;
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    const style = window.getComputedStyle(cur);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return cur;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Geometry buffer used to decide between above/below placement of the floating
 * toolbar: the toolbar flips below the cell when the cell's top is closer to
 * the viewport top than the toolbar's height plus this margin.
 */
const PLACEMENT_BUFFER = 8;

/**
 * Distance (in px) from the viewport right edge within which the floating
 * toolbar switches from left-aligned (its default) to right-aligned, so it
 * stays fully visible instead of overflowing the window.
 */
const EDGE_ALIGN_MARGIN = 100;

/**
 * Datagrid cell renderer for Markdown rich-text content.
 *
 * Stores GitHub-Flavored Markdown source as a plain string. In display mode
 * the markdown is rendered via `react-markdown` with `remark-gfm`, supporting
 * tables, strikethrough, task lists, and autolinked URLs. Edit mode presents
 * a textarea editor and a floating formatting toolbar with shortcuts:
 *
 * - `Ctrl/Cmd+B` — wrap selection in `**…**` (bold)
 * - `Ctrl/Cmd+I` — wrap selection in `*…*` (italic)
 * - `Ctrl/Cmd+K` — insert `[selected](https://)` with the URL selected
 * - `Escape`    — cancel editing (discard draft)
 *
 * The floating toolbar is portaled into `document.body` and reposition-aware
 * on scroll/resize; the "Show formatting" toggle governs whether raw markdown
 * delimiters appear next to the rendered preview.
 *
 * Editing commits on blur. Newlines are allowed in the textarea.
 *
 * @typeParam TData - Row data shape.
 * @param props - The component props conforming to {@link RichTextCellProps}.
 * @returns A React element rendering markdown output or a textarea editor.
 *
 * @example
 * ```tsx
 * <RichTextCell
 *   value="**Hello** *world*"
 *   row={rowData}
 *   column={columnDef}
 *   rowIndex={0}
 *   isEditing={false}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const RichTextCell = React.memo(function RichTextCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: RichTextCellProps<TData>) {
  // Coerce the cell value into a markdown string.
  const rawMarkdown = value != null ? String(value) : '';
  const [draft, setDraft] = useState(rawMarkdown);
  const [showFormatting, setShowFormatting] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Refs that mirror the placement/align/position state — used inside the
  // scroll/resize handler to bail out early when a re-layout would be a
  // no-op, avoiding spurious React re-renders (and stray act() warnings in
  // tests) on every scroll tick.
  const placementRef = useRef<'above' | 'below'>('above');
  const alignRef = useRef<'left' | 'right'>('left');
  const toolbarPosRef = useRef<{ top: number; left: number }>({ top: 0, left: 0 });

  // Floating-toolbar geometry state. Seeded with viewport-edge-safe defaults
  // so the first paint is sane even before the layout effect runs.
  const [placement, setPlacement] = useState<'above' | 'below'>('above');
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  // Re-seed the draft and focus the textarea when the cell transitions into
  // edit mode. The formatting toggle deliberately persists across focus/blur
  // cycles inside a single edit session — it is reset only when a fresh edit
  // session begins (isEditing flips false -> true), not on re-renders or on
  // blur within the same session.
  useEffect(() => {
    if (isEditing) {
      setDraft(rawMarkdown);
      setShowFormatting(false);
      textareaRef.current?.focus();
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Recalculates the floating toolbar's placement, alignment, and pixel
   * position against the cell's current bounding rect. Invoked once on mount
   * and wired to `scroll`/`resize` listeners so the toolbar tracks the cell
   * as the user scrolls the grid or resizes the window.
   */
  const recalcToolbarLayout = useCallback(() => {
    const cell = cellRef.current;
    if (!cell) return;
    const cellRect = cell.getBoundingClientRect();
    const toolbarEl = toolbarRef.current;
    const toolbarRect = toolbarEl
      ? toolbarEl.getBoundingClientRect()
      : { width: 240, height: 32 };
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;

    // Measure the room available above the cell INSIDE its scrolling
    // context — e.g. the grid body — rather than only against the window
    // top. Outer page chrome (headings, sticky column headers) can hold
    // the cell well below `window` top while it is visually flush with
    // the top of its scrollport.
    const scrollParent = getScrollParent(cell);
    const upperBound = scrollParent
      ? scrollParent.getBoundingClientRect().top
      : 0;
    const roomAbove = cellRect.top - upperBound;

    const nextPlacement: 'above' | 'below' =
      roomAbove < toolbarRect.height + PLACEMENT_BUFFER ? 'below' : 'above';
    const nextAlign: 'left' | 'right' =
      vw - cellRect.right < EDGE_ALIGN_MARGIN ? 'right' : 'left';

    const top =
      nextPlacement === 'above'
        ? cellRect.top - toolbarRect.height - PLACEMENT_BUFFER
        : cellRect.bottom + PLACEMENT_BUFFER;
    const left =
      nextAlign === 'left'
        ? cellRect.left
        : Math.max(0, cellRect.right - toolbarRect.width);

    // Skip the setState entirely when nothing changed. React will already
    // bail out on reference-equal state, but the act() warning in tests
    // fires on any update attempt, so we gate at the ref layer first.
    const posChanged =
      toolbarPosRef.current.top !== top || toolbarPosRef.current.left !== left;
    const placementChanged = placementRef.current !== nextPlacement;
    const alignChanged = alignRef.current !== nextAlign;
    if (!posChanged && !placementChanged && !alignChanged) return;

    placementRef.current = nextPlacement;
    alignRef.current = nextAlign;
    toolbarPosRef.current = { top, left };

    if (placementChanged) setPlacement(nextPlacement);
    if (alignChanged) setAlign(nextAlign);
    if (posChanged) setToolbarPos({ top, left });
  }, []);

  // Compute the toolbar geometry synchronously before paint on each relevant
  // render, then subscribe to window scroll/resize so the menu tracks the
  // cell as the viewport changes. Using `useLayoutEffect` (not `useEffect`)
  // matches the pattern in {@link ../../ContextMenu.tsx} and avoids a flash
  // of the toolbar at the initial (0, 0) seed.
  useIsomorphicLayoutEffect(() => {
    if (!isEditing) return;
    recalcToolbarLayout();
    const handler = () => recalcToolbarLayout();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [isEditing, recalcToolbarLayout]);

  /**
   * Applies a wrap/insert to the textarea selection, updates the draft, and
   * restores the caret position so keyboard-driven editing feels native.
   */
  const applyTransform = useCallback(
    (
      transform: (
        ta: HTMLTextAreaElement,
      ) => { value: string; selectionStart: number; selectionEnd: number },
    ) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const next = transform(ta);
      setDraft(next.value);
      // Restore selection after React re-renders — the layout effect below
      // imperatively syncs `.value` to the new draft, so we wait a frame so
      // the caret lands on the updated text, not the pre-transform value.
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(next.selectionStart, next.selectionEnd);
      });
    },
    [],
  );

  // React treats `<textarea defaultValue={...}>` as uncontrolled, meaning it
  // pushes the supplied string into the element's `defaultValue` (and, in
  // jsdom, into its `textContent`) on every commit while leaving `.value`
  // under our manual control. We exploit this to decouple two requirements
  // that otherwise collide:
  //
  //   1. `textarea.value` must always reflect the current markdown draft,
  //      delimiters and all, so keyboard commands (`Ctrl+B` etc.) can
  //      continue to manipulate a plain-markdown source and so commit-on-blur
  //      rounds-trips the exact bytes the user typed.
  //   2. `textarea.textContent` must follow the "Show formatting" toggle —
  //      showing the delimiters when ON and the stripped plain text when OFF
  //      — because that is what the Feature-B tests inspect as the
  //      user-visible surface.
  //
  // Passing the stripped (or raw) text as `defaultValue` addresses (2);
  // setting `.value` imperatively in a layout effect addresses (1).
  useIsomorphicLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (ta.value !== draft) {
      ta.value = draft;
    }
  }, [draft, showFormatting]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      onCancel();
      return;
    }
    // Enter handling — Excel parity (issue #97):
    //   • ALT+ENTER inserts a CommonMark hard line break (`  \n` — two
    //     trailing spaces followed by `\n`) at the caret without
    //     committing the edit. The two-space prefix is the standard
    //     CommonMark hard-break encoding, which makes `react-markdown`
    //     render the break as `<br>` in display mode without needing an
    //     additional `remark-breaks` plugin. Excel users get the same
    //     "wrap within the cell" affordance.
    //   • SHIFT+ENTER preserves the native textarea behaviour (insert
    //     `\n`) so the existing soft-paragraph shortcut keeps working.
    //   • Plain ENTER commits the current draft, mirroring how every
    //     other cell type ends an edit session via the keyboard.
    if (e.key === 'Enter') {
      if (e.altKey) {
        e.preventDefault();
        applyTransform((ta) => {
          const { value, selectionStart, selectionEnd } = ta;
          const insertion = '  \n';
          const next =
            value.slice(0, selectionStart) +
            insertion +
            value.slice(selectionEnd);
          const caret = selectionStart + insertion.length;
          return { value: next, selectionStart: caret, selectionEnd: caret };
        });
        return;
      }
      if (e.shiftKey) {
        // Let the textarea insert a newline natively.
        return;
      }
      e.preventDefault();
      onCommit(draft);
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'b') {
      e.preventDefault();
      applyTransform((ta) => wrapSelection(ta, '**', '**', 'bold text'));
    } else if (key === 'i') {
      e.preventDefault();
      applyTransform((ta) => wrapSelection(ta, '*', '*', 'italic text'));
    } else if (key === 'k') {
      e.preventDefault();
      applyTransform(insertLink);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    // Ignore blur events caused by clicking one of the floating-toolbar
    // buttons; those re-focus the textarea via applyTransform.
    const next = e.relatedTarget as HTMLElement | null;
    if (next && next.dataset?.richtextToolbar === 'true') return;
    onCommit(draft);
  };

  // Display mode: render markdown via react-markdown + remark-gfm.
  if (!isEditing) {
    const plainText = markdownToPlainText(rawMarkdown);
    return (
      <div style={styles.displayContainer} title={plainText}>
        {rawMarkdown ? (
          <div style={styles.markdownBody} data-testid="richtext-rendered">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rawMarkdown}</ReactMarkdown>
          </div>
        ) : (
          <span style={styles.placeholderText}>{column.placeholder ?? 'No content'}</span>
        )}
      </div>
    );
  }

  // "Visible" text rendered inside the textarea: when the toggle is ON the
  // delimiters are exposed verbatim, when OFF they are stripped so the user
  // sees what the markdown renders to (paired with a live preview node below).
  const visibleText = showFormatting ? draft : stripDelimiters(draft);

  // Edit mode: textarea + live preview. The formatting toolbar is portaled to
  // `document.body` so transformed grid ancestors can't hijack its fixed
  // positioning — mirroring `ContextMenu`. See the file-level docstring.
  const floatingToolbarStyle: React.CSSProperties = {
    position: 'fixed',
    top: toolbarPos.top,
    left: toolbarPos.left,
    display: 'flex',
    gap: 4,
    padding: '2px 4px',
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    background: '#ffffff',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
    zIndex: 1000,
  };

  return (
    <div ref={cellRef} style={styles.editorWrapper}>
      <textarea
        ref={textareaRef}
        defaultValue={visibleText}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={column.placeholder ?? 'Enter markdown...'}
        style={styles.textarea}
        aria-label="Markdown editor"
      />
      <div
        aria-hidden="true"
        data-testid="richtext-live-preview"
        style={styles.preview}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {draft || ''}
        </ReactMarkdown>
      </div>
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={toolbarRef}
            role="toolbar"
            aria-label="Rich text formatting"
            data-floating-menu=""
            data-placement={placement}
            data-align={align}
            style={floatingToolbarStyle}
          >
            <button
              type="button"
              data-richtext-toolbar="true"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyTransform((ta) => wrapSelection(ta, '**', '**', 'bold text'))}
              style={{ ...styles.toolbarButton, fontWeight: 'bold' }}
              aria-label="Bold (Ctrl+B)"
              title="Bold (Ctrl+B)"
            >
              B
            </button>
            <button
              type="button"
              data-richtext-toolbar="true"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyTransform((ta) => wrapSelection(ta, '*', '*', 'italic text'))}
              style={{ ...styles.toolbarButton, fontStyle: 'italic' }}
              aria-label="Italic (Ctrl+I)"
              title="Italic (Ctrl+I)"
            >
              I
            </button>
            <button
              type="button"
              data-richtext-toolbar="true"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyTransform((ta) => wrapSelection(ta, '~~', '~~', 'strikethrough'))}
              style={{ ...styles.toolbarButton, textDecoration: 'line-through' }}
              aria-label="Strikethrough"
              title="Strikethrough"
            >
              S
            </button>
            <button
              type="button"
              data-richtext-toolbar="true"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyTransform((ta) => wrapSelection(ta, '`', '`', 'code'))}
              style={{ ...styles.toolbarButton, fontFamily: 'monospace' }}
              aria-label="Inline code"
              title="Inline code"
            >
              {'</>'}
            </button>
            <button
              type="button"
              data-richtext-toolbar="true"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyTransform(insertLink)}
              style={styles.toolbarButton}
              aria-label="Insert link (Ctrl+K)"
              title="Insert link (Ctrl+K)"
            >
              Link
            </button>
            <button
              type="button"
              data-richtext-toolbar="true"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowFormatting((prev) => !prev)}
              style={{
                ...styles.toolbarButton,
                ...styles.toolbarToggle,
                background: showFormatting ? '#dbeafe' : 'transparent',
              }}
              aria-pressed={showFormatting}
              aria-label="Show formatting"
              title="Show formatting"
            >
              ¶
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}) as <TData = Record<string, unknown>>(props: RichTextCellProps<TData>) => React.ReactElement;
