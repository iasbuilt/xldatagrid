import type { Validator } from './validators';
import type { OverflowPolicy, Density } from './overflow';

/**
 * Core type definitions for the datagrid system.
 *
 * This module declares all shared interfaces, type aliases, and enumerations used
 * across the datagrid packages — covering cell values, sorting, filtering,
 * selection, column configuration, validation, grouping, plugin/extension
 * contracts, undo/redo commands, and the top-level {@link GridConfig} that
 * consumers pass to instantiate a grid.
 *
 * Every rendering adapter and extension relies on these canonical types to
 * ensure consistent behavior and type safety throughout the stack.
 *
 * @module types
 */

// ---------------------------------------------------------------------------
// Cell value primitives
// ---------------------------------------------------------------------------

/**
 * The union of primitive and array types that a single cell can hold.
 *
 * Covers the most common data shapes encountered in spreadsheet-style grids:
 * textual content, numbers, booleans, dates, explicit `null`/`undefined`
 * (empty cells), and heterogeneous arrays (e.g. tag lists or multi-value
 * selections).
 */
export type CellValue = string | number | boolean | Date | null | undefined | unknown[];

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

/**
 * Ascending or descending ordering direction for a sort operation.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Describes a single-field sort criterion.
 *
 * Multiple {@link SortDescriptor} entries compose into a {@link SortState} to
 * express multi-column sorting with well-defined priority.
 */
export interface SortDescriptor {
  /** The data-field name to sort by. */
  field: string;
  /** The ordering direction. */
  dir: SortDirection;
}

/**
 * An ordered list of sort descriptors representing the full sort configuration.
 *
 * The first element carries the highest priority; subsequent entries serve as
 * tie-breakers.
 */
export type SortState = SortDescriptor[];

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

/**
 * The set of comparison operators available for constructing filter expressions.
 *
 * Operators range from simple equality checks (`eq`, `neq`) through relational
 * comparisons (`gt`, `gte`, `lt`, `lte`), string matching (`contains`,
 * `startsWith`, `endsWith`), range testing (`between`), null checks
 * (`isNull`, `isNotNull`), and value-list membership (`in`, `notIn`).
 *
 * The `in` / `notIn` operators back the Excel 365-style column filter menu:
 * the user picks a set of distinct values from a checklist and rows are kept
 * (or dropped) based on set membership. They expect the descriptor's `value`
 * to be either a `string[]` or a `Set<string>`; see {@link FilterDescriptor}
 * for the runtime semantics and the sentinel `'(blanks)'` convention used to
 * match empty cells.
 */
export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'between' | 'isNull' | 'isNotNull' | 'in' | 'notIn';

/**
 * A single-field filter predicate.
 *
 * The shape of `value` is operator-dependent:
 * - scalar operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`,
 *   `startsWith`, `endsWith`) expect a single reference value of a type
 *   compatible with the cell being tested;
 * - `between` expects a two-element `[min, max]` tuple (inclusive bounds);
 * - `isNull` / `isNotNull` ignore `value` entirely;
 * - `in` / `notIn` expect either an array of strings or a `Set<string>` of
 *   allowed values. Cells are coerced to strings (via `String(cell)`) before
 *   comparison, comparison is case-sensitive, and the literal string
 *   `'(blanks)'` inside the list matches `null`, `undefined`, and `''`.
 */
export interface FilterDescriptor {
  /** The data-field name to filter on. */
  field: string;
  /** The comparison operator. */
  operator: FilterOperator;
  /**
   * The reference value. Its concrete type depends on {@link operator};
   * see the interface docstring for the per-operator contract.
   */
  value: unknown;
}

/**
 * A recursive, tree-structured filter expression that combines leaf
 * {@link FilterDescriptor} nodes with boolean logic (`and` / `or`).
 *
 * Nesting allows arbitrarily complex filter predicates to be expressed: each
 * entry in `filters` may itself be a composite, so the tree has no depth
 * limit. Evaluation is short-circuit-free — every child is visited — but
 * the precompile step in `applyFiltering` hoists expensive value-list targets
 * into `Set`s once per call so per-row cost stays O(1) regardless of depth.
 */
export interface CompositeFilterDescriptor {
  /** Boolean combinator applied to child filters. */
  logic: 'and' | 'or';
  /** Child filters — may be leaf descriptors or nested composites. */
  filters: (FilterDescriptor | CompositeFilterDescriptor)[];
}

/**
 * Top-level filter state stored on the grid.
 *
 * It is always a composite descriptor (even for single-field filters) so that
 * multi-field / nested predicates are representable without a type change.
 */
export type FilterState = CompositeFilterDescriptor;

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Identifies a single cell within the grid by row identity and column field.
 */
export interface CellAddress {
  /** The unique row identifier (derived from the `rowKey` resolver). */
  rowId: string;
  /** The column field name. */
  field: string;
}

/**
 * A contiguous rectangular selection described by an anchor (the cell where the
 * selection started) and a focus (the cell where it currently ends).
 *
 * `kind` records the user's selection *intent* at the time the range was
 * created. A range carrying `kind: 'row'` was produced by a chrome row-number
 * gutter interaction (plain / Shift / Cmd click or the row-aware keyboard
 * helpers) and is rendered as a row-level outline regardless of the grid's
 * `selectionMode`. Ranges without `kind` are plain cell/range selections and
 * keep the pre-existing per-cell outline / range-tint visual.
 */
export interface CellRange {
  /** The originating cell of the selection. */
  anchor: CellAddress;
  /** The terminal cell of the selection. */
  focus: CellAddress;
  /** Selection intent; only `'row'` is used today. */
  kind?: 'row';
}

/**
 * Determines the granularity of user selection within the grid.
 *
 * - `'cell'`  — individual cell selection.
 * - `'row'`   — whole-row selection.
 * - `'range'` — rectangular multi-cell range selection.
 * - `'none'`  — selection is disabled.
 */
export type SelectionMode = 'cell' | 'row' | 'range' | 'none';

// ---------------------------------------------------------------------------
// Upload / attachment system (issue #91)
// ---------------------------------------------------------------------------

/**
 * Opaque handle returned by an upload backend after persisting a file.
 *
 * The grid is deliberately agnostic about *how* a file is stored, deduped,
 * scoped, or revoked — those concerns live in the consumer's attachment
 * service (e.g. the iasbuilt/webapp attachment system specced in
 * istracked/webapp#155). The grid only needs a stable reference so it can
 * record what was uploaded and, optionally, render a download/preview link.
 *
 * @remarks
 * The `id` is the canonical persisted handle (a content-hash, blob-store key,
 * or DB row id — the grid does not care). `url` and `meta` are optional
 * hints used by the cell renderer's display mode; cells gracefully fall back
 * to id-only display when they are omitted.
 */
export interface AttachmentRef {
  /** Stable backend identifier for the persisted file. */
  id: string;
  /** Optional human-friendly file name (used by display mode). */
  name?: string;
  /** Optional URL for download / preview affordance. */
  url?: string;
  /** Optional MIME type — used to pick an icon / thumbnail. */
  mimeType?: string;
  /** Byte size of the persisted file, if known. */
  size?: number;
  /** Free-form metadata bag forwarded verbatim by the backend. */
  meta?: Record<string, unknown>;
}

