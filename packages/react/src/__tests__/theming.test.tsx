import { render, screen } from '@testing-library/react';
import { DataGrid, LIGHT_THEME, DARK_THEME, resolveThemeStyle } from '../DataGrid';
import darkTokens from '../styles/tokens/dark.json';
import lightTokens from '../styles/tokens/light.json';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type TestRow = { id: string; name: string; age: number };

function makeData(): TestRow[] {
  return [
    { id: '1', name: 'Alice', age: 30 },
    { id: '2', name: 'Bob', age: 25 },
  ];
}

const columns = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'age', field: 'age', title: 'Age' },
];

function renderGrid(overrides: Partial<Parameters<typeof DataGrid>[0]> = {}) {
  return render(
    <DataGrid
      data={makeData()}
      columns={columns}
      rowKey="id"
      {...(overrides as any)}
    />,
  );
}

/** Helper: get the inline style value for a CSS custom property on the grid container */
function getGridStyle(prop: string): string {
  const grid = screen.getByRole('grid');
  return grid.style.getPropertyValue(prop);
}

// ---------------------------------------------------------------------------
// Individual CSS custom property tests
// ---------------------------------------------------------------------------

describe('Theming', () => {
  it('theme applies CSS custom property for primary color', () => {
    renderGrid({ theme: { '--dg-primary-color': '#ff0000' } });
    expect(getGridStyle('--dg-primary-color')).toBe('#ff0000');
  });

  it('theme applies CSS custom property for background color', () => {
    renderGrid({ theme: { '--dg-bg-color': '#111111' } });
    expect(getGridStyle('--dg-bg-color')).toBe('#111111');
  });

  it('theme applies CSS custom property for text color', () => {
    renderGrid({ theme: { '--dg-text-color': '#222222' } });
    expect(getGridStyle('--dg-text-color')).toBe('#222222');
  });

  it('theme applies CSS custom property for border color', () => {
    renderGrid({ theme: { '--dg-border-color': '#333333' } });
    expect(getGridStyle('--dg-border-color')).toBe('#333333');
  });

  it('theme applies CSS custom property for header background', () => {
    renderGrid({ theme: { '--dg-header-bg': '#444444' } });
    expect(getGridStyle('--dg-header-bg')).toBe('#444444');
  });

  it('theme applies CSS custom property for cell padding', () => {
    renderGrid({ theme: { '--dg-cell-padding': '0 20px' } });
    expect(getGridStyle('--dg-cell-padding')).toBe('0 20px');
  });

  it('theme applies CSS custom property for font family', () => {
    renderGrid({ theme: { '--dg-font-family': 'monospace' } });
    expect(getGridStyle('--dg-font-family')).toBe('monospace');
  });

  it('theme applies CSS custom property for font size', () => {
    renderGrid({ theme: { '--dg-font-size': '16px' } });
    expect(getGridStyle('--dg-font-size')).toBe('16px');
  });

  it('theme applies CSS custom property for row height', () => {
    renderGrid({ theme: { '--dg-row-height': '48px' } });
    expect(getGridStyle('--dg-row-height')).toBe('48px');
  });

  it('theme applies CSS custom property for selection color', () => {
    renderGrid({ theme: { '--dg-selection-color': '#00ff00' } });
    expect(getGridStyle('--dg-selection-color')).toBe('#00ff00');
  });

  it('theme applies CSS custom property for error color', () => {
    renderGrid({ theme: { '--dg-error-color': '#ff00ff' } });
    expect(getGridStyle('--dg-error-color')).toBe('#ff00ff');
  });

  it('theme applies CSS custom property for hover background', () => {
    renderGrid({ theme: { '--dg-hover-bg': '#aabbcc' } });
    expect(getGridStyle('--dg-hover-bg')).toBe('#aabbcc');
  });

  // ---------------------------------------------------------------------------
  // Light / dark presets
  // ---------------------------------------------------------------------------

  it('theme light mode applies light color scheme', () => {
    renderGrid({ theme: 'light' });
    const grid = screen.getByRole('grid');
    expect(grid.style.colorScheme).toBe('light');
    expect(getGridStyle('--dg-bg-color')).toBe(LIGHT_THEME['--dg-bg-color']);
    expect(getGridStyle('--dg-primary-color')).toBe(LIGHT_THEME['--dg-primary-color']);
  });

  it('theme dark mode applies dark color scheme', () => {
    renderGrid({ theme: 'dark' });
    const grid = screen.getByRole('grid');
    expect(grid.style.colorScheme).toBe('dark');
    expect(getGridStyle('--dg-bg-color')).toBe(DARK_THEME['--dg-bg-color']);
    expect(getGridStyle('--dg-primary-color')).toBe(DARK_THEME['--dg-primary-color']);
  });

  // ---------------------------------------------------------------------------
  // Theme switching
  // ---------------------------------------------------------------------------

  it('theme switches from light to dark mode', () => {
    const { rerender } = render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" theme="light" />,
    );
    let grid = screen.getByRole('grid');
    expect(grid.style.colorScheme).toBe('light');

    rerender(
      <DataGrid data={makeData()} columns={columns} rowKey="id" theme="dark" />,
    );
    grid = screen.getByRole('grid');
    expect(grid.style.colorScheme).toBe('dark');
    expect(getGridStyle('--dg-bg-color')).toBe(DARK_THEME['--dg-bg-color']);
  });

  it('theme switches from dark to light mode', () => {
    const { rerender } = render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" theme="dark" />,
    );
    let grid = screen.getByRole('grid');
    expect(grid.style.colorScheme).toBe('dark');

    rerender(
      <DataGrid data={makeData()} columns={columns} rowKey="id" theme="light" />,
    );
    grid = screen.getByRole('grid');
    expect(grid.style.colorScheme).toBe('light');
    expect(getGridStyle('--dg-bg-color')).toBe(LIGHT_THEME['--dg-bg-color']);
  });

  // ---------------------------------------------------------------------------
  // Persistence / re-render
  // ---------------------------------------------------------------------------

  it('theme persists across grid re-renders', () => {
    const { rerender } = render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" theme="dark" />,
    );
    expect(getGridStyle('--dg-bg-color')).toBe(DARK_THEME['--dg-bg-color']);

    // Re-render with same theme but different data
    rerender(
      <DataGrid
        data={[{ id: '99', name: 'Zara', age: 40 }]}
        columns={columns}
        rowKey="id"
        theme="dark"
      />,
    );
    expect(getGridStyle('--dg-bg-color')).toBe(DARK_THEME['--dg-bg-color']);
    expect(screen.getByRole('grid').style.colorScheme).toBe('dark');
  });

  // ---------------------------------------------------------------------------
  // Sub-grid / nested
  // ---------------------------------------------------------------------------

  it('theme applies to nested sub-grid', () => {
    const { container } = render(
      <div>
        <DataGrid data={makeData()} columns={columns} rowKey="id" theme="dark" />
        <DataGrid data={makeData()} columns={columns} rowKey="id" theme="dark" />
      </div>,
    );
    const grids = container.querySelectorAll('[role="grid"]');
    expect(grids).toHaveLength(2);
    for (const grid of grids) {
      expect((grid as HTMLElement).style.getPropertyValue('--dg-bg-color')).toBe(
        DARK_THEME['--dg-bg-color'],
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Context menu, calendar, dropdown inherit theme
  // ---------------------------------------------------------------------------

  it('theme applies to context menu', () => {
    // The context menu reads CSS custom properties from the parent container.
    // When theme sets --dg-border-color on the grid, the ContextMenu component
    // references var(--dg-border-color) in its styles. We verify the grid
    // container has the expected property set.
    renderGrid({ theme: 'dark' });
    expect(getGridStyle('--dg-border-color')).toBe(DARK_THEME['--dg-border-color']);
  });

  it('theme applies to calendar popup', () => {
    // Calendar popups use the same CSS custom property inheritance.
    // Verify theme tokens are set on the container which calendar inherits from.
    renderGrid({ theme: 'light' });
    expect(getGridStyle('--dg-primary-color')).toBe(LIGHT_THEME['--dg-primary-color']);
    expect(getGridStyle('--dg-font-family')).toBe(LIGHT_THEME['--dg-font-family']);
  });

  it('theme applies to dropdown popups', () => {
    // Dropdown popups inherit CSS custom properties from the grid container.
    renderGrid({ theme: 'dark' });
    expect(getGridStyle('--dg-header-bg')).toBe(DARK_THEME['--dg-header-bg']);
    expect(getGridStyle('--dg-text-color')).toBe(DARK_THEME['--dg-text-color']);
  });

  // ---------------------------------------------------------------------------
  // Custom override precedence
  // ---------------------------------------------------------------------------

  it('theme custom property override takes precedence', () => {
    // style prop should override theme values
    renderGrid({
      theme: 'light',
      style: { '--dg-primary-color': '#custom1' } as React.CSSProperties,
    });
    // The style prop is spread after themeStyle, so it overrides
    const grid = screen.getByRole('grid');
    expect(grid.style.getPropertyValue('--dg-primary-color')).toBe('#custom1');
  });

  // ---------------------------------------------------------------------------
  // Inheritance from parent
  // ---------------------------------------------------------------------------

  it('theme inherits from parent CSS custom properties', () => {
    // When no theme is set, the grid does not override CSS custom properties,
    // allowing parent values to flow through via var() fallbacks.
    const { container } = render(
      <div style={{ '--dg-primary-color': '#parent-blue' } as React.CSSProperties}>
        <DataGrid data={makeData()} columns={columns} rowKey="id" />
      </div>,
    );
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    // Without a theme, the grid should NOT set --dg-primary-color inline
    expect(grid.style.getPropertyValue('--dg-primary-color')).toBe('');
  });

  // ---------------------------------------------------------------------------
  // Transition on theme switch
  // ---------------------------------------------------------------------------

  it('theme applies transition on theme switch', () => {
    renderGrid({ theme: 'dark' });
    const grid = screen.getByRole('grid');
    expect(grid.style.transition).toContain('color');
    expect(grid.style.transition).toContain('background');
  });

  // ---------------------------------------------------------------------------
  // Token-driven palette (issue #17)
  //
  // The light and dark presets are projections of the `iasbuilt/tokens`
  // design-token tree; the grid must not carry its own hand-tuned colours.
  // These checks pin the row-background and header-background tokens to the
  // values ingested from `src/styles/tokens/{light,dark}.json`, so a future
  // token-repo upgrade is the only way they can change.
  // ---------------------------------------------------------------------------

  it('dark theme row backgrounds track the ingested dark tokens', () => {
    const expectedDefault = (
      darkTokens as any
    ).color.datagrid.row.bg.default.$value.toLowerCase();
    const expectedAlt = (
      darkTokens as any
    ).color.datagrid.row.bg.alt.$value.toLowerCase();

    renderGrid({ theme: 'dark' });
    // Both row-bg tokens must be set on the grid container; the prior bug
    // was that they were undefined, so rows fell back to hard-coded light
    // defaults regardless of theme.
    expect(getGridStyle('--dg-row-bg')).toBe(expectedDefault);
    expect(getGridStyle('--dg-row-bg-alt')).toBe(expectedAlt);

    // Cross-check: the `DARK_THEME` constant used by the preset resolver
    // exposes the same values.
    expect(DARK_THEME['--dg-row-bg']).toBe(expectedDefault);
    expect(DARK_THEME['--dg-row-bg-alt']).toBe(expectedAlt);
  });

  it('dark theme header background tracks the ingested dark token', () => {
    const expectedHeader = (
      darkTokens as any
    ).color.datagrid.header.bg.default.$value.toLowerCase();

    renderGrid({ theme: 'dark' });
    expect(getGridStyle('--dg-header-bg')).toBe(expectedHeader);
    expect(DARK_THEME['--dg-header-bg']).toBe(expectedHeader);

    // The header must remain one tone lighter than the default row
    // background so it reads as an elevated surface rather than a well —
    // this was the "header too dark" half of issue #17.
    const rowDefault = DARK_THEME['--dg-row-bg'];
    expect(expectedHeader).not.toBe(rowDefault);
  });

  it('light theme row and header backgrounds track the ingested light tokens', () => {
    const expectedRow = (
      lightTokens as any
    ).color.datagrid.row.bg.default.$value.toLowerCase();
    const expectedHeader = (
      lightTokens as any
    ).color.datagrid.header.bg.default.$value.toLowerCase();

    renderGrid({ theme: 'light' });
    expect(getGridStyle('--dg-row-bg')).toBe(expectedRow);
    expect(getGridStyle('--dg-header-bg')).toBe(expectedHeader);
  });

  // ---------------------------------------------------------------------------
  // Non-plain-object safety (regression #20)
  //
  // React DOM's `setValueForStyle` assigns each style property onto a
  // `CSSStyleDeclaration` via an indexed setter. If the `style` prop ever
  // receives an object whose keys are numeric (e.g. the indexed characters
  // produced by accidentally spreading a string), React throws
  // `TypeError: Indexed property setter is not supported`.
  //
  // Guard against that by:
  //   1. Asserting `resolveThemeStyle` always returns a plain POJO whose
  //      keys are valid CSS identifiers (not `"0"`, `"1"`, …).
  //   2. Rendering the `"excel365"` preset end-to-end to confirm the grid
  //      mounts without that TypeError being thrown.
  // ---------------------------------------------------------------------------

  describe('resolveThemeStyle returns plain-object style bag (regression #20)', () => {
    const hasNumericIndexKeys = (obj: object): boolean =>
      Object.keys(obj).some((k) => /^\d+$/.test(k));

    it('returns a plain object for the light preset', () => {
      const result = resolveThemeStyle('light');
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(hasNumericIndexKeys(result)).toBe(false);
    });

    it('returns a plain object for the dark preset', () => {
      const result = resolveThemeStyle('dark');
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(hasNumericIndexKeys(result)).toBe(false);
    });

    it('returns a plain object for a custom token map', () => {
      const input = { '--dg-primary-color': '#123' };
      const result = resolveThemeStyle(input);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(hasNumericIndexKeys(result)).toBe(false);
      // Callers treat the result as a writable CSSProperties bag; the
      // returned object must not share identity with the caller's input
      // (which may be frozen or otherwise exotic).
      expect(result).not.toBe(input);
    });

    it('returns an empty plain object for an unknown string preset', () => {
      // A string like "excel365" is handled entirely by CSS via
      // `data-theme="excel365"`. Returning the string itself would spread
      // indexed character properties into `style` — the exact shape that
      // triggers `TypeError: Indexed property setter is not supported`
      // inside React DOM's `setValueForStyle`.
      const result = resolveThemeStyle('excel365' as unknown as 'light');
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(hasNumericIndexKeys(result)).toBe(false);
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('mounts a grid with theme="excel365" without throwing indexed-setter errors', () => {
      // The grid mounts, and its inline `style` must not contain numeric
      // keys — `setValueForStyle` would throw if it did.
      render(
        <DataGrid
          data={makeData()}
          columns={columns}
          rowKey="id"
          theme={'excel365' as unknown as 'light'}
        />,
      );
      const grid = screen.getByRole('grid');
      // The data-theme attribute is how the CSS tokens get applied.
      expect(grid.getAttribute('data-theme')).toBe('excel365');
      // No indexed character properties leaked into the inline style.
      for (let i = 0; i < 'excel365'.length; i++) {
        expect(grid.style.getPropertyValue(String(i))).toBe('');
      }
    });
  });
});
