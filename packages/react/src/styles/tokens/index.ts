/**
 * Theme-token ingestion for the datagrid.
 *
 * The organisation-wide source of truth for the iAsBuilt palette lives in the
 * `iasbuilt/tokens` repository. `scripts/sync-tokens.mjs` copies the built
 * JSON artefacts from that repository into this directory; this module then
 * projects the relevant leaves of the W3C-design-token tree onto the
 * `--dg-*` CSS custom properties that the grid's inline styles and
 * stylesheet use.
 *
 * A single mapping function (`toDatagridThemeTokens`) is shared between the
 * light and dark presets so that both flavours emit exactly the same set of
 * custom properties, keyed by the same names. Consumers looking for the
 * resolved light and dark preset maps should import {@link lightThemeTokens}
 * and {@link darkThemeTokens}; they are the authoritative values used by the
 * React `<DataGrid>` preset path.
 */

import lightRaw from './light.json';
import darkRaw from './dark.json';

// ---------------------------------------------------------------------------
// W3C design-token shape helpers
// ---------------------------------------------------------------------------

interface TokenLeaf {
  $type?: string;
  $value: string;
  $description?: string;
}

interface TokenTree {
  [segment: string]: TokenLeaf | TokenTree;
}

function isLeaf(node: TokenLeaf | TokenTree): node is TokenLeaf {
  return typeof (node as TokenLeaf).$value === 'string';
}

/**
 * Resolve a dotted token path (e.g. `color.datagrid.row.bg.default`) to its
 * `$value` string. Throws if the path is missing so a broken token upgrade
 * fails loudly at build time rather than producing a silently-broken theme.
 */
function resolveToken(tree: TokenTree, path: string): string {
  const parts = path.split('.');
  let cursor: TokenLeaf | TokenTree = tree;
  for (const part of parts) {
    if (isLeaf(cursor)) {
      throw new Error(`Unexpected leaf before path end at "${part}" in "${path}"`);
    }
    const next: TokenLeaf | TokenTree | undefined = cursor[part];
    if (next === undefined) {
      throw new Error(`Token path "${path}" is not present in the ingested tokens. ` +
        `Re-run scripts/sync-tokens.mjs from an up-to-date iasbuilt/tokens checkout.`);
    }
    cursor = next;
  }
  if (!isLeaf(cursor)) {
    throw new Error(`Token path "${path}" resolved to a branch, not a leaf value.`);
  }
  return cursor.$value;
}

// ---------------------------------------------------------------------------
// Token -> --dg-* mapping
// ---------------------------------------------------------------------------

/**
 * Projects a root token tree onto the `--dg-*` custom properties the grid
 * consumes. The set of keys is identical for both themes so that switching
 * between them swaps values without leaving any variables stale.
 *
 * Only a subset of the design-token tree is surfaced here — just the leaves
 * that the current grid markup actually references. Additional `--dg-*`
 * variables can be added alongside the relevant token path as the grid grows.
 */