/**
 * Per-cell context passed to {@link UploadAttachHandler} so the consumer can
 * route the upload to the right scope / row / column on its side.
 *
 * @remarks
 * `CellAddress` is intentionally reused here so the same address shape that
 * flows through selection and editing also identifies an upload target. The
 * `column` reference is forwarded so the handler can read column-level
 * config (accept list, scope, etc.) without re-resolving the column.
 *
 * @typeParam TData - The shape of a data row.
 */
export interface UploadAttachContext<TData = Record<string, unknown>> {
  /** Target cell receiving the attachment. */
  cell: CellAddress;
  /** Column definition for the target cell. */
  column: ColumnDef<TData>;
  /** Row data for the target cell. */
  row: TData;
}

/**
 * Reports progress for an in-flight upload.
 *
 * @param loaded - Bytes transferred so far.
 * @param total - Total bytes expected (may be `undefined` for chunked uploads).
 */
export type UploadProgressReporter = (loaded: number, total?: number) => void;

/**
 * The clean interface the grid hands to consumers (e.g. iasbuilt/webapp) so
 * they can wire the file-upload cell to their attachment system.
 *
 * **Contract**
 * - Receives the raw `File` and an {@link UploadAttachContext} identifying
 *   the target cell.
 * - Must resolve with an {@link AttachmentRef} on success.
 * - Must reject (throw) on failure; the cell surfaces the error message and
 *   keeps the cell value unchanged so the user can retry.
 * - May call `onProgress` zero or more times before resolving.
 *
 * @typeParam TData - The shape of a data row.
 *
 * @example
 * ```ts
 * const columns: ColumnDef<MyRow>[] = [
 *   {
 *     id: 'attachment', field: 'attachment', title: 'File',
 *     cellType: 'upload',
 *     onAttach: async (file, ctx) => {
 *       const ref = await myAttachmentService.upload(file, { scope: ctx.column.scope });
 *       return { id: ref.id, name: file.name, url: ref.url };
 *     },
 *   },
 * ];
 * ```
 */
export type UploadAttachHandler<TData = Record<string, unknown>> = (
  file: File,
  context: UploadAttachContext<TData>,
  onProgress?: UploadProgressReporter,
) => Promise<AttachmentRef>;

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------

/**
 * Enumerates the built-in cell-renderer types that the grid supports.
 *
 * Each type maps to a specialised editor/renderer pair in the rendering layer,
 * covering plain text, calendars, status badges, tag chips, booleans, currency
 * formatting, rich-text editing, file uploads, nested sub-grids, and more.
 *
 * Two variants extend the base boolean/password renderers with richer display
 * semantics intended primarily for form-style (transposed) grids:
 *   - `'booleanSelected'` — displays the literal word "Selected" when the
 *     value is `true`, an em-dash ("—") for `false`, and nothing for
 *     nullish values. Click-to-toggle remains available.
 *   - `'passwordConfirm'` — renders two password inputs (value + confirm)
 *     plus a show/hide eye toggle. The commit is gated on both inputs
 *     matching; mismatch is surfaced inline.
 */
export type CellType = 'text' | 'calendar' | 'status' | 'tags' | 'compoundChipList' | 'boolean' | 'booleanSelected' | 'password' | 'passwordConfirm' | 'chipSelect' | 'currency' | 'richText' | 'numeric' | 'upload' | 'subGrid' | 'list' | 'actions';

/**
 * Represents a selectable option in status, chip-select, or list columns.
 */
export interface StatusOption {
  /** Underlying value stored in the data model. */
  value: string;
  /** Human-readable display label. */
  label: string;
  /** Optional CSS colour associated with the option (e.g. `"#ff0000"`). */
  color?: string;
  /** Optional icon identifier rendered alongside the label. */
  icon?: string;
}

/**
 * Defines a single column's schema, behaviour, and visual properties.
 *
 * @typeParam TData - The shape of a data row. Defaults to a generic record.
 *
 * @remarks
 * Several optional fields are cell-type-specific (e.g. `options` is relevant
 * only for `status`, `chipSelect`, and `list` cell types). Setting them on
 * an unrelated cell type has no effect.
 */
export interface ColumnDef<TData = Record<string, unknown>> {
  /** Unique column identifier (stable across reorders). */
  id: string;
  /** Property path within `TData` that this column reads/writes. */
  field: keyof TData & string;
  /** Display title rendered in the column header. */
  title: string;
  /** Initial pixel width. */
  width?: number;
  /** Minimum pixel width when resizing. */
  minWidth?: number;
  /** Maximum pixel width when resizing. */
  maxWidth?: number;
  /**
   * Width sizing mode.
   * - `'auto'`: column expands to fit its content (icons, text, etc.)
   * - `'fixed'`: column has a fixed pixel width; content shrinks/clips to fit
   * Defaults to `'fixed'` when `width` is set, `'auto'` otherwise.
   */
  widthMode?: 'auto' | 'fixed';
  /** Selects the renderer/editor pair for cells in this column. */
  cellType?: CellType;
  /** Whether the column participates in sorting. */
  sortable?: boolean;
  /** Whether the column participates in filtering. */
  filterable?: boolean;
  /** Whether cells in this column are editable. */
  editable?: boolean;
  /** Whether the column is visible. */
  visible?: boolean;
  /** Freezes the column to the left or right edge of the viewport. */
  frozen?: 'left' | 'right';
  /** Whether the column width can be changed by the user via drag. */
  resizable?: boolean;
  /** Whether the column can be repositioned via drag-and-drop. */
  reorderable?: boolean;

  // Cell type specific options

  /** Selectable options for `status`, `chipSelect`, and `list` cell types. */
  options?: StatusOption[];
  /** Default cell value applied when a new row is created. */
  defaultValue?: unknown;
  /** Allows multiple selections in `chipSelect` columns. */
  multiSelect?: boolean;
  /** Autocomplete suggestions for `tags` or text-autocomplete columns. */
  suggestions?: string[];
  /** Permits free-text entry in `tags` columns alongside suggestions. */
  allowFreeText?: boolean;
  /** Placeholder text shown in empty cells. */
  placeholder?: string;
  /** Display format string for `calendar` and `currency` columns. */
  format?: string;
  /** Minimum allowed numeric value for `numeric` columns. */
  min?: number;
  /** Maximum allowed numeric value for `numeric` columns. */
  max?: number;

  /** Cell-level validators run on every commit. Results render in a portal tooltip. */
  validators?: Validator<TData>[];

  /**
   * Optional hover-tooltip content surfaced after a short delay on mouseover.
   *
   * - A string value is rendered verbatim for every cell in the column.
   * - A function value is called with the row object on each hover and must
   *   return the string to display; use this form for per-row computed notes
   *   (e.g. "Resident of {city}"). The default content (the cell's rendered
   *   text) is replaced entirely when `note` is provided.
   *
   * See `HoverTooltip` for the dismiss/delay/portal contract.
   */
  note?: string | ((row: TData) => string);

