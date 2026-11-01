import eslint from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: true,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/infrastructure', from: './src/modules' },
            { target: './src/shared', from: './src/modules' },
            { target: './src/shared', from: './src/infrastructure/database' },
            { target: './src/modules/catalog', from: './src/modules/workouts' },
            { target: './src/modules/catalog', from: './src/modules/personal-records' },
            { target: './src/modules/personal-records', from: './src/modules/workouts' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  prettierConfig,
);
