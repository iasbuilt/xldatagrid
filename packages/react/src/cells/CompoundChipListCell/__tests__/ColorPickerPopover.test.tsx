/**
 * Unit tests for the {@link ColorPickerPopover} component and its supporting
 * helpers ({@link normalizeHex}, {@link applyCustomColorToPalette},
 * {@link createInMemoryPaletteAdapter}). These exercise the palette-adapter
 * contract end-to-end without dragging the full chip cell into scope.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

import {
  ColorPickerPopover,
  applyCustomColorToPalette,
  createInMemoryPaletteAdapter,
  normalizeHex,
  PALETTE_MAX,
  DEFAULT_THEME_COLORS,
} from '../ColorPickerPopover';
import type { PaletteAdapter } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// normalizeHex
// ---------------------------------------------------------------------------

describe('normalizeHex', () => {
  it('accepts 6-digit hex with hash', () => {
    expect(normalizeHex('#ABCDEF')).toBe('#abcdef');
  });

  it('accepts 6-digit hex without hash', () => {
    expect(normalizeHex('abcdef')).toBe('#abcdef');
  });

  it('expands 3-digit shorthand to 6-digit form', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
  });

  it('rejects invalid input', () => {
    expect(normalizeHex('not-a-color')).toBeNull();
    expect(normalizeHex('#zzz')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyCustomColorToPalette
// ---------------------------------------------------------------------------

describe('applyCustomColorToPalette', () => {
  it('prepends a new color', () => {
    expect(applyCustomColorToPalette(['#111111'], '#222222')).toEqual([
      '#222222',
      '#111111',
    ]);
  });

  it('dedupes case-insensitively and floats the entry to the front', () => {
    expect(applyCustomColorToPalette(['#111111', '#222222'], '#222222')).toEqual([
      '#222222',
      '#111111',
    ]);
    expect(applyCustomColorToPalette(['#aaaaaa'], '#AAAAAA')).toEqual(['#AAAAAA']);
  });

  it('caps the palette at PALETTE_MAX entries', () => {
    const huge = Array.from({ length: PALETTE_MAX + 5 }, (_, i) =>
      `#${i.toString(16).padStart(6, '0')}`,
    );
    const result = applyCustomColorToPalette(huge, '#abcdef');
    expect(result).toHaveLength(PALETTE_MAX);
    expect(result[0]).toBe('#abcdef');
  });
});

// ---------------------------------------------------------------------------
// createInMemoryPaletteAdapter
// ---------------------------------------------------------------------------

describe('createInMemoryPaletteAdapter', () => {
  it('round-trips colors through read/write', async () => {
    const adapter = createInMemoryPaletteAdapter();
    expect(await adapter.read()).toEqual([]);
    await adapter.write(['#abcdef', '#123456']);
    expect(await adapter.read()).toEqual(['#abcdef', '#123456']);
  });

  it('respects the PALETTE_MAX cap on write', async () => {
    const adapter = createInMemoryPaletteAdapter();
    const huge = Array.from({ length: PALETTE_MAX + 5 }, (_, i) =>
      `#${i.toString(16).padStart(6, '0')}`,
    );
    await adapter.write(huge);
    expect(await adapter.read()).toHaveLength(PALETTE_MAX);
  });

  it('honors an initial palette', async () => {
    const adapter = createInMemoryPaletteAdapter(['#111111']);
    expect(await adapter.read()).toEqual(['#111111']);
  });
});

// ---------------------------------------------------------------------------
// ColorPickerPopover
// ---------------------------------------------------------------------------

describe('ColorPickerPopover', () => {
  function renderPopover(overrides: Partial<{
    paletteAdapter: PaletteAdapter;
    onPick: (c: string) => void;
    onClose: () => void;
    themeColors: string[];
    allowCustomColor: boolean;
    currentColor: string | null;
  }> = {}) {
    const onPick = overrides.onPick ?? vi.fn();
    const onClose = overrides.onClose ?? vi.fn();
    const utils = render(
      <ColorPickerPopover
        currentColor={overrides.currentColor ?? null}
        themeColors={overrides.themeColors}
        paletteAdapter={overrides.paletteAdapter}
        allowCustomColor={overrides.allowCustomColor}
        onPick={onPick}
        onClose={onClose}
      />,
    );
    return { ...utils, onPick, onClose };
  }

  it('renders one button per theme color', () => {
    renderPopover({ themeColors: ['#111111', '#222222'] });
    expect(screen.getAllByRole('button', { name: /theme color/i })).toHaveLength(2);
  });

  it('uses the DEFAULT_THEME_COLORS when no themeColors prop is provided', () => {
    renderPopover();
    expect(screen.getAllByRole('button', { name: /theme color/i })).toHaveLength(
      DEFAULT_THEME_COLORS.length,
    );
  });

  it('fires onPick with the swatch color when a theme swatch is clicked', () => {
    const onPick = vi.fn();
    renderPopover({ themeColors: ['#ef4444'], onPick });
    fireEvent.click(screen.getByRole('button', { name: 'Theme color #ef4444' }));
    expect(onPick).toHaveBeenCalledWith('#ef4444');
  });

  it('renders the empty-state indicator when the palette is empty', async () => {
    renderPopover();
    expect(await screen.findByText(/no recent colors/i)).toBeInTheDocument();
  });

  it('hydrates palette swatches from the adapter on mount', async () => {
    const adapter = createInMemoryPaletteAdapter(['#abcdef', '#123456']);
    renderPopover({ paletteAdapter: adapter });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Palette color #abcdef' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Palette color #123456' })).toBeInTheDocument();
    });
  });

  it('shows a hex input and Add button when allowCustomColor is unset (default true)', () => {
    renderPopover();
    expect(screen.getByLabelText(/hex color/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to palette/i })).toBeInTheDocument();
  });

  it('hides the custom color section when allowCustomColor is false', () => {
    renderPopover({ allowCustomColor: false });
    expect(screen.queryByLabelText(/hex color/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to palette/i })).not.toBeInTheDocument();
  });

  it('fires onPick with the normalized hex when Add to palette is clicked', () => {
    const onPick = vi.fn();
    renderPopover({ onPick });
    fireEvent.change(screen.getByLabelText(/hex color/i), { target: { value: 'ABCDEF' } });
    fireEvent.click(screen.getByRole('button', { name: /add to palette/i }));
    expect(onPick).toHaveBeenCalledWith('#abcdef');
  });

  it('shows an inline error and does NOT fire onPick when the hex is invalid', () => {
    const onPick = vi.fn();
    renderPopover({ onPick });
    fireEvent.change(screen.getByLabelText(/hex color/i), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /add to palette/i }));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/valid hex/i);
  });

  it('commits the hex on Enter inside the hex input', () => {
    const onPick = vi.fn();
    renderPopover({ onPick });
    const input = screen.getByLabelText(/hex color/i);
    fireEvent.change(input, { target: { value: '#3b82f6' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('#3b82f6');
  });

  it('closes on Escape inside the hex input', () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    const input = screen.getByLabelText(/hex color/i);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the user clicks outside the popover', async () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    // jsdom doesn't ship a PointerEvent constructor; the popover listens for
    // `pointerdown` by name so a generic Event with the right type suffices.
    await act(async () => {
      const evt = new Event('pointerdown', { bubbles: true });
      document.dispatchEvent(evt);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('treats palette read failures as an empty palette', async () => {
    const broken: PaletteAdapter = {
      read: vi.fn().mockRejectedValue(new Error('storage down')),
      write: vi.fn(),
    };
    renderPopover({ paletteAdapter: broken });
    // Should fall back to the empty-state indicator rather than throwing.
    expect(await screen.findByText(/no recent colors/i)).toBeInTheDocument();
  });
});
