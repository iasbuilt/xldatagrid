/**
 * Phase 2 contract: BYO-graph integration with @causl/core.
 *
 * Pins the SPA-integration capability that the migration was undertaken for.
 * If these tests fail, the architectural investment is hollow — consumers
 * cannot compose grid state into the rest of their SPA's causl graph.
 *
 * Tests in this file should pass against the post-migration core, where
 * `createGridModel` accepts an optional `graph` (BYO) parameter. They are
 * Phase 2 deliverables, not Phase 1 contract tests — they intentionally
 * reach into `@causl/core` because they are validating the integration
 * surface itself.
 */
import { describe, it, expect } from 'vitest';
import { createCausl, type Graph, type Commit } from '@causl/core';
import { createGridModel } from '../grid-model';
import type { GridConfig } from '../types';

type Row = { id: string; name: string; age: number };

function makeConfig(overrides: Partial<GridConfig<Row>> = {}): GridConfig<Row> {
  return {
    columns: [
      { id: 'name', field: 'name', title: 'Name', width: 160 },
      { id: 'age', field: 'age', title: 'Age', width: 80 },
    ],
    data: [
      { id: '1', name: 'Alice', age: 30 },
      { id: '2', name: 'Bob', age: 25 },
      { id: '3', name: 'Carol', age: 40 },
    ],
    rowKey: 'id',
    ...overrides,
  };
}

describe('createGridModel — BYO-graph contract', () => {
  it('accepts a consumer-supplied causl Graph and registers its nodes on it', () => {
    const graph = createCausl({ name: 'host-app' });
    const model = createGridModel({ ...makeConfig(), graph });
    // The grid exposes its graph so consumers can compose with it.
    expect(model.graph).toBe(graph);
  });

  it('constructs a private graph when none is supplied', () => {
    const model = createGridModel(makeConfig());
    expect(model.graph).toBeDefined();
    // Calling read() on a grid node should work without external setup.
    expect(model.getState().data).toHaveLength(3);
  });

  it('namespaces grid-owned node ids with a configurable prefix', () => {
    const graph = createCausl({ name: 'host-app' });
    createGridModel({ ...makeConfig(), graph, graphNamespace: 'employees' });
    // The presence of namespaced nodes is observable via the engine.
    // We don't assert exact IDs — just that the namespace is used.
    const snapshot = graph.exportModel();
    const namespacedIds = snapshot.nodes.filter(
      (n) => n.kind === 'input' && n.id.startsWith('employees:'),
    );
    expect(namespacedIds.length).toBeGreaterThan(0);
  });

  it('allows external derivations to compose over grid nodes atomically', async () => {
    const graph = createCausl({ name: 'host-app' });
    const model = createGridModel({ ...makeConfig(), graph, graphNamespace: 'grid' });

    // External consumer registers a derived node that aggregates over the grid.
    // This is the entire point of foundational causl: a chart/pivot/URL-state
    // node in another part of the SPA can derive from grid state and update
    // atomically with grid mutations.
    const avgAge = graph.derived('app:avgAge', (get) => {
      const data = get(model.nodes.data) as Row[];
      if (data.length === 0) return 0;
      return data.reduce((s, r) => s + r.age, 0) / data.length;
    });

    expect(graph.read(avgAge)).toBeCloseTo((30 + 25 + 40) / 3);

    // Mutation through the grid updates the external derivation in one commit.
    await model.deleteRows(['1']);
    expect(graph.read(avgAge)).toBeCloseTo((25 + 40) / 2);
  });

  it('one grid mutation produces exactly one commit (atomicity)', () => {
    const graph = createCausl({ name: 'host-app' });
    const model = createGridModel({ ...makeConfig(), graph });
    const commits: Commit[] = [];
    graph.subscribeCommits((c) => {
      commits.push(c);
    });

    model.select({ rowId: '1', field: 'name' });
    expect(commits.length).toBe(1);

    model.sort([{ field: 'age', dir: 'asc' }]);
    expect(commits.length).toBe(2);
  });

  it('commit intent labels identify the mutation that produced them', () => {
    const graph = createCausl({ name: 'host-app' });
    const model = createGridModel({ ...makeConfig(), graph });
    const intents: string[] = [];
    graph.subscribeCommits((c) => {
      intents.push(c.intent);
    });

    model.select({ rowId: '1', field: 'name' });
    model.sort([{ field: 'age', dir: 'asc' }]);
    model.setColumnWidth('name', 240);

    // Intent labels are stable and meaningful — used by devtools / replay.
    // We don't pin exact strings (implementation-defined) but they must be
    // distinguishable per mutation type.
    expect(new Set(intents).size).toBe(3);
  });

  it('two independent grids on the same graph have non-colliding node ids', () => {
    const graph = createCausl({ name: 'host-app' });
    const a = createGridModel({ ...makeConfig(), graph, graphNamespace: 'gridA' });
    const b = createGridModel({ ...makeConfig(), graph, graphNamespace: 'gridB' });

    a.select({ rowId: '1', field: 'name' });
    expect(a.getState().selection.range).not.toBeNull();
    expect(b.getState().selection.range).toBeNull();
  });

  it('exposes model.graph and model.nodes for consumers that want fine-grained access', () => {
    const model = createGridModel(makeConfig());
    expect(model.graph).toBeDefined();
    expect(model.nodes).toBeDefined();
    expect(model.nodes.data).toBeDefined();
    expect(model.nodes.selection).toBeDefined();
    expect(model.nodes.sort).toBeDefined();
    // Reading a node returns the same value as the corresponding getState() field.
    expect(model.graph.read(model.nodes.data)).toEqual(model.getState().data);
  });
});
