import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JETONS, PAIRES_CONTRASTE, contraste } from '../../../src/styles/jetons.js';
import { lireDocumentPalette } from '../../../src/styles/paletteServeur.js';
import { MODELES_PALETTE } from '../../../src/styles/modeles.js';

// Les modeles de palette (src/styles/modeles/*.json, scripts/generer-modeles-palette.mjs) : des
// documents `plan-palette` complets, et lisibles — chaque paire de contraste tient dans les deux
// themes, comme pour les couleurs d'origine.

const dossier = resolve(__dirname, '../../../src/styles/modeles');
const fichiers = readdirSync(dossier).filter(f => f.endsWith('.json')).sort();

describe('les modeles de palette', () => {
  it('sont huit, et tous proposes par le menu', () => {
    expect(fichiers.map(f => f.replace(/\.json$/, ''))).toEqual(['eau-vive', 'fleurie', 'halloween', 'monochrome', 'multicolore', 'psychedelique', 'vert-jardin', 'zen']);
    expect(MODELES_PALETTE.map(m => m.id).sort()).toEqual(fichiers.map(f => f.replace(/\.json$/, '')));
  });

  for (const f of fichiers) {
    const doc = JSON.parse(readFileSync(resolve(dossier, f), 'utf8'));
    describe(f, () => {
      it('est une palette complete : chaque jeton, chaque theme, en #RRGGBB', () => {
        expect(doc.format).toBe('plan-palette');
        expect(typeof doc.nom).toBe('string');
        for (const t of ['clair', 'sombre'] as const) {
          expect(Object.keys(doc.couleurs[t])).toEqual(Object.keys(JETONS[t]));
          for (const v of Object.values(doc.couleurs[t])) expect(v).toMatch(/^#[0-9A-F]{6}$/);
        }
        expect(lireDocumentPalette(doc)?.couleurs).toEqual(doc.couleurs);
      });

      it('garde le texte lisible dans les deux themes', () => {
        const faibles = (['clair', 'sombre'] as const).flatMap(t => PAIRES_CONTRASTE
          .filter(([texte, fond, min]) => contraste(doc.couleurs[t][texte], doc.couleurs[t][fond]) < min)
          .map(([texte, fond]) => t + ' ' + texte + '/' + fond));
        expect(faibles).toEqual([]);
      });
    });
  }
});
