/**
 * MUI actions cell renderer for the datagrid.
 *
 * @module MuiActionsCell
 * @packageDocumentation
 */
import React from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { CellValue, ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';

interface ActionOption extends StatusOption {
  disabled?: boolean;
}

interface ActionsDef {
  label: string;
  onClick: (row: unknown) => void;
  disabled?: boolean | ((row: unknown) => boolean);
  tooltip?: string;
}

/**
 * MUI-based actions cell renderer using IconButton with Tooltip.
 */
export const MuiActionsCell = React.memo(function MuiActionsCell<TData = Record<string, unknown>>({
  row,
  column,
}: CellRendererProps<TData>) {
  const typedColumn = column as CellRendererProps<TData>['column'] & { actions?: ActionsDef[] };
  const actions: ActionsDef[] = typedColumn.actions ?? [];
  const optionButtons: ActionOption[] = actions.length === 0 ? (column.options ?? []) : [];

  if (actions.length === 0 && optionButtons.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
      {actions.map((action, i) => {
        const isDisabled =
          typeof action.disabled === 'function'
            ? action.disabled(row)
            : action.disabled === true;

        const button = (
          <IconButton
            key={i}
            size="small"
            disabled={isDisabled}
            aria-label={action.label}
            onClick={() => !isDisabled && action.onClick(row)}
            sx={{ fontSize: 12, padding: '4px' }}
          >
            {action.label}
          </IconButton>
        );

        if (action.tooltip) {
          return (
            <Tooltip key={i} title={action.tooltip} arrow>
              <span>{button}</span>
            </Tooltip>
          );
        }

        return button;
      })}

      {optionButtons.map((opt) => (
        <Button
          key={opt.value}
          size="small"
          disabled={opt.disabled}
          aria-label={opt.label}
          variant="text"
          sx={{ fontSize: 11, minWidth: 0, px: 1, opacity: opt.disabled ? 0.5 : 1 }}
        >
          {opt.label}
        </Button>
      ))}
    </Box>
  );
}) as <TData = Record<string, unknown>>(props: CellRendererProps<TData>) => React.ReactElement | null;
