import { describe, it, expect } from 'vitest';
import { correspondanceDesCotes, facadesSurLeContour } from '../../../src/model/cotesAudit.js';
import { insererSommet, supprimerSommet } from '../../../src/model/sommets.js';
import type { BatimentCapture } from '../../../src/model/auditParcelle.js';
import type { PhotoCas } from '../../../src/model/audit.js';
import type { PtBrut } from '../../../src/model/types.js';

// Les facades de l'audit de la parcelle suivent leur mur quand le contour change (model/cotesAudit.ts) : un sommet ajoute ou
// retire (app/assemblage/gestes.ts) ne les envoie plus au mur voisin, et une annulation les ramene.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const forme = (pts: PtBrut[]) => ({ pts: pts.map((p) => ({ ...p })), vertexNames: pts.map((_, i) => 'Coin ' + (i + 1)), segmentNames: pts.map((_, i) => 'Cote ' + (i + 1)), frozenVertices: pts.map(() => false) });
const photo = (nom: string) => ({ base64: nom }) as unknown as PhotoCas;
/** Une facade notee sur chacun des cotes 1, 2 et 3 du rectangle (est, nord, ouest). */
const batiment = (contour?: PtBrut[]): BatimentCapture => ({
  facades: { 1: { photos: [photo('est')] }, 2: { photos: [photo('nord')], inaccessible: false }, 3: { photos: [photo('ouest')], corrections: { 0: { echelleLargeurM: 10 } } } },
  vu: {}, photos: [], ...(contour ? { contour } : {}),
});
const noms = (b: BatimentCapture) => Object.fromEntries(Object.entries(b.facades).map(([c, f]) => [c, f.photos.map((p) => (p as unknown as { base64: string }).base64).join(',')]));

describe('les facades de l audit suivent leur mur', () => {
  it('un sommet ajoute sur le cote sud : les facades suivantes avancent d un rang, et Ctrl+Z les ramene', () => {
    const avant = rect(0, 0, 10, 8);
    const f = forme(avant);
    insererSommet(f, 0, { x: 4, y: 0 });
    expect(correspondanceDesCotes(avant, f.pts)).toEqual([1, 2, 3, 4]);
    const apres = facadesSurLeContour(batiment(avant), f.pts);
    expect(noms(apres)).toEqual({ 2: 'est', 3: 'nord', 4: 'ouest' });
    expect(apres.facades[3]?.inaccessible).toBe(false);
    expect(apres.facades[4]?.corrections).toEqual({ 0: { echelleLargeurM: 10 } });
    expect(apres.contour).toEqual(f.pts);
    // Annule : le contour d'avant revient, les facades aussi.
    expect(noms(facadesSurLeContour(apres, avant))).toEqual({ 1: 'est', 2: 'nord', 3: 'ouest' });
  });

  it('un sommet ajoute sur le cote est le coupe en deux : la facade va a la plus grande part', () => {
    const avant = rect(0, 0, 10, 8);
    const f = forme(avant);
    insererSommet(f, 1, { x: 10, y: 3 });
    expect(noms(facadesSurLeContour(batiment(avant), f.pts))).toEqual({ 2: 'est', 3: 'nord', 4: 'ouest' });
  });

  it('un sommet retire : les facades suivantes reculent d un rang ; deux murs fondus gardent toutes leurs photos', () => {
    const avant = [...rect(0, 0, 10, 8).slice(0, 2), { x: 10, y: 4 }, ...rect(0, 0, 10, 8).slice(2)];
    const b: BatimentCapture = { facades: { 1: { photos: [photo('est-bas')] }, 2: { photos: [photo('est-haut')] }, 3: { photos: [photo('nord')] } }, vu: {}, photos: [], contour: avant };
    const f = forme(avant);
    supprimerSommet(f, 2);
    expect(noms(facadesSurLeContour(b, f.pts))).toEqual({ 1: 'est-bas,est-haut', 2: 'nord' });
  });

  it('un contour deplace d un bloc garde ses rangs ; sans contour garde, celui du moment est adopte', () => {
    const avant = rect(0, 0, 10, 8);
    const deplace = avant.map((p) => ({ x: p.x + 1.5, y: p.y - 2 }));
    expect(noms(facadesSurLeContour(batiment(avant), deplace))).toEqual({ 1: 'est', 2: 'nord', 3: 'ouest' });
    const adopte = facadesSurLeContour(batiment(), avant);
    expect(adopte.contour).toEqual(avant);
    expect(noms(adopte)).toEqual({ 1: 'est', 2: 'nord', 3: 'ouest' });
    expect(facadesSurLeContour(adopte, avant)).toBe(adopte);
  });
});
