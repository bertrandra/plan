import { describe, it, expect } from 'vitest';
import { resumerChiffrage } from '../../../src/ui/chiffrage.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le resume du chiffrage (feuille de selection, bandeau de l'inspecteur, tuiles des resultats) se partage entre les appels d'un meme
// rendu, et se refait a la tache suivante (ui/clePlan.ts : la cle est un jeton de tache, plus le plan serialise).
const tache = () => new Promise((ok) => setTimeout(ok, 0));
const plan = (): ObjetPlan[] => {
  const objets = structuredClone(DEMO_OBJECTS) as ObjetPlan[];
  const parcelle = objets.find((o) => o.key === 'parcelle') as ObjetPlan & { relief: { z?: (number | null)[]; nx: number; ny: number } };
  parcelle.relief.z = Array.from({ length: parcelle.relief.nx * parcelle.relief.ny }, (_, i) => 30 + (i % 7) / 10);
  return objets;
};
const terrasse = (objets: ObjetPlan[]) => objets.find((o) => o.key === 'terrasse') as ObjetPlan & { type: 'polygon' };

describe('le resume du chiffrage et son cache', () => {
  it('un meme rendu le partage ; la tache suivante le refait, au meme resultat', async () => {
    const objets = plan();
    const r1 = resumerChiffrage(terrasse(objets), objets);
    expect(r1?.haut).toBeGreaterThan(0);
    expect(resumerChiffrage(terrasse(objets), objets)).toBe(r1);
    await tache();
    const r2 = resumerChiffrage(terrasse(objets), objets);
    expect(r2).not.toBe(r1);
    expect(r2).toEqual(r1);
  });

  it('un geste dans une autre tache le fait recalculer, meme sur le meme tableau d objets', async () => {
    const objets = plan();
    const r1 = resumerChiffrage(terrasse(objets), objets);
    await tache();
    const t = terrasse(objets);
    t.pts = t.pts.map((p, i) => (i === 0 ? { ...p, x: p.x - 1 } : p));
    const r2 = resumerChiffrage(t, objets);
    expect(r2).not.toBe(r1);
    expect(r2?.surface).not.toBe(r1?.surface);
  });

  it('une grille du relief remplacee : meme resultat, recalcule', async () => {
    const objets = plan();
    const parcelle = objets.find((o) => o.key === 'parcelle') as ObjetPlan & { relief: { z: (number | null)[] } };
    const r1 = resumerChiffrage(terrasse(objets), objets);
    await tache();
    parcelle.relief.z = [...parcelle.relief.z];
    const r2 = resumerChiffrage(terrasse(objets), objets);
    expect(r2).not.toBe(r1);
    expect(r2).toEqual(r1);
  });
});
