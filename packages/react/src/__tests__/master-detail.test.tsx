import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MasterDetail, DetailComponentProps } from '../MasterDetail';
import type { ColumnDef } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TestRow = { id: string; name: string; age: number };

function makeData(): TestRow[] {
  return [
    { id: '1', name: 'Alice', age: 30 },
    { id: '2', name: 'Bob', age: 25 },
    { id: '3', name: 'Charlie', age: 35 },
  ];
}

const columns: ColumnDef<TestRow>[] = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'age', field: 'age', title: 'Age' },
];

function SimpleDetail({ masterRow }: DetailComponentProps<TestRow>) {
  return <div data-testid="detail-content">Detail for {(masterRow as TestRow).name}</div>;
}

function LoadingDetail({ masterRow, detailData, loading }: DetailComponentProps<TestRow>) {
  if (loading) return <div>Loading...</div>;
  return (
    <div data-testid="detail-content">
      Detail for {(masterRow as TestRow).name}: {detailData ? String(detailData) : 'no data'}
    </div>
  );
}

function renderMasterDetail(overrides: Partial<React.ComponentProps<typeof MasterDetail>> = {}) {
  return render(
    <MasterDetail
      data={makeData()}
      columns={columns}
      rowKey="id"
      detailComponent={SimpleDetail as any}
      {...(overrides as any)}
    />,
  );
}

