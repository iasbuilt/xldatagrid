import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Reference/MUI Components',
};
export default meta;

const cellRenderers: [string, string, string][] = [
  ['MuiTextCell', 'TextField, Typography', 'text'],
  ['MuiNumericCell', 'TextField, Typography', 'numeric'],
  ['MuiCurrencyCell', 'TextField, InputAdornment, Typography', 'currency'],
  ['MuiBooleanCell', 'Checkbox', 'boolean'],
  ['MuiCalendarCell', 'TextField (date), Typography', 'calendar'],
  ['MuiStatusCell', 'Select, MenuItem, Chip', 'status'],
  ['MuiTagsCell', 'Autocomplete, Chip, TextField, Box', 'tags'],
  ['MuiChipSelectCell', 'Autocomplete, Chip, TextField, Box', 'chipSelect'],
  ['MuiCompoundChipListCell', 'Chip, Box, Button, TextField', 'compoundChipList'],
  ['MuiListCell', 'Select, MenuItem, Typography', 'list'],
  ['MuiPasswordCell', 'TextField, IconButton, InputAdornment, Box', 'password'],
  ['MuiRichTextCell', 'Box, Button, Tooltip, ToggleButton', 'richText'],
  ['MuiUploadCell', 'Button, LinearProgress, Box, Typography', 'upload'],
  ['MuiSubGridCell', 'Accordion, AccordionSummary, AccordionDetails, Chip, Box', 'subGrid'],
  ['MuiActionsCell', 'IconButton, Tooltip, Box, Button', 'actions'],
];

const wrapperComponents: [string, string][] = [
  ['MuiDataGrid', 'Wraps DataGrid with automatic MUI cell renderers'],
  ['MuiDataGridThemeProvider', 'Bridges MUI theme to datagrid CSS variables'],
  ['bridgeMuiTheme', 'Converts MUI theme shape to CSS custom properties'],
];

export const ComponentList: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Reference catalogue of every MUI cell renderer wrapped by datagrid-mui, plus the top-level wrapper utilities. See also the "Components New In Branch" story for the Excel-365 column filter menu components shipped on feat/excel-365-column-menu.',
      },
    },
  },
  render: () => (
    <div style={styles.introWrapper}>
      <h1 style={styles.introTitle}>MUI Component Reference</h1>
      <p style={styles.introSubtitle}>
        Every MUI component wrapped by datagrid-mui cell renderers, plus the top-level wrapper utilities.
      </p>

      <h2>Cell Renderers</h2>
      <table style={styles.introTable}>
        <thead>
          <tr>
            <th style={styles.introTh}>Our Component</th>
            <th style={styles.introTh}>MUI Components Used</th>
            <th style={styles.introTh}>Cell Type</th>
          </tr>
        </thead>
        <tbody>
          {cellRenderers.map(([name, mui, cellType]) => (
            <tr key={name}>
              <td style={styles.introTd}><strong>{name}</strong></td>
              <td style={styles.introTd}>{mui}</td>
              <td style={{ ...styles.introTd, fontFamily: 'monospace' }}>{cellType}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Wrapper Components</h2>
      <table style={styles.introTable}>
        <thead>
          <tr>
            <th style={styles.introTh}>Export</th>
            <th style={styles.introTh}>Description</th>
          </tr>
        </thead>
        <tbody>
          {wrapperComponents.map(([name, desc]) => (
            <tr key={name}>
              <td style={styles.introTd}><strong>{name}</strong></td>
              <td style={styles.introTd}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// New-in-branch components (feat/excel-365-column-menu)
//
// The Excel-365 column filter menu and its condition dialog live in the
// @iasbuilt/datagrid-react package as internal sub-components of DataGrid.
// They are not standalone imports a consumer wires directly — instead they
// are activated via the `showFilterMenu` prop on DataGrid / MuiDataGrid,
// which mounts and positions them internally. This story documents what
// ships in the branch without attempting to render them outside that
// orchestration.
// ---------------------------------------------------------------------------

const newInBranchComponents: [string, string, string][] = [
  [
    'DataGridColumnFilterMenu',
    'packages/react/src/header/column-filter-menu/DataGridColumnFilterMenu.tsx',
    'Excel-365 column header dropdown: sort asc/desc, clear filter, Text/Number/Date Filters submenu, search box, distinct-value checklist, and OK/Cancel. Rendered automatically when showFilterMenu is true on DataGrid / MuiDataGrid; positioned against the filter-icon anchor via a DOMRect passed from the header.',
  ],
  [
    'FilterConditionDialog',
    'packages/react/src/header/column-filter-menu/FilterConditionDialog.tsx',
    'Accessible modal (role="dialog", aria-modal, focus trap) launched from the filter menu\'s "Custom filter…" entry. Builds composite AND/OR two-clause predicates and emits a CompositeFilterDescriptor back to the grid model.',
  ],
];

export const Components_NewInBranch: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'New sub-components introduced on feat/excel-365-column-menu. These are orchestrated internally by DataGrid when showFilterMenu is enabled, so activate them from the Kitchen Sink or Filtering stories rather than mounting them directly.',
      },
    },
  },
  render: () => (
    <div style={styles.introWrapper}>
      <h1 style={styles.introTitle}>Components — New In Branch</h1>
      <p style={styles.introSubtitle}>
        Added on <code>feat/excel-365-column-menu</code>. Enable via the
        {' '}<code>showFilterMenu</code> prop on <code>DataGrid</code> or
        {' '}<code>MuiDataGrid</code>.
      </p>

      <h2>Filter Menu Components</h2>
      <table style={styles.introTable}>
        <thead>
          <tr>
            <th style={styles.introTh}>Component</th>
            <th style={styles.introTh}>Source</th>
            <th style={styles.introTh}>Role</th>
          </tr>
        </thead>
        <tbody>
          {newInBranchComponents.map(([name, src, desc]) => (
            <tr key={name}>
              <td style={styles.introTd}><strong>{name}</strong></td>
              <td style={{ ...styles.introTd, fontFamily: 'monospace', fontSize: 12 }}>{src}</td>
              <td style={styles.introTd}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>How to see them</h2>
      <ul>
        <li>Open <strong>Pages/Kitchen Sink &gt; Everything At Once</strong> — the main kitchen-sink story enables <code>showFilterMenu</code> and the left row-number gutter by default.</li>
        <li>Click the filter chevron in any filterable column header to open <code>DataGridColumnFilterMenu</code>.</li>
        <li>Choose <em>Custom filter…</em> from the Text/Number/Date Filters submenu to launch <code>FilterConditionDialog</code>.</li>
      </ul>
    </div>
  ),
};
