import { describe, it, expect } from 'vitest';
import { REGLAGES_DETECTION } from '../../../../src/facade/regles/facades/detection.js';
import { REGLAGES_STRUCTURE } from '../../../../src/facade/regles/facades/structure.js';
import { REGLAGES_TEXTURE } from '../../../../src/facade/regles/facades/texture.js';

// Les reglages des facades sont des donnees (regles/facades/*.json) : le code les lit, un fichier mal forme ne doit pas passer.
const UNITES = new Set(['m', 'm2', 'niveaux', 'rapport', 'part', 'nombre']);

describe('les réglages des façades, lus des fichiers de regles/facades/', () => {
  for (const [nom, r] of Object.entries({ detection: REGLAGES_DETECTION, structure: REGLAGES_STRUCTURE, texture: REGLAGES_TEXTURE })) {
    it(nom + ' : chaque réglage a une valeur finie, une unité connue, une raison', () => {
      const lignes = Object.entries(r);
      expect(lignes.length).toBeGreaterThan(0);
      for (const [cle, g] of lignes) {
        expect(Number.isFinite(g.valeur), cle).toBe(true);
        expect(UNITES.has(g.unite), cle + ' : ' + g.unite).toBe(true);
        expect(g.pourquoi.length, cle).toBeGreaterThan(10);
        expect(cle.startsWith('facades.'), cle).toBe(true);
      }
    });
  }
});
