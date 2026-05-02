/**
 * Guard test that pins the `@iasbuilt/datagrid-react` public API contract
 * for the cell-editor hooks consumed by `@iasbuilt/datagrid-mui`.
 *
 * The three named exports asserted below (`useDraftState`, `useSelectState`,
 * `useArrayState`) back every built-in and third-party cell renderer; moving
 * them to a sub-path export or renaming them would silently break the MUI
 * cell package (see the WS-C baseline typecheck regression). This suite is
 * deliberately loud so the contract can only change by editing this file.
 */
import { describe, it, expect } from 'vitest';
import * as publicApi from '../index';

describe('@iasbuilt/datagrid-react public hook exports', () => {
  it('exposes useDraftState as a named export', () => {
    expect(typeof publicApi.useDraftState).toBe('function');
  });

  it('exposes useSelectState as a named export', () => {
    expect(typeof publicApi.useSelectState).toBe('function');
  });

  it('exposes useArrayState as a named export', () => {
    expect(typeof publicApi.useArrayState).toBe('function');
  });
});
