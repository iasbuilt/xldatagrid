/**
 * Tests for scripts/sync-tokens.mjs
 *
 * These tests exercise the sync-tokens script as a subprocess so we verify the
 * real CLI surface that developers and CI invoke. They cover:
 *   1. Missing sibling tokens repo (bad ISTRACKED_TOKENS_DIR).
 *   2. Partial output (source is missing one of the expected artefacts).
 *   3. Manifest content-hash presence and change sensitivity.
 *   4. `--check` drift-detection mode.
 *
 * Test runner: node --test (Node's built-in test runner). Invoked via the
 * `pnpm test:scripts` script at the repo root.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  copyFileSync,
  existsSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const scriptPath = resolve(repoRoot, 'scripts', 'sync-tokens.mjs');

/**
 * Build a temporary tokens fixture with the same layout as iasbuilt/tokens.
 * Returns the path to the fixture root.
 */
function makeTokensFixture({ omit = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tokens-fixture-'));
  mkdirSync(join(root, 'dist', 'json'), { recursive: true });
  mkdirSync(join(root, 'dist', 'css'), { recursive: true });
  const files = {
    'dist/json/light.json': '{"color":"light"}\n',
    'dist/json/dark.json': '{"color":"dark"}\n',
    'dist/css/light.css': ':root{--bg:#fff;}\n',
    'dist/css/dark.css': ':root{--bg:#000;}\n',
  };
  for (const [rel, contents] of Object.entries(files)) {
    if (omit.includes(rel)) continue;
    writeFileSync(join(root, rel), contents);
  }
  return root;
}

/**
 * Build a temporary xldatagrid-like target tree so the script can write into
 * `packages/react/src/styles/tokens/`. Returns the root of the fake repo.
 * We copy the real sync-tokens.mjs into `scripts/` of this fake repo so its
 * `repoRoot` resolution (two levels up from the script) points at the fixture.
 */
function makeRepoFixture() {
  const root = mkdtempSync(join(tmpdir(), 'xldg-fixture-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'packages', 'react', 'src', 'styles', 'tokens'), {
    recursive: true,
  });
  copyFileSync(scriptPath, join(root, 'scripts', 'sync-tokens.mjs'));
  return root;
}

function runScript({ cwd, env = {}, args = [] }) {
  return spawnSync(
    process.execPath,
    [join(cwd, 'scripts', 'sync-tokens.mjs'), ...args],
    {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    },
  );
}

test('exits non-zero when ISTRACKED_TOKENS_DIR points at a missing path', () => {
  const repo = makeRepoFixture();
  try {
    const result = runScript({
      cwd: repo,
      env: { ISTRACKED_TOKENS_DIR: '/nonexistent/path/for/tokens/repo-xyz' },
    });
    assert.notEqual(result.status, 0, 'script should exit non-zero');
    const combined = `${result.stdout}\n${result.stderr}`;
    assert.match(
      combined,
      /\/nonexistent\/path\/for\/tokens\/repo-xyz/,
      'error should mention the missing path',
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('exits non-zero when a required source artefact is missing', () => {
  const tokens = makeTokensFixture({ omit: ['dist/json/dark.json'] });
  const repo = makeRepoFixture();
  try {
    const result = runScript({
      cwd: repo,
      env: { ISTRACKED_TOKENS_DIR: tokens },
    });
    assert.notEqual(result.status, 0, 'script should exit non-zero');
    const combined = `${result.stdout}\n${result.stderr}`;
    assert.match(
      combined,
      /dark\.json/,
      'error should name the missing artefact',
    );
  } finally {
    rmSync(tokens, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test('manifest contains contentHash and it changes when any copied file changes by one byte', () => {
  const tokens = makeTokensFixture();
  const repo = makeRepoFixture();
  try {
    const first = runScript({ cwd: repo, env: { ISTRACKED_TOKENS_DIR: tokens } });
    assert.equal(first.status, 0, `first sync should succeed: ${first.stderr}`);

    const manifestPath = join(
      repo,
      'packages',
      'react',
      'src',
      'styles',
      'tokens',
      'manifest.json',
    );
    const manifest1 = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.ok(
      typeof manifest1.contentHash === 'string' && manifest1.contentHash.length >= 32,
      'manifest.contentHash should be a non-trivial string',
    );
    assert.match(
      manifest1.contentHash,
      /^[a-f0-9]{64}$/,
      'contentHash should be a sha-256 hex digest',
    );

    // Mutate one copied source file by one byte and re-run.
    appendFileSync(join(tokens, 'dist/css/dark.css'), '/* drift */');
    const second = runScript({ cwd: repo, env: { ISTRACKED_TOKENS_DIR: tokens } });
    assert.equal(second.status, 0, `second sync should succeed: ${second.stderr}`);
    const manifest2 = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.notEqual(
      manifest1.contentHash,
      manifest2.contentHash,
      'contentHash must change when any copied file changes by one byte',
    );
  } finally {
    rmSync(tokens, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test('--check passes when committed tokens match manifest hash, fails after drift', () => {
  const tokens = makeTokensFixture();
  const repo = makeRepoFixture();
  try {
    // First sync writes the canonical manifest + tokens.
    const synced = runScript({ cwd: repo, env: { ISTRACKED_TOKENS_DIR: tokens } });
    assert.equal(synced.status, 0, `initial sync should succeed: ${synced.stderr}`);

    // Clean `--check` should pass.
    const checkOk = runScript({
      cwd: repo,
      env: { ISTRACKED_TOKENS_DIR: tokens },
      args: ['--check'],
    });
    assert.equal(
      checkOk.status,
      0,
      `--check should exit 0 when tokens are in sync: stdout=${checkOk.stdout} stderr=${checkOk.stderr}`,
    );

    // Mutate a committed token file (simulating a developer edit).
    const committedDark = join(
      repo,
      'packages',
      'react',
      'src',
      'styles',
      'tokens',
      'dark.css',
    );
    assert.ok(existsSync(committedDark));
    appendFileSync(committedDark, '/* manual drift */');

    const checkFail = runScript({
      cwd: repo,
      env: { ISTRACKED_TOKENS_DIR: tokens },
      args: ['--check'],
    });
    assert.notEqual(
      checkFail.status,
      0,
      '--check must exit non-zero on drift',
    );
    const combined = `${checkFail.stdout}\n${checkFail.stderr}`;
    assert.match(
      combined,
      /drift/i,
      'drift message should mention "drift"',
    );
    assert.match(
      combined,
      /sync:tokens/,
      'drift message should point users at `pnpm sync:tokens`',
    );
  } finally {
    rmSync(tokens, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});
