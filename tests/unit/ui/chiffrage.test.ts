import { describe, it, expect } from 'vitest';
import { resumerChiffrage } from '../../../src/ui/chiffrage.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le resume du chiffrage (feuille de selection, bandeau de l'inspecteur, tuiles des resultats) est mis en cache sur le plan entier.
// Feuille de route, etape 2.2 : la cle se calcule une fois par tache, et les grilles d'altitudes y entrent par leur identite.
const tache = () => new Promise((ok) => setTimeout(ok, 0));
const plan = (): ObjetPlan[] => {
  const objets = structuredClone(DEMO_OBJECTS) as ObjetPlan[];
  const parcelle = objets.find((o) => o.key === 'parcelle') as ObjetPlan & { relief: { z?: (number | null)[]; nx: number; ny: number } };
  parcelle.relief.z = Array.from({ length: parcelle.relief.nx * parcelle.relief.ny }, (_, i) => 30 + (i % 7) / 10);
  return objets;
};
const terrasse = (objets: ObjetPlan[]) => objets.find((o) => o.key === 'terrasse') as ObjetPlan & { type: 'polygon' };

describe('le resume du chiffrage et son cache', () => {
  it('un meme rendu le partage, et le plan inchange le garde d une tache a l autre', async () => {
    const objets = plan();
    const r1 = resumerChiffrage(terrasse(objets), objets);
    expect(r1?.haut).toBeGreaterThan(0);
    expect(resumerChiffrage(terrasse(objets), objets)).toBe(r1);
    await tache();
    expect(resumerChiffrage(terrasse(objets), objets)).toBe(r1);
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

  it('une grille du relief remplacee le fait recalculer ; ses valeurs ne sont pas relues une a une', async () => {
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
