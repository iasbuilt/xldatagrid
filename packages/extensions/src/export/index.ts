/**
 * Data-export extension for the datagrid. Supports exporting grid data to CSV,
 * Excel (XLSX), and PDF formats. The module provides both low-level generation
 * helpers (for CSV strings, Excel data structures, and PDF table data) and a
 * high-level {@link createExportExtension} factory that exposes a convenient
 * {@link ExportApi} through the extension lifecycle.
 *
 * @remarks
 * Excel and PDF binary generation is currently stubbed — the helpers produce
 * JSON-encoded `Uint8Array` markers. A production build would integrate
 * ExcelJS / SheetJS for XLSX and jsPDF / pdfmake for PDF.
 *
 * @packageDocumentation
 */
import {
  ExtensionDefinition,
  ColumnDef,
  FilterState,
  CellValue,
} from '@iasbuilt/datagrid-core';
import { applyFiltering } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Config & types
// ---------------------------------------------------------------------------

/**
 * Supported export output formats.
 */
export type ExportFormat = 'csv' | 'excel' | 'pdf';

/**
 * Page-size and orientation settings used when generating PDF exports.
 */
export interface ExportPageConfig {
  /** Paper size preset. */
  size?: 'A4' | 'A3' | 'Letter' | 'Legal';

  /** Page orientation. */
  orientation?: 'portrait' | 'landscape';
}

/**
 * Header and footer text rendered on each page of a PDF export.
 */
export interface ExportHeaderFooter {
  /** Text displayed at the top of every page. */
  header?: string;

  /** Text displayed at the bottom of every page. */
  footer?: string;
}

/**
 * Top-level configuration for the {@link createExportExtension} factory.
 */
export interface ExportConfig {
  /**
   * Callback invoked after each export operation completes, receiving the
   * format and the fully assembled {@link ExportResult}.
   *
   * @param format - The format that was exported.
   * @param data - The generated export result.
   */
  onExport?: (format: ExportFormat, data: ExportResult) => void;

  /** PDF page configuration (size, orientation). */
  page?: ExportPageConfig;

  /** Header / footer text for PDF exports. */
  headerFooter?: ExportHeaderFooter;

  /**
   * Base filename (without extension) used for the exported file.
   *
   * @defaultValue `'export'`
   */
  filename?: string;
}

/**
 * The output produced by an export operation, containing the generated content
 * together with metadata about columns, rows, and format-specific options.
 */
export interface ExportResult {
  /** The format of the exported content. */
  format: ExportFormat;

  /** The generated file content — a string for CSV, or binary data for Excel/PDF. */
  content: string | Uint8Array;

  /** The column definitions included in the export. */
  columns: ColumnDef[];

  /** The data rows included in the export. */
  rows: Record<string, unknown>[];

  /** The resolved filename including the appropriate extension. */
  filename: string;

  /** PDF-specific page configuration, present only for PDF exports. */
  page?: ExportPageConfig;

  /** PDF-specific header/footer text, present only for PDF exports. */
  headerFooter?: ExportHeaderFooter;
}

// ---------------------------------------------------------------------------
// Data extraction helpers (shared across formats)
// ---------------------------------------------------------------------------

/**
 * Filters the full column list down to only those columns that should appear in
 * the export. Columns explicitly marked as `visible: false` or present in the
 * `hiddenColumns` set are excluded.
 *
 * @param columns - The complete set of column definitions.
 * @param hiddenColumns - A set of field names that have been hidden by the user.
 * @returns The subset of columns eligible for export.
 */
export function getExportColumns(
  columns: ColumnDef[],
  hiddenColumns: Set<string>,
): ColumnDef[] {
  return columns.filter(c => {
    // Skip columns explicitly configured as invisible
    if (c.visible === false) return false;
    // Skip columns the user has hidden at runtime
    if (hiddenColumns.has(c.field)) return false;
    return true;
  });
}

