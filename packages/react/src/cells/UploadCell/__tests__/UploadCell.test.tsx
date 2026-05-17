import { vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

import { UploadCell } from '../UploadCell';
import type { AttachmentRef, CellValue, ColumnDef } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeColumn(overrides: Partial<ColumnDef> = {}): ColumnDef {
  return { id: 'col1', field: 'col1', title: 'Column 1', ...overrides };
}

function makeProps(overrides: {
  value?: CellValue;
  column?: Partial<ColumnDef>;
  isEditing?: boolean;
  onCommit?: (v: CellValue) => void;
  onCancel?: () => void;
  rowId?: string;
}) {
  return {
    value: overrides.value ?? null,
    row: {},
    column: makeColumn(overrides.column),
    rowIndex: 0,
    isEditing: overrides.isEditing ?? false,
    onCommit: overrides.onCommit ?? vi.fn(),
    onCancel: overrides.onCancel ?? vi.fn(),
    rowId: overrides.rowId ?? 'r1',
  };
}

// ---------------------------------------------------------------------------
// UploadCell — legacy display contract
// ---------------------------------------------------------------------------

describe('UploadCell — display + legacy contract', () => {
  it('renders file name as a link when value is set', () => {
    render(<UploadCell {...makeProps({ value: 'report.pdf' })} />);
    expect(screen.getByRole('link', { name: /download report\.pdf/i })).toBeInTheDocument();
  });

  it('renders placeholder text when value is null', () => {
    render(<UploadCell {...makeProps({ value: null, column: { placeholder: 'No file' } })} />);
    expect(screen.getByText('No file')).toBeInTheDocument();
  });

  it('renders placeholder when value is empty string', () => {
    render(<UploadCell {...makeProps({ value: '' })} />);
    expect(screen.getByText(/no file/i)).toBeInTheDocument();
  });

  it('renders "Upload" button when no file is present', () => {
    render(<UploadCell {...makeProps({ value: null })} />);
    expect(screen.getByRole('button', { name: /upload file/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload file/i })).toHaveTextContent('Upload');
  });

  it('renders "Replace" button when a file is present', () => {
    render(<UploadCell {...makeProps({ value: 'doc.docx' })} />);
    expect(screen.getByRole('button', { name: /upload file/i })).toHaveTextContent('Replace');
  });

  it('renders attachment-ref display name when value is an AttachmentRef', () => {
    const ref: AttachmentRef = { id: 'att-1', name: 'photo.png', url: 'https://x/photo.png' };
    render(<UploadCell {...makeProps({ value: ref as unknown as CellValue })} />);
    expect(screen.getByRole('link', { name: /download photo\.png/i })).toBeInTheDocument();
  });

  it('calls onDownload handler when file link is clicked (legacy string value)', () => {
    const onDownload = vi.fn();
    const column = { ...makeColumn(), onDownload } as unknown as ColumnDef;
    render(
      <UploadCell
        value="report.pdf"
        row={{}}
        column={column}
        rowIndex={0}
        isEditing={false}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: /download/i }));
    expect(onDownload).toHaveBeenCalledWith('report.pdf');
  });

  it('calls onDownload with the AttachmentRef when value is a ref', () => {
    const onDownload = vi.fn();
    const ref: AttachmentRef = { id: 'att-2', name: 'spec.pdf' };
    const column = { ...makeColumn(), onDownload } as unknown as ColumnDef;
    render(
      <UploadCell
        value={ref as unknown as CellValue}
        row={{}}
        column={column}
        rowIndex={0}
        isEditing={false}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: /download/i }));
    expect(onDownload).toHaveBeenCalledWith(ref);
  });

  it('commits the filename in legacy mode (no onAttach wired)', () => {
    const onCommit = vi.fn();
    render(<UploadCell {...makeProps({ value: null, onCommit })} />);
    const fileInput = screen.getByLabelText(/file input/i);
    const file = new File(['content'], 'new-file.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onCommit).toHaveBeenCalledWith('new-file.txt');
  });

  it('handles drag-and-drop in legacy mode', () => {
    const onCommit = vi.fn();
    const { container } = render(<UploadCell {...makeProps({ value: null, onCommit })} />);
    const file = new File(['content'], 'dropped.png', { type: 'image/png' });
    const dropZone = container.firstChild as Element;
    fireEvent.dragOver(dropZone, { dataTransfer: { files: [file] } });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    expect(onCommit).toHaveBeenCalledWith('dropped.png');
  });

  it('has a hidden file input element', () => {
    render(<UploadCell {...makeProps({ value: null })} />);
    const input = screen.getByLabelText(/file input/i);
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveStyle({ display: 'none' });
  });

  it('applies drag-over border style when dragging over', () => {
    const { container } = render(<UploadCell {...makeProps({ value: null })} />);
    const dropZone = container.firstChild as Element;
    fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } });
    expect(dropZone).toHaveStyle({ border: '2px dashed #2563eb' });
  });
});

