import { describe, it, expect } from 'vitest';
import { aimanter, cadreDe, cotesDe, glisser, poigneesDe } from '../../../src/facade/regles/toits/poignees.js';
import { appliquerPiece } from '../../../src/three/gestesToits.js';
import { repere } from '../../../src/facade/toitCorps.js';
import type { CorpsToit, ObjetPlan } from '../../../src/model/types.js';

const maison = (): ObjetPlan => ({ key: 'b', type: 'polygon', fonction: 'batiment', elevation: 3, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' } } as unknown as ObjetPlan);
const avecTout = (): CorpsToit[] => {
  const o = maison();
  for (const id of ['facade:bow-window', 'sur:pignon', 'sur:cheminee', 'sur:jacobine', 'sur:fenetre-toit', 'sur:solaire']) appliquerPiece(o, id);
  return o.corpsToit!;
};

describe('l aimantation', () => {
  it('colle a moins de 25 cm, sinon arrondit a 5 cm', () => {
    expect(aimanter(3.12, [0, 3, 10])).toEqual({ v: 3, colle: 3 });
    expect(aimanter(3.38, [0, 3, 10])).toEqual({ v: 3.4, colle: null });
  });
});

describe('les poignees', () => {
  it('chaque element a ses poignees, dans le repere de sa facade', () => {
    const corps = avecTout();
    const ids = (t: Parameters<typeof poigneesDe>[1]) => poigneesDe(corps, t).map((p) => p.id);
    expect(ids({ type: 'saillie', rang: 1, i: 0 })).toEqual(['pos', 'larg', 'prof', 'haut']);
    expect(ids({ type: 'pignon', rang: 0, i: 0 })).toEqual(['pos', 'larg', 'haut']);
    expect(ids({ type: 'lucarne', rang: 0, i: 0 })).toEqual(['pos', 'larg', 'haut']);
    expect(ids({ type: 'cheminee', rang: 0, i: 0 })).toEqual(['pos']);
    expect(ids({ type: 'solaire', rang: 0, i: 1 })).toEqual(['pos', 'taille']);
    expect(ids({ type: 'corps', rang: 0, i: 0, mur: 0 })).toEqual(['haut', 'long']);
    expect(ids({ type: 'pignon', rang: 0, i: 9 })).toEqual([]);
  });

  it('le repere du pan 0 sort vers l exterieur de son cote', () => {
    const c = avecTout();
    const f = cadreDe(c, { type: 'pignon', rang: 0, i: 0 })!;
    expect(f.n.y).toBeLessThan(0);
    expect(f.L).toBeCloseTo(10, 5);
  });

  it('dit les cotes de l element', () => {
    const corps = avecTout();
    expect(cotesDe(corps, { type: 'saillie', rang: 1, i: 0 }).map((c) => c.cle)).toEqual(['w', 'prof', 'h']);
    expect(cotesDe(corps, { type: 'pignon', rang: 0, i: 0 }).find((c) => c.cle === 'w')!.texte).toMatch(/m$/);
    expect(cotesDe(corps, { type: 'pignon', rang: 0, i: 0 }).find((c) => c.cle === 'ang')!.texte).toMatch(/°$/);
  });
});

describe('glisser', () => {
  it('ne touche pas au corps de depart', () => {
    const corps = avecTout(), avant = JSON.stringify(corps);
    glisser(corps, { type: 'pignon', rang: 0, i: 0 }, 'pos', { long: 3 });
    expect(JSON.stringify(corps)).toBe(avant);
  });

  it('deplace un pignon, le colle aux bords et le garde dans le corps', () => {
    const corps = avecTout();
    const g0 = corps[0]!.pignons[0]!, w = g0.fin - g0.debut;
    const a = glisser(corps, { type: 'pignon', rang: 0, i: 0 }, 'pos', { long: 2 });
    expect(a.corps[0]!.pignons[0]!.debut).toBeCloseTo(g0.debut + 2, 1);
    expect(a.corps[0]!.pignons[0]!.fin - a.corps[0]!.pignons[0]!.debut).toBeCloseTo(w, 5);
    // Tire trop loin : il s'arrete au bout du mur, et le bord colle y dessine un guide.
    const b = glisser(corps, { type: 'pignon', rang: 0, i: 0 }, 'pos', { long: 50 });
    expect(b.corps[0]!.pignons[0]!.fin).toBeLessThanOrEqual(10.0001);
    const c = glisser(corps, { type: 'pignon', rang: 0, i: 0 }, 'pos', { long: 10 - w - g0.debut - 0.1 });
    expect(c.guides).toContain(10);
    expect(c.corps[0]!.pignons[0]!.fin).toBeCloseTo(10, 5);
  });

  it('regle la largeur et la hauteur d un pignon dans les bornes', () => {
    const corps = avecTout();
    const l = glisser(corps, { type: 'pignon', rang: 0, i: 0 }, 'larg', { long: 20 }).corps[0]!.pignons[0]!;
    expect(l.fin - l.debut).toBeLessThanOrEqual(8.0001);
    const h = glisser(corps, { type: 'pignon', rang: 0, i: 0 }, 'haut', { vert: -20 }).corps[0]!.pignons[0]!;
    expect(h.faitage).toBeGreaterThanOrEqual(Math.min(...corps[0]!.egouts) + 0.8 - 1e-9);
    const hh = glisser(corps, { type: 'pignon', rang: 0, i: 0 }, 'haut', { vert: 20 }).corps[0]!.pignons[0]!;
    expect(hh.faitage).toBeLessThanOrEqual(corps[0]!.faitage + 1e-9);
  });

  it('deplace, elargit, avance et monte un bow-window', () => {
    const corps = avecTout(), s0 = corps[1]!.saillie!;
    const p = glisser(corps, { type: 'saillie', rang: 1, i: 0 }, 'pos', { long: 1 }).corps[1]!.saillie!;
    expect(p.centreM).toBeCloseTo(s0.centreM + 1, 1);
    const l = glisser(corps, { type: 'saillie', rang: 1, i: 0 }, 'larg', { long: 1 }).corps[1]!.saillie!;
    expect(l.largeurM).toBeCloseTo(s0.largeurM + 1, 1);
    // Le bord gauche reste en place : le centre suit la moitie du changement.
    expect(l.centreM - l.largeurM / 2).toBeCloseTo(s0.centreM - s0.largeurM / 2, 1);
    const sa = glisser(corps, { type: 'saillie', rang: 1, i: 0 }, 'prof', { prof: 5 }).corps[1]!.saillie!;
    expect(sa.profondeurM).toBeLessThanOrEqual(1.5);
    const h = glisser(corps, { type: 'saillie', rang: 1, i: 0 }, 'haut', { vert: 1 }).corps[1]!;
    expect(h.saillie!.hauteurM).toBeGreaterThan(Math.min(...corps[1]!.egouts));
    expect(Math.min(...h.egouts)).toBeCloseTo(h.saillie!.hauteurM!, 2);
  });

  it('monte la facade d un corps et l etire en gardant ce qui est pose dessus', () => {
    const corps = avecTout();
    const h = glisser(corps, { type: 'corps', rang: 0, i: 0, mur: 0 }, 'haut', { vert: 1 }).corps[0]!;
    expect(h.faitage).toBeCloseTo(corps[0]!.faitage + 1, 2);
    const e = glisser(corps, { type: 'corps', rang: 0, i: 0, mur: 0 }, 'long', { long: 2 }).corps;
    expect(repere(e[0]!.pts).L).toBeCloseTo(12, 1);
    expect(e[1]!.saillie).toBeDefined();
    // Trop court : borne a 2,5 m.
    expect(repere(glisser(corps, { type: 'corps', rang: 0, i: 0, mur: 0 }, 'long', { long: -50 }).corps[0]!.pts).L).toBeCloseTo(2.5, 1);
    // Une facade de bout change la largeur et garde le faitage au meme endroit relatif.
    const w = glisser(corps, { type: 'corps', rang: 0, i: 0, mur: 1 }, 'long', { long: 2 }).corps[0]!;
    expect(repere(w.pts).W).toBeCloseTo(8, 1);
    expect(w.posFaitage / repere(w.pts).W).toBeCloseTo(corps[0]!.posFaitage / 6, 2);
  });

  it('deplace une cheminee dans le plan et un solaire sur son pan', () => {
    const corps = avecTout();
    const h0 = corps[0]!.cheminees![0]!;
    const h = glisser(corps, { type: 'cheminee', rang: 0, i: 0 }, 'pos', { long: 1, prof: 0.5 }).corps[0]!.cheminees![0]!;
    expect(h.x).not.toBe(h0.x);
    const e0 = corps[0]!.elementsToit![1]!;
    const e = glisser(corps, { type: 'solaire', rang: 0, i: 1 }, 'pos', { long: 1, vert: 0.3 }).corps[0]!.elementsToit![1]!;
    expect(e.sM).toBeCloseTo(e0.sM + 1, 1);
    expect(e.dM).toBeGreaterThan(e0.dM);
    const t = glisser(corps, { type: 'solaire', rang: 0, i: 1 }, 'taille', { long: 1 }).corps[0]!.elementsToit![1]!;
    expect(t.echelle).toBeGreaterThan(1);
  });
});
