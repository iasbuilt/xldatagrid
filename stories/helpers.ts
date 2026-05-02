import { muiCellRendererMap } from '@iasbuilt/datagrid-mui';

/** MUI cell renderers — drop-in replacement for plain React renderers */
export const allCellRenderers = muiCellRendererMap;

/** Wrapper style for story containers */
export const storyContainer: React.CSSProperties = {
  padding: 24,
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  boxSizing: 'border-box',
};

export const gridContainer: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  overflow: 'hidden',
};
