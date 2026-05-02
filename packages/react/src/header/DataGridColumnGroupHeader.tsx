import React from 'react';
import type { ColumnDef, ColumnGroupConfig } from '@iasbuilt/datagrid-core';
import type { ColumnGroupDragState } from '../state';
import * as styles from './DataGridColumnGroupHeader.styles';

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
