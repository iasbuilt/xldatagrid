import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { UploadCell } from '../UploadCell';
import type { ColumnDef, CellValue } from '@iasbuilt/datagrid-core';

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
}) {
  return {
    value: overrides.value ?? null,
    row: {},
    column: makeColumn(overrides.column),
    rowIndex: 0,
    isEditing: overrides.isEditing ?? false,
    onCommit: overrides.onCommit ?? vi.fn(),
    onCancel: overrides.onCancel ?? vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// UploadCell
// ---------------------------------------------------------------------------

describe('UploadCell', () => {
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

  it('calls onDownload handler when file link is clicked', () => {
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
      />
    );
    fireEvent.click(screen.getByRole('link', { name: /download/i }));
    expect(onDownload).toHaveBeenCalledWith('report.pdf');
  });

  it('calls onCommit with file name after file input change', () => {
    const onCommit = vi.fn();
    render(<UploadCell {...makeProps({ value: null, onCommit })} />);
    const fileInput = screen.getByLabelText(/file input/i);
    const file = new File(['content'], 'new-file.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onCommit).toHaveBeenCalledWith('new-file.txt');
  });

  it('calls onCommit after drag-and-drop', () => {
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