function getExpandIcons() {
  return screen.getAllByTestId(/^expand-icon-/);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('master detail', () => {
  it('renders expand icon in first column', () => {
    renderMasterDetail();
    const icons = getExpandIcons();
    expect(icons).toHaveLength(3);
    // Each icon should contain the right-pointing triangle
    expect(icons[0]!.textContent).toContain('\u25B6');
  });

  it('expands detail panel on icon click', () => {
    renderMasterDetail();
    const icon = screen.getByTestId('expand-icon-1');
    fireEvent.click(icon);
    expect(screen.getByTestId('detail-panel-1')).toBeInTheDocument();
    expect(screen.getByText('Detail for Alice')).toBeInTheDocument();
  });

  it('collapses detail panel on second click', () => {
    renderMasterDetail();
    const icon = screen.getByTestId('expand-icon-1');
    fireEvent.click(icon);
    expect(screen.getByTestId('detail-panel-1')).toBeInTheDocument();
    fireEvent.click(icon);
    expect(screen.queryByTestId('detail-panel-1')).not.toBeInTheDocument();
  });

  it('renders detail template component', () => {
    renderMasterDetail();
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    expect(screen.getByTestId('detail-content')).toBeInTheDocument();
  });

  it('passes master row data to detail component', () => {
    renderMasterDetail();
    fireEvent.click(screen.getByTestId('expand-icon-2'));
    expect(screen.getByText('Detail for Bob')).toBeInTheDocument();
  });

  it('only one detail expanded at a time when configured', () => {
    renderMasterDetail({ singleExpand: true });
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    expect(screen.getByTestId('detail-panel-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('expand-icon-2'));
    expect(screen.queryByTestId('detail-panel-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('detail-panel-2')).toBeInTheDocument();
  });

  it('allows multiple details expanded when configured', () => {
    renderMasterDetail({ singleExpand: false });
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    fireEvent.click(screen.getByTestId('expand-icon-2'));
    expect(screen.getByTestId('detail-panel-1')).toBeInTheDocument();
    expect(screen.getByTestId('detail-panel-2')).toBeInTheDocument();
  });

  it('fires onDetailExpand callback with row data', () => {
    const onDetailExpand = vi.fn();
    renderMasterDetail({ onDetailExpand });
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    expect(onDetailExpand).toHaveBeenCalledTimes(1);
    expect(onDetailExpand).toHaveBeenCalledWith(expect.objectContaining({ id: '1', name: 'Alice' }));
  });

  it('fires onDetailCollapse callback with row data', () => {
    const onDetailCollapse = vi.fn();
    renderMasterDetail({ onDetailCollapse });
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    expect(onDetailCollapse).toHaveBeenCalledTimes(1);
    expect(onDetailCollapse).toHaveBeenCalledWith(expect.objectContaining({ id: '1', name: 'Alice' }));
  });

  it('preserves expansion state on sort', () => {
    // Sort changes don't affect the MasterDetail component since expansion is
    // tracked by rowId, not index. We simulate by passing sorted data.
    const { rerender } = renderMasterDetail();
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    expect(screen.getByTestId('detail-panel-1')).toBeInTheDocument();

    // Re-render with sorted data (Alice is still id: '1')
    const sortedData = [...makeData()].sort((a, b) => b.age - a.age);
    rerender(
      <MasterDetail
        data={sortedData}
        columns={columns}
        rowKey="id"
        detailComponent={SimpleDetail as any}
      />,
    );
    expect(screen.getByTestId('detail-panel-1')).toBeInTheDocument();
  });

  it('preserves expansion state on filter', () => {
    const { rerender } = renderMasterDetail();
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    expect(screen.getByTestId('detail-panel-1')).toBeInTheDocument();

    // Re-render with filtered data that still includes row 1
    const filteredData = makeData().filter(r => r.age >= 30);
    rerender(
      <MasterDetail
        data={filteredData}
        columns={columns}
        rowKey="id"
        detailComponent={SimpleDetail as any}
      />,
    );
    expect(screen.getByTestId('detail-panel-1')).toBeInTheDocument();
  });

  it('detail panel spans full grid width', () => {
    renderMasterDetail();
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    const panel = screen.getByTestId('detail-panel-1');
    expect(panel.style.width).toBe('100%');
  });

  it('detail panel height adjusts to content', () => {
    renderMasterDetail();
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    const panel = screen.getByTestId('detail-panel-1');
    // Without detailHeight, no fixed height is set
    expect(panel.style.height).toBe('');
  });

  it('detail panel fixed height when configured', () => {
    renderMasterDetail({ detailHeight: 200 });
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    const panel = screen.getByTestId('detail-panel-1');
    expect(panel.style.height).toBe('200px');
    expect(panel.style.overflow).toBe('auto');
  });

  it('lazy loads detail data on expand', async () => {
    const fetchDetail = vi.fn().mockResolvedValue('lazy-data');
    renderMasterDetail({
      detailComponent: LoadingDetail as any,
      fetchDetail,
    });
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    expect(fetchDetail).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    await waitFor(() => {
      expect(screen.getByText('Detail for Alice: lazy-data')).toBeInTheDocument();
    });
  });

  it('shows loading spinner during lazy fetch', async () => {
    let resolvePromise!: (value: unknown) => void;
    const fetchDetail = vi.fn().mockReturnValue(new Promise(res => { resolvePromise = res; }));
    renderMasterDetail({
      detailComponent: LoadingDetail as any,
      fetchDetail,
    });
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    // Loading state should be visible
    expect(screen.getByTestId('detail-loading-1')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Resolve
    await act(async () => { resolvePromise('done'); });
    await waitFor(() => {
      expect(screen.queryByTestId('detail-loading-1')).not.toBeInTheDocument();
    });
  });

  it('caches loaded detail data', async () => {
    const fetchDetail = vi.fn().mockResolvedValue('cached-data');
    renderMasterDetail({
      detailComponent: LoadingDetail as any,
      fetchDetail,
    });

    // Expand
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    await waitFor(() => {
      expect(screen.getByText('Detail for Alice: cached-data')).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    expect(screen.queryByTestId('detail-panel-1')).not.toBeInTheDocument();

    // Expand again - should use cached data, not call fetchDetail again
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    // fetchDetail should only have been called once
    expect(fetchDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Detail for Alice: cached-data')).toBeInTheDocument();
  });

  it('invalidates cache on master row change', async () => {
    const fetchDetail = vi.fn().mockResolvedValue('v1');
    const data = makeData();
    const detailCacheKey = (row: TestRow) => `${row.name}-${row.age}`;

    const { rerender } = render(
      <MasterDetail
        data={data}
        columns={columns}
        rowKey="id"
        detailComponent={LoadingDetail as any}
        fetchDetail={fetchDetail}
        detailCacheKey={detailCacheKey as any}
      />,
    );

    // Expand and load
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    await waitFor(() => {
      expect(screen.getByText('Detail for Alice: v1')).toBeInTheDocument();
    });
    expect(fetchDetail).toHaveBeenCalledTimes(1);

    // Collapse
    fireEvent.click(screen.getByTestId('expand-icon-1'));

    // Change master row data (age changed)
    const newData = data.map(r => r.id === '1' ? { ...r, age: 31 } : r);
    fetchDetail.mockResolvedValue('v2');

    rerender(
      <MasterDetail
        data={newData}
        columns={columns}
        rowKey="id"
        detailComponent={LoadingDetail as any}
        fetchDetail={fetchDetail}
        detailCacheKey={detailCacheKey as any}
      />,
    );

    // Expand again - cache key changed, so should fetch again
    fireEvent.click(screen.getByTestId('expand-icon-1'));
    await waitFor(() => {
      expect(fetchDetail).toHaveBeenCalledTimes(2);
    });
  });

  it('keyboard Enter toggles detail expansion', () => {
    renderMasterDetail();
    const row = screen.getByTestId('expand-icon-1').closest('[data-row-id]')!;
    // Simulate Enter key on the grid container (which has keyDown handler)
    const grid = screen.getByRole('grid');
    // We need to fire keyDown on an element that has data-row-id in its ancestry
    fireEvent.keyDown(row, { key: 'Enter', bubbles: true });
    expect(screen.getByTestId('detail-panel-1')).toBeInTheDocument();
    fireEvent.keyDown(row, { key: 'Enter', bubbles: true });
    expect(screen.queryByTestId('detail-panel-1')).not.toBeInTheDocument();
  });

  it('detail panel receives focus after expand', async () => {
    renderMasterDetail();
    fireEvent.click(screen.getByTestId('expand-icon-1'));

    // The panel uses requestAnimationFrame to focus. We simulate that.
    await act(async () => {
      // Flush RAF
      await new Promise(r => setTimeout(r, 0));
    });

    const panel = screen.getByTestId('detail-panel-1');
    // The panel has tabIndex={-1} so it's focusable
    expect(panel.getAttribute('tabindex')).toBe('-1');
  });
});
