import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Mesmo padrão do app (mobile/eslint.config.mjs). Em arquivos .ts o
// typescript-eslint já desliga no-undef (o TypeScript checa os globais).
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
