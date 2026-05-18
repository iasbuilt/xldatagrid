/**
 * Pre-configured MUI Autocomplete for multi-select grid cell edit mode.
 *
 * @module EditableAutocomplete
 */
import React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';

/**
 * Props accepted by {@link EditableAutocomplete}. The component is a
 * thin pass-through to MUI's `<Autocomplete>` with sensible defaults
 * for in-cell editing (small density, no clear button, multi-select
 * always on).
 */
export interface EditableAutocompleteProps<T = string> {
  multiple: true;
  freeSolo?: boolean;
  value: T[];
  onChange: (event: React.SyntheticEvent, newValue: T[]) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  options: T[];
  getOptionLabel?: (option: T) => string;
  placeholder?: string;
}

/**
 * Thin wrapper around MUI Autocomplete with the standard grid-cell defaults applied.
 * Defaults: size="small", sx width 100%, renderInput uses variant="standard" and size="small".
 */
export const EditableAutocomplete = React.memo(function EditableAutocomplete<T = string>({
  multiple,
  freeSolo,
  value,
  onChange,
  onBlur,
  onKeyDown,
  options,
  getOptionLabel,
  placeholder,
}: EditableAutocompleteProps<T>) {
  return (
    <Autocomplete<T, true, false, boolean>
      multiple={multiple}
      freeSolo={freeSolo}
      value={value}
      // MUI widens the onChange value type to `(string | T)[]` when freeSolo is
      // unknown at compile time; cast to silence the mismatch.
      onChange={onChange as Parameters<typeof Autocomplete<T, true, false, boolean>>[0]['onChange']}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      options={options}
      // Same widening applies to getOptionLabel.
      getOptionLabel={getOptionLabel as ((option: T | string) => string) | undefined}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          size="small"
          placeholder={placeholder}
        />
      )}
      sx={{ width: '100%' }}
      size="small"
    />
  );
}) as <T = string>(props: EditableAutocompleteProps<T>) => React.ReactElement;