/**
 * Applies the current filter state to the data set to obtain only the rows that
 * should be included in the export. Delegates to the core `applyFiltering` utility.
 *
 * @typeParam T - The row data shape.
 * @param data - The full data array.
 * @param filter - The active filter state, or `null` for no filtering.
 * @returns The filtered subset of rows.
 */
export function getExportRows<T extends Record<string, unknown>>(
  data: T[],
  filter: FilterState | null,
): T[] {
  return applyFiltering(data, filter);
}

// ---------------------------------------------------------------------------
// CSV generation
// ---------------------------------------------------------------------------

/**
 * Escapes a single cell value for safe inclusion in a CSV file. Values containing
 * commas, double-quotes, or newlines are wrapped in double-quotes, with internal
 * quotes doubled per RFC 4180. `null` and `undefined` produce an empty string;
 * `Date` instances are serialised to ISO-8601.
 *
 * @param value - The raw cell value.
 * @returns The CSV-safe string representation.
 */
function escapeCsvValue(value: unknown): string {
  if (value == null) return '';
  // Normalise Date objects to ISO strings before further processing
  const str = value instanceof Date ? value.toISOString() : String(value);
  // Wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates a complete CSV document from the given columns and rows. The first
 * line contains the column titles as the header row, followed by one line per
 * data row with values in matching column order.
 *
 * @param columns - The columns to include (determines header order).
 * @param rows - The data rows to serialise.
 * @returns A CSV-formatted string.
 *
 * @example
 * ```ts
 * const csv = generateCsv(
 *   [{ field: 'name', title: 'Name' }],
 *   [{ name: 'Alice' }, { name: 'Bob' }],
 * );
 * // => "Name\nAlice\nBob"
 * ```
 */
export function generateCsv(
  columns: ColumnDef[],
  rows: Record<string, unknown>[],
): string {
  // Build the header line from column titles
  const header = columns.map(c => escapeCsvValue(c.title)).join(',');
  // Map each row to a comma-separated line of escaped values
  const lines = rows.map(row =>
    columns.map(c => escapeCsvValue(row[c.field])).join(','),
  );
  return [header, ...lines].join('\n');
}

// ---------------------------------------------------------------------------
// Excel generation (data prep + stub binary)
// ---------------------------------------------------------------------------

/**
 * Formats a single cell value for inclusion in an Excel worksheet, returning
 * the value alongside an optional Excel number-format string. Numeric and date
 * values are paired with a format derived from the column definition; other
 * types are coerced to strings.
 *
 * @param value - The raw cell value.
 * @param column - The column definition, used to resolve format strings and cell types.
 * @returns An object containing the formatted `value` and an optional `format` pattern.
 */
export function formatCellForExcel(value: unknown, column: ColumnDef): { value: unknown; format?: string } {
  if (value == null) return { value: '' };

  // `ColumnDef.format` admits both legacy mask strings and the
  // NumberFormatSpec object (issue #92). Excel export still emits a plain
  // mask string — coerce the object form to undefined so we fall back to the
  // defaults below; bespoke Excel masks for the new presets are deferred.
  const formatMask = typeof column.format === 'string' ? column.format : undefined;

  if (typeof value === 'number') {
    // Apply currency format when the column is typed as currency
    if (column.cellType === 'currency') {
      return { value, format: formatMask ?? '$#,##0.00' };
    }
    return { value, format: formatMask ?? '0' };
  }

  if (value instanceof Date) {
    return { value, format: formatMask ?? 'yyyy-mm-dd' };
  }

  return { value: String(value) };
}

/**
 * Prepares structured data suitable for populating an Excel worksheet. Returns
 * a headers array and a two-dimensional `dataRows` array where each cell is
 * a `{ value, format? }` pair.
 *
 * @param columns - The columns to include.
 * @param rows - The data rows to process.
 * @returns An object with `headers` and `dataRows` ready for an Excel writer.
 */
export function generateExcelData(
  columns: ColumnDef[],
  rows: Record<string, unknown>[],
): { headers: string[]; dataRows: { value: unknown; format?: string }[][] } {
  // Extract header titles in column order
  const headers = columns.map(c => c.title);
  // Format each cell value according to its column definition
  const dataRows = rows.map(row =>
    columns.map(c => formatCellForExcel(row[c.field], c)),
  );
  return { headers, dataRows };
}

/**
 * Generates a binary Excel file from the given columns and rows.
 *
 * @remarks
 * This is a stub implementation that serialises the structured data as
 * JSON-encoded bytes. A production build would use a library such as
 * ExcelJS or SheetJS to produce a valid XLSX binary.
 *
 * @param columns - The columns to include.
 * @param rows - The data rows to export.
 * @returns A `Uint8Array` representing the file content.
 */
export function generateExcelFile(
  columns: ColumnDef[],
  rows: Record<string, unknown>[],
): Uint8Array {
  // Prepare the structured data first
  const data = generateExcelData(columns, rows);
  // Encode a JSON representation as bytes – a real implementation would produce
  // a proper XLSX binary via ExcelJS / SheetJS.
  const json = JSON.stringify(data);
  return new TextEncoder().encode(json);
}

// ---------------------------------------------------------------------------
// PDF generation (data prep + stub binary)
// ---------------------------------------------------------------------------

/**
 * Structured table data suitable for rendering into a PDF document.
 */
export interface PdfTableData {
  /** Column header labels. */
  headers: string[];

  /** Two-dimensional array of stringified cell values, one sub-array per row. */
  bodyRows: string[][];

  /** Page configuration for the PDF. */
  page: ExportPageConfig;

  /** Header and footer text for the PDF. */
  headerFooter: ExportHeaderFooter;
}

/**
 * Prepares structured table data for rendering into a PDF. All cell values are
 * coerced to display strings — `Date` instances use `toLocaleDateString()`, and
 * nullish values become empty strings.
 *
 * @param columns - The columns to include.
 * @param rows - The data rows to process.
 * @param page - Optional page configuration (size, orientation).
 * @param headerFooter - Optional header/footer text.
 * @returns A {@link PdfTableData} object ready for a PDF rendering library.
 */
export function generatePdfData(
  columns: ColumnDef[],
  rows: Record<string, unknown>[],
  page: ExportPageConfig = {},
  headerFooter: ExportHeaderFooter = {},
): PdfTableData {
  return {
    headers: columns.map(c => c.title),
    bodyRows: rows.map(row => columns.map(c => {
      const v = row[c.field];
      // Coerce each value to a display-friendly string
      if (v == null) return '';
      if (v instanceof Date) return v.toLocaleDateString();
      return String(v);
    })),
    page,
    headerFooter,
  };
}

/**
 * Generates a binary PDF file from the given columns and rows.
 *
 * @remarks
 * This is a stub implementation that serialises the structured data as
 * JSON-encoded bytes. A production build would use a library such as
 * jsPDF or pdfmake to produce a valid PDF binary.
 *
 * @param columns - The columns to include.
 * @param rows - The data rows to export.
 * @param page - Optional page configuration.
 * @param headerFooter - Optional header/footer text.
 * @returns A `Uint8Array` representing the file content.
 */
export function generatePdfFile(
  columns: ColumnDef[],
  rows: Record<string, unknown>[],
  page: ExportPageConfig = {},
  headerFooter: ExportHeaderFooter = {},
): Uint8Array {
  // Build the structured PDF table data
  const data = generatePdfData(columns, rows, page, headerFooter);
  // Serialise to JSON bytes as a placeholder for real PDF generation
  const json = JSON.stringify(data);
  return new TextEncoder().encode(json);
}

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

/**
 * Programmatic API exposed by the export extension, providing methods to
 * trigger exports in each supported format.
 */
export interface ExportApi {
  /**
   * Exports visible grid data as a CSV file.
   *
   * @returns The {@link ExportResult} containing the CSV string and metadata.
   */
  exportToCSV(): ExportResult;

  /**
   * Exports visible grid data as an Excel (XLSX) file.
   *
   * @returns The {@link ExportResult} containing the binary content and metadata.
   */
  exportToExcel(): ExportResult;

  /**
   * Exports visible grid data as a PDF file.
   *
   * @returns The {@link ExportResult} containing the binary content and metadata.
   */
  exportToPDF(): ExportResult;
}

/**
 * Creates an {@link ExtensionDefinition} that adds data-export capabilities to the
 * datagrid. The returned extension exposes an {@link ExportApi} through its `api`
 * property, which consumers use to trigger CSV, Excel, or PDF exports on demand.
 *
 * During `init`, the factory captures the grid context and builds the API methods.
 * Each export method reads the current grid state (columns, hidden columns, active
 * filters, data), applies column visibility filtering and row filtering, then
 * delegates to the appropriate format generator. An optional `onExport` callback
 * is invoked after generation to allow side effects such as downloading the file.
 *
 * @param config - Optional configuration for filenames, PDF options, and callbacks.
 * @returns An extension definition augmented with an {@link ExportApi} accessor.
 *
 * @example
 * ```ts
 * const exportExt = createExportExtension({
 *   filename: 'report',
 *   onExport: (format, result) => downloadBlob(result.content, result.filename),
 * });
 * grid.registerExtension(exportExt);
 *
 * // Later, trigger an export:
 * exportExt.api.exportToCSV();
 * ```
 */
export function createExportExtension(config: ExportConfig = {}): ExtensionDefinition & { api: ExportApi } {
  let api: ExportApi;

  const ext: ExtensionDefinition & { api: ExportApi } = {
    id: 'export',
    name: 'Export',
    version: '0.1.0',

    get api() { return api; },

    init(ctx) {
      // Resolve the base filename once at initialisation time
      const filename = config.filename ?? 'export';

      api = {
        exportToCSV(): ExportResult {
          // Read the current grid state snapshot
          const state = ctx.getState();
          // Filter columns and rows based on visibility and active filters
          const columns = getExportColumns(state.columns as unknown as ColumnDef[], state.hiddenColumns);
          const rows = getExportRows(state.data, state.filter);
          const content = generateCsv(columns, rows);
          const result: ExportResult = {
            format: 'csv',
            content,
            columns,
            rows,
            filename: `${filename}.csv`,
          };
          // Notify the consumer that export has completed
          config.onExport?.('csv', result);
          return result;
        },

        exportToExcel(): ExportResult {
          // Read the current grid state snapshot
          const state = ctx.getState();
          // Filter columns and rows based on visibility and active filters
          const columns = getExportColumns(state.columns as unknown as ColumnDef[], state.hiddenColumns);
          const rows = getExportRows(state.data, state.filter);
          const content = generateExcelFile(columns, rows);
          const result: ExportResult = {
            format: 'excel',
            content,
            columns,
            rows,
            filename: `${filename}.xlsx`,
          };
          // Notify the consumer that export has completed
          config.onExport?.('excel', result);
          return result;
        },

        exportToPDF(): ExportResult {
          // Read the current grid state snapshot
          const state = ctx.getState();
          // Filter columns and rows based on visibility and active filters
          const columns = getExportColumns(state.columns as unknown as ColumnDef[], state.hiddenColumns);
          const rows = getExportRows(state.data, state.filter);
          const content = generatePdfFile(columns, rows, config.page, config.headerFooter);
          const result: ExportResult = {
            format: 'pdf',
            content,
            columns,
            rows,
            filename: `${filename}.pdf`,
            page: config.page,
            headerFooter: config.headerFooter,
          };
          // Notify the consumer that export has completed
          config.onExport?.('pdf', result);
          return result;
        },
      };
    },

    hooks() {
      return [];
    },
  };

  return ext;
}
