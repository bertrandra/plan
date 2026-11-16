import { describe, it, expect } from 'vitest';
import { sectionsConstruction } from '../../../src/ui/champs/construction.js';
import type { ChampChoix, ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan } from '../../../src/model/types.js';
import { LAMES_COMMERCE, lameDuCommerce } from '../../../src/engine/bois/lamesCommerce.js';
import { ESSENCE_PRICES } from '../../../src/engine/bois/essences.js';
import { LAME_RAIDEUR } from '../../../src/engine/bois/portees.js';
import { computeBOM } from '../../../src/engine/bom.js';
import { computeTerrasseLayers } from '../../../src/engine/layers.js';
import { ensureConstruction } from '../../../src/engine/construction.js';

// La lame du commerce (lot 2 de la simplification, 16 novembre 2026) : un choix qui pose l'essence, les cotes et la raideur d'un coup,
// exactement comme les champs du pli le feraient un par un. Rien ne change tant qu'on ne choisit pas.

function terrasse(construction: Record<string, unknown>): ObjetPlan {
  return { key: 't', name: 'T', fonction: 'terrasse', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }], construction } as unknown as ObjetPlan;
}
function contexte(obj: ObjetPlan): ContexteChamps {
  return { etat: { objects: [obj], highlight: {} }, obj, objets: [obj], parcelle: null, construction: () => obj.construction } as unknown as ContexteChamps;
}
const champLame = (cx: ContexteChamps) => sectionsConstruction(cx).find((s) => s.id === 'lames')!.champs.find((c) => c.cle === 'lameCommerce') as ChampChoix;
const bom = (o: ObjetPlan) => JSON.stringify(computeBOM(o, computeTerrasseLayers(o, [o])));

describe('la lame du commerce', () => {
  it('est le premier champ des lames ; les reglages fins se replient sous elle', () => {
    const cx = contexte(terrasse({}));
    const lames = sectionsConstruction(cx).find((s) => s.id === 'lames')!;
    expect(lames.champs[0]!.cle).toBe('lameCommerce');
    expect(lames.champs.filter((c) => c.repli === 'Détail de la lame (essence, cotes, raideur)').map((c) => c.cle)).toEqual(['essenceBois', 'coefRaideurLame', 'largeurLame', 'epaisseurLame']);
  });

  it('chaque lame du catalogue a une essence connue, et des cotes distinctes', () => {
    for (const l of LAMES_COMMERCE) expect(ESSENCE_PRICES[l.essence]).toBeDefined();
    expect(new Set(LAMES_COMMERCE.map((l) => l.essence + l.largeur + 'x' + l.epaisseur)).size).toBe(LAMES_COMMERCE.length);
  });

  it('se lit « autre lame » sur une construction hors catalogue, sans rien y ecrire', () => {
    const o = terrasse({ essenceBois: 'autre', largeurLame: 140, epaisseurLame: 25 });
    const cx = contexte(o), ch = champLame(cx);
    expect(ch.lire(cx)).toBe('');
    const avant = JSON.stringify(o.construction);
    ch.ecrire(cx, '');
    expect(JSON.stringify(o.construction)).toBe(avant);
  });

  it('pose essence, largeur, epaisseur et raideur, comme les champs un par un : meme nomenclature', () => {
    for (const l of LAMES_COMMERCE) {
      const parCatalogue = terrasse({}); ensureConstruction(parCatalogue);
      const cx = contexte(parCatalogue), ch = champLame(cx);
      ch.ecrire(cx, l.id);
      expect(ch.lire(cx)).toBe(l.id);
      expect(lameDuCommerce(parCatalogue.construction!)).toEqual(l);
      const aLaMain = terrasse({}); ensureConstruction(aLaMain);
      Object.assign(aLaMain.construction!, { essenceBois: l.essence, coefRaideurLame: LAME_RAIDEUR[l.essence], largeurLame: l.largeur, epaisseurLame: l.epaisseur });
      expect(JSON.stringify(parCatalogue.construction)).toBe(JSON.stringify(aLaMain.construction));
      expect(bom(parCatalogue)).toBe(bom(aLaMain));
    }
  });
});
