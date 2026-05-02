/**
 * MUI text cell renderer for the datagrid.
 *
 * @module MuiTextCell
 * @packageDocumentation
 */
import React from 'react';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { useDraftState } from '@iasbuilt/datagrid-react';
import {
  truncateEnd,
  truncateMiddle,
  getDefaultOverflowPolicy,
} from '@iasbuilt/datagrid-core';
import { EditableTextField, DisplayTypography } from '../../components';

// Matches `TRUNCATE_MAX_CHARS` in `packages/react/src/body/DataGridBody.tsx`:
// the body measures truncation by raw-text length, and the display path must
// produce a string whose character count equals that budget so the two paths
// agree on what counts as truncated.
const TRUNCATE_MAX_CHARS = 24;

/**
 * MUI-based text cell renderer.
 *
 * Uses MUI Typography in display mode and MUI TextField in edit mode.
 */
export const MuiTextCell = React.memo(function MuiTextCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: CellRendererProps<TData>) {
  const displayValue = value != null ? String(value) : '';

  const { draft, setDraft, inputRef, handleKeyDown, handleBlur } = useDraftState({
    initialValue: displayValue,
    isEditing,
    onCommit: onCommit as (value: unknown) => void,
    onCancel,
    deferFocus: true,
  });

  if (!isEditing) {
    // Apply the column's overflow policy textually so DOM-based assertions
    // (and AT/SR consumers) observe the truncation. The `BodyCell` wrapper
    // supplies the full raw value via the hover-reveal tooltip, so users
    // never lose access to the underlying text.
    const policy =
      (column as { overflow?: string }).overflow ??
      getDefaultOverflowPolicy(column.field);
    const truncated =
      policy === 'truncate-end'
        ? truncateEnd(displayValue, TRUNCATE_MAX_CHARS)
        : policy === 'truncate-middle'
          ? truncateMiddle(displayValue, TRUNCATE_MAX_CHARS)
          : displayValue;
    return (
      <DisplayTypography value={truncated} placeholder={column.placeholder} noWrap />
    );
  }

  return (
    <EditableTextField
      inputRef={inputRef as React.Ref<HTMLInputElement>}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      placeholder={column.placeholder}
    />
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
