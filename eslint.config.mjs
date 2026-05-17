// Flat-config ESLint setup for the @iasbuilt/datagrid monorepo (issue #101).
//
// SCOPE DECISION
// --------------
// What is linted:
//   - All `.ts` / `.tsx` source under `packages/**/src/`
//   - The `playground/` SPA (`.ts` / `.tsx`)
//   - The `e2e/` Playwright suite (`.ts` / `.tsx`)
//   - Stories under `stories/` (`*.stories.tsx`)
//   - Root config files (`*.config.{ts,mjs,js}`, this file, `scripts/**`)
//
// What is NOT linted:
//   - `node_modules/`, `dist/`, `coverage/`, `docs/` (generated or third-party)
//   - Storybook static output (`storybook-static/`)
//   - The Husky internals (`.husky/_/`)
//   - Playwright artefact dirs (`playwright-report/`, `test-results/`)
//
// Rules — global baseline:
//   - `@typescript-eslint/no-unused-vars`            (error, ignore `_`-prefixed)
//   - `@typescript-eslint/no-floating-promises`       (error)
//   - `react-hooks/rules-of-hooks`                    (error)
//   - `react-hooks/exhaustive-deps`                   (warn — see below)
//
// Why `exhaustive-deps` is warn-not-error:
//   The grid hooks (e.g. `use-grid-interaction`, `use-virtualization`) deliberately
//   omit some dependencies to avoid render thrash when the dependency is a stable
//   ref or a setter from `useState`. Tightening to `error` would force a sweep
//   across files several other in-flight PRs are also editing (#106 / #113 / #109
//   touch the same hooks). Once those merge we can flip this to `error` in a
//   follow-up. Each site that disables the rule inline carries a one-line WHY
//   comment per the user's directive.
//
// `no-floating-promises` is enabled because almost every grid bug filed in the
// last cycle (#79, #80, #105, #107) traces back to a swallowed promise rejection
// — usually from clipboard, persistence, or devtools handlers.
//
// `no-unused-vars` honours the leading-underscore convention already in use in
// the codebase (`_ctx`, `_ev`) so contributors can opt out of the check by
// renaming the binding rather than reaching for an inline disable.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import storybook from 'eslint-plugin-storybook'

