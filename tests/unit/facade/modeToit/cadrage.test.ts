import { describe, it, expect } from 'vitest';
import { CADRAGE_MIN_M, cadreDe, emprisePourCadrer, MARGE_CADRAGE_M, murDeCadrage, poigneesDe, pointsDeLElement } from '../../../../src/facade/modeToit/poignees.js';
import { listerElements } from '../../../../src/facade/modeToit/elements.js';
import { murDuCorps } from '../../../../src/facade/modeToit/saillies.js';
import { appliquerPiece } from '../../../../src/three/gestesToits.js';
import { cadreOblique, type PointScene, type Reserve } from '../../../../src/three/poseFacade.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';

// Choisir un element du mode Toit cadre la camera de facade sur lui (2 novembre 2026, « les icônes des objets sur le toit sont trop
// petits, il faut zoomer dessus ») : une fenetre de toit, un panneau, une jacobine ne faisaient que quelques pixels devant la facade entiere.

const maison = (): ObjetPlan => ({ key: 'b', type: 'polygon', fonction: 'batiment', elevation: 4, pts: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }], batiment: { toit: { forme: 'deux-pans', hauteur: 3.5, angleFaitage: 0, source: 'bdtopo' } } } as unknown as ObjetPlan);
const avecTout = (): CorpsToit[] => {
  const o = maison();
  for (const id of ['facade:bow-window', 'sur:pignon', 'sur:cheminee', 'sur:jacobine', 'sur:capucine', 'sur:oeil-de-boeuf', 'sur:fenetre-toit', 'sur:solaire']) appliquerPiece(o, id);
  return o.batiment!.corpsToit!;
};

/** Les trois classes d'ecran, et ce que le panneau du mode y recouvre (une colonne a droite, un bandeau en bas). */
const ECRANS: { nom: string; l: number; h: number; reserve: Reserve }[] = [
  { nom: 'compact', l: 390, h: 680, reserve: { largeur: 390, hauteur: 680, droite: 0, bas: 330 } },
  { nom: 'moyen', l: 820, h: 1000, reserve: { largeur: 820, hauteur: 1000, droite: 0, bas: 420 } },
  { nom: 'large', l: 1370, h: 690, reserve: { largeur: 1370, hauteur: 690, droite: 400, bas: 0 } },
];
/** Au doigt, une cible fait 44 px au moins (skill design-ui) : l'element choisi, cadre, doit au moins la valoir. */
const CIBLE_PX = 44;

const enScene = (p: { x: number; y: number; z: number }): PointScene => ({ x: p.x, y: p.z, z: -p.y });
/** Les pixels par metre de la camera de facade qui tient `points` devant le mur (a, b, n), sur cet ecran. */
function pixelsParMetre(corps: CorpsToit[], rang: number, mur: number, points: PointScene[], e: (typeof ECRANS)[number]): number {
  const m = murDuCorps(corps[rang]!, mur);
  const cadre = cadreOblique(m.a, m.b, m.n, points, { x: 0, y: 0 }, e.l, e.h, e.reserve);
  return (cadre.projection[0]! * e.l) / 2;
}
/** La taille de l'element lui-meme : la plus grande dimension de sa boite (ses facettes, sa souche ; au moins 0,6 m). */
function tailleM(corps: CorpsToit[], t: Parameters<typeof pointsDeLElement>[1]): number {
  const p = pointsDeLElement(corps, t);
  const d = (k: 'x' | 'y' | 'z') => Math.max(...p.map((q) => q[k])) - Math.min(...p.map((q) => q[k]));
  return Math.max(0.6, d('x'), d('y'), d('z'));
}

