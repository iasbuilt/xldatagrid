#!/usr/bin/env node
/**
 * sync-tokens.mjs
 *
 * Ingests design tokens from the `iasbuilt/tokens` repository into the
 * xldatagrid source tree. The tokens repository is the organisation-wide
 * source of truth for the iAsBuilt palette; this script copies the
 * already-built distribution artefacts (JSON + CSS) into
 * `packages/react/src/styles/tokens/` so the grid's theme layer can consume
 * them without a hard git-submodule or package-manager dependency.
 *
 * Resolution order for the tokens source directory:
 *   1. `ISTRACKED_TOKENS_DIR` environment variable (absolute path).
 *   2. A sibling directory named `tokens` next to the repository root.
 *
 * The script copies:
 *   - `dist/json/light.json`  -> `packages/react/src/styles/tokens/light.json`
 *   - `dist/json/dark.json`   -> `packages/react/src/styles/tokens/dark.json`
 *   - `dist/css/light.css`    -> `packages/react/src/styles/tokens/light.css`
 *   - `dist/css/dark.css`     -> `packages/react/src/styles/tokens/dark.css`
 *
 * The emitted `manifest.json` includes a `contentHash` field: a SHA-256 of
 * the canonical sorted concatenation of copied-file bodies. The hash lets
 * downstream tooling detect drift between the committed tokens and any
 * re-sync from the source repository.
 *
 * Modes:
 *   (default)     — copy source files into the tokens dir and refresh the
 *                   manifest (including `contentHash`).
 *   --check       — recompute the hash from the currently-committed tokens
 *                   and compare against `manifest.json.contentHash`. Exits
 *                   non-zero on mismatch with guidance to re-run the sync.
 *
 * Exit code 0 on success, non-zero on missing sources, missing targets, or
 * drift detection (check mode).
 */

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const TARGET_DIR = resolve(
  repoRoot,
  'packages',
  'react',
  'src',
  'styles',
  'tokens',
);

/**
 * Source/destination pairs. The destination filenames also serve as the
 * canonical sorted key for content-hash computation (sort alphabetically
 * by destination basename before concatenation).
 */
const PAIRS = [
  ['dist/json/light.json', 'light.json'],
  ['dist/json/dark.json', 'dark.json'],
  ['dist/css/light.css', 'light.css'],
  ['dist/css/dark.css', 'dark.css'],
];

function fail(message) {
  process.stderr.write(`sync-tokens: ${message}\n`);
  process.exit(1);
}

function resolveTokensDir() {
  const fromEnv = process.env.ISTRACKED_TOKENS_DIR;
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      fail(
        `ISTRACKED_TOKENS_DIR is set to ${fromEnv} but that path does not exist.`,
      );
    }
    return fromEnv;
  }
  const sibling = resolve(repoRoot, '..', 'tokens');
  if (existsSync(sibling)) return sibling;
  fail(
    `Unable to locate the iasbuilt/tokens repository. Checked the sibling directory ${sibling}. ` +
      `Set ISTRACKED_TOKENS_DIR to its absolute path and retry.`,
  );
  return ''; // unreachable — fail() exits the process
}

/**
 * Compute the canonical SHA-256 hash of the copied file set. The hash is
 * order-independent (we sort by destination basename) and length-safe: each
 * file's bytes are prefixed with its path and byte length so two different
 * file sets with coincidentally concatenating bodies cannot collide.
 */
function computeContentHash(directory, filenames) {
  const hash = createHash('sha256');
  const sorted = [...filenames].sort();
  for (const name of sorted) {
    const full = join(directory, name);
    if (!existsSync(full)) {
      fail(`Expected token artefact missing from ${directory}: ${name}`);
    }
    const body = readFileSync(full);
    // Frame each file so re-ordering/truncation cannot forge a matching hash.
    hash.update(`${name}:${body.length}\n`);
    hash.update(body);
    hash.update('\n');
  }
  return hash.digest('hex');
}

function readManifest() {
  const manifestPath = join(TARGET_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    fail(
      `manifest.json not found at ${manifestPath}. Run \`pnpm sync:tokens\` first.`,
    );
  }
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    fail(`manifest.json at ${manifestPath} is not valid JSON: ${err.message}`);
    return null; // unreachable
  }
}

function runCheckMode() {
  const manifest = readManifest();
  if (typeof manifest.contentHash !== 'string' || manifest.contentHash.length === 0) {
    fail(
      'manifest.json is missing `contentHash` — tokens have drifted (older manifest format). ' +
        'Run `pnpm sync:tokens` and commit the result.',
    );
  }
  const filenames = PAIRS.map(([, dst]) => dst);
  const actual = computeContentHash(TARGET_DIR, filenames);
  if (actual !== manifest.contentHash) {
    fail(
      'tokens have drifted — run `pnpm sync:tokens` and commit the result.\n' +
        `  expected contentHash: ${manifest.contentHash}\n` +
        `  actual   contentHash: ${actual}`,
    );
  }
  console.log('sync-tokens: tokens match manifest contentHash (no drift).');
}

function runSyncMode() {
  const tokensDir = resolveTokensDir();
  mkdirSync(TARGET_DIR, { recursive: true });

  for (const [src, dst] of PAIRS) {
    const source = join(tokensDir, src);
    const target = join(TARGET_DIR, dst);
    if (!existsSync(source)) {
      fail(`Expected token artefact not found: ${source}`);
    }
    copyFileSync(source, target);
    console.log(`copied ${src} -> ${target}`);
  }

  const filenames = PAIRS.map(([, dst]) => dst);
  const contentHash = computeContentHash(TARGET_DIR, filenames);

  const manifest = {
    source: tokensDir,
    syncedAt: new Date().toISOString(),
    files: filenames,
    contentHash,
  };
  writeFileSync(
    join(TARGET_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  console.log(`wrote manifest to ${join(TARGET_DIR, 'manifest.json')}`);
  console.log(`contentHash: ${contentHash}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    runCheckMode();
    return;
  }
  runSyncMode();
}

main();
