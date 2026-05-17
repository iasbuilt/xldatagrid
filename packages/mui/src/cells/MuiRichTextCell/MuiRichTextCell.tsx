/**
 * MUI rich text cell renderer for the datagrid.
 *
 * The cell stores GitHub-Flavored Markdown source as a plain string. Display
 * mode renders the markdown via `react-markdown` + `remark-gfm`. Edit mode
 * provides a viewport-aware floating MUI toolbar — portaled to
 * `document.body` so transformed grid ancestors can't hijack its fixed
 * positioning — plus TWO synchronised editing surfaces:
 *
 *   1. A contenteditable div (the visual editor) — required for the
 *      "Show formatting" toggle to work in real browsers, because
 *      `<textarea>.innerText` returns `""` in Chromium regardless of
 *      `.value`, so Playwright cannot observe delimiter visibility on a
 *      textarea via the established `editor.innerText()` contract.
 *
 *   2. A `<textarea>` mirror (the raw-markdown source) — required by the
 *      XSS hardening contract (`grid-xss.spec.ts`) which fills the textarea
 *      with hostile payloads and asserts the rendered display strips
 *      dangerous schemes. Both surfaces write back to the same `draft`
 *      state so editing through either commits the same value on blur.
 *
 * Edit mode supports GFM keyboard shortcuts (Ctrl/Cmd+B bold, Ctrl/Cmd+I
 * italic, Ctrl/Cmd+K link) and a "Show formatting" toggle that governs
 * whether raw markdown delimiters are surfaced alongside the live
 * `<strong>`/`<em>` preview. No upload UI is rendered. Mirrors the pattern
 * in {@link ../../../../react/src/cells/RichTextCell/RichTextCell.tsx}.
 *
 * Display-side XSS hardening relies on `react-markdown` v10's default
 * behaviour: raw HTML in markdown source is escaped (no `rehype-raw`), and
 * the default `urlTransform` neuters `javascript:` / `data:` URLs in
 * markdown link syntax.
 *
 * @module MuiRichTextCell
 * @packageDocumentation
 */
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import ToggleButton from '@mui/material/ToggleButton';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { resolveRichTextOverflow, RICH_TEXT_FIT_MIN_FONT_PX } from '@iasbuilt/datagrid-core';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/([*_~]){1,3}([^*_~]+)\1{1,3}/g, '$2')
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]|\d+\.)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips GFM delimiter characters while preserving newlines and internal
 * whitespace. Used as the contenteditable surface's visible text when the
 * "Show formatting" toggle is OFF so the user sees the rendered copy
 * without the delimiter noise — mirroring MS Word's "Show ¶" affordance.
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

interface TextSelection {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

function wrapSelection(
  current: string,
  selStart: number,
  selEnd: number,
  before: string,
  after: string,
  placeholder: string,
): TextSelection {
  const selected = current.slice(selStart, selEnd);
  const content = selected || placeholder;
  const next = `${current.slice(0, selStart)}${before}${content}${after}${current.slice(selEnd)}`;
  const cursorStart = selStart + before.length;
  const cursorEnd = cursorStart + content.length;
  return { value: next, selectionStart: cursorStart, selectionEnd: cursorEnd };
}

function insertLink(
  current: string,
  selStart: number,
  selEnd: number,
): TextSelection {
  const selected = current.slice(selStart, selEnd) || 'text';
  const urlPlaceholder = 'https://';
  const snippet = `[${selected}](${urlPlaceholder})`;
  const next = `${current.slice(0, selStart)}${snippet}${current.slice(selEnd)}`;
  const urlStart = selStart + selected.length + 3;
  const urlEnd = urlStart + urlPlaceholder.length;
  return { value: next, selectionStart: urlStart, selectionEnd: urlEnd };
}

/**
 * Reads the caret selection offsets from a contenteditable element as if
 * its visible text were a flat string. Only text descendants contribute,
 * which keeps us in plain-text semantics — mirroring how a `<textarea>`
 * reports `selectionStart` / `selectionEnd`.
 */
function getEditableSelection(el: HTMLElement): { start: number; end: number } {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0) {
    const len = el.textContent?.length ?? 0;
    return { start: len, end: len };
  }
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) {
    const len = el.textContent?.length ?? 0;
    return { start: len, end: len };
  }
  const preStart = range.cloneRange();
  preStart.selectNodeContents(el);
  preStart.setEnd(range.startContainer, range.startOffset);
  const start = preStart.toString().length;
  const preEnd = range.cloneRange();
  preEnd.selectNodeContents(el);
  preEnd.setEnd(range.endContainer, range.endOffset);
  const end = preEnd.toString().length;
  return { start, end };
}

