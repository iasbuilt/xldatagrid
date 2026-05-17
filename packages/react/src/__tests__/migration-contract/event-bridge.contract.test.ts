/**
 * Contract: state-mutation → EventBus dispatch.
 *
 * The current implementation wires each Jotai base atom to a corresponding
 * GridEventType through `event-bridge.ts`. Post-migration, the equivalent is
 * `graph.subscribeCommits` reading commit intent + changedNodes. The
 * EXTERNAL OBSERVABLE behavior must remain identical: when a consumer calls
 * `model.X()`, certain event types must fire on `model.dispatch`'s underlying
 * event bus.
 *
 * We assert via `eventBus.addHook`-equivalent: extensions installed before a
 * mutation MUST observe the named event.
 */
import { describe, it, expect } from 'vitest';
import { createGridModel } from '@iasbuilt/datagrid-core';
import type {
  GridConfig,
  GridEventType,
  ExtensionDefinition,
} from '@iasbuilt/datagrid-core';

type Row = { id: string; name: string; age: number };

function makeConfig(): GridConfig<Row> {
  return {
    columns: [
      { id: 'name', field: 'name', title: 'Name', width: 160 },
      { id: 'age', field: 'age', title: 'Age', width: 80 },
    ],
    data: [
      { id: '1', name: 'Alice', age: 30 },
      { id: '2', name: 'Bob', age: 25 },
    ],
    rowKey: 'id',
  };
}

/**
 * Install a recording extension and return the list of event types it has
 * observed. The extension records every `on`-phase hook fire it receives,
 * across every event type listed in `watch`.
 */
async function recordEvents(
  model: ReturnType<typeof createGridModel<Row>>['model'],
  watch: GridEventType[],
): Promise<{ stop: () => Promise<void>; events: GridEventType[] }> {
  const events: GridEventType[] = [];
  const ext: ExtensionDefinition = {
    id: 'test-recorder',
    name: 'test-recorder',
    hooks: () =>
      watch.map((event) => ({
        event,
        phase: 'on' as const,
        handler: () => {
          events.push(event);
        },
      })),
  };
  await model.registerExtension(ext);
  return {
    events,
    stop: () => model.unregisterExtension(ext.id),
  };
}

describe('event-bridge — dispatch contract', () => {
  it('sort() dispatches column:sort', async () => {
    const model = createGridModel(makeConfig());
    const recorder = await recordEvents(model, ['column:sort']);
    model.sort([{ field: 'age', dir: 'asc' }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(recorder.events).toContain('column:sort');
    await recorder.stop();
    await model.destroy();
  });

  it('filter() dispatches column:filter', async () => {
    const model = createGridModel(makeConfig());
    const recorder = await recordEvents(model, ['column:filter']);
    model.filter({
      logic: 'and',
      filters: [{ field: 'age', operator: 'gt', value: 26 }],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(recorder.events).toContain('column:filter');
    await recorder.stop();
    await model.destroy();
  });

  it('select() dispatches cell:selectionChange', async () => {
    const model = createGridModel(makeConfig());
    const recorder = await recordEvents(model, ['cell:selectionChange']);
    model.select({ rowId: '1', field: 'name' });
    await new Promise((r) => setTimeout(r, 0));
    expect(recorder.events).toContain('cell:selectionChange');
    await recorder.stop();
    await model.destroy();
  });

  it('insertRow() dispatches grid:dataChange', async () => {
    const model = createGridModel(makeConfig());
    const recorder = await recordEvents(model, ['grid:dataChange']);
    await model.insertRow(0, { id: '99', name: 'Z', age: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(recorder.events).toContain('grid:dataChange');
    await recorder.stop();
    await model.destroy();
  });

  it('deleteRows() dispatches grid:dataChange', async () => {
    const model = createGridModel(makeConfig());
    const recorder = await recordEvents(model, ['grid:dataChange']);
    await model.deleteRows(['2']);
    await new Promise((r) => setTimeout(r, 0));
    expect(recorder.events).toContain('grid:dataChange');
    await recorder.stop();
    await model.destroy();
  });

  it('setColumnWidth() dispatches column:resize', async () => {
    const model = createGridModel(makeConfig());
    const recorder = await recordEvents(model, ['column:resize']);
    model.setColumnWidth('name', 240);
    await new Promise((r) => setTimeout(r, 0));
    expect(recorder.events).toContain('column:resize');
    await recorder.stop();
    await model.destroy();
  });

  it('beginEdit() dispatches grid:stateChange (editing changed)', async () => {
    const model = createGridModel(makeConfig());
    const recorder = await recordEvents(model, ['grid:stateChange']);
    model.beginEdit({ rowId: '1', field: 'name' });
    await new Promise((r) => setTimeout(r, 0));
    expect(recorder.events).toContain('grid:stateChange');
    await recorder.stop();
    await model.destroy();
  });

  it('after destroy(), further mutations must not fire events for unregistered extensions', async () => {
    const model = createGridModel(makeConfig());
    const recorder = await recordEvents(model, ['column:sort']);
    await model.destroy();
    model.sort([{ field: 'age', dir: 'asc' }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(recorder.events).toHaveLength(0);
  });
});
