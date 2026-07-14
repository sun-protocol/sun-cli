import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended'

export default tseslint.config(
  {
    ignores: [
      '.worktrees/**',
      '**/.worktrees/**',
      '.superpowers/**',
      '**/.superpowers/**',
      'dist/**',
      'node_modules/**',
      'bin/**',
      '.github/**',
      'test/**/*.d.ts',
      'test/**/*.js',
      'test/**/*.js.map',
      '*.js',
      '*.mjs',
      '*.cjs',
      '**/*.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettier,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'prefer-const': 'error',
      'no-useless-escape': 'warn',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
)
