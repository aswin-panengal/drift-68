import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts', 'server/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.mjs', 'vite.config.ts'],
    ignores: ['server/worker-configuration.d.ts'],
    languageOptions: { parser: tsParser },
    rules: {
      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-sparse-arrays': 'error',
    },
  },
];
