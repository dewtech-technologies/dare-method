import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/** RS-06: forbid shell:true in production src (tests excluded; ralph-loop until task-010). */
export default [
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/**/__tests__/**',
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'src/dag-runner/ralph-loop.ts',
    ],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='shell'][value.value=true]",
          message:
            'shell:true is forbidden (RS-06). Use exec/safe-spawn.ts instead.',
        },
      ],
    },
  },
];