export function toDatagridThemeTokens(
  raw: unknown,
  extra: { colorScheme: 'light' | 'dark' },
): Record<string, string> {
  const tree = (raw as { color: TokenTree }).color;

  // The source JSON uses upper-case hex (e.g. `#0F172A`). Normalise to
  // lower-case so inline style values match the CSS-variable literals used in
  // stylesheets and tests without forcing every caller to be case-aware.
  const normalise = (v: string): string =>
    /^#[0-9A-Fa-f]+$/.test(v) ? v.toLowerCase() : v;
  const get = (path: string) => normalise(resolveToken(tree, path));

  // Resolve once so the returned object is a flat string map.
  const rowBgDefault = get('datagrid.row.bg.default');
  const rowBgAlt = get('datagrid.row.bg.alt');
  const rowBgHover = get('datagrid.row.bg.hover');
  const rowBgSelected = get('datagrid.row.bg.selected');
  const rowBorderDefault = get('datagrid.row.border.default');
  const rowBorderSelected = get('datagrid.row.border.selected');

  const headerBg = get('datagrid.header.bg.default');
  const headerBgHover = get('datagrid.header.bg.hover');
  const headerText = get('datagrid.header.text.default');

  const cellBgDefault = get('datagrid.cell.bg.default');
  const cellBgInvalid = get('datagrid.cell.bg.invalid');
  const cellTextDefault = get('datagrid.cell.text.default');
  const cellBorderDefault = get('datagrid.cell.border.default');
  const cellBorderSelected = get('datagrid.cell.border.selected');
  const cellBorderInvalid = get('datagrid.cell.border.invalid');

  const gridBorder = get('datagrid.border.default');
  const gridBg = get('datagrid.bg.default');

  const primary = get('global.brand.primary.default');
  const selectionBg = get('global.selection.bg.default');

  // Validation severity tokens consumed by the portal validation tooltip
  // (`packages/react/src/ValidationTooltip.tsx`). Issue #78 requires a
  // severity-keyed background + matching icon foreground for the tooltip;
  // these tokens slot into the existing feedback.{danger,warning,info}
  // surface scale so a single token-pack swap retints the tooltip without
  // a code change. `bg.strong` is the saturated severity hue (red / yellow
  // / blue), and the icon glyph is drawn in white so it stays legible
  // against that surface in both light and dark themes.
  const validationErrorBg = get('feedback.danger.bg.strong');
  const validationErrorIcon = '#ffffff';
  const validationWarningBg = get('feedback.warning.bg.strong');
  const validationWarningIcon = '#ffffff';
  const validationInfoBg = get('feedback.info.bg.strong');
  const validationInfoIcon = '#ffffff';

  return {
    // Primary / semantic
    '--dg-primary-color': primary,
    '--dg-bg-color': gridBg,
    '--dg-text-color': cellTextDefault,
    '--dg-border-color': gridBorder,
    '--dg-error-color': cellBorderInvalid,

    // Validation tooltip severity tokens (see issue #78). Surfaces use the
    // saturated severity hue; icon foreground is white so the inline SVG
    // glyph reads clearly against the surface in both themes.
    '--dg-validation-error-bg': validationErrorBg,
    '--dg-validation-error-icon': validationErrorIcon,
    '--dg-validation-warning-bg': validationWarningBg,
    '--dg-validation-warning-icon': validationWarningIcon,
    '--dg-validation-info-bg': validationInfoBg,
    '--dg-validation-info-icon': validationInfoIcon,

    // Header
    '--dg-header-bg': headerBg,
    '--dg-header-hover-bg': headerBgHover,
    '--dg-header-text': headerText,

    // Rows (the bug: these were never set for dark mode)
    '--dg-row-bg': rowBgDefault,
    '--dg-row-bg-alt': rowBgAlt,
    '--dg-row-bg-hover': rowBgHover,
    '--dg-row-bg-selected': rowBgSelected,
    '--dg-row-border': rowBorderDefault,

    // Cells
    '--dg-cell-bg': cellBgDefault,
    '--dg-cell-bg-invalid': cellBgInvalid,
    '--dg-cell-border': cellBorderDefault,
    '--dg-selection-border': cellBorderSelected,
    '--dg-selection-color': selectionBg,

    // Interaction
    '--dg-hover-bg': rowBgHover,

    // Row-select visual stack (#75): when ANY row is fully selected the grid
    // root carries `data-row-selected="true"` and three coordinated tints
    // paint together to mirror Excel-365's row-select visual:
    //   - the column header strip darkens (lower luminance in light, higher
    //     in dark) so the user sees the selection's column context
    //   - the row-number gutter cell paints a semi-transparent blue so the
    //     gutter reads as "this row is selected" without losing the gutter
    //     affordance
    //   - the data cells in that row paint a DARKER semi-transparent blue
    //     so the data area is the focal point (luminance(data) <
    //     luminance(gutter) is the contract in `e2e/row-select-styling.spec.ts`).
    //
    // The values here mirror the literals in `datagrid-theme.css` so the
    // preset inline-styles path and the cascading stylesheet path agree.
    // Light/dark variants are picked by `lightThemeTokens`/`darkThemeTokens`
    // below via `extra.colorScheme`.
    '--dg-header-selected-bg': extra.colorScheme === 'dark' ? '#475569' : '#cbd5e1',
    '--dg-row-number-selected-bg':
      extra.colorScheme === 'dark'
        ? 'rgba(96, 165, 250, 0.45)'
        : 'rgba(96, 165, 250, 0.5)',
    '--dg-row-selected-bg':
      extra.colorScheme === 'dark'
        ? 'rgba(59, 130, 246, 0.38)'
        : 'rgba(59, 130, 246, 0.28)',

    // Typography / layout (unchanged by colour palette; preserved for back-compat)
    '--dg-cell-padding': '0 12px',
    '--dg-font-family': 'system-ui, sans-serif',
    '--dg-font-size': '14px',
    '--dg-row-height': '36px',

    // Browser form-control colour scheme
    color: cellTextDefault,
    colorScheme: extra.colorScheme,
  };
}

// ---------------------------------------------------------------------------
// Pre-resolved presets
// ---------------------------------------------------------------------------

/** Resolved light-theme `--dg-*` map, derived from `tokens/light.json`. */
export const lightThemeTokens: Record<string, string> = toDatagridThemeTokens(
  lightRaw,
  { colorScheme: 'light' },
);

/** Resolved dark-theme `--dg-*` map, derived from `tokens/dark.json`. */
export const darkThemeTokens: Record<string, string> = toDatagridThemeTokens(
  darkRaw,
  { colorScheme: 'dark' },
);
