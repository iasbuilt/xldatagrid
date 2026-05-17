import type { CSSProperties } from 'react';

/**
 * Base wrapper for the display-mode rich-text content. Concrete sizing /
 * overflow behaviour comes from the per-mode style spreads below
 * (`displayTruncate`, `displayWrap`, `displayFit`) so the three issue-#96
 * modes share a single layout primitive.
 */
export const displayContainer: CSSProperties = {
  fontSize: 13,
  lineHeight: '1.4',
  width: '100%',
};

/**
 * Truncate mode (issue #96, default): single line, clip with ellipsis.
 * Uses `whiteSpace: 'nowrap'` + `textOverflow: 'ellipsis'` on the wrapper
 * so the markdown body inherits the clipping behaviour even though its
 * own `display: 'inline'` would otherwise pass through.
 */
export const displayTruncate: CSSProperties = {
  overflow: 'hidden',
  maxHeight: 40,
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
};

/**
 * Wrap mode (issue #96): allow the cell to grow vertically as the
 * markdown wraps to multiple lines. The grid row's effective height is
 * computed as `max(rowHeight, contentHeight)` by the body layout, so the
 * wrapper just removes the height cap and switches to wrap-on-spaces.
 */
export const displayWrap: CSSProperties = {
  whiteSpace: 'normal',
  wordWrap: 'break-word',
  overflowWrap: 'break-word',
};

/**
 * Fit mode (issue #96): no truncation, no wrapping — the
 * RichTextDisplay shrink-to-fit hook scales `font-size` down (within
 * RICH_TEXT_FIT_MIN_FONT_PX) until the content fits the available width.
 * The wrapper itself just provides the single-line layout the hook
 * measures against.
 */
export const displayFit: CSSProperties = {
  overflow: 'hidden',
  whiteSpace: 'nowrap',
};

export const placeholderText: CSSProperties = {
  color: '#9ca3af',
};

/** Prose wrapper so react-markdown output doesn't collapse into a single run-on line. */
export const markdownBody: CSSProperties = {
  display: 'inline',
};

export const editorWrapper: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
};

export const toolbar: CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '2px 4px',
  borderBottom: '1px solid #e5e7eb',
  background: '#f9fafb',
  flexShrink: 0,
};

export const toolbarButton: CSSProperties = {
  cursor: 'pointer',
  padding: '2px 6px',
  border: '1px solid transparent',
  background: 'transparent',
  fontSize: 12,
  fontFamily: 'inherit',
  color: '#374151',
  borderRadius: 3,
};

export const toolbarToggle: CSSProperties = {
  marginLeft: 'auto',
};

export const textarea: CSSProperties = {
  flex: 1,
  width: '100%',
  border: 0,
  outline: 'none',
  resize: 'none',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  padding: 4,
  boxSizing: 'border-box',
};

export const preview: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 4,
  fontSize: 13,
  lineHeight: 1.4,
  boxSizing: 'border-box',
};
