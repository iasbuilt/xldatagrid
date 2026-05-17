/**
 * Color picker popover used by the {@link CompoundChipListCell} color
 * sub-chip. Renders three rows of swatches and an optional hex input:
 *
 *   1. Recently-used user palette (hydrated via {@link PaletteAdapter.read})
 *   2. Default theme swatches (per-column `defaultThemeColors`)
 *   3. Hex input + "Add to palette" — only when `allowCustomColor` is on
 *
 * The popover is intentionally framework-agnostic: it renders plain DOM and
 * inline styles so the MUI variant can reuse it without dragging MUI into
 * the React package's surface area.
 *
 * Contract:
 *   - `onPick(color)` fires when the user clicks a swatch OR commits a hex
 *     value via "Add to palette". The grid uses this to update the chip and
 *     to call {@link PaletteAdapter.write} when the color is a new custom
 *     one (i.e. not present in `defaultThemeColors` or the current palette).
 *
 * @module ColorPickerPopover
 */
import React, { useEffect, useState, useRef } from 'react';
import type { PaletteAdapter } from '@iasbuilt/datagrid-core';

/** Maximum number of recently-used colors retained in the palette. */
export const PALETTE_MAX = 8;

/** Sensible default theme swatches used when a column omits `defaultThemeColors`. */
export const DEFAULT_THEME_COLORS: string[] = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
  '#111827',
];

/**
 * Normalizes a user-typed hex string to the canonical lowercase 6-digit form
 * (e.g. `"#ABC"` → `"#aabbcc"`, `"abcdef"` → `"#abcdef"`). Returns `null`
 * when the input is not a valid 3- or 6-digit hex color so callers can keep
 * the input open for correction.
 */
export function normalizeHex(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v.startsWith('#')) v = '#' + v;
  // 3-digit shorthand → 6-digit
  if (/^#[0-9a-f]{3}$/.test(v)) {
    v = '#' + v.slice(1).split('').map((c) => c + c).join('');
  }
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

/**
 * Pure helper: returns the palette that should be persisted after a new
 * custom color is picked. Existing entries float to the front; the list is
 * deduped and capped at {@link PALETTE_MAX}.
 */
export function applyCustomColorToPalette(palette: string[], color: string): string[] {
  const next = [color, ...palette.filter((c) => c.toLowerCase() !== color.toLowerCase())];
  return next.slice(0, PALETTE_MAX);
}

/**
 * Returns a default in-memory {@link PaletteAdapter} bound to a single
 * mutable slot. Each cell instance gets its own when no adapter is wired by
 * the column, so palette state is preserved across picker open/close while
 * the cell is mounted but resets across page reloads — the documented
 * fallback behaviour when a consumer opts out of persistence.
 */
export function createInMemoryPaletteAdapter(initial: string[] = []): PaletteAdapter {
  let store = initial.slice(0, PALETTE_MAX);
  return {
    read: async () => store.slice(),
    write: async (colors) => {
      store = colors.slice(0, PALETTE_MAX);
    },
  };
}

export interface ColorPickerPopoverProps {
  /** Currently-selected chip color, or `null` when the chip has no color. */
  currentColor: string | null;
  /** Theme swatches for the static row. */
  themeColors?: string[];
  /** Storage adapter for the per-user palette. */
  paletteAdapter?: PaletteAdapter;
  /** Whether the hex input + "Add to palette" affordance is shown. */
  allowCustomColor?: boolean;
  /** Invoked when the user selects any color (theme, palette, or custom). */
  onPick: (color: string) => void;
  /** Invoked when the user dismisses the popover (Escape, click-out). */
  onClose: () => void;
}

/**
 * Renders the color picker popover. Self-contained: handles its own palette
 * fetch, hex validation, and click-outside dismissal.
 */
export function ColorPickerPopover({
  currentColor,
  themeColors,
  paletteAdapter,
  allowCustomColor = true,
  onPick,
  onClose,
}: ColorPickerPopoverProps) {
  const [palette, setPalette] = useState<string[]>([]);
  const [hexDraft, setHexDraft] = useState<string>(currentColor ?? '');
  const [hexError, setHexError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Hydrate the palette on mount via the adapter. We deliberately swallow
  // adapter errors and fall back to an empty palette so a misbehaving
  // backend doesn't take the picker down with it.
  useEffect(() => {
    let cancelled = false;
    if (!paletteAdapter) return;
    paletteAdapter
      .read()
      .then((colors) => {
        if (!cancelled) setPalette(colors.slice(0, PALETTE_MAX));
      })
      .catch(() => {
        if (!cancelled) setPalette([]);
      });
    return () => {
      cancelled = true;
    };
  }, [paletteAdapter]);

  // Dismiss on outside click. Pointer-down catches the gesture before any
  // focus shifts the popover into a stale state.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (!containerRef.current) return;
      if (e.target instanceof Node && !containerRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  const theme = themeColors ?? DEFAULT_THEME_COLORS;

  const handleSwatchClick = (color: string) => {
    onPick(color);
  };

  const handleAddToPalette = () => {
    const normalized = normalizeHex(hexDraft);
    if (!normalized) {
      setHexError('Enter a valid hex color (e.g. #3b82f6)');
      return;
    }
    setHexError(null);
    onPick(normalized);
  };

  const handleHexKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddToPalette();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Color picker"
      data-color-picker-popover
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: '100%',
        left: 0,
        marginTop: 4,
        background: '#fff',
        border: '1px solid #d1d5db',
        borderRadius: 6,
        padding: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
        Recently used
      </div>
      <div
        data-color-picker-section="palette"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, minHeight: 18 }}
      >
        {palette.length === 0 ? (
          <span style={{ fontSize: 10, color: '#9ca3af' }} data-color-picker-empty>
            No recent colors
          </span>
        ) : (
          palette.map((c) => (
            <button
              key={`p-${c}`}
              type="button"
              aria-label={`Palette color ${c}`}
              data-palette-swatch={c}
              onClick={() => handleSwatchClick(c)}
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                border: '1px solid #d1d5db',
                background: c,
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))
        )}
      </div>

      <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
        Theme colors
      </div>
      <div
        data-color-picker-section="theme"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}
      >
        {theme.map((c) => (
          <button
            key={`t-${c}`}
            type="button"
            aria-label={`Theme color ${c}`}
            data-theme-swatch={c}
            onClick={() => handleSwatchClick(c)}
            style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              border: '1px solid #d1d5db',
              background: c,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>

      {allowCustomColor ? (
        <div data-color-picker-section="custom">
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
            Custom color
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              aria-label="Hex color"
              data-color-picker-hex-input
              value={hexDraft}
              onChange={(e) => {
                setHexDraft(e.target.value);
                if (hexError) setHexError(null);
              }}
              onKeyDown={handleHexKeyDown}
              placeholder="#3b82f6"
              style={{
                flex: 1,
                fontSize: 11,
                padding: '2px 4px',
                border: '1px solid #d1d5db',
                borderRadius: 4,
                outline: 'none',
                fontFamily: 'monospace',
              }}
            />
            <button
              type="button"
              data-color-picker-add
              onClick={handleAddToPalette}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                border: '1px solid #d1d5db',
                borderRadius: 4,
                background: '#f9fafb',
                cursor: 'pointer',
              }}
            >
              Add to palette
            </button>
          </div>
          {hexError ? (
            <div
              role="alert"
              data-color-picker-hex-error
              style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}
            >
              {hexError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
