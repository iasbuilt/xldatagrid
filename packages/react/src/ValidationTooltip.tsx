/**
 * Per-cell validation tooltip rendered via a React portal into `document.body`.
 *
 * Rendering contract (enforced by
 * `packages/react/src/__tests__/validation-tooltip.test.tsx`):
 *
 *   - The tooltip node lives on `document.body`, never inside the grid
 *     container. Portal target is the document body so the overlay can escape
 *     the grid's overflow / stacking context.
 *   - One tooltip exists per validated cell whenever `results.length > 0`.
 *     Hover / focus on the cell flips `data-state` between `"closed"` (idle)
 *     and `"open"` (hovered or focused). The node stays mounted while results
 *     are present so assistive tech can still reach the messaging by id
 *     lookup even when the tooltip is visually dismissed.
 *   - Each result renders as a `<div data-validation-message>{message}</div>`
 *     child. The caller is responsible for ordering the results the way the
 *     UI wants — errors first, then warnings, then infos — so this component
 *     stays a pure renderer.
 *   - `data-validation-severity` reflects the most-severe entry so callers
 *     can style by severity (e.g. red border for `error`, yellow for
 *     `warning`). Paired with `data-validation-target` it lets tests and
 *     consumers address a specific cell's tooltip without relying on the
 *     React tree.
 *   - A single `<span data-icon="<severity>">` glyph is rendered before the
 *     messages block, reflecting the most-severe entry. Consumers can target
 *     `[data-icon="error" | "warning" | "info"]` to swap in a bespoke SVG;
 *     the built-in glyph is a unicode fallback so the tooltip still reads
 *     as severity-tagged without any icon-font dependency.
 *
 * @module ValidationTooltip
 */
import React from 'react';
import { createPortal } from 'react-dom';
import type { ValidationResult, ValidationSeverity } from '@iasbuilt/datagrid-core';

export interface ValidationTooltipProps {
  /** Id of the row the tooltip describes. */
  rowId: string;
  /** Field name of the cell the tooltip describes. */
  field: string;
  /** All validation results for the cell, already ordered for display. */
  results: ValidationResult[];
  /** Whether the tooltip is currently open (hovered or focused). */
  open: boolean;
  /** Most-severe result, drives `data-validation-severity` and colouring. */
  severity: ValidationSeverity | null;
}

// Severity → background colour token. Consumers can override by supplying
// their own CSS for `[data-validation-severity="error"]` / `="warning"` /
// `="info"` — these fallbacks match the existing `--dg-*-color` tokens.
const SEVERITY_BG: Record<ValidationSeverity, string> = {
  error: 'var(--dg-error-color, #ef4444)',
  warning: 'var(--dg-warning-color, #f59e0b)',
  info: 'var(--dg-info-color, #3b82f6)',
};

// Severity → unicode glyph used as the default icon. Consumers can override
// by styling/replacing `[data-icon="<severity>"]` via portal CSS; the
// `data-icon` attribute is the load-bearing contract so tests and external
// icon swaps keep working either way.
const SEVERITY_ICON: Record<ValidationSeverity, string> = {
  error: '\u2716', // HEAVY MULTIPLICATION X — reads as "error" without an icon font.
  warning: '\u26A0', // WARNING SIGN.
  info: '\u2139', // INFORMATION SOURCE.
};

/**
 * Renders a single portal tooltip for a validated cell.
 *
 * The component returns `null` when called without results to render. When
 * results are present it mounts a single `<div role="tooltip">` into
 * `document.body` via `createPortal`, toggling `data-state` based on the
 * caller-supplied `open` flag so hover / focus lifecycle stays owned upstream.
 */
export function ValidationTooltip(props: ValidationTooltipProps): React.ReactPortal | null {
  const { rowId, field, results, open, severity } = props;
  if (typeof document === 'undefined') return null;
  if (results.length === 0) return null;

  const bg = severity ? SEVERITY_BG[severity] : SEVERITY_BG.info;
  // Most-severe entry drives the icon. When `severity` is null we still have
  // at least one result (see early return above), so fall back to the first
  // entry's own severity instead of hard-coding `info`.
  const iconSeverity: ValidationSeverity = severity ?? results[0]!.severity;

  return createPortal(
    <div
      role="tooltip"
      data-validation-target={`${rowId}:${field}`}
      data-state={open ? 'open' : 'closed'}
      data-validation-severity={severity ?? undefined}
      style={{
        position: 'fixed',
        zIndex: 10000,
        visibility: open ? 'visible' : 'hidden',
        pointerEvents: 'none',
        background: bg,
        color: 'white',
        padding: '4px 8px',
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.4,
        maxWidth: 260,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
      }}
    >
      <span
        data-icon={iconSeverity}
        aria-hidden="true"
        style={{ flexShrink: 0, lineHeight: 1, fontSize: 14 }}
      >
        {SEVERITY_ICON[iconSeverity]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {results.map((r, i) => (
          <div key={i} data-validation-message data-severity={r.severity}>
            {r.message}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