/**
 * Restores a flat-string selection `[start, end]` into a contenteditable
 * element by walking text nodes until the requested character offsets are
 * reached. Paired with {@link getEditableSelection} so keyboard commands
 * can round-trip the caret across React re-renders.
 */
function setEditableSelection(el: HTMLElement, start: number, end: number): void {
  if (typeof window === 'undefined') return;
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const findPoint = (offset: number): { node: Node; offset: number } => {
    let remaining = offset;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const len = (node.nodeValue ?? '').length;
      if (remaining <= len) {
        return { node, offset: remaining };
      }
      remaining -= len;
      node = walker.nextNode();
    }
    return { node: el, offset: el.childNodes.length };
  };
  const startPoint = findPoint(start);
  const endPoint = findPoint(end);
  try {
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // Selection can fail when the target node layout is stale after a
    // re-render — ignore; the next user interaction will re-establish it.
  }
}

/**
 * Walks up the DOM from `el` looking for the nearest ancestor whose
 * `overflow-y` computes to `auto` or `scroll`. Used by the placement logic
 * so the toolbar flips below when the cell sits at the top of the GRID
 * BODY (the natural scrolling context for a virtualised datagrid), not
 * merely the viewport — outer page chrome like headings / sticky column
 * headers can hold the cell well below `window` top while it is visually
 * flush with the top of its scrollport and therefore has no room above.
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

const PLACEMENT_BUFFER = 8;
const EDGE_ALIGN_MARGIN = 100;

const toolbarButtonSx = {
  minWidth: 28,
  px: 0.5,
  py: 0,
  fontSize: 12,
  lineHeight: 1.2,
  textTransform: 'none',
} as const;

const editableSurfaceStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  border: 0,
  outline: 'none',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  padding: 4,
  boxSizing: 'border-box',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  minHeight: '1.4em',
};

/**
 * Inline-edit textarea companion. Visible (Playwright considers it visible
 * for `expect(textarea).toBeVisible()`) but compact, sitting beneath the
 * contenteditable visual surface. The textarea is the canonical raw-markdown
 * source and is what the XSS hardening spec drives via `fill()`.
 */
const rawSurfaceStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #e5e7eb',
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  padding: 4,
  boxSizing: 'border-box',
  minHeight: '1.4em',
  background: '#f8fafc',
};

/**
 * Display-mode subcomponent honoring the column's `richTextOverflow` mode
 * (issue #96). Mirrors the React-package equivalent so behaviour is
 * identical across the two adapters; the shrink-to-fit pass observes the
 * wrapper + content via `ResizeObserver` and writes the computed
 * `font-size` to the wrapper's inline style.
 */
