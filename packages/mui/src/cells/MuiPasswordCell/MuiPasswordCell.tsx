/**
 * MUI password cell renderer for the datagrid.
 *
 * @module MuiPasswordCell
 * @packageDocumentation
 */
import React, { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Box from '@mui/material/Box';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { useDraftState } from '@iasbuilt/datagrid-react';
import { EditableTextField } from '../../components';

const MASK_CHAR = '\u2022';

/**
 * MUI-based password cell renderer with IconButton visibility toggle.
 */
export const MuiPasswordCell = React.memo(function MuiPasswordCell<TData = Record<string, unknown>>({
  value,
  isEditing,
  onCommit,
  onCancel,
}: CellRendererProps<TData>) {
  const strValue = value != null ? String(value) : '';
  const [revealed, setRevealed] = useState(false);

  const { draft, setDraft, inputRef, handleKeyDown, handleBlur } = useDraftState({
    initialValue: strValue,
    isEditing,
    onCommit: onCommit as (value: unknown) => void,
    onCancel,
    deferFocus: true,
  });

  if (!isEditing) {
    const masked = MASK_CHAR.repeat(strValue.length);
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box component="span" sx={{ letterSpacing: 2 }}>
          {revealed ? strValue : masked}
        </Box>
        <IconButton
          size="small"
          aria-label={revealed ? 'Hide password' : 'Reveal password'}
          onClick={() => setRevealed((v) => !v)}
          sx={{ padding: '2px', fontSize: 12 }}
        >
          {revealed ? 'Hide' : 'Show'}
        </IconButton>
      </Box>
    );
  }

  return (
    <EditableTextField
      inputRef={inputRef as React.Ref<HTMLInputElement>}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      type={revealed ? 'text' : 'password'}
      inputSlotProps={{
        disableUnderline: true,
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              size="small"
              aria-label={revealed ? 'Hide password' : 'Show password'}
              onClick={() => setRevealed((v) => !v)}
              edge="end"
              sx={{ fontSize: 11 }}
            >
              {revealed ? 'Hide' : 'Show'}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement;