export default [
  // ---------------------------------------------------------------------------
  // Globally ignored paths. Flat config requires this to be the first block
  // (or an `ignores`-only object) for the ignores to apply across all subsequent
  // entries.
  // ---------------------------------------------------------------------------
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/storybook-static/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.husky/_/**',
      '**/.claude/**',
      'docs/**',
      // tsup / tsc emit
      '**/*.d.ts',
    ],
  },

  // ---------------------------------------------------------------------------
  // JS / TS baseline. Loose lint (no project-service / no type info) — picked
  // because the package layout has each `packages/*` with its own tsconfig and
  // wiring a single root project-service entry would create false "file not in
  // project" errors for the playground and e2e dirs. Type-aware lint is a
  // future tightening once the package tsconfigs reference a shared base.
  // ---------------------------------------------------------------------------
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ---------------------------------------------------------------------------
  // Project rules — apply to all TS / TSX files in the linted scope.
  // ---------------------------------------------------------------------------
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // Common browser/node globals used across the grid + scripts.
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        process: 'readonly',
        globalThis: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        FormData: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        CustomEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        FocusEvent: 'readonly',
        DragEvent: 'readonly',
        ClipboardEvent: 'readonly',
        ClipboardItem: 'readonly',
        DOMException: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        MutationObserver: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        DataTransfer: 'readonly',
        getComputedStyle: 'readonly',
        crypto: 'readonly',
        indexedDB: 'readonly',
        IDBKeyRange: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        performance: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // ----- React hooks -----
      'react-hooks/rules-of-hooks': 'error',
      // Warn-not-error: tightening to error would conflict with in-flight PRs
      // #106 / #113 / #109 that are restructuring the same hook bodies. Flip
      // to error in a follow-up once those merge.
      'react-hooks/exhaustive-deps': 'warn',

      // ----- typescript-eslint -----
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          // Stylistic-only — empty siblings sometimes show up in destructures
          // for documentation. Don't fail on those.
          ignoreRestSiblings: true,
        },
      ],
      // Consciously disabled — the codebase intentionally uses `any` at the
      // public causl-bridge surface (untyped reducer messages, dynamic cell
      // value bags) and the migration is gated on issue #101's sibling
      // ticket for typing the Msg union. Flip back to error once #101 ships.
      '@typescript-eslint/no-explicit-any': 'off',
      // The codebase uses `@ts-expect-error` with a description in load-bearing
      // places (cell-edit narrowing). The default rule is too strict — allow
      // descriptions without forcing a min length.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 3,
        },
      ],
      // `Function` and friends — leave as warn rather than error because the
      // playground sprinkles them in dev-only event handlers. Tightening
      // requires touching playground files several PRs also edit.
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-wrapper-object-types': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',

      // ----- base ESLint -----
      // typescript-eslint provides its own version of these; turn the base off.
      'no-unused-vars': 'off',
      'no-undef': 'off',
      // The grid uses Symbol.iterator patterns in a couple of places that
      // trigger this. Leave it at warn.
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-prototype-builtins': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // Stories — Storybook recommended rules. Scoped to `*.stories.tsx` only
  // (NOT every file under `stories/`) because the directory also contains
  // non-story helpers (`data.ts`, `helpers.ts`, `stories.styles.ts`) whose
  // `lowerCamelCase` exports are not Storybook stories and shouldn't trip
  // `storybook/prefer-pascal-case`.
  // ---------------------------------------------------------------------------
  ...storybook.configs['flat/recommended'].map((entry) => ({
    ...entry,
    files: ['**/*.stories.{ts,tsx}'],
  })),

  // ---------------------------------------------------------------------------
  // E2E (Playwright) — relax a few rules that don't make sense for tests.
  // ---------------------------------------------------------------------------
  {
    files: ['e2e/**/*.{ts,tsx}'],
    rules: {
      // Playwright assertion helpers commonly destructure `page`, `expect`
      // into args that may be unused for a given test variant.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_|^(page|context|browser)$',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Scripts (`scripts/**`) — Node CLI helpers. Need Node globals.
  // ---------------------------------------------------------------------------
  {
    files: ['scripts/**/*.{mjs,js,cjs,ts}'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // Vitest setup files — these use ambient globals that ESLint doesn't know
  // about. Silence `no-undef` for them (the `tsc` step still validates).
  // ---------------------------------------------------------------------------
  {
    files: ['vitest.setup.ts', 'vitest.*.ts', '**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // In-flight files — DO NOT add to this list without a tracking comment.
  //
  // These files are concurrently edited by open PRs (#109..#123 / #91..#96 at
  // the time #101 was scoped). Linting them clean now would create merge
  // conflicts in every one of those PRs, so the rules are downgraded to
  // `warn` here. A follow-up PR (#101-followup) will sweep them once the
  // in-flight branches merge.
  //
  // If you find yourself adding a file here that is NOT actually in-flight,
  // open an issue instead — the right answer is to fix the violation, not
  // shelf it.
  // ---------------------------------------------------------------------------
  {
    files: [
      'packages/react/src/DataGrid.tsx',
      'packages/react/src/body/DataGridBody.tsx',
      'packages/react/src/body/DataGridBody.styles.ts',
      'packages/react/src/chrome/ChromeRowNumberCell.tsx',
      'packages/react/src/styles/tokens/index.ts',
      'packages/react/src/use-grid.ts',
      'packages/react/src/use-causl-devtools.ts',
      'packages/react/src/ValidationTooltip.tsx',
      'packages/react/src/state/use-grid-interaction.ts',
      'packages/react/src/state/grid-interaction-state.ts',
      'packages/react/src/state/index.ts',
      'packages/react/src/context.ts',
      'packages/react/src/index.ts',
      'packages/react/src/__tests__/state/grid-interaction-causl.contract.test.tsx',
      'packages/react/src/__tests__/state/grid-interaction-state.test.ts',
      'packages/react/src/__tests__/migration-contract/**',
      'packages/react/src/__tests__/use-causl-devtools.test.tsx',
      'packages/mui/src/cells/MuiRichTextCell/MuiRichTextCell.tsx',
      'playground/spa-integration/main.tsx',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'warn',
      'prefer-const': 'warn',
    },
  },
]
