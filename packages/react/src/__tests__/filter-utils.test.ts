/**
 * Unit tests for the `stripField` filter-tree utility.
 *
 * Covers the hardening contract added in WS-E:
 *   A. Depth guard — pathological trees (200+ nested composites, circular
 *      references) throw a clear `RangeError` instead of blowing the stack.
 *   B. Empty-composite cascade pruning — branches whose children all resolve
 *      to the stripped field collapse to `null` so the parent also drops them.
 *   C. Whole-subtree match — a composite that only targets the field returns
 *      `null` outright.
 */
import { describe, it, expect } from 'vitest';
import type { FilterDescriptor, CompositeFilterDescriptor } from '@iasbuilt/datagrid-core';
import { stripField, MAX_FILTER_DEPTH } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const leaf = (field: string, value: unknown = 'v'): FilterDescriptor => ({
  field,
  operator: 'eq',
  value,
});

const and = (
  ...filters: (FilterDescriptor | CompositeFilterDescriptor)[]
): CompositeFilterDescriptor => ({ logic: 'and', filters });

const or = (
  ...filters: (FilterDescriptor | CompositeFilterDescriptor)[]
): CompositeFilterDescriptor => ({ logic: 'or', filters });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stripField', () => {
  describe('basic leaf pruning', () => {
    it('returns null when the root composite contains only the stripped field', () => {
      const tree = and(leaf('x'));
      expect(stripField(tree, 'x')).toBeNull();
    });

    it('returns the tree unchanged when stripping a field not present', () => {
      const tree = and(leaf('y'));
      const result = stripField(tree, 'x');
      expect(result).toEqual(tree);
    });

    it('removes a leaf matching the field and keeps siblings', () => {
      const tree = and(leaf('x'), leaf('y'));
      const result = stripField(tree, 'x') as CompositeFilterDescriptor;
      expect(result).not.toBeNull();
      expect(result.filters).toHaveLength(1);
      expect((result.filters[0] as FilterDescriptor).field).toBe('y');
    });
  });

  describe('empty-composite cascade pruning (Test B)', () => {
    it('prunes an empty and-branch left behind inside an or-composite', () => {
      // Input:  { or: [ { and: [x:1] }, { and: [y:2] } ] }   strip 'x'
      // Expect: { or: [ { and: [y:2] } ] }  — empty AND pruned
      const tree: CompositeFilterDescriptor = {
        logic: 'or',
        filters: [
          { logic: 'and', filters: [{ field: 'x', operator: 'eq', value: 1 }] },
          { logic: 'and', filters: [{ field: 'y', operator: 'eq', value: 2 }] },
        ],
      };
      const result = stripField(tree, 'x');
      expect(result).toEqual({
        logic: 'or',
        filters: [
          { logic: 'and', filters: [{ field: 'y', operator: 'eq', value: 2 }] },
        ],
      });
    });

    it('returns null when stripping collapses the entire tree', () => {
      const tree = or(and(leaf('x')), and(leaf('x')));
      expect(stripField(tree, 'x')).toBeNull();
    });

    it('prunes nested empty composites recursively', () => {
      // { or: [ { and: [ { or: [x] } ] }, { and: [y] } ] }  strip x
      // → { or: [ { and: [y] } ] }
      const tree = or(and(or(leaf('x'))), and(leaf('y')));
      const result = stripField(tree, 'x') as CompositeFilterDescriptor;
      expect(result).not.toBeNull();
      expect(result.filters).toHaveLength(1);
    });
  });

  describe('whole-subtree match (Test C)', () => {
    it('returns null for a composite whose only leaf matches the field', () => {
      const tree: CompositeFilterDescriptor = {
        logic: 'and',
        filters: [{ field: 'x', operator: 'eq', value: 1 }],
      };
      expect(stripField(tree, 'x')).toBeNull();
    });

    it('returns null when a nested composite only targets the field', () => {
      const tree = and(or(leaf('x'), leaf('x')));
      expect(stripField(tree, 'x')).toBeNull();
    });
  });

  describe('depth guard (Test A)', () => {
    it('handles a depth-200 linear nested tree without stack overflow', () => {
      // Build 200 nested composites: { and: [{ and: [{ and: [...] }] }] }
      let node: CompositeFilterDescriptor = and(leaf('y'));
      for (let i = 0; i < 200; i++) {
        node = and(node);
      }
      // Must not stack-overflow. Expected locked-in behaviour: throws a
      // clear `RangeError` mentioning the cap. (Returning the tree
      // unchanged would also satisfy the "no overflow" contract, but this
      // test suite locks in the throwing variant.)
      expect(() => stripField(node, 'nonexistent')).toThrow(RangeError);
      expect(() => stripField(node, 'nonexistent')).toThrow(/MAX_FILTER_DEPTH/);
    });

    it('throws RangeError once depth exceeds MAX_FILTER_DEPTH', () => {
      let node: CompositeFilterDescriptor = and(leaf('y'));
      for (let i = 0; i <= MAX_FILTER_DEPTH; i++) {
        node = and(node);
      }
      expect(() => stripField(node, 'x')).toThrow(RangeError);
    });

    it('terminates on a circular reference instead of infinite-looping (Test D)', () => {
      // Self-referential composite: a.filters = [a]
      const circular: CompositeFilterDescriptor = { logic: 'and', filters: [] };
      circular.filters = [circular];
      expect(() => stripField(circular, 'x')).toThrow(RangeError);
    });
  });
});