  /**
   * How this column's cells render text when the value is wider than the cell.
   *
   * Defaults to `getDefaultOverflowPolicy(field)` at runtime when omitted —
   * `truncate-middle` for path-/identifier-like fields, `clamp-2` for
   * description-like fields, `truncate-end` otherwise. Truncated and clamped
   * cells expose the full raw value via the existing hover tooltip + edit
   * mode, so omitting this is safe for adoption — but explicit declarations
   * are recommended for a predictable, scannable grid.
   */
  overflow?: OverflowPolicy;

  // Sub-grid

  /** Column definitions for a nested sub-grid rendered inside expanded rows. */
  subGridColumns?: ColumnDef[];
  /** The row-key field used to identify rows inside the sub-grid. */
  subGridRowKey?: string;

  // Upload (issue #91) — the grid is the agnostic surface; consumers wire
  // `onAttach` to their attachment backend (e.g. iasbuilt/webapp #155) and
  // the cell value becomes a reference to the persisted attachment.

  /**
   * Backend-wiring callback invoked when the user picks or drops a file in
   * an `upload` cell. Receives the raw {@link File}, an
   * {@link UploadAttachContext} identifying the target cell, and an optional
   * progress reporter. Must resolve to an {@link AttachmentRef}; rejecting
   * surfaces an error in the cell and leaves the prior value intact so the
   * user can retry.
   *
   * The grid is deliberately agnostic about *where* attachments live — that
   * concern is owned by the consumer's attachment service (storage, dedupe,
   * scoped inheritance, ACL all happen on the consumer side).
   */
  onAttach?: UploadAttachHandler<TData>;
  /**
   * For `upload` columns: when `true`, the cell stores a list of
   * {@link AttachmentRef}s rather than a single ref. Defaults to `false`.
   */
  multiple?: boolean;
  /**
   * For `upload` columns: an optional list of accepted MIME types and/or
   * extensions (`['image/png', '.pdf']`). Forwarded to the file picker via
   * the `accept` attribute and used to reject mis-typed drops early.
   */
  accept?: string[];
  /**
   * For `upload` columns: optional per-file byte size cap. Drops/picks
   * exceeding this size are rejected before {@link onAttach} is called.
   */
  maxSize?: number;
  /**
   * For `upload` columns: free-form scope hint forwarded to the consumer's
   * attachment service. The grid never inspects this value — it is passed
   * through to {@link onAttach} via {@link UploadAttachContext.column}, where
   * the handler can read it to honour scoped inheritance / ACL rules.
   */
  scope?: string;
  /**
   * For `upload` columns: optional download/preview handler invoked when the
   * user clicks the file link in display mode. Receives the persisted
   * {@link AttachmentRef} (or the raw string value for unwired columns).
   */
  onDownload?: (ref: AttachmentRef | string) => void;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Severity levels for validation feedback displayed on a cell.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * The outcome of a single validation check.
 */
export interface ValidationResult {
  /** Human-readable explanation of the validation issue. */
  message: string;
  /** Severity tier that controls visual treatment. */
  severity: ValidationSeverity;
}

/**
 * An enriched validation result pinned to a specific cell, optionally
 * tagged with a rule identifier and originating source for traceability.
 */
export interface ValidationError extends ValidationResult {
  /** The cell that failed validation. */
  cell: CellAddress;
  /** Optional unique rule identifier (useful for programmatic dismissal). */
  ruleId?: string;
  /** Optional label identifying the subsystem that produced the error. */
  source?: string;
}

// ---------------------------------------------------------------------------
// Row types (for row-driven pivot mode)
// ---------------------------------------------------------------------------

/**
 * Maps a row index to a specific cell type and optional metadata in
 * row-driven pivot mode, where each row may represent a different data shape.
 */
export interface RowTypeDef {
  /** Zero-based row index this definition applies to. */
  index: number;
  /** The cell renderer/editor type for the row. */
  cellType: CellType;
  /** Optional display label for the row. */
  label?: string;
  /** Selectable options when `cellType` supports them. */
  options?: StatusOption[];
}

// ---------------------------------------------------------------------------
// Pivot mode
// ---------------------------------------------------------------------------

/**
 * Controls whether the grid treats columns or rows as the primary data axis.
 *
 * - `'column'` — standard column-oriented layout.
 * - `'row'`    — transposed, row-oriented layout where each row carries its
 *   own cell type via {@link RowTypeDef}.
 */
export type PivotMode = 'column' | 'row';

// ---------------------------------------------------------------------------
// Toolbar / bar configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the grid's toolbar strip.
 */
export interface ToolbarConfig {
  /** Ordered list of toolbar item identifiers to render. */
  items?: string[];
}

/**
 * Configuration for the formula/input bar displayed above the grid body.
 */
export interface FormulaBarConfig {
  /** Whether the bar expands to support multi-line editing. */
  multiline?: boolean;
  /** Maximum pixel height when in multi-line mode. */
  maxHeight?: number;
}

/**
 * Master toggle and detailed configuration for the grid's chrome bars
 * (toolbar, formula bar, filter bar).
 *
 * Pass `true` to enable a bar with defaults, `false` to hide it, or an
 * options object for fine-grained control.
 */
export interface BarsConfig {
  /** Toolbar visibility or detailed configuration. */
  toolbar?: boolean | ToolbarConfig;
  /** Formula bar visibility or detailed configuration. */
  formulaBar?: boolean | FormulaBarConfig;
  /** Whether the quick-filter bar is visible. */
  filterBar?: boolean;
}

// ---------------------------------------------------------------------------
// Sorting config
// ---------------------------------------------------------------------------

/**
 * Runtime settings governing sort behaviour.
 */
export interface SortConfig {
  /** `'single'` restricts sorting to one column; `'multi'` allows stacking. */
  mode?: 'single' | 'multi';
  /** Whether string comparisons are case-sensitive. */
  caseSensitive?: boolean;
  /** When `true`, `null` / `undefined` values sort to the end. */
  nullsLast?: boolean;
}

// ---------------------------------------------------------------------------
// Filter config
// ---------------------------------------------------------------------------

/**
 * Runtime settings governing filter behaviour.
 */
export interface FilterConfig {
  /** Debounce delay (in milliseconds) before applying filter changes. */
  debounceMs?: number;
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

/**
 * Defines a single item (or sub-menu) within the grid's context menu.
 *
 * @remarks
 * `disabled` and `visible` accept either a static boolean or a callback that
 * receives the click context, enabling dynamic control based on the target
 * cell's row/column.
 */
export interface ContextMenuItemDef {
  /** Unique key identifying this menu item. */
  key: string;
  /** Display label. */
  label: string;
  /** Optional icon identifier rendered to the left of the label. */
  icon?: string;
  /** Keyboard shortcut hint displayed to the right of the label. */
  shortcut?: string;
  /** Renders the item in a destructive/danger style when `true`. */
  danger?: boolean;
  /** Whether the item is disabled (static or context-dependent). */
  disabled?: boolean | ((ctx: { rowId: string | null; field: string | null }) => boolean);
  /** Whether the item is visible (static or context-dependent). */
  visible?: boolean | ((ctx: { rowId: string | null; field: string | null }) => boolean);
  /** Renders a divider line below this item. */
  dividerAfter?: boolean;
  /** Sort order among sibling items (lower numbers appear first). */
  order?: number;
  /**
   * Handler invoked when the user activates the menu item.
   *
   * @param ctx - The row and column targeted by the right-click.
   */
  onClick: (ctx: { rowId: string | null; field: string | null; }) => void;
  /** Nested child items forming a sub-menu. */
  children?: ContextMenuItemDef[];
}

/**
 * Configuration object for the grid's context menu.
 */
export interface ContextMenuConfig {
  /** Menu item definitions to render when the context menu opens. */
  items?: ContextMenuItemDef[];
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Configuration for row-level grouping (collapsible group headers).
 */
export interface RowGroupConfig {
  /** Ordered list of field names to group by (first field is outermost). */
  fields: string[];
  /** Whether groups start in an expanded state. */
  defaultExpanded?: boolean;
  /** Aggregate functions to compute per group, keyed by field name. */
  aggregates?: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'>;
}

/**
 * Configuration for column-level grouping (visual super-headers).
 */
export interface ColumnGroupConfig {
  /** Definitions for each column group. */
  groups: { id: string; title: string; columns: string[] }[];
  /** Whether column groups can be collapsed. */
  collapsible?: boolean;
}

/**
 * Top-level grouping configuration combining row and column grouping.
 *
 * Pass `true` to enable with defaults, `false` to disable, or a detailed
 * config object.
 */
export interface GroupingConfig {
  /** Row grouping toggle or detailed configuration. */
  rows?: boolean | RowGroupConfig;
  /** Column grouping toggle or detailed configuration. */
  columns?: boolean | ColumnGroupConfig;
}

// ---------------------------------------------------------------------------
// Sub-grid config
// ---------------------------------------------------------------------------

/**
 * Options controlling nested sub-grid expansion within rows.
 */
export interface SubGridConfig {
  /** Maximum nesting depth for recursive sub-grids. */
  maxDepth?: number;
  /** When `true`, sub-grid data is fetched on demand rather than up-front. */
  lazyLoad?: boolean;
  /** Current nesting level when rendering nested sub-grids. */
  nestingLevel?: number;
  /** Whether this grid instance is itself a sub-grid. */
  isSubGrid?: boolean;
  /** When `true`, only one sub-grid row can be expanded at a time. */
  singleExpand?: boolean;
}

/**
 * Configuration for a detail row rendered inside an expanded sub-grid area.
 */
export interface DetailRowConfig {
  /** Unique identifier for this detail row configuration. */
  id: string;
  /** Display label for the detail row. */
  label: string;
  /** Optional icon identifier rendered alongside the label. */
  icon?: string;
  /** Optional data field this detail row is associated with. */
  field?: string;
}

// ---------------------------------------------------------------------------
// File drop
// ---------------------------------------------------------------------------

/**
 * Per-column overrides for file-drop behaviour.
 */
export interface FileDropColumnConfig {
  /** Accepted MIME types or extensions (e.g. `['.csv', 'image/*']`). */
  accept?: string[];
  /** Maximum individual file size in bytes. */
  maxFileSize?: number;
  /** Whether dropping a file automatically creates a new row. */
  createRow?: boolean;
}

/**
 * Comprehensive file-drop configuration for the grid.
 *
 * Enables drag-and-drop file uploads at the grid, column, or cell level,
 * with per-target overrides, progress callbacks, and completion handlers.
 */
export interface FileDropConfig {
  /** Master toggle — must be `true` to enable any file-drop behaviour. */
  enabled: boolean;
  /** Accepted MIME types or extensions at the grid level. */
  accept?: string[];
  /** Maximum individual file size in bytes at the grid level. */
  maxFileSize?: number;
  /** Maximum number of files allowed in a single drop. */
  maxFiles?: number;
  /** Per-column overrides keyed by column field name. */
  columnDrop?: Record<string, FileDropColumnConfig>;
  /** Options for cell-level drops (e.g. targeting a sub-grid field). */
  cellDrop?: { subGridField?: string; };
  /**
   * Callback invoked when files are dropped onto a target.
   *
   * @param files - The dropped {@link File} objects.
   * @param target - Identifies where the files were dropped.
   */
  onFileDrop?: (files: File[], target: DropTarget) => void;
  /**
   * Callback reporting upload progress for a specific file.
   *
   * @param fileId - Unique identifier of the file being uploaded.
   * @param progress - Completion ratio from `0` to `1`.
   */
  onUploadProgress?: (fileId: string, progress: number) => void;
  /**
   * Callback fired when an upload finishes.
   *
   * @param fileId - Unique identifier of the uploaded file.
   * @param result - Backend response payload.
   */
  onUploadComplete?: (fileId: string, result: unknown) => void;
}

/**
 * Describes the location where a file was dropped within the grid.
 */
export interface DropTarget {
  /** The granularity of the drop target. */
  type: 'grid' | 'column' | 'cell';
  /** Column field name (present when `type` is `'column'` or `'cell'`). */
  field?: string;
  /** Row identifier (present when `type` is `'cell'`). */
  rowId?: string;
}

// ---------------------------------------------------------------------------
// Ghost row
// ---------------------------------------------------------------------------

/**
 * Positions where the ghost (new-row placeholder) row can appear.
 */
export type GhostRowPosition = 'top' | 'bottom' | 'above-header';

/**
 * Configuration for the ghost row — a placeholder row that lets users create
 * new records inline.
 *
 * @typeParam TData - The shape of a data row.
 */
export interface GhostRowConfig<TData = Record<string, unknown>> {
  /** Where the ghost row is rendered relative to the data rows. */
  position?: GhostRowPosition;
  /** Whether the ghost row stays visible when scrolling. */
  sticky?: boolean;
  /** Placeholder text shown in empty ghost-row cells. */
  placeholder?: string;
  /** Initial field values pre-populated in the ghost row. */
  defaultValues?: Partial<TData>;
  /**
   * Validates the ghost row before it is committed as a real row.
   *
   * @param values - The partially filled row values.
   * @returns An error message string, or `null` if valid.
   */
  validate?: (values: Partial<TData>) => string | null;
}

// ---------------------------------------------------------------------------
// Grid state
// ---------------------------------------------------------------------------

/**
 * Complete runtime state snapshot of the grid.
 *
 * Maintained internally by the grid model and exposed (read-only) to
 * extensions via {@link ExtensionContext.gridState}. Captures data, columns,
 * active sort/filter/selection, editing state, pagination, undo history,
 * grouping, and visual layout details.
 *
 * @typeParam TData - The shape of a data row.
 */
export interface GridState<TData = Record<string, unknown>> {
  /** The current data rows. */
  data: TData[];
  /** Active column definitions. */
  columns: ColumnDef<TData>[];
  /** Current sort configuration. */
  sort: SortState;
  /** Current filter predicate, or `null` if no filter is active. */
  filter: FilterState | null;
  /** Currently selected cell range, or `null` if nothing is selected. */
  selection: CellRange | null;
  /** The cell currently being edited, or `null`. */
  editingCell: CellAddress | null;
  /** Zero-based current page index. */
  page: number;
  /** Number of rows per page. */
  pageSize: number;
  /** Row IDs whose detail/expand area is open. */
  expandedRows: Set<string>;
  /** Row IDs whose nested sub-grid is expanded. */
  expandedSubGrids: Set<string>;
  /** Ordered list of column field names controlling render order. */
  columnOrder: string[];
  /** Per-column pixel widths keyed by field name. */
  columnWidths: Record<string, number>;
  /** Column field names that are currently hidden. */
  hiddenColumns: Set<string>;
  /** Column field names that are frozen (pinned). */
  frozenColumns: string[];
  /** Active grouping state, or `null` if grouping is inactive. */
  groupState: GroupState | null;
  /** Stack of executed commands available for undo. */
  undoStack: Command[];
  /** Stack of undone commands available for redo. */
  redoStack: Command[];
}

// ---------------------------------------------------------------------------
// Command for undo/redo
// ---------------------------------------------------------------------------

/**
 * Encapsulates a reversible operation for the undo/redo system.
 *
 * Each command knows how to apply and revert itself, enabling deterministic
 * history traversal without external state snapshots.
 */
export interface Command {
  /** Descriptive label for the operation kind (e.g. `"setCellValue"`). */
  type: string;
  /** Reverts the operation, restoring prior state. */
  undo: () => void;
  /** Re-applies the operation after an undo. */
  redo: () => void;
  /** Millisecond timestamp recording when the command was executed. */
  timestamp: number;
  /** Optional human-readable summary shown in undo/redo UI. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Grouping state
// ---------------------------------------------------------------------------

/**
 * Runtime grouping state maintained alongside the grid data.
 */
export interface GroupState {
  /** Flat or hierarchical list of row groups produced by the grouping engine. */
  rowGroups: RowGroup[];
  /** Set of group keys that are currently expanded. */
  expandedGroups: Set<string>;
}

/**
 * Represents a single group of rows sharing a common field value.
 *
 * Groups may nest recursively via {@link subGroups} when multi-field grouping
 * is active.
 */
export interface RowGroup {
  /** A unique string key identifying this group (typically `field:value`). */
  key: string;
  /** The field name this group was derived from. */
  field: string;
  /** The shared value among all rows in the group. */
  value: unknown;
  /** Ordered list of row IDs belonging to the group. */
  rows: string[];
  /** Total number of rows (including nested sub-groups). */
  count: number;
  /** Computed aggregate values keyed by field name. */
  aggregates?: Record<string, number>;
  /** Child groups when multi-level grouping is applied. */
  subGroups?: RowGroup[];
}

// ---------------------------------------------------------------------------
// Chrome columns (controls + row numbers)
// ---------------------------------------------------------------------------

/**
 * Configuration for the optional chrome columns that flank the data columns.
 *
 * Chrome columns are non-data presentation columns rendered outside the
 * user's schema: a controls column (pinned on the far left) and a row-number
 * gutter (side is configurable via {@link RowNumberColumnConfig.position}).
 * Each slot accepts either a boolean (quick enable/disable with defaults) or
 * a configuration object for fine-grained control.
 *
 * The three `getRow…` / `getChromeCellContent` resolvers are row-level
 * presentation hooks that let consumers style individual rows and inject
 * content into the row-number ("chrome") gutter without needing a custom
 * cell renderer. They are the public extension points that downstream
 * features (row-click selection, Shift+Arrow range highlight, transposed
 * field column) build on.
 *
 * @typeParam TData - The shape of a data row.
 */
export interface ChromeColumnsConfig<TData = Record<string, unknown>> {
  /** Far-left action column (e.g. magnifying glass, expand). */
  controls?: ControlsColumnConfig | boolean;
  /** Excel-style row number column with selection and reorder. Positioned via `RowNumberColumnConfig.position` (default: 'left'). */
  rowNumbers?: RowNumberColumnConfig | boolean;
  /**
   * Per-row border resolver. Called once per rendered row.
   *
   * Two calling conventions are supported — pick whichever is more
   * ergonomic for the consumer; the grid honours both:
   *
   *   * **Positional** (backward-compatible):
   *     `(row, rowId, rowIndex) => RowBorderStyle | null | undefined`
   *   * **Named-object** (self-documenting, extensible):
   *     `({ row, rowId, rowIndex, column? }) => RowBorderStyle | null | undefined`
   *
   * The grid dispatches between the two forms by inspecting the declared
   * arity (`fn.length`) — a one-argument resolver receives the named-object
   * context, a three-argument resolver receives the positional args. See
   * {@link ChromeRowResolver} for the full type and
   * {@link ChromeRowResolverContext} for the context shape.
   *
   * The returned border is applied to the row container itself (all four
   * sides by default; see {@link RowBorderStyle.sides}). It composes with
   * chrome column styles — the chrome gutter's own left/right borders are
   * preserved.
   */
  getRowBorder?: ChromeRowResolver<TData, RowBorderStyle | null | undefined>;
  /**
   * Per-row background colour resolver. Called once per rendered row; the
   * returned string is applied as the row container's `background` CSS
   * property and therefore wins over the default zebra striping. Any
   * CSS-legal colour value is accepted (HEX is preferred for determinism,
   * but `rgba(…)` / named colours also work). Return `null`/`undefined` to
   * fall back to the default row background token.
   *
   * Accepts either calling convention — see {@link ChromeRowResolver}.
   */
  getRowBackground?: ChromeRowResolver<TData, string | null | undefined>;
  /**
   * Per-row chrome-cell content resolver. When provided and the row-number
   * chrome column is enabled, the returned {@link ChromeCellContent} replaces
   * the default row-number digit with custom text and/or an icon. The
   * resolver's `onClick` is invoked in addition to (not in place of) the
   * built-in row-selection click handler — this is the hook that downstream
   * features such as row-click selection (#15) and the transpose field
   * column (#18) build on.
   *
   * Returning `null`/`undefined` preserves the default row-number rendering
   * for that row.
   *
   * Accepts either calling convention — see {@link ChromeRowResolver}.
   */
  getChromeCellContent?: ChromeRowResolver<TData, ChromeCellContent | null | undefined>;
}

/**
 * Context object passed to the named-object form of a {@link ChromeRowResolver}.
 *
 * Consumers that prefer a self-documenting call shape (and access to the
 * optional `column` reference the row belongs to) opt in by declaring their
 * resolver with a single object parameter, e.g.
 *
 *     chrome: {
 *       getRowBackground: ({ row, rowIndex }) =>
 *         rowIndex % 2 === 0 ? '#fafafa' : null,
 *     }
 *
 * The grid's body renderer inspects the resolver's declared arity
 * (`fn.length === 1`) to dispatch between the positional and named-object
 * forms.
 *
 * `column` is populated only for cell-level invocations (not currently a
 * public surface but reserved for the future per-cell chrome hooks).
 * Row-level callers may leave it `undefined`.
 *
 * @typeParam TData - The shape of a data row.
 */
export interface ChromeRowResolverContext<TData = Record<string, unknown>> {
  /** The row data at this index. */
  row: TData;
  /** The row's stable id (as derived from {@link GridConfig.rowKey}). */
  rowId: string;
  /** Zero-based row index within the current (processed) data array. */
  rowIndex: number;
  /**
   * Optional column reference. Populated when the resolver is invoked at
   * the cell level; left `undefined` for row-level invocations such as
   * {@link ChromeColumnsConfig.getRowBorder} and
   * {@link ChromeColumnsConfig.getRowBackground}.
   */
  column?: ColumnDef<TData>;
}

/**
 * Row-level chrome resolver with two backward-compatible calling conventions.
 *
 * The original signature was positional — `(row, rowId, rowIndex) => TResult`
 * — and remains the grid's wire-format. A consumer who prefers the
 * self-documenting named-object form may instead declare their resolver as
 * `(ctx: ChromeRowResolverContext<TData>) => TResult`; the grid's body
 * renderer detects the form at call time via `fn.length === 1` (the
 * resolver's declared arity) and dispatches accordingly.
 *
 * Untyped / spread-argument callers (`(...args) => …`, whose `.length`
 * is `0`) fall back to the positional form so no historical consumer
 * regresses. This is the documented trade-off of arity-based dispatch.
 *
 * @typeParam TData    - The shape of a data row.
 * @typeParam TResult  - The resolver's return type (e.g.
 *                       `string | null | undefined` for a background
 *                       colour resolver).
 */
export type ChromeRowResolver<TData, TResult> =
  | ((row: TData, rowId: string, rowIndex: number) => TResult)
  | ((ctx: ChromeRowResolverContext<TData>) => TResult);

/**
 * Per-row border style returned by {@link ChromeColumnsConfig.getRowBorder}.
 *
 * Every field is optional; unset fields fall back to sensible defaults:
 * `color` → `currentColor`, `style` → `'solid'`, `width` → `1`,
 * `sides` → all four sides.
 */
export interface RowBorderStyle {
  /** Border colour (any CSS-legal value; HEX preferred). Default: inherits. */
  color?: string;
  /** Border line style. Default: `'solid'`. */
  style?: 'solid' | 'dashed' | 'dotted';
  /** Border width in pixels. Default: `1`. */
  width?: number;
  /**
   * Which edges of the row the border is applied to. Default: all four.
   * The bottom edge overrides the default row separator; omit it to keep
   * the stock separator behaviour.
   */
  sides?: Array<'top' | 'right' | 'bottom' | 'left'>;
}

/**
 * Content returned from {@link ChromeColumnsConfig.getChromeCellContent} to
 * override the default row-number rendering inside the row-number chrome
 * gutter.
 *
 * When provided, `text` and/or `icon` replace the digit; `onClick` is fired
 * on click in addition to the row-selection handler, allowing downstream
 * features (e.g. row-click selection) to opt into richer click semantics
 * without shadowing the selection behaviour.
 */
export interface ChromeCellContent {
  /** Text to display inside the chrome cell (wins over the default digit). */
  text?: string;
  /** Optional icon node (rendered before the text). */
  icon?: unknown;
  /**
   * Optional click handler. Receives the native `MouseEvent` alongside the
   * row id and row index. Called in addition to the built-in row-selection
   * click — call `evt.stopPropagation()` on the event to prevent the
   * selection handler from firing.
   */
  onClick?: (evt: MouseEvent, rowId: string, rowIndex: number) => void;
}

/**
 * Configuration for the controls column rendered at the far left of the grid.
 */
export interface ControlsColumnConfig {
  /** Width in pixels. Default: 40. */
  width?: number;
  /** Width sizing mode. 'auto' expands to fit actions, 'fixed' clips overflow. Default: 'fixed'. */
  widthMode?: 'auto' | 'fixed';
  /** Action definitions rendered in each row's controls cell. */
  actions: ControlAction[];
}

/**
 * A single action button rendered inside the controls column.
 */
export interface ControlAction {
  /** Unique key for this action (used as React key). */
  key: string;
  /** Accessible label for the action button. */
  label: string;
  /** Custom render function for the action button content. */
  render?: (rowId: string, rowIndex: number) => unknown;
  /** Click handler invoked when the action button is pressed. */
  onClick?: (rowId: string, rowIndex: number) => void;
}

/**
 * Configuration for the Excel-style row-number column.
 *
 * The column renders a gutter of row numbers used for whole-row selection,
 * drag-to-reorder handles, and as a visual anchor during scrolling. It can be
 * anchored on either side of the data cells via
 * {@link RowNumberColumnConfig.position}; the default `'left'` matches the
 * Excel 365 convention and keeps the gutter sticky during horizontal scrolls.
 *
 * The cell background is themed via the `--dg-row-number-bg` CSS token
 * (default `#f3f2f1`, matching the Excel 365 gutter colour).
 */
export interface RowNumberColumnConfig {
  /** Width in pixels. Default: 50. */
  width?: number;
  /** Width sizing mode. Default: 'fixed'. */
  widthMode?: 'auto' | 'fixed';
  /** Whether rows can be reordered by dragging the row number cell. Default: true. */
  reorderable?: boolean;
  /**
   * Which side of the data cells the gutter renders on. Default: `'left'`
   * (Excel 365 convention). When `'left'`, the cell is also sticky-left
   * so horizontal scrolling keeps the gutter pinned; when `'right'`, the
   * gutter floats after the last data column and scrolls with it.
   */
  position?: 'left' | 'right';
}

// ---------------------------------------------------------------------------
// Grid configuration (full)
// ---------------------------------------------------------------------------

/**
 * The top-level configuration object consumers provide to instantiate a grid.
 *
 * Combines data, column definitions, feature toggles, and behavioural
 * overrides into a single declarative specification. Boolean-or-object
 * patterns (e.g. `sorting?: boolean | SortConfig`) allow quick toggling with
 * defaults while still permitting fine-grained control.
 *
 * @typeParam TData - The shape of a data row.
 *
 * @example
 * ```ts
 * const config: GridConfig<MyRow> = {
 *   data: rows,
 *   columns: columnDefs,
 *   rowKey: 'id',
 *   sorting: { mode: 'multi', nullsLast: true },
 *   selectionMode: 'range',
 * };
 * ```
 */
export interface GridConfig<TData = Record<string, unknown>> {
  /** The initial data set to display. */
  data: TData[];
  /** Column definitions describing each visible (or hidden) column. */
  columns: ColumnDef<TData>[];
  /**
   * Resolves a unique string key for each row.
   * Accepts either a property name of `TData` or a custom resolver function.
   */
  rowKey: keyof TData | ((row: TData) => string);
  /** Layout orientation — standard column mode or transposed row mode. */
  pivotMode?: PivotMode;
  /** Per-row cell type overrides used in `'row'` pivot mode. */
  rowTypes?: RowTypeDef[];
  /** Toolbar, formula bar, and filter bar configuration. */
  bars?: BarsConfig;
  /** Optional chrome columns: controls (far left) and row numbers (far right). */
  chrome?: ChromeColumnsConfig<TData>;
  /** Enable or configure column sorting. */
  sorting?: boolean | SortConfig;
  /** Enable or configure column filtering. */
  filtering?: boolean | FilterConfig;
  /** Enable or configure the right-click context menu. */
  contextMenu?: boolean | ContextMenuConfig;
  /** Enable or configure row/column grouping. */
  grouping?: GroupingConfig;
  /** Options for nested sub-grids. */
  subGrid?: SubGridConfig;
  /** File drag-and-drop upload configuration. */
  fileDrop?: FileDropConfig;
  /** Enable or configure the ghost (new-row placeholder) row. */
  ghostRow?: boolean | GhostRowConfig<TData>;
  /** Selection granularity. */
  selectionMode?: SelectionMode;
  /** When `true`, disables all editing interactions globally. */
  readOnly?: boolean;
  /** Number of rows per page (pagination). */
  pageSize?: number;
  /** Whether arrow-key / tab navigation is active. */
  keyboardNavigation?: boolean;
  /**
   * Controls how Shift + Arrow key combinations are interpreted.
   *
   * - `'scroll'` (default) — Shift + Arrow scrolls the viewport by roughly
   *   half a screen in the arrow's direction; the current selection is left
   *   untouched. Up / Down scroll vertically; Left / Right scroll horizontally.
   * - `'rangeSelect'` — Shift + Arrow extends the current rectangular range
   *   selection by one cell in the arrow's direction while preserving the
   *   anchor, so every intermediate cell becomes part of the range.
   *
   * Plain Arrow and Ctrl / Cmd + Arrow are never affected by this flag.
   */
  shiftArrowBehavior?: 'scroll' | 'rangeSelect';
  /** Visual theme — a preset name or a custom token map. */
  theme?: 'light' | 'dark' | Record<string, string>;
  /**
   * Optional causl `Graph` instance the grid should register its state on.
   * When supplied, other SPA modules can compose derived nodes over grid
   * state with atomic, glitch-free updates inside the same commit boundary.
   * When omitted, the grid constructs a private graph.
   *
   * Typed as `unknown` here to avoid a hard type-level dependency on
   * `@causl/core` in `GridConfig` consumers that don't use this field.
   * `createGridModel` narrows internally.
   */
  graph?: unknown;
  /**
   * Namespace prefix used for grid-owned node ids on the graph. Defaults
   * to `'grid'`. Use distinct namespaces when multiple grids share one
   * graph to avoid id collisions.
   */
  graphNamespace?: string;
  /**
   * Optional `StorageAdapter` from `@causl/persistence` used to persist
   * user-preference state (column widths, order, visibility, frozen).
   * When omitted, preferences live in-memory only.
   *
   * Typed as `unknown` here to keep `@causl/persistence` an optional
   * dependency at the type level for consumers that don't persist prefs.
   * `createGridModel` narrows internally.
   */
  storage?: unknown;
  /**
   * Storage key prefix for persisted UI prefs. Defaults to
   * `'xldatagrid:<graphNamespace>'`. Distinguish multiple grids on the
   * same `StorageAdapter` instance.
   */
  persistenceKey?: string;
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all event names the grid's {@link EventBus} can
 * dispatch.
 *
 * Events are namespaced by subsystem (`cell:`, `row:`, `column:`,
 * `clipboard:`, `contextMenu:`, `grid:`) to avoid collisions and
 * simplify subscription filtering.
 */
export type GridEventTypeBase =
  | 'cell:valueChange' | 'cell:selectionChange' | 'cell:click' | 'cell:doubleClick' | 'cell:validation'
  | 'row:insert' | 'row:delete' | 'row:move'
  | 'column:resize' | 'column:sort' | 'column:filter' | 'column:reorder' | 'column:visibility'
  | 'clipboard:copy' | 'clipboard:paste'
  | 'contextMenu:open'
  | 'subGrid:expand' | 'subGrid:collapse'
  | 'grid:mount' | 'grid:unmount' | 'grid:dataChange' | 'grid:stateChange';

export type GridEventType = GridEventTypeBase | `before:${GridEventTypeBase}`;

/**
 * Lifecycle phases available for hook registration.
 *
 * - `'before'` — runs before the core handler; can cancel the event.
 * - `'on'`     — the primary handler phase (skipped if cancelled).
 * - `'after'`  — runs unconditionally after the event, even if cancelled.
 */
export type HookPhase = 'before' | 'on' | 'after';

/**
 * Payload envelope dispatched through the {@link EventBus}.
 *
 * Carries the event type, a high-resolution timestamp, an extensible
 * payload record, and cancellation affordances for `before`-phase hooks.
 *
 * @typeParam T - Narrows the event type for strongly typed subscriptions.
 */
export interface GridEvent<T extends GridEventType = GridEventType> {
  /** The event identifier. */
  type: T;
  /** High-resolution timestamp (via `performance.now()`) of dispatch. */
  timestamp: number;
  /** Optional label identifying the subsystem that emitted the event. */
  source?: string;
  /** Whether a `before`-phase hook has cancelled this event. */
  cancelled?: boolean;
  /** Invoke to cancel the event (prevents `on`-phase handlers). */
  cancel?: () => void;
  /** Arbitrary event data, specific to each {@link GridEventType}. */
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Plugin / Extension types
// ---------------------------------------------------------------------------

/**
 * Declarative definition of a grid extension (plugin).
 *
 * Extensions integrate with the grid via lifecycle hooks (`init` / `destroy`)
 * and by registering event hooks that run during the `before`, `on`, or
 * `after` phases of grid events.
 */
export interface ExtensionDefinition {
  /** Globally unique extension identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Semantic version string (informational). */
  version?: string;
  /** IDs of extensions that must be loaded before this one. */
  dependencies?: string[];
  /**
   * Called once when the extension is activated.
   *
   * @param ctx - Provides access to grid state, commands, and event hooks.
   */
  init?: (ctx: ExtensionContext) => void | Promise<void>;
  /**
   * Called once when the extension is deactivated or the grid unmounts.
   *
   * @param ctx - The same context passed to {@link init}.
   */
  destroy?: (ctx: ExtensionContext) => void | Promise<void>;
  /**
   * Returns an array of hook registrations the extension wants to install.
   *
   * @param ctx - Extension context for state/command access.
   * @returns Hook registrations to bind.
   */
  hooks?: (ctx: ExtensionContext) => HookRegistration[];
}

/**
 * Binds a handler to a specific grid event and lifecycle phase.
 */
export interface HookRegistration {
  /** The event to listen for. */
  event: GridEventType;
  /** Lifecycle phase — defaults to `'on'` when omitted. */
  phase?: HookPhase;
  /** Numeric priority within the phase (lower runs first; default `500`). */
  priority?: number;
  /**
   * The event handler.
   *
   * @param event - The dispatched grid event.
   * @returns Return `false` from a `before`-phase handler to cancel the event.
   *          May be async.
   */
  handler: (event: GridEvent) => void | false | Promise<void | false>;
}

/**
 * Runtime context exposed to extensions, providing read access to grid state
 * and write access via commands and event hooks.
 */
export interface ExtensionContext {
  /** Read-only snapshot of the current grid state. */
  gridState: Readonly<GridState>;
  /** Imperative command interface for mutating the grid. */
  commands: GridCommands;
  /**
   * Dispatches an event through the event bus.
   *
   * @param type - The event type to emit.
   * @param payload - Arbitrary payload data.
   */
  emit: (type: GridEventType, payload: Record<string, unknown>) => Promise<void>;
  /**
   * Registers an event hook and returns a disposal function.
   *
   * @param reg - The hook registration descriptor.
   * @returns A function that removes the hook when called.
   */
  addHook: (reg: HookRegistration) => () => void;
  /**
   * Subscribes to state-change notifications.
   *
   * @param listener - Callback invoked after every state mutation.
   * @returns A function that unsubscribes the listener when called.
   */
  subscribe: (listener: () => void) => () => void;
  /**
   * Returns the latest read-only grid state snapshot.
   *
   * @returns The current {@link GridState}.
   */
  getState: () => Readonly<GridState>;
}

/**
 * Imperative command API for programmatically mutating grid state.
 *
 * All mutation commands are routed through the event bus so that extensions
 * can intercept, validate, or augment operations via lifecycle hooks.
 */
export interface GridCommands {
  /**
   * Sets the value of a specific cell.
   *
   * @param cell - Target cell address.
   * @param value - The new cell value.
   */
  setCellValue: (cell: CellAddress, value: unknown) => Promise<void>;
  /**
   * Enters edit mode for the specified cell.
   *
   * @param cell - The cell to begin editing.
   */
  beginEdit: (cell: CellAddress) => Promise<void>;
  /** Commits the current in-progress cell edit. */
  commitEdit: () => Promise<void>;
  /** Discards the current in-progress cell edit. */
  cancelEdit: () => Promise<void>;
  /**
   * Inserts a new row at the given index.
   *
   * @param index - Zero-based insertion position.
   * @param data - Optional initial row data.
   */
  insertRow: (index: number, data?: Record<string, unknown>) => Promise<void>;
  /**
   * Deletes one or more rows by their IDs.
   *
   * @param rowIds - Array of row identifiers to remove.
   */
  deleteRows: (rowIds: string[]) => Promise<void>;
  /**
   * Replaces the current selection.
   *
   * @param range - The new selection range, or `null` to clear.
   */
  setSelection: (range: CellRange | null) => void;
  /**
   * Scrolls the viewport so that the specified cell is visible.
   *
   * @param cell - The target cell address.
   */
  scrollToCell: (cell: CellAddress) => void;
  /**
   * Marks specific cells as needing a re-render.
   *
   * @param cells - Cells to invalidate.
   */
  invalidateCells: (cells: CellAddress[]) => void;
  /** Marks every cell as needing a re-render. */
  invalidateAll: () => void;
  /**
   * Applies a new sort configuration.
   *
   * @param state - The desired sort state.
   */
  sort: (state: SortState) => void;
  /**
   * Applies a new filter configuration.
   *
   * @param state - The desired filter state, or `null` to clear.
   */
  filter: (state: FilterState | null) => void;
  /**
   * Resizes a column to the specified pixel width.
   *
   * @param field - Column field name.
   * @param width - New width in pixels.
   */
  setColumnWidth: (field: string, width: number) => void;
  /**
   * Moves a column to a new position in the column order.
   *
   * @param field - Column field name.
   * @param toIndex - Target zero-based index.
   */
  reorderColumn: (field: string, toIndex: number) => void;
  /**
   * Toggles a column between visible and hidden states.
   *
   * @param field - Column field name.
   */
  toggleColumnVisibility: (field: string) => void;
  /**
   * Freezes (pins) or unfreezes a column.
   *
   * @param field - Column field name.
   * @param frozen - `'left'` or `'right'` to pin, `null` to unpin.
   */
  freezeColumn: (field: string, frozen: 'left' | 'right' | null) => void;
  /** Reverts the most recent undoable command. */
  undo: () => void;
  /** Re-applies the most recently undone command. */
  redo: () => void;
}

// ---------------------------------------------------------------------------
// Listener type for the subscribe pattern
// ---------------------------------------------------------------------------

/**
 * A no-argument callback used by the subscribe/notify pattern.
 *
 * Registered via {@link EventBus.subscribe} or
 * {@link ExtensionContext.subscribe} to receive notifications after every
 * dispatched event.
 */
export type GridListener = () => void;

// ---------------------------------------------------------------------------
// Row key resolver helper type
// ---------------------------------------------------------------------------

/**
 * A function that extracts a unique string key from a data row.
 *
 * Used internally to convert the `rowKey` configuration (which may be a
 * property name) into a callable resolver.
 *
 * @typeParam TData - The shape of a data row.
 * @param row - The data row to extract a key from.
 * @returns A unique string identifier for the row.
 */
export type RowKeyResolver<TData> = (row: TData) => string;

// ---------------------------------------------------------------------------
// Transposed (form-mode) grid
// ---------------------------------------------------------------------------

/**
 * Describes a single field in a transposed (form-mode) grid.
 *
 * In transposed mode each field becomes a row, and each entity becomes a
 * column. The first column displays the field label; subsequent columns
 * render editable inputs whose type is determined by {@link cellType}.
 */
export interface TransposedField {
  /** Unique field identifier. */
  id: string;
  /** Display label shown in the frozen first column. */
  label: string;
  /** Cell type for the editable input. */
  cellType: CellType;
  /** Options for status / chipSelect / list cell types. */
  options?: StatusOption[];
  /** Placeholder text. */
  placeholder?: string;
  /** Default value for new entities. */
  defaultValue?: unknown;
  /** Whether this field is required. */
  required?: boolean;
  /** For password confirmation: the id of the field this should match. */
  confirmField?: string;
  /** Field-level validation. */
  validate?: (value: CellValue) => ValidationResult | null;
}

/**
 * Configuration for creating a transposed grid.
 *
 * Consumed by {@link createTransposedConfig} to produce a standard
 * {@link GridConfig} that renders in row-pivot mode.
 */
export interface TransposedGridConfig {
  /** Field definitions (become rows). */
  fields: TransposedField[];
  /** Entity column keys. */
  entityKeys: string[];
  /** Label for the field name column. */
  fieldColumnLabel?: string;
  /** Width of the field label column in pixels. */
  fieldColumnWidth?: number;
  /** Width of each entity column in pixels. */
  entityColumnWidth?: number;
  /**
   * When `true`, the field labels are rendered inside the row-number chrome
   * gutter via `chrome.getChromeCellContent` instead of an ordinary data
   * column. This removes the frozen `__field_label` data column entirely —
   * the chrome column becomes the authoritative "key" column, matching the
   * extension point added for issue #14.
   *
   * Defaults to `false` for backward compatibility.
   */
  useChromeFieldColumn?: boolean;
}
