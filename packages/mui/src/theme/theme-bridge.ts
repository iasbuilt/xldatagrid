/**
 * Bridges a MUI theme to CSS custom properties used by the datagrid.
 *
 * Colour values are drawn from the MUI theme at call time, so host
 * applications stay in control of their own palette. The *default*
 * header-background value used when no per-mode override is supplied falls
 * back to the corresponding iAsBuilt token from `@iasbuilt/datagrid-react`
 * (which ingests from the organisation-wide `iasbuilt/tokens` repository)
 * so the MUI bridge cannot drift away from the source of truth.
 *
 * @module theme-bridge
 * @packageDocumentation
 */

// In-monorepo sibling package; the import looks relative because pnpm symlinks
// the workspace, but it goes through the package's public `@iasbuilt/datagrid-react`
// entry — no `eslint-plugin-import` rule needed once the lint scope landed
// under #101.
import { lightThemeTokens, darkThemeTokens } from '@iasbuilt/datagrid-react';

/** Minimal MUI theme shape needed for the bridge. */
export interface MuiThemeShape {
  palette: {
    primary: { main: string };
    background: { paper: string; default: string };
    text: { primary: string; secondary: string };
    divider: string;
    action: { hover: string; selected: string };
    error: { main: string };
    success: { main: string };
    warning: { main: string };
    mode?: 'light' | 'dark';
  };
  typography: {
    fontFamily: string;
    fontSize: number;
  };
}

/**
 * Maps MUI theme tokens to datagrid CSS custom properties.
 *
 * @param theme - A MUI theme object conforming to {@link MuiThemeShape}.
 * @returns A record of CSS custom property names to their string values.
 */
export function bridgeMuiTheme(theme: MuiThemeShape): Record<string, string> {
  // Pick the row/header colours for the matching mode so MUI-mode grids are
  // not stuck with the light-theme fallbacks when the host app is dark.
  const base = theme.palette.mode === 'dark' ? darkThemeTokens : lightThemeTokens;
  return {
    '--dg-primary-color': theme.palette.primary.main,
    '--dg-bg-color': theme.palette.background.paper,
    '--dg-surface-color': theme.palette.background.default,
    '--dg-text-color': theme.palette.text.primary,
    '--dg-text-secondary': theme.palette.text.secondary,
    '--dg-border-color': theme.palette.divider,
    '--dg-hover-bg': theme.palette.action.hover,
    '--dg-selected-bg': theme.palette.action.selected,
    '--dg-error-color': theme.palette.error.main,
    '--dg-success-color': theme.palette.success.main,
    '--dg-warning-color': theme.palette.warning.main,
    '--dg-header-bg': base['--dg-header-bg'] ?? '#F1F5F9',
    '--dg-row-bg': base['--dg-row-bg'] ?? theme.palette.background.paper,
    '--dg-row-bg-alt': base['--dg-row-bg-alt'] ?? theme.palette.background.default,
    '--dg-font-family': theme.typography.fontFamily,
    '--dg-font-size': `${theme.typography.fontSize}px`,
  };
}