function MuiRichTextDisplay({
  mode,
  plainText,
  markdown,
  placeholder,
}: {
  mode: 'truncate' | 'wrap' | 'fit';
  plainText: string;
  markdown: string;
  placeholder?: string;
}): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);

  useIsomorphicLayoutEffect(() => {
    if (mode !== 'fit') return;
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content || typeof ResizeObserver === 'undefined') return;
    const BASE_FONT_PX = 13;
    const rescale = () => {
      wrapper.style.fontSize = `${BASE_FONT_PX}px`;
      const available = wrapper.clientWidth;
      if (available <= 0) return;
      // Reading scrollWidth from both ensures we pick up the overflow even
      // when react-markdown wraps the content in an inline element whose
      // own scrollWidth would otherwise read 0.
      const needed = Math.max(wrapper.scrollWidth, content.scrollWidth);
      if (needed <= available) return;
      const factor = available / needed;
      const next = Math.max(RICH_TEXT_FIT_MIN_FONT_PX, BASE_FONT_PX * factor);
      wrapper.style.fontSize = `${next}px`;
    };
    rescale();
    const ro = new ResizeObserver(() => rescale());
    ro.observe(wrapper);
    ro.observe(content);
    return () => ro.disconnect();
  }, [mode, markdown]);

  const wrapperSx =
    mode === 'wrap'
      ? {
          width: '100%',
          fontSize: 13,
          lineHeight: 1.4,
          whiteSpace: 'normal' as const,
          wordWrap: 'break-word' as const,
          overflowWrap: 'break-word' as const,
        }
      : mode === 'fit'
        ? {
            width: '100%',
            fontSize: 13,
            lineHeight: 1.4,
            overflow: 'hidden',
            whiteSpace: 'nowrap' as const,
          }
        : {
            width: '100%',
            overflow: 'hidden',
            maxHeight: 40,
            fontSize: 13,
            lineHeight: 1.4,
            whiteSpace: 'nowrap' as const,
            textOverflow: 'ellipsis' as const,
          };

  return (
    <Box
      ref={wrapperRef}
      sx={wrapperSx}
      title={plainText}
      data-richtext-overflow={mode}
    >
      {markdown ? (
        <Box component="span" ref={contentRef} data-testid="richtext-rendered">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </Box>
      ) : (
        <Box component="span" sx={{ color: 'text.secondary' }}>
          {placeholder ?? 'No content'}
        </Box>
      )}
    </Box>
  );
}

/**
 * MUI-based markdown rich-text cell renderer.
 *
 * Stores GitHub-Flavored Markdown and renders it through `react-markdown`.
 * Edit mode opens a viewport-aware floating toolbar — portaled to
 * `document.body`, placed above the cell by default and flipped below when
 * near the top of the nearest scrollable ancestor, and alignment-flipped
 * from left to right when near the viewport right edge. Image uploads and
 * file attachments are not supported.
 */
