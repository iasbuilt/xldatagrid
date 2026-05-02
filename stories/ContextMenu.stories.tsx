import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import type { ContextMenuConfig } from '@iasbuilt/datagrid-core';
import { makeEmployees, defaultColumns } from './data';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Context Menu',
};
export default meta;

export const DefaultContextMenu: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Default Context Menu</h2>
      <p style={styles.subtitle}>
        Right-click any cell to open the built-in context menu.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployees(15)}
          columns={defaultColumns as any}
          rowKey="id"
          contextMenu
          sorting
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

export const InsideTransformedAncestor: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Context Menu Inside Transformed Ancestor</h2>
      <p style={styles.subtitle}>
        Verifies the context menu positions at the cursor even when a CSS{' '}
        <code>transform</code> ancestor would otherwise break{' '}
        <code>position: fixed</code>.
      </p>
      <div style={{ transform: 'translate3d(0,0,0)', padding: 24 }}>
        <div style={{ ...gridContainer, height: 480 }}>
          <MuiDataGrid
            data={makeEmployees(15)}
            columns={defaultColumns as any}
            rowKey="id"
            contextMenu
            sorting
            selectionMode="cell"
            keyboardNavigation
          />
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Smoke test: the grid sits inside a trivial `translate3d(0,0,0)` wrapper, which is enough to make a transformed ancestor become the containing block for any `position: fixed` descendant. The menu must still appear at the cursor, not at the top-left of the viewport. See `ContextMenu_InTransformedAncestor` for a non-identity transform that exercises the same invariant more aggressively.',
      },
    },
  },
};

export const ContextMenu_InTransformedAncestor: StoryObj = {
  name: 'Context Menu In Transformed Ancestor (portal invariant)',
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>
        Context Menu In Transformed Ancestor
      </h2>
      <p style={styles.subtitle}>
        Right-click anywhere; the menu must appear at the cursor, not in the
        top-left corner of the viewport.
      </p>
      <p style={styles.subtitle}>
        The grid is wrapped in an ancestor with{' '}
        <code>transform: translate(50px, 50px) scale(0.95)</code>. Per the CSS
        spec, that turns the wrapper into the containing block for any{' '}
        <code>position: fixed</code> descendant. Before the portal fix, the
        context menu resolved its <code>top</code>/<code>left</code> against
        the wrapper's origin instead of the viewport and flew to the far
        top-left. The menu now renders through{' '}
        <code>createPortal(…, document.body)</code> and re-seeds its position
        inside <code>useLayoutEffect</code>, so it lands at the cursor on the
        very first committed frame.
      </p>
      <div
        style={{
          transform: 'translate(50px, 50px) scale(0.95)',
          transformOrigin: '0 0',
          padding: 24,
          border: '1px dashed #94a3b8',
          borderRadius: 8,
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ ...gridContainer, height: 480 }}>
          <MuiDataGrid
            data={makeEmployees(15)}
            columns={defaultColumns as any}
            rowKey="id"
            contextMenu
            sorting
            selectionMode="cell"
            keyboardNavigation
          />
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Right-click anywhere; the menu must appear at the cursor, not in the top-left corner of the viewport. The wrapper applies `transform: translate(50px, 50px) scale(0.95)`, which historically broke `position: fixed` for the context menu. The menu now renders through `createPortal(…, document.body)` and positions itself in `useLayoutEffect`, so a transformed / filtered / perspective-set ancestor can no longer hijack its containing block. See the regression test at `packages/react/src/__tests__/context-menu-position.test.tsx`.',
      },
    },
  },
};

export const CustomContextMenu: StoryObj = {
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    const menuConfig: ContextMenuConfig = {
      items: [
        {
          key: 'copy',
          label: 'Copy Cell',
          shortcut: 'Ctrl+C',
          onClick: ({ rowId, field }) => setLog((p) => [...p.slice(-4), `Copy: [${rowId}].${field}`]),
        },
        {
          key: 'paste',
          label: 'Paste',
          shortcut: 'Ctrl+V',
          onClick: () => setLog((p) => [...p.slice(-4), 'Paste triggered']),
          dividerAfter: true,
        },
        {
          key: 'delete-row',
          label: 'Delete Row',
          danger: true,
          onClick: ({ rowId }) => setLog((p) => [...p.slice(-4), `Delete row: ${rowId}`]),
        },
        {
          key: 'export',
          label: 'Export',
          children: [
            { key: 'csv', label: 'As CSV', onClick: () => setLog((p) => [...p.slice(-4), 'Export CSV']) },
            { key: 'pdf', label: 'As PDF', onClick: () => setLog((p) => [...p.slice(-4), 'Export PDF']) },
          ],
          onClick: () => {},
        },
      ],
    };
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Custom Context Menu Items</h2>
        <p style={styles.subtitle}>
          Right-click to see custom items including a nested "Export" submenu and a danger "Delete Row" action.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeEmployees(10)}
            columns={defaultColumns as any}
            rowKey="id"
            contextMenu={menuConfig}
            sorting
            selectionMode="cell"
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(right-click and choose an action)'}
        </pre>
      </div>
    );
  },
};
