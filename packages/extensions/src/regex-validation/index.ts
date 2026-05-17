/**
 * Regex-based cell validation extension for the datagrid. Validates cell values
 * against configurable regular-expression rules on a per-column basis, collecting
 * validation errors and optionally rejecting edits that fail with `error` severity.
 *
 * @packageDocumentation
 */
import { ExtensionDefinition, CellAddress, ValidationResult, ValidationSeverity, GridEvent } from '@iasbuilt/datagrid-core';

/**
 * A single regex-based validation rule applied to cell values within a column.
 */
export interface RegexRule {
  /** Unique identifier for this rule. */
  id: string;

  /** The regular expression pattern string (without delimiters). */
  pattern: string;

  /**
   * Optional regex flags (e.g., `'i'` for case-insensitive matching).
   *
   * @defaultValue `''`
   */
  flags?: string;

  /**
   * The error message shown when validation fails. Supports `{value}`, `{field}`,
   * and `{pattern}` placeholders that are interpolated at runtime.
   */
  message: string;

  /** The severity level assigned to failures of this rule. */
  severity: ValidationSeverity;

  /**
   * When `true`, the rule passes if the pattern does **not** match — effectively
   * a "must not match" constraint.
   */
  invert?: boolean;

  /**
   * When `true` (the default behaviour when omitted), empty values are allowed
   * to pass without testing the regex. Set to `false` to require non-empty values.
   */
  allowEmpty?: boolean;
}

/**
 * Configuration options for the {@link createRegexValidation} extension factory.
 */
export interface RegexValidationConfig {
  /**
   * A mapping from column field names to the ordered list of {@link RegexRule | rules}
   * applied to values in that column.
   */
  columns: Record<string, RegexRule[]>;

  /**
   * Controls whether a cell edit is rejected (cancelled) when any rule with
   * `severity: 'error'` fails.
   *
   * @defaultValue `true` (edits are rejected on error)
   */
  rejectOnError?: boolean;
}

/**
 * Creates an {@link ExtensionDefinition} that validates cell edits against
 * per-column regular-expression rules. The extension hooks into the
 * `cell:valueChange` event at the `before` phase, evaluates all rules for the
 * target column, and accumulates {@link ValidationResult | validation results}.
 *
 * When `rejectOnError` is enabled (the default), any rule failure at `error`
 * severity causes the edit event to be cancelled, preventing the invalid value
 * from being committed. Errors are stored in an internal map keyed by
 * `"rowId:field"` for later retrieval.
 *
 * @param config - Configuration specifying per-column rules and rejection behaviour.
 * @returns An extension definition ready to register with the datagrid.
 *
 * @example
 * ```ts
 * const validation = createRegexValidation({
 *   columns: {
 *     email: [{
 *       id: 'email-format',
 *       pattern: '^[^@]+@[^@]+\\.[^@]+$',
 *       message: '"{value}" is not a valid email address',
 *       severity: 'error',
 *     }],
 *   },
 * });
 * grid.registerExtension(validation);
 * ```
 */
export function createRegexValidation(config: RegexValidationConfig): ExtensionDefinition {
  // Internal error store keyed by "rowId:field" composite strings
  const errors = new Map<string, ValidationResult[]>();

  return {
    id: 'regex-validation',
    name: 'Regex Validation',
    version: '0.1.0',
    hooks(_ctx) {
      return [{
        event: 'cell:valueChange',
        phase: 'before',
        priority: 100,
        handler(event: GridEvent) {
          const { cell, newValue } = event.payload as { cell: CellAddress; newValue: unknown };

          // Only validate columns that have rules configured
          const rules = config.columns[cell.field];
          if (!rules) return;

          // Coerce the incoming value to a string for regex testing
          const value = newValue != null ? String(newValue) : '';
          const cellErrors: ValidationResult[] = [];

          // Evaluate each rule in declaration order
          for (const rule of rules) {
            // Skip regex test for empty values when allowEmpty is not explicitly disabled
            if (rule.allowEmpty !== false && !value) continue;

            // Compile the regex from the pattern and optional flags
            const regex = new RegExp(rule.pattern, rule.flags ?? '');
            const matches = regex.test(value);

            // Determine validity, accounting for inverted rules
            const isValid = rule.invert ? !matches : matches;
            if (!isValid) {
              // Interpolate placeholder tokens in the error message
              cellErrors.push({
                message: rule.message
                  .replace('{value}', value)
                  .replace('{field}', cell.field)
                  .replace('{pattern}', rule.pattern),
                severity: rule.severity,
              });
            }
          }

          // Update the internal error map for this cell
          const key = `${cell.rowId}:${cell.field}`;
          if (cellErrors.length > 0) {
            errors.set(key, cellErrors);
            // Cancel the edit if any error-severity rule failed and rejection is enabled
            if (config.rejectOnError !== false && cellErrors.some(e => e.severity === 'error')) {
              event.cancel?.();
              return false;
            }
          } else {
            // Clear stale errors when the new value passes all rules
            errors.delete(key);
          }
        },
      }];
    },
  };
}

/**
 * Retrieves the current map of all validation errors across the grid.
 *
 * @remarks
 * This is a placeholder implementation. In a fully integrated build, the function
 * would access the extension's internal error state through the grid context.
 *
 * @returns A `Map` keyed by `"rowId:field"` strings, with arrays of
 *   {@link ValidationResult} as values. Currently returns an empty map.
 */
export function getValidationErrors(): Map<string, ValidationResult[]> {
  // This would be accessed via extension state in real impl
  return new Map();
}
