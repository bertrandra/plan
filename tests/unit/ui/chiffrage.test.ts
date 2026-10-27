import { describe, it, expect, vi } from 'vitest';
import { resumerChiffrage } from '../../../src/ui/chiffrage.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import { toucher } from '../../../src/core/controleurObjets.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le resume du chiffrage (feuille de selection, bandeau de l'inspecteur, tuiles des resultats) se garde tant que rien n'a ete ecrit :
// sa cle est la version de l'ensemble que tient le controleur des objets (ui/clePlan.ts, MD/spec-ouvrages.md etape 6.5).
const tache = () => new Promise((ok) => setTimeout(ok, 0));
const plan = (): ObjetPlan[] => {
  const objets = structuredClone(DEMO_OBJECTS) as ObjetPlan[];
  const parcelle = objets.find((o) => o.key === 'parcelle') as ObjetPlan & { relief: { z?: (number | null)[]; nx: number; ny: number } };
  parcelle.relief.z = Array.from({ length: parcelle.relief.nx * parcelle.relief.ny }, (_, i) => 30 + (i % 7) / 10);
  return objets;
};
const terrasse = (objets: ObjetPlan[]) => objets.find((o) => o.key === 'terrasse') as ObjetPlan & { type: 'polygon' };

describe('le resume du chiffrage et son cache', () => {
  it('se garde d un rendu a l autre tant que rien n est ecrit', async () => {
    const objets = plan();
    const r1 = resumerChiffrage(terrasse(objets), objets);
    expect(r1?.haut).toBeGreaterThan(0);
    expect(resumerChiffrage(terrasse(objets), objets)).toBe(r1);
    await tache();
    expect(resumerChiffrage(terrasse(objets), objets)).toBe(r1);
  });

  it('un geste qui touche son objet le fait recalculer', async () => {
    const objets = plan();
    const r1 = resumerChiffrage(terrasse(objets), objets);
    await tache();
    const t = terrasse(objets);
    t.pts = t.pts.map((p, i) => (i === 0 ? { ...p, x: p.x - 1 } : p));
    toucher(t);
    const r2 = resumerChiffrage(t, objets);
    expect(r2).not.toBe(r1);
    expect(r2?.surface).not.toBe(r1?.surface);
  });

  it('une grille du relief remplacee et touchee : recalcule, au meme resultat', async () => {
    const objets = plan();
    const parcelle = objets.find((o) => o.key === 'parcelle') as ObjetPlan & { relief: { z: (number | null)[] } };
    const r1 = resumerChiffrage(terrasse(objets), objets);
    parcelle.relief.z = [...parcelle.relief.z];
    toucher(parcelle);
    const r2 = resumerChiffrage(terrasse(objets), objets);
    expect(r2).not.toBe(r1);
    expect(r2).toEqual(r1);
  });

  it('en developpement, une ecriture qui ne touche pas son objet se signale', () => {
    const objets = plan();
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    resumerChiffrage(terrasse(objets), objets);
    const t = terrasse(objets);
    t.pts = t.pts.map((p, i) => (i === 0 ? { ...p, x: p.x - 1 } : p));
    resumerChiffrage(t, objets);
    expect(erreur.mock.calls.some((c) => String(c[0]).startsWith('[cle de version]'))).toBe(true);
    erreur.mockRestore();
  });
});
