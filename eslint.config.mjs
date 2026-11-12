// ESLint 10 flat config (.mjs: el root no es "type": "module") para todo el monorepo.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'cache/**',
      'apps/api/public/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-implicit-globals': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_|next' }],
    },
  },
];
