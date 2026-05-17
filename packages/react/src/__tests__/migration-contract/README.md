# Migration contract tests

These specs pin the **observable public behavior** of the React package so a
state-library migration (Jotai → causl) can be done with confidence. Tests in
this directory:

1. Do not import `jotai` or `@causl/*` directly.
2. Assert only on the public surface exposed from `@iasbuilt/datagrid-react`
   (`useGrid`, `GridContext`) and on the `GridModel` interface from
   `@iasbuilt/datagrid-core`. (The historical `useGridWithAtoms` and
   `createAtomicGridModel` exports were removed in the post-`v0.1.0` major.)
3. Cover the behaviors that have the highest risk of breaking during the swap:
   bundle return-shape, lifecycle (mount/unmount/destroy), mutation semantics
   (each action atom becomes a causl `commit`), and the EventBus dispatch
   contract (the bridge between atom changes and core events).

Tests must stay GREEN on the current Jotai backend and must stay GREEN on the
post-migration causl backend. If a test fails on either, either the production
code is wrong or the test was too tightly coupled to one library — fix the
test, not the contract.

See `PLAN_CAUSL_MIGRATION.md` at the repo root for the full migration plan.