// ---------------------------------------------------------------------------
// UploadCell — onAttach contract (issue #91)
// ---------------------------------------------------------------------------

describe('UploadCell — onAttach contract (issue #91)', () => {
  it('calls onAttach with the file, a CellAddress-shaped context, and a progress reporter', async () => {
    const onAttach = vi.fn().mockResolvedValue({ id: 'att-100', name: 'x.txt' } as AttachmentRef);
    const column = { ...makeColumn({ field: 'attachment' }), onAttach } as unknown as ColumnDef;
    render(
      <UploadCell
        value={null}
        row={{ id: 'r-42' }}
        column={column}
        rowIndex={0}
        isEditing={false}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
        rowId="r-42"
      />,
    );

    const file = new File(['x'], 'x.txt', { type: 'text/plain' });
    const input = screen.getByLabelText(/file input/i);
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(onAttach).toHaveBeenCalledTimes(1);
    const [calledFile, calledCtx, calledProgress] = onAttach.mock.calls[0];
    expect(calledFile).toBe(file);
    expect(calledCtx.cell).toEqual({ rowId: 'r-42', field: 'attachment' });
    expect(calledCtx.column.field).toBe('attachment');
    expect(typeof calledProgress).toBe('function');
  });

  it('shows in-flight UI while onAttach is pending and success after it resolves', async () => {
    let resolveUpload!: (ref: AttachmentRef) => void;
    const onAttach = vi.fn(
      () => new Promise<AttachmentRef>((res) => { resolveUpload = res; }),
    );
    const onCommit = vi.fn();
    const column = { ...makeColumn(), onAttach } as unknown as ColumnDef;
    render(
      <UploadCell
        value={null}
        row={{}}
        column={column}
        rowIndex={0}
        isEditing={false}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );

    const file = new File(['x'], 'pending.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(/file input/i), { target: { files: [file] } });

    expect(await screen.findByTestId('upload-cell-uploading')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload file/i })).toBeDisabled();

    await act(async () => {
      resolveUpload({ id: 'att-200', name: 'pending.txt' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-cell-success')).toBeInTheDocument();
    });
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'att-200', name: 'pending.txt' }),
    );
  });

  it('shows error state when onAttach rejects, exposes a Retry button, and keeps the prior value', async () => {
    let rejectUpload!: (reason: Error) => void;
    const onAttach = vi.fn(
      () => new Promise<AttachmentRef>((_res, rej) => { rejectUpload = rej; }),
    );
    const onCommit = vi.fn();
    const column = { ...makeColumn(), onAttach } as unknown as ColumnDef;
    render(
      <UploadCell
        value="prior.pdf"
        row={{}}
        column={column}
        rowIndex={0}
        isEditing={false}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );

    const file = new File(['x'], 'will-fail.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(/file input/i), { target: { files: [file] } });
    await act(async () => {
      rejectUpload(new Error('network down'));
    });

    expect(await screen.findByTestId('upload-cell-error')).toHaveTextContent('network down');
    expect(screen.getByRole('button', { name: /retry upload/i })).toBeInTheDocument();
    // Prior cell value untouched.
    expect(onCommit).not.toHaveBeenCalled();
    // Display still shows the prior filename.
    expect(screen.getByRole('link', { name: /download prior\.pdf/i })).toBeInTheDocument();
  });

  it('Retry re-invokes onAttach with the same file', async () => {
    const onAttach = vi
      .fn<[File, unknown, unknown?], Promise<AttachmentRef>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'att-300', name: 'r.txt' });
    const onCommit = vi.fn();
    const column = { ...makeColumn(), onAttach } as unknown as ColumnDef;
    render(
      <UploadCell
        value={null}
        row={{}}
        column={column}
        rowIndex={0}
        isEditing={false}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );

    const file = new File(['r'], 'r.txt', { type: 'text/plain' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/file input/i), { target: { files: [file] } });
    });
    expect(await screen.findByTestId('upload-cell-error')).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: /retry upload/i });
    await act(async () => {
      fireEvent.click(retry);
    });

    await waitFor(() => expect(screen.getByTestId('upload-cell-success')).toBeInTheDocument());
    expect(onAttach).toHaveBeenCalledTimes(2);
    expect(onAttach.mock.calls[1][0]).toBe(file);
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'att-300' }));
  });

  it('rejects files exceeding maxSize without invoking onAttach', async () => {
    const onAttach = vi.fn();
    const column = { ...makeColumn({ maxSize: 5 }), onAttach } as unknown as ColumnDef;
    render(
      <UploadCell
        value={null}
        row={{}}
        column={column}
        rowIndex={0}
        isEditing={false}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const file = new File(['too-much-content'], 'big.txt', { type: 'text/plain' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/file input/i), { target: { files: [file] } });
    });

    expect(onAttach).not.toHaveBeenCalled();
    expect(await screen.findByTestId('upload-cell-error')).toHaveTextContent(/max size/i);
  });

  it('rejects files outside the accept list without invoking onAttach', async () => {
    const onAttach = vi.fn();
    const column = { ...makeColumn({ accept: ['.pdf'] }), onAttach } as unknown as ColumnDef;
    render(
      <UploadCell
        value={null}
        row={{}}
        column={column}
        rowIndex={0}
        isEditing={false}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const file = new File(['x'], 'note.txt', { type: 'text/plain' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/file input/i), { target: { files: [file] } });
    });
    expect(onAttach).not.toHaveBeenCalled();
    expect(await screen.findByTestId('upload-cell-error')).toHaveTextContent(/not accepted/i);
  });

  it('forwards progress updates from onAttach', async () => {
    let resolveUpload!: (ref: AttachmentRef) => void;
    let progressReporter: ((loaded: number, total?: number) => void) | undefined;
    const onAttach = vi.fn((_file: File, _ctx: unknown, onProgress?: (loaded: number, total?: number) => void) => {
      progressReporter = onProgress;
      return new Promise<AttachmentRef>((res) => { resolveUpload = res; });
    });
    const column = { ...makeColumn(), onAttach } as unknown as ColumnDef;
    render(
      <UploadCell
        value={null}
        row={{}}
        column={column}
        rowIndex={0}
        isEditing={false}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const file = new File(['x'], 'p.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(/file input/i), { target: { files: [file] } });
    await screen.findByTestId('upload-cell-uploading');

    await act(async () => {
      progressReporter?.(50, 100);
    });
    const progressEl = screen.getByRole('progressbar');
    expect(progressEl).toBeInTheDocument();

    await act(async () => {
      resolveUpload({ id: 'p', name: 'p.txt' });
    });
    await waitFor(() => expect(screen.getByTestId('upload-cell-success')).toBeInTheDocument());
  });
});
