# Migration contract tests

These specs pin the **observable public behavior** of the React package
across a state-substrate migration. They were originally written to
guard the Jotai → causl swap (now landed: every commit after
[`f109567`](../../../../../README.md) — *"feat: causl state foundation
(Phases 1-3 + interaction lift + devtools)"* — runs on causl); they
remain checked-in so any future substrate change has a ready-made
regression net.

Tests in this directory deliberately:

1. Do **not** import `jotai`, `@causl/*`, or any other state-library
   namespace directly. The point is to assert against the public
   surface, not the internal substrate.
2. Assert only on the public surface exposed from
   `@iasbuilt/datagrid-react` (`useGrid`, `GridContext`,
   `useGridStore`, `useGridInteraction`) and on the `GridModel`
   interface from `@iasbuilt/datagrid-core`. The historical
   `useGridWithAtoms` and `createAtomicGridModel` exports were
   removed in the post-`v0.1.0` consolidation; do not re-add them
   here.
3. Cover the behaviors with the highest swap-risk: bundle return-shape,
   lifecycle (mount / unmount / destroy / dispose cleanup), mutation
   semantics (each action becomes exactly one `graph.commit` with the
   right intent string), and the EventBus dispatch contract (causl
   commits drive `cell:valueChange` / `cell:beginEdit` / etc.).
4. Stay GREEN on every commit on `main`. If one of these tests breaks
   after a refactor, the **public contract regressed** — fix the
   production code, not the test. The only acceptable test edit is
   when the contract itself is being intentionally evolved, and that
   should land as a single PR labelled `contract-change` so reviewers
   can spot it.

## How they relate to the rest of the suite

| Layer | Lives in | Scope |
|---|---|---|
| Migration contract | `migration-contract/` *(this dir)* | Public-surface invariants — substrate-agnostic. |
| Unit / integration | sibling `__tests__/` directories | Behaviour of a single hook / component / module. |
| End-to-end | `e2e/` | Real browser, real DOM, real keyboard / mouse. |

A new feature usually needs unit + e2e coverage; a migration contract
test is only worth adding when the feature exposes a **shape** that an
adopter could write against (e.g. `useGrid` return type, `GridModel`
methods) and that we want to freeze across future substrate work.
