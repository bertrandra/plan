import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { lireFormes } from '../../../../src/facade/toits/lectureFormes.js';
import { reconstruireCorps } from '../../../../src/facade/toits/toitCorps.js';
import { toitMesureDepuisGrille } from '../../../../src/model/toitMesure.js';
import type { GrilleRelief } from '../../../../src/model/relief.js';
import type { PtBrut, ToitMesure } from '../../../../src/model/types.js';

// Aucun faux positif : sur les quatorze batiments reels du corpus (Le Vesinet, Gordes, Hucqueliers, des pavillons aux longeres), la lecture des formes du
// catalogue ne voit rien de plus que le corps lu par les formes simples. Un Mansart ou un papillon invente sur un pavillon serait pire que rien.

const DOSSIER = new URL('../../../fixtures/toits/', import.meta.url);
const releves = readdirSync(DOSSIER).filter((f) => f.endsWith('.json') && f !== 'profils-essai.json');

describe('la lecture des formes sur des batiments reels', () => {
  it('a quatorze releves, au moins', () => { expect(releves.length).toBeGreaterThanOrEqual(14); });
  for (const f of releves) {
    it(f + ' : rien de plus que les formes simples', () => {
      const j = JSON.parse(readFileSync(new URL(f, DOSSIER), 'utf8')) as { contour: PtBrut[]; toitMesure?: ToitMesure; grille?: GrilleRelief };
      const m = j.toitMesure ?? (j.grille ? toitMesureDepuisGrille(j.grille, j.contour) : null);
      expect(m).not.toBeNull();
      const corps = reconstruireCorps(m as ToitMesure, j.contour, { grille: j.grille ?? null }) ?? [];
      expect(lireFormes(m as ToitMesure, corps, j.contour)).toEqual([]);
    });
  }
});
