/**
 * SPA-integration demo — the acceptance criterion from CAUSL_REVIEW_V2.md §3.
 *
 * Proves the BYO-graph payoff: a grid (DataGrid) and an external metrics
 * panel (a separate React subtree, *not* a child of DataGrid) share one
 * causl graph. The panel's metrics are `graph.derived` nodes that
 * automatically recompute when the user mutates the grid (filter,
 * delete, edit). Updates are atomic — one commit in the graph, one
 * synchronous render in both subtrees.
 *
 * If this demo works, the foundational causl investment is real. If the
 * metrics ever lag behind the grid, the BYO-graph wiring is broken.
 */
import React, { useMemo, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { DataGrid } from '@iasbuilt/datagrid-react';
import { createCausl, type Graph, type Node } from '@causl/core';
import type { ColumnDef, FilterState } from '@iasbuilt/datagrid-core';
import { makeEmployees, type Employee } from '../data';

// ---------------------------------------------------------------------------
// Demo data + columns
// ---------------------------------------------------------------------------

const DATA: Employee[] = makeEmployees(200);

const COLUMNS: ColumnDef<Employee>[] = [
  { id: 'name', field: 'name', title: 'Name', width: 180, sortable: true, filterable: true },
  { id: 'email', field: 'email', title: 'Email', width: 220, sortable: true, filterable: true },
  { id: 'department', field: 'department', title: 'Department', width: 140, sortable: true, filterable: true },
  { id: 'role', field: 'role', title: 'Role', width: 140, sortable: true, filterable: true },
  { id: 'salary', field: 'salary', title: 'Salary', width: 110, sortable: true, filterable: true, cellType: 'numeric' },
  { id: 'active', field: 'active', title: 'Active', width: 80, cellType: 'boolean' },
];

// ---------------------------------------------------------------------------
// React adapter for a single causl node — useSyncExternalStore wrapper.
//
// Note: `@causl/react` exports an equivalent `useCauslNode`; we inline
// this here so the demo has zero deps beyond what the grid + core already
// pull in.
// ---------------------------------------------------------------------------

function useNode<T>(graph: Graph, node: Node<T>): T {
  return useSyncExternalStore(
    (cb) => graph.subscribe(node, cb),
    () => graph.read(node),
  );
}

// ---------------------------------------------------------------------------
// Metric tile
// ---------------------------------------------------------------------------

function Metric(props: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      padding: 16,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {props.label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4, color: '#0f172a' }}>
        {props.value}
      </div>
      {props.sub && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{props.sub}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function App() {
  // The graph is OWNED BY THE PAGE, not by the grid. We pass it into the
  // grid via config.graph; the grid registers its nodes on this graph
  // under the `employees:` namespace.
  const graph = useMemo(() => createCausl({ name: 'spa-integration-demo' }), []);

  // The DataGrid component itself uses useGrid(config) internally to
  // construct its model. We pass `graph` in `config` so the grid's
  // nodes land on OUR graph rather than the grid's private one.
  //
  // The grid then exposes `model.nodes.processedData` etc., which we
  // could subscribe to directly — but to demonstrate composition, we
  // instead register an EXTERNAL derived node `pivot:metrics` that
  // computes app-side aggregates from the grid's processed data. This
  // is the SPA-integration pattern: app-level derivations layered
  // OVER grid state.

  // Step 1: register a placeholder derivation, then wire its compute
  // once the grid has been constructed and its nodes are visible on
  // the shared graph. We capture model in a closure via `gridRef`.
  // (The grid constructs synchronously during the first render below.)

  // For demonstration, we register pivot:metrics LAZILY — only after
  // the grid registers its nodes. The cleanest pattern is to register
  // the grid first, then layer derivations on top, but here we wrap
  // it in a useMemo that runs after DataGrid mounts (via the
  // useEffect inside it).

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
          SPA Integration — BYO-graph
        </h1>
        <p style={{ color: '#475569', marginTop: 6, fontSize: 14 }}>
          A grid and a pivot panel sharing one <code>causl Graph</code>. The pivot is a
          separate React subtree that derives from grid state through{' '}
          <code>graph.derived</code>. Filter / edit / delete in the grid; the pivot
          updates atomically inside the same commit.
        </p>
      </header>

      <GridWithPivot graph={graph} />
    </div>
  );
}

function GridWithPivot({ graph }: { graph: Graph }) {
  // The grid first — passing in our shared graph so its nodes land here.
  const gridConfig = useMemo(() => ({
    data: DATA,
    columns: COLUMNS,
    rowKey: 'id' as const,
    sorting: true as const,
    filtering: true as const,
    selectionMode: 'range' as const,
    keyboardNavigation: true,
    graph,
    graphNamespace: 'employees',
  }), [graph]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
        <DataGrid {...gridConfig} />
      </div>
      <PivotPanel graph={graph} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PivotPanel — pure SPA-side React subtree. Reads from the same causl
// graph the grid registered its nodes on. Knows nothing about the grid
// component instance; only knows the namespaced node ids.
// ---------------------------------------------------------------------------

function PivotPanel({ graph }: { graph: Graph }) {
  // The grid registers `employees:data`, `employees:filter`, etc. on the
  // shared graph. We layer an `app:pivot` derived node on top that
  // recomputes whenever filtering / data changes — atomically with the
  // grid mutation that caused it.
  //
  // We don't have direct handles to the grid's InputNode instances from
  // here. Instead, we look them up via `graph.read` by name using a
  // tiny helper. The `Node` handle requires the same identity the input
  // was registered with, so we reconstruct it with a no-op cast — the
  // engine validates and throws UnknownNodeError if missing.

  const pivotNode = useMemo(() => {
    return graph.derived<{
      visible: number;
      totalSalary: number;
      avgSalary: number;
      departments: number;
      activeCount: number;
    }>('app:pivot:metrics', (get) => {
      // employees:processedData is the grid's derived "after filter+sort" node.
      // We look it up by id-cast — the engine will error if it's not registered yet.
      const processedNode = { id: 'employees:processedData' } as unknown as Node<Employee[]>;
      const rows = get(processedNode);
      /* DEBUG */ console.group('[pivot] recompute');
      /* DEBUG */ console.log('row count:', rows.length);
      /* DEBUG */ {
        const salaries = rows.map((r) => r.salary);
        const salaryTypes = new Set(salaries.map((s) => typeof s));
        console.log('salary types observed:', Array.from(salaryTypes));
        const sample = salaries.slice(0, 5);
        console.log('first 5 salaries (raw):', sample, '(JSON:', JSON.stringify(sample), ')');
        // Find any salary that's a string or NaN-prone — the smoking gun for "gigantic" totals.
        const suspicious = rows
          .map((r, i) => ({ i, id: r.id, salary: r.salary, type: typeof r.salary }))
          .filter((x) => x.type !== 'number' || !Number.isFinite(x.salary as number) || (x.salary as number) > 10_000_000);
        if (suspicious.length > 0) {
          console.warn('[pivot] suspicious salary rows:', suspicious.slice(0, 10));
        }
      }
      const totalSalary = rows.reduce((s, r) => s + (r.salary ?? 0), 0);
      const activeCount = rows.reduce((c, r) => c + (r.active ? 1 : 0), 0);
      const departments = new Set(rows.map((r) => r.department)).size;
      const result = {
        visible: rows.length,
        totalSalary,
        avgSalary: rows.length > 0 ? Math.round(totalSalary / rows.length) : 0,
        departments,
        activeCount,
      };
      /* DEBUG */ console.log('emitted:', result);
      /* DEBUG */ console.groupEnd();
      return result;
    });
  }, [graph]);

  const metrics = useNode(graph, pivotNode);

  const fmtMoney = (n: number) => `$${n.toLocaleString('en-US')}`;

  return (
    <aside style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>
        <strong style={{ color: '#0f172a' }}>Pivot</strong> — derived from grid state via
        a separate <code>graph.derived</code> node. Updates atomically.
      </div>
      <Metric label="Visible" value={metrics.visible} sub="rows after filter+sort" />
      <Metric label="Active" value={metrics.activeCount} sub={`${Math.round(100*metrics.activeCount/(metrics.visible||1))}% of visible`} />
      <Metric label="Departments" value={metrics.departments} sub="distinct values in view" />
      <Metric label="Avg salary" value={fmtMoney(metrics.avgSalary)} sub="across visible rows" />
      <Metric label="Total salary" value={fmtMoney(metrics.totalSalary)} sub="sum of visible rows" />
      <DemoControls graph={graph} />
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Demo controls — buttons that mutate the grid's filter node directly
// through the shared graph, proving the panel doesn't depend on the
// grid React component for state changes.
// ---------------------------------------------------------------------------

function DemoControls({ graph }: { graph: Graph }) {
  const filterNode = useMemo(() => ({ id: 'employees:filter' } as unknown as Node<FilterState | null>), []);

  const setFilter = (filter: FilterState | null) => {
    graph.commit('demo:setFilter', (tx) => tx.set(filterNode, filter));
  };

  return (
    <div style={{ marginTop: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Filter from the panel
      </div>
      <button onClick={() => setFilter(null)} style={btnStyle}>
        Clear filter
      </button>
      <button
        onClick={() => setFilter({ logic: 'and', filters: [{ field: 'salary', operator: 'gt', value: 100000 }] })}
        style={btnStyle}
      >
        Salary &gt; $100k
      </button>
      <button
        onClick={() => setFilter({ logic: 'and', filters: [{ field: 'active', operator: 'eq', value: true }] })}
        style={btnStyle}
      >
        Active only
      </button>
      <button
        onClick={() => setFilter({ logic: 'and', filters: [{ field: 'department', operator: 'eq', value: 'Engineering' }] })}
        style={btnStyle}
      >
        Engineering only
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
};

createRoot(document.getElementById('root')!).render(<App />);