describe('le cadrage sur l element choisi', () => {
  it('chaque element a un mur devant lequel se montrer, et le corps n en a pas (il se regarde en entier)', () => {
    const corps = avecTout();
    const elements = listerElements(corps).filter((e) => e.cible.type !== 'corps');
    expect(new Set(elements.map((e) => e.cible.type))).toEqual(new Set(['saillie', 'pignon', 'lucarne', 'cheminee', 'fenetre-toit', 'solaire']));
    for (const e of elements) expect(murDeCadrage(corps, e.cible, null), e.libelle).not.toBeNull();
    expect(murDeCadrage(corps, { type: 'corps', rang: 0, i: 0 }, null)).toBeNull();
    expect(murDeCadrage(corps, { type: 'lucarne', rang: 0, i: 99 }, null)).toBeNull();
  });

  it('un element du toit se montre devant le mur de son pan ; une cheminee, devant la facade regardee', () => {
    const corps = avecTout();
    const fenetre = listerElements(corps).find((e) => e.cible.type === 'fenetre-toit')!.cible;
    const pan = corps[0]!.elementsToit![fenetre.i]!.pan;
    expect(murDeCadrage(corps, fenetre, null)).toEqual({ rang: 0, mur: pan === 1 ? 2 : 0 });
    const cheminee = { type: 'cheminee' as const, rang: 0, i: 0 };
    expect(murDeCadrage(corps, cheminee, { rang: 0, mur: 2 })).toEqual({ rang: 0, mur: 2 });
    expect(murDeCadrage(corps, cheminee, { rang: null, mur: 2 })).toEqual({ rang: 0, mur: 0 });
  });

  it('l emprise tient l element entier avec sa marge, assez large pour voir le toit autour, jamais sous le sol', () => {
    const corps = avecTout();
    for (const e of listerElements(corps).filter((x) => x.cible.type !== 'corps')) {
      const b = emprisePourCadrer(corps, e.cible), p = pointsDeLElement(corps, e.cible);
      expect(b, e.libelle).toHaveLength(8);
      expect(p.length, e.libelle).toBeGreaterThan(0);
      const [bx, by, bz] = (['x', 'y', 'z'] as const).map((k) => [Math.min(...b.map((q) => q[k])), Math.max(...b.map((q) => q[k]))] as const);
      for (const q of p) {
        expect(q.x, e.libelle).toBeGreaterThanOrEqual(bx![0] + MARGE_CADRAGE_M - 1e-9);
        expect(q.x, e.libelle).toBeLessThanOrEqual(bx![1] - MARGE_CADRAGE_M + 1e-9);
        expect(q.y, e.libelle).toBeGreaterThanOrEqual(by![0] + MARGE_CADRAGE_M - 1e-9);
        expect(q.z, e.libelle).toBeLessThanOrEqual(bz![1] - MARGE_CADRAGE_M + 1e-9);
      }
      expect(bx![1] - bx![0], e.libelle).toBeGreaterThanOrEqual(CADRAGE_MIN_M - 1e-9);
      expect(by![1] - by![0], e.libelle).toBeGreaterThanOrEqual(CADRAGE_MIN_M - 1e-9);
      expect(bz![0], e.libelle).toBeGreaterThanOrEqual(0);
    }
    expect(emprisePourCadrer(corps, { type: 'corps', rang: 0, i: 0 })).toEqual([]);
  });

  it('les poignees d une fenetre de toit et d un panneau sont sur l element, pas hors du toit devant le mur', () => {
    const corps = avecTout();
    for (const e of listerElements(corps).filter((x) => x.cible.type === 'fenetre-toit' || x.cible.type === 'solaire')) {
      const f = pointsDeLElement(corps, e.cible), pos = poigneesDe(corps, e.cible).find((q) => q.id === 'pos')!.point;
      const xs = f.map((q) => q.x), ys = f.map((q) => q.y);
      expect(pos.x, e.libelle).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6);
      expect(pos.x, e.libelle).toBeLessThanOrEqual(Math.max(...xs) + 1e-6);
      expect(pos.y, e.libelle).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6);
      expect(pos.y, e.libelle).toBeLessThanOrEqual(Math.max(...ys) + 1e-6);
      // En deca du mur de sa facade : la normale sort du corps.
      const cadre = cadreDe(corps, e.cible)!;
      expect((pos.x - cadre.o.x) * cadre.n.x + (pos.y - cadre.o.y) * cadre.n.y, e.libelle).toBeLessThan(0);
    }
  });

  it('cadre, chaque element fait au moins 44 px dans les trois classes d ecran, et plus que devant la facade entiere', () => {
    const corps = avecTout();
    // Le batiment entier, comme la camera de facade le cadrait jusqu'ici (du pied a 50 cm au-dessus du faitage).
    const haut = Math.max(...corps.map((c) => c.faitage)) + 0.5;
    const batiment = corps.flatMap((c) => c.pts).flatMap((q) => [0, haut].map((z) => enScene({ ...q, z })));
    for (const e of listerElements(corps).filter((x) => x.cible.type !== 'corps')) {
      const m = murDeCadrage(corps, e.cible, { rang: 0, mur: 0 })!;
      const boite = emprisePourCadrer(corps, e.cible).map(enScene);
      for (const ecran of ECRANS) {
        const cadre = pixelsParMetre(corps, m.rang, m.mur, boite, ecran) * tailleM(corps, e.cible);
        const entier = pixelsParMetre(corps, m.rang, m.mur, batiment, ecran) * tailleM(corps, e.cible);
        expect(cadre, e.libelle + ' ' + ecran.nom).toBeGreaterThanOrEqual(CIBLE_PX);
        expect(cadre, e.libelle + ' ' + ecran.nom).toBeGreaterThan(entier);
      }
    }
  });

  it('cadrer ne touche ni aux corps ni a leurs elements (une lecture, pas un geste)', () => {
    const corps = avecTout(), avant = structuredClone(corps);
    for (const e of listerElements(corps)) { murDeCadrage(corps, e.cible, { rang: 0, mur: 0 }); emprisePourCadrer(corps, e.cible); }
    expect(corps).toEqual(avant);
  });
});
