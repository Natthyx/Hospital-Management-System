// @ts-check
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ── Global ignores ──
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'docker/**',
      '**/.tmp/**',
      '**/.temp/**',
    ],
  },

  // ── Base: recommended JS rules ──
  eslint.configs.recommended,

  // ── TypeScript: type-aware strict rules ──
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // ── Prettier: disable formatting rules that conflict ──
  eslintConfigPrettier,

  // ── Project-wide settings ──
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.mjs',
            'commitlint.config.mjs',
            'scripts/*.mjs',
            'scripts/*.ts',
            'scripts/*.mts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'import-x': importX,
    },
    rules: {
      // ── Rule 02: No any ──
      '@typescript-eslint/no-explicit-any': 'error',

      // ── Rule 02: No unhandled promises ──
      '@typescript-eslint/no-floating-promises': 'error',

      // ── Rule 02: No console.log (use pino logger) ──
      'no-console': 'error',

      // ── Rule 02: No default exports (frameworks may need overrides) ──
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message:
            'Default exports are not allowed. Use named exports instead (rule 02).',
        },
      ],

      // ── Rule 02: Ban @ts-ignore, allow @ts-expect-error only with description ──
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          minimumDescriptionLength: 10,
        },
      ],

      // ── Import ordering ──
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',

      // ── Additional strictness ──
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',

      // ── Relax rules that are too aggressive for a NestJS codebase ──
      // NestJS decorators and DI require classes with specific patterns
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // ── Config files: allow default exports (required by tools) ──
  {
    files: [
      '*.config.{js,cjs,mjs,ts,mts}',
      '**/*.config.{js,cjs,mjs,ts,mts}',
      'commitlint.config.*',
    ],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // ── Plain JS files: disable type-aware rules (no TS type info available) ──
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
