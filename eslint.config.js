import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'prisma/generated/**', 'coverage/**', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Money is BIGINT minor units. Floats are never correct here.' },
        { name: 'Number', message: 'Do not coerce money with Number(). See docs/03 money representation.' },
      ],
    },
  },
  {
    // docs/09 non-negotiable 6 + 7: the domain layer is pure and has no `any`.
    files: ['src/domain/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@modules/*', '@platform/*', '../modules/*', '../platform/*', '**/src/modules/*', '**/src/platform/*'],
              message: 'src/domain imports nothing from modules or platform (docs/09 non-negotiable 6).' },
          ],
        },
      ],
    },
  },
  {
    files: ['test/**/*.ts', '*.config.ts', 'eslint.config.js'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
  },
);
