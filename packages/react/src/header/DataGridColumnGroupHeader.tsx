/**
 * Optional banner row rendered above the per-column header when the
 * grid's `columnGroups` config is non-empty. Each group spans the
 * columns assigned to it, supports drag-to-reorder at the group
 * granularity, and can be collapsed to hide every member column at
 * once.
 *
 * @module DataGridColumnGroupHeader
 */
import React from 'react';
import type { ColumnDef, ColumnGroupConfig } from '@iasbuilt/datagrid-core';
import type { ColumnGroupDragState } from '../state';
import * as styles from './DataGridColumnGroupHeader.styles';

/**
 * Props accepted by {@link DataGridColumnGroupHeader}. Width
 * resolution is left to the parent: the component receives the
 * already-ordered visible columns plus the matching `columnWidths`
 * array so each group banner can compute its `width: sum(member
 * column widths)` without re-walking the grid model.
 */
export interface DataGridColumnGroupHeaderProps {
  columnGroupConfig: ColumnGroupConfig;
  effectiveGroupOrder: string[];
  orderedVisibleColumns: ColumnDef<any>[];
  columnWidths: { width: number }[];
  collapsedColumnGroups: Set<string>;
  columnGroupDrag: ColumnGroupDragState;
  onDragStart: (groupId: string) => void;
  onDragOver: (groupId: string) => void;
  onDrop: (groupId: string) => void;
  onDragEnd: () => void;
  onCollapseToggle: (groupId: string) => void;
}

/**
 * Renders the column-group banner row. See
 * {@link DataGridColumnGroupHeaderProps} for the per-field contract.
 */
export function DataGridColumnGroupHeader(props: DataGridColumnGroupHeaderProps) {
  const {
    columnGroupConfig,
    effectiveGroupOrder,
    orderedVisibleColumns,
    columnWidths,
    collapsedColumnGroups,
    columnGroupDrag,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onCollapseToggle,
  } = props;

  return (
    <div style={styles.columnGroupHeaderRow}>
      {effectiveGroupOrder.map(groupId => {
        const group = columnGroupConfig.groups.find(g => g.id === groupId);
        if (!group) return null;
        const visibleInGroup = group.columns.filter(f => orderedVisibleColumns.some(c => c.field === f));
        if (visibleInGroup.length === 0) return null;
        const groupWidth = visibleInGroup.reduce((sum, f) => {
          const idx = orderedVisibleColumns.findIndex(c => c.field === f);
          return sum + (columnWidths[idx]?.width ?? 150);
        }, 0);
        return (
          <div
            key={group.id}
            data-testid="column-group-header"
            data-group-id={group.id}
            draggable
            style={styles.columnGroupHeader(groupWidth)}
            onDragStart={(e) => {
              onDragStart(group.id);
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (columnGroupDrag.type === 'dragging' && columnGroupDrag.groupId !== group.id) {
                onDragOver(group.id);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (columnGroupDrag.type === 'dragging' && columnGroupDrag.groupId !== group.id) {
                onDrop(group.id);
              }
            }}
            onDragEnd={() => {
              onDragEnd();
            }}
          >
            <span>{group.title}</span>
            {columnGroupConfig.collapsible && (
              <button
                data-testid="column-group-collapse"
                style={styles.columnGroupCollapseButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onCollapseToggle(group.id);
                }}
              >
                {collapsedColumnGroups.has(group.id) ? '+' : '-'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
