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
    // FF-10 : une fonction de plus de 150 lignes ne se relit plus en une fois, et deux personnes
    // finissent par y travailler en meme temps.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: { 'max-lines-per-function': ['error', { max: 150 }] }
  },
  // Le cliquet de FF-10. Ces fichiers portaient deja une fonction plus longue le 27 septembre 2026 ;
  // chacun a pour plafond sa plus longue d'alors. Une entree ne s'ajoute jamais, un plafond ne monte
  // jamais : quand une fonction est decoupee, on baisse le plafond ou on retire la ligne.
  ...Object.entries({
    'src/three/scene.ts': 638,           // buildThreeScene()
    'src/interaction/pointeur.ts': 281,
    'src/export/pdfPlan.ts': 257,
    'src/geo/cadastreObjets.ts': 244,
    'src/io/importSvg.ts': 165,
  }).map(([fichier, max]) => ({ files: [fichier], rules: { 'max-lines-per-function': ['error', { max }] } })),
  {
    // Les tests s'executent sous Node : ils utilisent __dirname, Buffer et process.
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: { __dirname: 'readonly', Buffer: 'readonly', process: 'readonly' }
    }
  }
];
