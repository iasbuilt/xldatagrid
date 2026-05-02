/**
 * Property-based tests for `stripField`.
 *
 * Uses fast-check to generate arbitrary CompositeFilterDescriptor trees (depth
 * up to 8, width up to 5) and verifies the invariants that must hold after
 * stripping a field from the tree.
 */
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { stripField } from '@iasbuilt/datagrid-core';
import type {
  FilterDescriptor,
  CompositeFilterDescriptor,
  FilterOperator,
} from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const FIELD_NAMES = ['name', 'age', 'city', 'status', 'score', 'active'];
const OPERATORS: FilterOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'contains'];

/** Generate a leaf FilterDescriptor targeting one of the known fields. */
const leafArb: fc.Arbitrary<FilterDescriptor> = fc.record({
  field: fc.constantFrom(...FIELD_NAMES),
  operator: fc.constantFrom(...OPERATORS),
  value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
});

/** Recursive composite generator with bounded depth and width. */
function compositeArb(maxDepth: number): fc.Arbitrary<CompositeFilterDescriptor> {
  if (maxDepth === 0) {
    // At depth 0, produce a composite wrapping 1–5 leaves
    return fc.record({
      logic: fc.constantFrom('and' as const, 'or' as const),
      filters: fc.array(leafArb, { minLength: 1, maxLength: 5 }),
    });
  }
  return fc.record({
    logic: fc.constantFrom('and' as const, 'or' as const),
    filters: fc.array(
      fc.oneof(
        { weight: 3, arbitrary: leafArb },
        { weight: 1, arbitrary: compositeArb(maxDepth - 1) },
      ),
      { minLength: 1, maxLength: 5 },
    ),
  });
}

/** The full arbitrary used in tests: depth up to 8. */
const filterTreeArb = compositeArb(7);

// ---------------------------------------------------------------------------
// Helper: collect all field names present in a filter tree
// ---------------------------------------------------------------------------

function collectFields(
  node: FilterDescriptor | CompositeFilterDescriptor,
): Set<string> {
  const fields = new Set<string>();
  function walk(n: FilterDescriptor | CompositeFilterDescriptor): void {
    if ('filters' in n) {
      n.filters.forEach(walk);
    } else {
      fields.add(n.field);
    }
  }
  walk(node);
  return fields;
}

// ---------------------------------------------------------------------------
// Helper: validate that a node is a well-formed filter tree
// ---------------------------------------------------------------------------

function isValidTree(
  node: FilterDescriptor | CompositeFilterDescriptor,
): boolean {
  if ('filters' in node) {
    if (!node.logic || !Array.isArray(node.filters)) return false;
    if (node.filters.length === 0) return false; // empty composite is invalid
    return node.filters.every(isValidTree);
  }
  return typeof node.field === 'string' && node.field.length > 0;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('stripField — property-based', () => {
  it('result never contains a leaf whose .field equals the stripped field', () => {
    fc.assert(
      fc.property(
        filterTreeArb,
        fc.constantFrom(...FIELD_NAMES),
        (tree, field) => {
          const result = stripField(tree, field);
          if (result === null) return true; // null is always valid
          const remainingFields = collectFields(result);
          return !remainingFields.has(field);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('result is either null or a valid (non-empty) filter tree', () => {
    fc.assert(
      fc.property(
        filterTreeArb,
        fc.constantFrom(...FIELD_NAMES),
        (tree, field) => {
          const result = stripField(tree, field);
          if (result === null) return true;
          return isValidTree(result);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('stripping a field not present in the tree returns the tree unchanged', () => {
    const ABSENT_FIELD = '__definitely_not_a_field__';
    fc.assert(
      fc.property(filterTreeArb, (tree) => {
        // The generated tree never uses ABSENT_FIELD
        const result = stripField(tree, ABSENT_FIELD);
        // Should return the same structure (deep equal) — not null
        expect(result).not.toBeNull();
        expect(result).toEqual(tree);
      }),
      { numRuns: 200 },
    );
  });

  it('stripping the only field in a single-leaf composite returns null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FIELD_NAMES),
        fc.constantFrom(...OPERATORS),
        fc.oneof(fc.string(), fc.integer()),
        (field, operator, value) => {
          const tree: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field, operator, value }],
          };
          const result = stripField(tree, field);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('stripping preserves all non-matching fields', () => {
    fc.assert(
      fc.property(
        filterTreeArb,
        fc.constantFrom(...FIELD_NAMES),
        (tree, strippedField) => {
          const before = collectFields(tree);
          const result = stripField(tree, strippedField);
          if (result === null) return true;
          const after = collectFields(result);
          // Every field in `after` must have been present before stripping
          for (const f of after) {
            if (!before.has(f)) return false;
          }
          // Every field present before (except strippedField) must still be there
          // IF the tree was not entirely composed of strippedField references.
          for (const f of before) {
            if (f === strippedField) continue;
            if (!after.has(f)) return false;
          }
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });
});
