/**
 * Per-cell validation tooltip rendered via a React portal into `document.body`.
 *
 * Rendering contract (enforced by
 * `packages/react/src/__tests__/validation-tooltip.test.tsx` and the e2e
 * suites `e2e/validation-tooltip.spec.ts` /
 * `e2e/issue-78-validation-tooltip-severity.spec.ts`):
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
 *     UI wants (errors first, then warnings, then infos) so this component
 *     stays a pure renderer.
 *   - `data-validation-severity` reflects the most-severe entry so callers
 *     can style by severity (e.g. red background for `error`, yellow for
 *     `warning`, blue for `info`). Paired with `data-validation-target` it
 *     lets tests and consumers address a specific cell's tooltip without
 *     relying on the React tree.
 *   - A single `<span data-icon="<severity>">` glyph is rendered before the
 *     messages block, reflecting the most-severe entry. Issue #78 swapped
 *     the legacy Unicode fallback for an inline SVG glyph (circle-X /
 *     triangle-! / circle-i) so the tooltip reads as a true severity badge
 *     even when the host application has not loaded an icon-font sprite.
 *     The wrapping `[data-icon="..."]` selector is preserved so existing
 *     consumers (CSS overrides, Playwright assertions) keep working.
 *   - The portal background is driven by the severity-keyed token chain
 *     `--dg-validation-{error,warning,info}-bg`, falling back to the
 *     legacy `--dg-{error,warning,info}-color` aliases and finally to
 *     Tailwind-style red-500 / amber-500 / blue-500 literals so the tooltip
 *     stays in the right hue family even when no theme preset is wired up.
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

// Severity to portal-surface colour. Layered fallback chain so consumers can
// either set the issue-78-aligned tokens directly OR keep using the legacy
// `--dg-{error,warning,info}-color` aliases without breakage; the literal
// hex anchors the hue family when no theme is wired up at all (matching the
// hue-family probes in `e2e/validation-tooltip.spec.ts`).
const SEVERITY_BG: Record<ValidationSeverity, string> = {
  error: 'var(--dg-validation-error-bg, var(--dg-error-color, #ef4444))',
  warning: 'var(--dg-validation-warning-bg, var(--dg-warning-color, #f59e0b))',
  info: 'var(--dg-validation-info-bg, var(--dg-info-color, #3b82f6))',
};

// Severity to icon foreground colour. Defaults to white so the SVG glyph
// stays legible against the saturated severity surface; consumers can
// override via `--dg-validation-{error,warning,info}-icon`.
const SEVERITY_ICON_COLOUR: Record<ValidationSeverity, string> = {
  error: 'var(--dg-validation-error-icon, #ffffff)',
  warning: 'var(--dg-validation-warning-icon, #ffffff)',
  info: 'var(--dg-validation-info-icon, #ffffff)',
};

/**
 * Inline-SVG severity glyph rendered inside `[data-icon="<severity>"]`.
 *
 * Issue #78 calls for a real iconographic glyph (circle-X / triangle-! /
 * circle-i) rather than the previous Unicode fallback so the tooltip reads
 * as a true severity badge even when the host application has not loaded an
 * icon-font sprite. The wrapping `<span data-icon="...">` stays in place so
 * the load-bearing CSS / test selector contract is preserved; consumers
 * swapping in a bespoke icon can target `[data-icon="..."] > svg` without
 * losing the data-attribute hook.
 */
function SeverityGlyph({ severity }: { severity: ValidationSeverity }): React.JSX.Element {
  const stroke = SEVERITY_ICON_COLOUR[severity];
  const common = {
    width: 12,
    height: 12,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
  if (severity === 'error') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.5" />
        <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" />
        <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" />
      </svg>
    );
  }
  if (severity === 'warning') {
    return (
      <svg {...common}>
        <path d="M8 2 L14.5 13.5 L1.5 13.5 Z" />
        <line x1="8" y1="6" x2="8" y2="9.5" />
        <line x1="8" y1="11.5" x2="8.01" y2="11.5" />
      </svg>
    );
  }
  // info
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.5" />
      <line x1="8" y1="7" x2="8" y2="11.5" />
      <line x1="8" y1="4.6" x2="8.01" y2="4.6" />
    </svg>
  );
}

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
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span
        data-icon={iconSeverity}
        aria-hidden="true"
        style={{
          flexShrink: 0,
          lineHeight: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SeverityGlyph severity={iconSeverity} />
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
