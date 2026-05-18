/**
 * Pre-configured MUI TextField for use inside grid cell edit mode.
 *
 * @module EditableTextField
 */
import React from 'react';
import TextField from '@mui/material/TextField';

/**
 * Props accepted by {@link EditableTextField}. The component is a
 * pre-configured MUI `<TextField variant="standard">` tuned for in-cell
 * editing: no label, no underline, density to match the surrounding row
 * height. Use the `inputSlotProps` and `htmlInputSlotProps` escape
 * hatches for one-off overrides; for repeated patterns prefer adding a
 * named field to the props.
 */
export interface EditableTextFieldProps {
  inputRef?: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  /** Passed to TextField type prop (e.g., 'date', 'password'). */
  type?: string;
  placeholder?: string;
  /** Extra slotProps.input properties merged with defaults. */
  inputSlotProps?: Record<string, unknown>;
  /** Extra slotProps.htmlInput properties. */
  htmlInputSlotProps?: Record<string, unknown>;
  /** Extra sx merged with defaults. */
  sx?: Record<string, unknown>;
}

/**
 * Thin wrapper around MUI TextField with the standard grid-cell defaults applied.
 * Defaults: variant="standard", size="small", fullWidth, disableUnderline.
 */
export const EditableTextField = React.memo(function EditableTextField({
  inputRef,
  value,
  onChange,
  onKeyDown,
  onBlur,
  type,
  placeholder,
  inputSlotProps,
  htmlInputSlotProps,
  sx,
}: EditableTextFieldProps) {
  // Excel-365 padding parity (issue #65): the inline editor's first glyph
  // must sit on the same X/Y as the display cell. The host `[role=gridcell]`
  // still carries its `--dg-cell-padding` during edit mode so display and
  // edit share one box model; here we absolutely-position the TextField to
  // fill the cell's *border-box* (escaping the cell's padding-box) and
  // transfer the same `--dg-cell-padding` onto the native input. Because
  // `input.rect.left === cell.rect.left` and `input.padding-left ===
  // cell.padding-left`, the first glyph lands on the same pixel whether the
  // cell is displaying or editing — Excel's "only the caret changes" feel.
  // Font is inherited so font-family / size / weight / line-height match
  // the cell pixel-for-pixel.
  const mergedSx = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    margin: 0,
    padding: 0,
    // MUI's Input root normally carries its own vertical padding for the
    // floating-label / underline affordances; with `disableUnderline` and no
    // label neither applies, so zero it out and let the native input own
    // the padding box.
    '& .MuiInputBase-root': {
      width: '100%',
      height: '100%',
      margin: 0,
      padding: 0,
      font: 'inherit',
      lineHeight: 'inherit',
    },
    '& input': {
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      padding: 'var(--dg-cell-padding, 0 12px)',
      margin: 0,
      border: 0,
      font: 'inherit',
      lineHeight: 'inherit',
    },
    ...sx,
  };

  const mergedInputSlotProps = {
    disableUnderline: true,
    ...inputSlotProps,
  };

  return (
    <TextField
      inputRef={inputRef}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      type={type}
      placeholder={placeholder}
      variant="standard"
      size="small"
      fullWidth
      slotProps={{
        input: mergedInputSlotProps,
        ...(htmlInputSlotProps ? { htmlInput: htmlInputSlotProps } : {}),
      }}
      sx={mergedSx}
    />
  );
});
