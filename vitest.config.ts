import { defineConfig } from 'vitest/config';

// Phase 1 : la chaine de test existe et tourne a vide ou presque. Les tests unitaires arrivent en
// phase 2, quand les fonctions pures sortiront de legacy.ts (spec section 11.1).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**'], exclude: ['src/legacy.ts'] }
  }
});
