import React, { useState, useCallback, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import { createValidationTooltip } from '@iasbuilt/datagrid-extensions';
import type { ValidationTooltipConfig, ValidationTooltipEntry } from '@iasbuilt/datagrid-extensions';
import type { ColumnDef, CellValue, CellAddress, ValidationResult, Validator } from '@iasbuilt/datagrid-core';
import { makeEmployees, defaultColumns, Employee } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Validation Tooltip',
};
export default meta;

// ---------------------------------------------------------------------------
// Tooltip overlay UI (simulated)
// ---------------------------------------------------------------------------

const defaultSeverity = { bg: '#eff6ff', border: '#93c5fd', icon: '\u2139' };
const severityColors: Record<string, { bg: string; border: string; icon: string }> = {
  error: { bg: '#fef2f2', border: '#fca5a5', icon: '\u2716' },
  warning: { bg: '#fffbeb', border: '#fcd34d', icon: '\u26A0' },
  info: { bg: '#eff6ff', border: '#93c5fd', icon: '\u2139' },
};

interface TooltipOverlayProps {
  entries: ValidationTooltipEntry[];
  showIcon: boolean;
  position: string;
  onDismiss: (cell: CellAddress) => void;
}

function TooltipOverlay({ entries, showIcon, position, onDismiss }: TooltipOverlayProps) {
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>
        Validation Issues ({entries.length})
      </div>
      {entries.map((entry, i) => {
        const { bg, border, icon } = severityColors[entry.result.severity] ?? defaultSeverity;
        return (
          <div
            key={`${entry.cell.rowId}-${entry.cell.field}-${i}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px',
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 4,
            }}
          >
            {showIcon && <span>{icon}</span>}
            <span style={{ flex: 1 }}>
              <strong>{entry.cell.field}</strong> (row {entry.cell.rowId}): {entry.result.message}
            </span>
            <button
              onClick={() => onDismiss(entry.cell)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                color: '#94a3b8',
                padding: 0,
              }}
            >
              \u00D7
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default story with interactive controls
// ---------------------------------------------------------------------------

export const Default: StoryObj = {
  render: () => {
    const [position, setPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');
    const [autoDismissMs, setAutoDismissMs] = useState(5000);
    const [showIcon, setShowIcon] = useState(true);
    const [maxVisible, setMaxVisible] = useState(3);
    const [entries, setEntries] = useState<ValidationTooltipEntry[]>([]);

    const extRef = useRef(
      createValidationTooltip({ position, autoDismissMs, showIcon, maxVisible }),
    );

    // Columns wired to the new multi-validator API. The grid renders the
    // authoritative tooltip portal; the in-story overlay below is a
    // supplementary visual log that mirrors the most-severe entry per cell.
    const emailValidators: Validator<Employee>[] = [
      {
        name: 'email:format',
        run: (v: CellValue) =>
          !v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))
            ? { message: 'Invalid email address', severity: 'error' as const }
            : null,
      },
    ];
    const nameValidators: Validator<Employee>[] = [
      {
        name: 'name:minLength',
        run: (v: CellValue) =>
          !v || String(v).trim().length < 2
            ? { message: 'Name must be at least 2 characters', severity: 'error' as const }
            : null,
      },
      {
        name: 'name:lettersOnly',
        run: (v: CellValue) =>
          v != null && String(v).length > 0 && !/^[A-Za-z\s]+$/.test(String(v))
            ? { message: 'Name should contain only letters', severity: 'warning' as const }
            : null,
      },
    ];
    const salaryValidators: Validator<Employee>[] = [
      {
        name: 'salary:positive',
        run: (v: CellValue) => {
          const num = Number(v);
          return isNaN(num) || num < 0
            ? { message: 'Salary must be a positive number', severity: 'error' as const }
            : null;
        },
      },
      {
        name: 'salary:range',
        run: (v: CellValue) => {
          const num = Number(v);
          return !isNaN(num) && num > 200000
            ? { message: 'Salary exceeds typical range', severity: 'warning' as const }
            : null;
        },
      },
    ];

    const cols: ColumnDef<Employee>[] = defaultColumns.map((c) => {
      if (c.field === 'email') return { ...c, validators: emailValidators };
      if (c.field === 'name') return { ...c, validators: nameValidators };
      if (c.field === 'salary') return { ...c, validators: salaryValidators };
      return c;
    });

    const handleCellChange = useCallback(
      (rowId: string, field: string, value: any) => {
        // Mirror the grid's tooltip into the demo overlay: run each validator
        // in sequence, collect results, keep the first (most-severe) entry.
        const col = cols.find((c) => c.field === field);
        const validators = col?.validators as Validator<Employee>[] | undefined;
        if (!validators || validators.length === 0) return;
        const results: ValidationResult[] = [];
        for (const v of validators) {
          const r = v.run(value, { row: { id: rowId } as Employee, rowId, field });
          if (r) results.push(r);
        }
        if (results.length > 0) {
          // Pick most-severe — error > warning > info.
          const rank = { error: 3, warning: 2, info: 1 } as const;
          const top = results.slice().sort((a, b) => rank[b.severity] - rank[a.severity])[0]!;
          const cell: CellAddress = { rowId, field };
          const entry: ValidationTooltipEntry = { cell, result: top, timestamp: Date.now() };
          setEntries((prev) => {
            const filtered = prev.filter(
              (e) => !(e.cell.rowId === rowId && e.cell.field === field),
            );
            return [...filtered, entry].slice(-maxVisible);
          });
        } else {
          setEntries((prev) =>
            prev.filter((e) => !(e.cell.rowId === rowId && e.cell.field === field)),
          );
        }
      },
      [cols, maxVisible],
    );

    const handleDismiss = useCallback((cell: CellAddress) => {
      setEntries((prev) =>
        prev.filter((e) => !(e.cell.rowId === cell.rowId && e.cell.field === cell.field)),
      );
    }, []);

    const handleClearAll = useCallback(() => {
      setEntries([]);
    }, []);

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Validation Tooltip Extension</h2>
        <p style={styles.subtitle}>
          Edit the Name, Email, or Salary columns with invalid values to see validation tooltips.
          Tooltips auto-dismiss after {autoDismissMs / 1000}s.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            Position:
            <select
              style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 13 }}
              value={position}
              onChange={(e) => setPosition(e.target.value as any)}
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            Auto-dismiss (ms):
            <input
              type="number"
              style={{ width: 70, padding: '2px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 13 }}
              value={autoDismissMs}
              onChange={(e) => setAutoDismissMs(Number(e.target.value))}
              step={1000}
              min={0}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showIcon}
              onChange={(e) => setShowIcon(e.target.checked)}
            />
            Show icon
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            Max visible:
            <input
              type="number"
              style={{ width: 50, padding: '2px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 13 }}
              value={maxVisible}
              onChange={(e) => setMaxVisible(Number(e.target.value))}
              min={1}
              max={10}
            />
          </label>
          <button onClick={handleClearAll} style={styles.extensionsBtnStyle}>
            Clear All
          </button>
        </div>

        <TooltipOverlay
          entries={entries}
          showIcon={showIcon}
          position={position}
          onDismiss={handleDismiss}
        />

        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(15)}
            columns={cols as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onCellValueChange={handleCellChange}
          />
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// Persistent tooltips (no auto-dismiss)
// ---------------------------------------------------------------------------

export const PersistentTooltips: StoryObj = {
  render: () => {
    const [entries, setEntries] = useState<ValidationTooltipEntry[]>([]);

    const emailValidators: Validator<Employee>[] = [
      {
        name: 'email:format',
        run: (v: CellValue) =>
          !v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))
            ? { message: 'Invalid email', severity: 'error' as const }
            : null,
      },
    ];

    const cols: ColumnDef<Employee>[] = defaultColumns.map((c) =>
      c.field === 'email' ? { ...c, validators: emailValidators } : c,
    );

    const handleCellChange = useCallback((rowId: string, field: string, value: any) => {
      const col = cols.find((c) => c.field === field);
      const validators = col?.validators as Validator<Employee>[] | undefined;
      if (!validators || validators.length === 0) return;
      let result: ValidationResult | null = null;
      for (const v of validators) {
        const r = v.run(value, { row: { id: rowId } as Employee, rowId, field });
        if (r) {
          result = r;
          break;
        }
      }
      if (result) {
        const res = result;
        setEntries((prev) => {
          const filtered = prev.filter(
            (e) => !(e.cell.rowId === rowId && e.cell.field === field),
          );
          return [...filtered, { cell: { rowId, field }, result: res, timestamp: Date.now() }].slice(-5);
        });
      } else {
        setEntries((prev) =>
          prev.filter((e) => !(e.cell.rowId === rowId && e.cell.field === field)),
        );
      }
    }, [cols]);

    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Persistent Validation Tooltips</h2>
        <p style={styles.subtitle}>
          Auto-dismiss is disabled (0ms). Tooltips remain visible until manually dismissed. Up to 5
          tooltips are shown at once.
        </p>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, alignItems: 'center' }}>
          <span style={{ background: '#fef2f2', padding: '2px 8px', borderRadius: 4, border: '1px solid #fca5a5' }}>
            Auto-dismiss: off
          </span>
          <span style={{ background: '#e0f2fe', padding: '2px 8px', borderRadius: 4 }}>
            Max visible: 5
          </span>
          <button onClick={() => setEntries([])} style={styles.extensionsBtnStyle}>
            Clear All
          </button>
        </div>

        <TooltipOverlay
          entries={entries}
          showIcon
          position="bottom"
          onDismiss={(cell) =>
            setEntries((prev) =>
              prev.filter((e) => !(e.cell.rowId === cell.rowId && e.cell.field === cell.field)),
            )
          }
        />

        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(10)}
            columns={cols as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onCellValueChange={handleCellChange}
          />
        </div>
      </div>
    );
  },
};
