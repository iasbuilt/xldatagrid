import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Introduction',
};
export default meta;

export const Welcome: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Landing page for the @iasbuilt/datagrid Storybook. Summarises feature categories and highlights the latest changes shipped on the feat/excel-365-column-menu branch.',
      },
    },
  },
  render: () => (
    <div style={styles.introWrapper}>
      <h1 style={styles.introTitle}>@iasbuilt/datagrid — Kitchen Sink</h1>
      <p style={styles.introSubtitle}>
        A comprehensive, enterprise-grade datagrid built in React 19 with Jotai state management.
      </p>

      <h2>What&apos;s new</h2>
      <p style={styles.introSubtitle}>
        Highlights from the <code>feat/excel-365-column-menu</code> branch.
      </p>
      <table style={styles.introTable}>
        <thead>
          <tr>
            <th style={styles.introTh}>Feature</th>
            <th style={styles.introTh}>Summary</th>
          </tr>
        </thead>
        <tbody>
          {whatsNew.map(([name, desc]) => (
            <tr key={name}>
              <td style={styles.introTd}><strong>{name}</strong></td>
              <td style={styles.introTd}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Features</h2>
      <table style={styles.introTable}>
        <thead>
          <tr>
            <th style={styles.introTh}>Category</th>
            <th style={styles.introTh}>Features</th>
          </tr>
        </thead>
        <tbody>
          {features.map(([cat, feat]) => (
            <tr key={cat}>
              <td style={styles.introTd}><strong>{cat}</strong></td>
              <td style={styles.introTd}>{feat}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Browse the sidebar</h2>
      <p>
        Stories are organised by feature area under <strong>Examples/</strong>. The <strong>Pages/Kitchen Sink</strong> story combines every feature into a single interactive grid.
      </p>
    </div>
  ),
};

const whatsNew: [string, string][] = [
  ['Excel-365 column filter menu', 'Header dropdown with sort, clear filter, Text/Number/Date Filters submenu, search box, distinct-value checklist, and OK/Cancel actions.'],
  ['FilterConditionDialog', 'Accessible modal (role="dialog", aria-modal, focus trap) for building custom AND/OR two-clause filter predicates.'],
  ['in / notIn filter operators', 'New set-membership operators that back the Excel-style value checklist and power multi-select filtering.'],
  ['useBackgroundIndexer hook', 'Builds per-column distinct-value search indexes off the main thread and caches them in IndexedDB for instant re-open.'],
  ['Row-number gutter', 'Sticky row-number column with default position: left (Excel 365 convention); opt-in position: right also available.'],
  ['Context-menu portal fix', 'Context menu now positions correctly inside CSS-transformed ancestors (portal + viewport-coordinate anchoring).'],
  ['Filter chevron button', 'Header filter trigger exposes aria-label and aria-haspopup="menu" for assistive-tech navigation.'],
  ['Mutual exclusion of filter menu and column menu', 'Opening either menu closes the other so only one column-level popover is open at a time.'],
  ['Excel-365 theme tokens', 'New theme variables scoped to .dg-theme-excel365 / [data-theme="excel365"] for the Office-style look.'],
];

const features: [string, string][] = [
  ['Cell Types', 'Text, Numeric, Currency, Boolean, Calendar, Status, Tags, ChipSelect, CompoundChipList, List, Password, RichText, Upload, SubGrid, Actions'],
  ['Editing', 'Inline cell editing, Ghost row (new-row entry), Undo / Redo, Validation'],
  ['Selection', 'Cell, Row, Range, None modes'],
  ['Sorting', 'Single-click, Multi-sort (shift-click)'],
  ['Filtering', '12 operators, Composite AND/OR, Debounced'],
  ['Grouping', 'Row grouping with aggregates (sum, avg, count, min, max), Column groups, Collapsible'],
  ['Columns', 'Resize, Reorder (drag), Freeze left/right, Visibility toggle, Header menu'],
  ['Extensions', 'Regex Validation, Cell Comments, Column Resize constraints, Export (CSV, Excel, PDF)'],
  ['Theming', 'Light, Dark, Custom CSS variables'],
  ['Advanced', 'Master-Detail, Context Menu, Keyboard navigation, Clipboard, Ghost row positioning'],
];
