/**
 * MUI cell renderer barrel module for the datagrid MUI package.
 *
 * Re-exports every MUI cell renderer component and provides a
 * {@link muiCellRendererMap} lookup table that maps column `type` strings
 * to their corresponding MUI-based React component.
 *
 * @module cells
 * @packageDocumentation
 */
import React from 'react';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';

export { MuiTextCell } from './MuiTextCell';
export { MuiNumericCell } from './MuiNumericCell';
export { MuiCurrencyCell } from './MuiCurrencyCell';
export { MuiBooleanCell } from './MuiBooleanCell';
export { MuiCalendarCell } from './MuiCalendarCell';
export { MuiStatusCell } from './MuiStatusCell';
export { MuiTagsCell } from './MuiTagsCell';
export { MuiChipSelectCell } from './MuiChipSelectCell';
export { MuiCompoundChipListCell } from './MuiCompoundChipListCell';
export { MuiListCell } from './MuiListCell';
export { MuiPasswordCell } from './MuiPasswordCell';
export { MuiRichTextCell } from './MuiRichTextCell';
export { MuiUploadCell } from './MuiUploadCell';
export { MuiSubGridCell } from './MuiSubGridCell';
export { MuiActionsCell } from './MuiActionsCell';

import { MuiTextCell } from './MuiTextCell';
import { MuiNumericCell } from './MuiNumericCell';
import { MuiCurrencyCell } from './MuiCurrencyCell';
import { MuiBooleanCell } from './MuiBooleanCell';
import { MuiCalendarCell } from './MuiCalendarCell';
import { MuiStatusCell } from './MuiStatusCell';
import { MuiTagsCell } from './MuiTagsCell';
import { MuiChipSelectCell } from './MuiChipSelectCell';
import { MuiCompoundChipListCell } from './MuiCompoundChipListCell';
import { MuiListCell } from './MuiListCell';
import { MuiPasswordCell } from './MuiPasswordCell';
import { MuiRichTextCell } from './MuiRichTextCell';
import { MuiUploadCell } from './MuiUploadCell';
import { MuiSubGridCell } from './MuiSubGridCell';
import { MuiActionsCell } from './MuiActionsCell';

/**
 * Maps column type identifiers to their corresponding MUI cell renderer components.
 *
 * Drop-in replacement for the default `cellRendererMap` from `@iasbuilt/datagrid-react`,
 * using Material UI components for consistent MUI theming.
 */
export const muiCellRendererMap: Record<string, React.ComponentType<CellRendererProps<any>>> = {
  text: MuiTextCell as React.ComponentType<CellRendererProps<any>>,
  numeric: MuiNumericCell as React.ComponentType<CellRendererProps<any>>,
  currency: MuiCurrencyCell as React.ComponentType<CellRendererProps<any>>,
  boolean: MuiBooleanCell as React.ComponentType<CellRendererProps<any>>,
  calendar: MuiCalendarCell as React.ComponentType<CellRendererProps<any>>,
  status: MuiStatusCell as React.ComponentType<CellRendererProps<any>>,
  tags: MuiTagsCell as React.ComponentType<CellRendererProps<any>>,
  chipSelect: MuiChipSelectCell as React.ComponentType<CellRendererProps<any>>,
  compoundChipList: MuiCompoundChipListCell as React.ComponentType<CellRendererProps<any>>,
  list: MuiListCell as React.ComponentType<CellRendererProps<any>>,
  password: MuiPasswordCell as React.ComponentType<CellRendererProps<any>>,
  richText: MuiRichTextCell as React.ComponentType<CellRendererProps<any>>,
  upload: MuiUploadCell as React.ComponentType<CellRendererProps<any>>,
  subGrid: MuiSubGridCell as React.ComponentType<CellRendererProps<any>>,
  actions: MuiActionsCell as React.ComponentType<CellRendererProps<any>>,
};
