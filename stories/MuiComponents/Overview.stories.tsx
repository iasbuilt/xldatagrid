import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import * as styles from '../stories.styles';

const meta: Meta = {
  title: 'MUI Components/Overview',
};
export default meta;

const components: [string, string, string][] = [
  ['TextField', 'Inputs', 'Text/numeric/currency/password editable cells'],
  ['Autocomplete', 'Inputs', 'Tag & chip-select editors (multi, freeSolo)'],
  ['Select', 'Inputs', 'Status/list dropdown editors'],
  ['MenuItem', 'Inputs', 'Option rows for Select'],
  ['Checkbox', 'Inputs', 'Boolean cell editor'],
  ['InputAdornment', 'Inputs', 'Currency symbol, password reveal toggle'],
  ['Button', 'Buttons', 'Action cells, upload trigger'],
  ['IconButton', 'Buttons', 'Inline row actions, reveal toggle'],
  ['Typography', 'Data Display', 'Read-only display for numeric/currency/date cells'],
  ['Chip', 'Data Display', 'Tags, chip-select, status, sub-grid summaries'],
  ['Tooltip', 'Data Display', 'Action-cell icon labels'],
  ['LinearProgress', 'Feedback', 'Upload progress indicator'],
  ['Box', 'Layout', 'Flex/wrap layout primitive via sx prop'],
  ['Accordion', 'Surfaces', 'Sub-grid collapsible cell'],
];

export const Index: StoryObj = {
  parameters: {
    docs: {
      description: {
        story:
          'Telerik-style per-component showcase of every MUI component consumed by @iasbuilt/datagrid-mui. Pick a component from the sidebar to see its variants.',
      },
    },
  },
  render: () => (
    <div style={styles.introWrapper}>
      <h1 style={styles.introTitle}>MUI Components</h1>
      <p style={styles.introSubtitle}>
        One showcase page per MUI primitive that xldatagrid depends on. Grouped by MUI&apos;s
        own category taxonomy (Inputs, Buttons, Data Display, Feedback, Layout, Surfaces).
      </p>
      <table style={styles.introTable}>
        <thead>
          <tr>
            <th style={styles.introTh}>Component</th>
            <th style={styles.introTh}>Category</th>
            <th style={styles.introTh}>Where xldatagrid uses it</th>
          </tr>
        </thead>
        <tbody>
          {components.map(([name, category, usage]) => (
            <tr key={name}>
              <td style={styles.introTd}><strong>{name}</strong></td>
              <td style={styles.introTd}>{category}</td>
              <td style={styles.introTd}>{usage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
};
