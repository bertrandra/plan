import { defineConfig } from 'vitest/config';

// Les tests vivent dans tests/unit/<couche>/, miroir de src/ (CLAUDE.md, Conventions).
export default defineConfig({
  // Les deux constantes que le build injecte : sans elles, importer src/plateforme/config.ts sous
  // vitest echouerait sur un identifiant inconnu. Vides, comme un build sans plateforme branchee.
  define: {
    __BACKPROD_API_URL__: JSON.stringify(process.env.BACKPROD_API_URL || ''),
    __BACKPROD_PRODUCT_CODE__: JSON.stringify(process.env.BACKPROD_PRODUCT_CODE || 'plan')
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**'] }
  }
});