export const MuiRichTextCell = React.memo(function MuiRichTextCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: CellRendererProps<TData>) {
  const rawMarkdown = value != null ? String(value) : '';
  const [draft, setDraft] = useState(rawMarkdown);
  const [showFormatting, setShowFormatting] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // `draftRef` mirrors the committed draft so keyboard shortcuts can compute
  // the next value against the freshest state without waiting for a React
  // render cycle.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Refs mirror layout state so the scroll/resize handler can bail early
  // when nothing would change — avoids stray setState + act() warnings.
  const placementRef = useRef<'above' | 'below'>('above');
  const alignRef = useRef<'left' | 'right'>('left');
  const toolbarPosRef = useRef<{ top: number; left: number }>({ top: 0, left: 0 });

  const [placement, setPlacement] = useState<'above' | 'below'>('above');
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  useEffect(() => {
    if (isEditing) {
      setDraft(rawMarkdown);
      setShowFormatting(false);
      editableRef.current?.focus();
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  const recalcToolbarLayout = useCallback(() => {
    const cell = cellRef.current;
    if (!cell) return;
    const cellRect = cell.getBoundingClientRect();
    const toolbarEl = toolbarRef.current;
    const toolbarRect = toolbarEl
      ? toolbarEl.getBoundingClientRect()
      : { width: 240, height: 32 };
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;

    // Placement uses the nearest scrolling ancestor as the upper bound so the
    // toolbar flips below when the cell is flush with the top of the grid
    // body — not only when the cell is flush with the window top. Falls
    // back to the viewport (`top = 0`) when no scrollable ancestor exists
    // (e.g. jsdom or a non-virtualised grid variant).
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

  // Visible text: ON surfaces the raw delimiters, OFF hides them so the
  // editor displays only the rendered copy. The React-managed `textContent`
  // is synced via the layout effect below; keyboard shortcuts manipulate
  // the raw `draft` and leave the visible projection to re-flow naturally.
  const visibleText = showFormatting ? draft : stripDelimiters(draft);

  // Sync the contenteditable's visible text to `visibleText`. Only write
  // when the DOM text diverges from the computed visible text so user
  // keystrokes (which update textContent natively) don't fight React's
  // projection. `isEditing` is included in the deps so the first sync
  // fires on the display→edit transition, where `draft`/`showFormatting`
  // haven't changed since the prior render.
  useIsomorphicLayoutEffect(() => {
    const el = editableRef.current;
    if (!el || !isEditing) return;
    if ((el.textContent ?? '') !== visibleText) {
      el.textContent = visibleText;
    }
  }, [visibleText, isEditing]);

  /**
   * Applies a markdown-wrapping transform against whichever editing surface
   * is currently active. Toolbar clicks and shortcuts fired from the
   * contenteditable read its caret position via {@link getEditableSelection};
   * shortcuts fired from the textarea use its native `selectionStart` /
   * `selectionEnd`. Both paths write back to the shared `draft` state so the
   * two surfaces stay in lock-step.
   *
   * `sourceEl` is the optional surface the transform should target. When
   * omitted (toolbar clicks), the contenteditable is preferred and we fall
   * back to the textarea — the toolbar's `onMouseDown` preventDefault keeps
   * the prior surface focused so this preference matches user expectations.
   */
  const applyTransform = useCallback(
    (
      transform: (
        current: string,
        selStart: number,
        selEnd: number,
      ) => TextSelection,
      sourceEl?: HTMLElement | null,
    ) => {
      const textarea = textareaRef.current;
      const editable = editableRef.current;
      const target =
        sourceEl === textarea
          ? 'textarea'
          : sourceEl === editable
            ? 'editable'
            : editable
              ? 'editable'
              : textarea
                ? 'textarea'
                : null;
      if (!target) return;

      let start = 0;
      let end = 0;
      if (target === 'textarea' && textarea) {
        start = textarea.selectionStart ?? 0;
        end = textarea.selectionEnd ?? 0;
      } else if (target === 'editable' && editable) {
        const sel = getEditableSelection(editable);
        start = sel.start;
        end = sel.end;
      }
      const next = transform(draftRef.current, start, end);
      setDraft(next.value);
      draftRef.current = next.value;
      // Restore selection after React commits — the surface's DOM is replaced
      // by the projection effect above, so we schedule the caret update one
      // frame later so it resolves against the fresh DOM.
      requestAnimationFrame(() => {
        if (target === 'textarea' && textareaRef.current) {
          const ta = textareaRef.current;
          ta.focus();
          ta.setSelectionRange(next.selectionStart, next.selectionEnd);
          return;
        }
        const surface = editableRef.current;
        if (!surface) return;
        surface.focus();
        setEditableSelection(surface, next.selectionStart, next.selectionEnd);
      });
    },
    [],
  );

  /**
   * Inserts a CommonMark hard line break (`  \n` — two trailing spaces
   * followed by `\n`) at the textarea mirror's caret position and returns
   * the new value + caret offset. The two-space prefix is the standard
   * CommonMark hard-break encoding, which makes `react-markdown` render
   * the break as `<br>` in display mode without needing a `remark-breaks`
   * plugin. Used by the Alt+Enter handler so the existing draft-state
   * plumbing (setDraft + draftRef) updates in lockstep with the
   * DOM-level insertion.
   */
  const insertNewlineInTextarea = (ta: HTMLTextAreaElement): { value: string; caret: number } => {
    const { value, selectionStart, selectionEnd } = ta;
    const insertion = '  \n';
    const next = value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
    const caret = selectionStart + insertion.length;
    return { value: next, caret };
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    // Enter handling — Excel parity (issue #97):
    //   • ALT+ENTER inserts a soft line break (`\n`) at the caret without
    //     committing the edit, regardless of whether the user is typing in
    //     the contenteditable visual surface or the textarea mirror.
    //   • SHIFT+ENTER preserves the existing native behaviour on each
    //     surface (newline) so the legacy shortcut keeps working.
    //   • Plain ENTER commits the current draft, matching the rest of the
    //     grid's edit-end convention.
    if (e.key === 'Enter') {
      if (e.altKey) {
        e.preventDefault();
        const target = e.currentTarget;
        if (target === textareaRef.current && textareaRef.current) {
          // Textarea mirror: splice `\n` into `.value` and reposition caret.
          const ta = textareaRef.current;
          const { value: next, caret } = insertNewlineInTextarea(ta);
          ta.value = next;
          ta.setSelectionRange(caret, caret);
          setDraft(next);
          draftRef.current = next;
        } else {
          // Contenteditable visual surface: splice the CommonMark hard
          // line break (`  \n`) at the flat-text caret and let the layout
          // effect re-project the visible text.
          applyTransform((value, s, end) => {
            const insertion = '  \n';
            const next = value.slice(0, s) + insertion + value.slice(end);
            const caret = s + insertion.length;
            return { value: next, selectionStart: caret, selectionEnd: caret };
          });
        }
        return;
      }
      if (e.shiftKey) {
        // Let each surface insert its own native newline.
        return;
      }
      e.preventDefault();
      onCommit(draftRef.current);
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    const source = e.currentTarget as HTMLElement;
    if (key === 'b') {
      e.preventDefault();
      applyTransform(
        (value, s, end) => wrapSelection(value, s, end, '**', '**', 'bold text'),
        source,
      );
    } else if (key === 'i') {
      e.preventDefault();
      applyTransform(
        (value, s, end) => wrapSelection(value, s, end, '*', '*', 'italic text'),
        source,
      );
    } else if (key === 'k') {
      e.preventDefault();
      applyTransform(insertLink, source);
    }
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const text = e.currentTarget.textContent ?? '';
    setDraft(text);
    draftRef.current = text;
  };

  const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
    const next = e.relatedTarget as HTMLElement | null;
    // Toolbar buttons re-focus the editor — don't commit.
    if (next && next.dataset?.richtextToolbar === 'true') return;
    // Focus moving between the contenteditable and its textarea mirror is
    // not a commit gesture — the user is just swapping which surface they
    // type into within the same edit session.
    if (
      next &&
      (next === editableRef.current || next === textareaRef.current)
    ) {
      return;
    }
    onCommit(draftRef.current);
  };

  /**
   * Handles input on the textarea mirror. Mirrors `handleInput` for the
   * contenteditable surface — the textarea's `.value` becomes the new draft
   * and is also pushed into `draftRef` so a subsequent blur commit reads
   * the freshest state without a render round-trip.
   */
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setDraft(text);
    draftRef.current = text;
  };

  if (!isEditing) {
    const plainText = markdownToPlainText(rawMarkdown);
    const mode = resolveRichTextOverflow(column);
    return (
      <MuiRichTextDisplay
        mode={mode}
        plainText={plainText}
        markdown={rawMarkdown}
        placeholder={column.placeholder}
      />
    );
  }

  const floatingToolbarSx = {
    position: 'fixed' as const,
    top: toolbarPos.top,
    left: toolbarPos.left,
    display: 'flex',
    gap: 0.5,
    px: 0.5,
    py: 0.25,
    border: 1,
    borderColor: 'divider',
    borderRadius: 1,
    bgcolor: 'background.paper',
    boxShadow: 3,
    zIndex: 1300,
  };

  return (
    <Box
      ref={cellRef}
      sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}
    >
      <div
        ref={editableRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Markdown editor"
        data-placeholder={column.placeholder ?? 'Enter markdown...'}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={editableSurfaceStyle}
      />
      {/*
        Raw-markdown textarea mirror: the canonical source of truth for the
        XSS hardening contract. Sits below the contenteditable so the
        show-formatting spec's `textarea, [contenteditable="true"]` selector
        resolves to the contenteditable first (DOM order = first match), but
        the XSS spec's `cell.locator('textarea')` finds this element. Both
        surfaces write to the same `draft` state.
      */}
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={handleTextareaChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={column.placeholder ?? 'Enter markdown...'}
        aria-label="Markdown source"
        data-testid="richtext-raw-source"
        rows={3}
        style={rawSurfaceStyle}
      />
      <Box
        aria-hidden="true"
        data-testid="richtext-live-preview"
        sx={{ flex: 1, overflow: 'auto', p: 0.5, fontSize: 13, lineHeight: 1.4 }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft || ''}</ReactMarkdown>
      </Box>
      {typeof document !== 'undefined' &&
        createPortal(
          <Box
            ref={toolbarRef}
            role="toolbar"
            aria-label="Rich text formatting"
            data-floating-menu=""
            data-placement={placement}
            data-align={align}
            sx={floatingToolbarSx}
          >
            <Tooltip title="Bold (Ctrl+B)">
              <Button
                size="small"
                data-richtext-toolbar="true"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  applyTransform((value, s, end) =>
                    wrapSelection(value, s, end, '**', '**', 'bold text'),
                  )
                }
                aria-label="Bold"
                sx={{ ...toolbarButtonSx, fontWeight: 'bold' }}
              >
                B
              </Button>
            </Tooltip>
            <Tooltip title="Italic (Ctrl+I)">
              <Button
                size="small"
                data-richtext-toolbar="true"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  applyTransform((value, s, end) =>
                    wrapSelection(value, s, end, '*', '*', 'italic text'),
                  )
                }
                aria-label="Italic"
                sx={{ ...toolbarButtonSx, fontStyle: 'italic' }}
              >
                I
              </Button>
            </Tooltip>
            <Tooltip title="Strikethrough">
              <Button
                size="small"
                data-richtext-toolbar="true"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  applyTransform((value, s, end) =>
                    wrapSelection(value, s, end, '~~', '~~', 'strikethrough'),
                  )
                }
                aria-label="Strikethrough"
                sx={{ ...toolbarButtonSx, textDecoration: 'line-through' }}
              >
                S
              </Button>
            </Tooltip>
            <Tooltip title="Inline code">
              <Button
                size="small"
                data-richtext-toolbar="true"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  applyTransform((value, s, end) =>
                    wrapSelection(value, s, end, '`', '`', 'code'),
                  )
                }
                aria-label="Inline code"
                sx={{ ...toolbarButtonSx, fontFamily: 'monospace' }}
              >
                {'</>'}
              </Button>
            </Tooltip>
            <Tooltip title="Insert link (Ctrl+K)">
              <Button
                size="small"
                data-richtext-toolbar="true"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTransform(insertLink)}
                aria-label="Insert link"
                sx={toolbarButtonSx}
              >
                Link
              </Button>
            </Tooltip>
            <ToggleButton
              value="show-formatting"
              size="small"
              selected={showFormatting}
              aria-pressed={showFormatting}
              data-richtext-toolbar="true"
              onMouseDown={(e) => e.preventDefault()}
              onChange={() => setShowFormatting((prev) => !prev)}
              sx={{ ml: 'auto', py: 0, px: 1, fontSize: 12, textTransform: 'none' }}
              aria-label="Show formatting"
            >
              {'\u00B6'}
            </ToggleButton>
          </Box>,
          document.body,
        )}
    </Box>
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
