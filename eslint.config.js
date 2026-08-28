// Configuration a plat (ESLint 9). Phase 1 : on met en place l'outil, pas la severite - legacy.ts
// est exclu tant qu'il contient le code d'origine, sinon la sortie serait illisible et personne ne
// la lirait. Les regles de la section 9.3 de la spec s'activeront au fur et a mesure des phases.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'legacy/**', 'src/legacy.ts'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json', ecmaVersion: 2022, sourceType: 'module' },
      globals: { document: 'readonly', window: 'readonly', console: 'readonly' }
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      // La regle qui compte pour ce projet (spec 9.3) : une promesse laissee sans .catch() a deja
      // fait disparaitre des erreurs d'export en silence.
      '@typescript-eslint/no-floating-promises': 'error',
      // TypeScript verifie deja l'existence des identifiants, et bien mieux : la regle de base
      // ignore les types et signale des faux positifs sur les globales d'environnement.
      'no-undef': 'off'
    }
  },
  {
    // Les tests s'executent sous Node : ils utilisent __dirname, Buffer et process.
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: { __dirname: 'readonly', Buffer: 'readonly', process: 'readonly' }
    }
  }
];
