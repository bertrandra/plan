// Configuration a plat (ESLint 9). Porte deux fonctions d'aptitude d'architecture.md §9 :
// FF-9 (aucun `any` dans le domaine) et FF-10 (aucune fonction de plus de 150 lignes, en cliquet).
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'legacy/**', 'src/legacy.ts'] },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json', ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
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
    // FF-9 : le domaine ne connait pas `any`. C'est la ou un nombre faux devient un devis faux, et le
    // compteur est a zero : la regle garde ce zero. Pas de commentaire `eslint-disable` non plus dans
    // ces dossiers : c'est par la qu'un `any` y avait survecu a la premiere version de cette regle.
    files: ['src/model/**/*.ts', 'src/engine/**/*.ts', 'src/geometry/**/*.ts'],
    linterOptions: { noInlineConfig: true },
    rules: { '@typescript-eslint/no-explicit-any': 'error' }
  },
  {
    // Aucune assertion `!` dans le code livre (28 septembre 2026 : de 506 a 0). Un `!` affirme ce
    // que le compilateur ne peut pas prouver et le laisse passer en `undefined` s'il se trompe ; les
    // remplacants disent ce qu'ils supposent — `au` et `sommetDe` levent une RangeError nommee, une
    // garde de type retrecit, un repli nomme sa valeur par defaut. La regle garde ce zero.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'error' }
  },
  {
    // FF-10 : une fonction de plus de 150 lignes ne se relit plus en une fois, et deux personnes
    // finissent par y travailler en meme temps. Sans exception depuis le 28 septembre 2026 : le
    // cliquet ouvert le 27 avec onze fichiers (boot() en tete, 1 013 lignes) est vide.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: { 'max-lines-per-function': ['error', { max: 150 }] }
  },
  {
    // Les tests s'executent sous Node : ils utilisent __dirname, Buffer et process.
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: { __dirname: 'readonly', Buffer: 'readonly', process: 'readonly' }
    }
  }
];
