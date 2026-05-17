import React, { useState, useCallback, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import { createFormulaBar } from '@iasbuilt/datagrid-extensions';
import type { CellAddress, CellValue } from '@iasbuilt/datagrid-core';
import { makeEmployees, defaultColumns } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Formula Bar',
};
export default meta;

// ---------------------------------------------------------------------------
// Helper: simulated formula bar UI component
// ---------------------------------------------------------------------------

interface FormulaBarUIProps {
  activeCell: CellAddress | null;
  value: string;
  showCellAddress: boolean;
  showCellType: boolean;
  height: number;
  placeholder: string;
  onValueChange: (value: string) => void;
  onCommit: (value: string) => void;
}

function FormulaBarUI({
  activeCell,
  value,
  showCellAddress,
  showCellType,
  height,
  placeholder,
  onValueChange,
  onCommit,
}: FormulaBarUIProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const cellLabel = activeCell
    ? `${activeCell.field.charAt(0).toUpperCase()}${activeCell.field.slice(1)} (Row ${activeCell.rowId})`
    : '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onCommit(value);
      inputRef.current?.blur();
    }
    if (e.key === 'Escape') {
      inputRef.current?.blur();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height,
        padding: '0 12px',
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        background: '#f8fafc',
        fontSize: 13,
      }}
    >
      {showCellAddress && (
        <span
          style={{
            fontWeight: 600,
            color: activeCell ? '#1e293b' : '#94a3b8',
            minWidth: 120,
            fontFamily: 'monospace',
            fontSize: 12,
            background: '#e2e8f0',
            padding: '2px 8px',
            borderRadius: 4,
          }}
        >
          {cellLabel || 'No cell'}
        </span>
      )}
      {showCellType && activeCell && (
        <span
          style={{
            fontSize: 11,
            color: '#64748b',
            background: '#e0f2fe',
            padding: '2px 6px',
            borderRadius: 4,
          }}
        >
          text
        </span>
      )}
      <span style={{ color: '#94a3b8', fontSize: 16 }}>fx</span>
      <input
        ref={inputRef}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: 13,
          fontFamily: 'inherit',
        }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!activeCell}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default story
// ---------------------------------------------------------------------------

export const Default: StoryObj = {
  render: () => {
    const [data, setData] = useState(() => makeEmployees(15));
    const [activeCell, setActiveCell] = useState<CellAddress | null>(null);
    const [barValue, setBarValue] = useState('');

    const ext = useRef(createFormulaBar());

    const _handleCellSelect = useCallback((_addr: CellAddress, _val: CellValue) => {
      // MuiDataGrid fires onCellSelect — we track it for the formula bar UI.
      // Underscore-prefix marks this as deliberately unwired: the story drives
      // selection via `handleSelectionChange` below; the cell-select callback
      // is kept as documentation of the alternative subscription API.
    }, []);

    const handleSelectionChange = useCallback(
      (selection: any) => {
        if (selection && selection.focus) {
          const cell = selection.focus as CellAddress;
          setActiveCell(cell);
          const row = data.find((r) => r.id === cell.rowId);
          setBarValue(row ? String((row as any)[cell.field] ?? '') : '');
        }
      },
      [data],
    );

    const handleCommit = useCallback(
      (value: string) => {
        if (!activeCell) return;
        setData((prev) =>
          prev.map((row) => {
            if (row.id === activeCell.rowId) {
              return { ...row, [activeCell.field]: value };
            }
            return row;
          }),
        );
      },
      [activeCell],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Formula Bar Extension</h2>
        <p style={styles.subtitle}>
          Click any cell to see its value in the formula bar above the grid. Edit the value in the
          bar and press Enter to commit.
        </p>
        <FormulaBarUI
          activeCell={activeCell}
          value={barValue}
          showCellAddress={ext.current.config.showCellAddress}
          showCellType={ext.current.config.showCellType}
          height={ext.current.config.height}
          placeholder={ext.current.config.placeholder}
          onValueChange={setBarValue}
          onCommit={handleCommit}
        />
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onSelectionChange={handleSelectionChange}
          />
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Custom height and no cell address
// ---------------------------------------------------------------------------

export const MinimalBar: StoryObj = {
  render: () => {
    const [data] = useState(() => makeEmployees(10));
    const [activeCell, setActiveCell] = useState<CellAddress | null>(null);
    const [barValue, setBarValue] = useState('');

    const ext = useRef(
      createFormulaBar({
        showCellAddress: false,
        showCellType: false,
        height: 28,
        placeholder: 'Click a cell...',
      }),
    );

    const handleSelectionChange = useCallback(
      (selection: any) => {
        if (selection?.focus) {
          const cell = selection.focus as CellAddress;
          setActiveCell(cell);
          const row = data.find((r) => r.id === cell.rowId);
          setBarValue(row ? String((row as any)[cell.field] ?? '') : '');
        }
      },
      [data],
    );

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Minimal Formula Bar</h2>
        <p style={styles.subtitle}>
          A compact formula bar with no cell address or type indicators — just the value input.
        </p>
        <FormulaBarUI
          activeCell={activeCell}
          value={barValue}
          showCellAddress={ext.current.config.showCellAddress}
          showCellType={ext.current.config.showCellType}
          height={ext.current.config.height}
          placeholder={ext.current.config.placeholder}
          onValueChange={setBarValue}
          onCommit={() => {}}
        />
        <div style={gridContainer}>
          <MuiDataGrid
            data={data}
            columns={defaultColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onSelectionChange={handleSelectionChange}
          />
        </div>
      </div>
    );
  },
};
