import { describe, it, expect } from 'vitest';
import { aimanter, cadreDe, cibleDesPoignees, cotesDe, EGOUT_MIN_M, glisser, murVersLOeil, poigneesDe } from '../../../../src/facade/modeToit/poignees.js';
import { appliquerPiece } from '../../../../src/three/gestesToits.js';
import { repere } from '../../../../src/facade/toits/toitCorps.js';
import { silhouetteVersLOeil } from '../../../../src/facade/regles/toits/silhouetteDesCorps.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';

const maison = (): ObjetPlan => ({ key: 'b', type: 'polygon', fonction: 'batiment', elevation: 3, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], batiment: { toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' } } } as unknown as ObjetPlan);
const avecTout = (): CorpsToit[] => {
  const o = maison();
  for (const id of ['facade:bow-window', 'sur:pignon', 'sur:cheminee', 'sur:jacobine', 'sur:fenetre-toit', 'sur:solaire']) appliquerPiece(o, id);
  return o.batiment!.corpsToit!;
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
    expect(ids({ type: 'pignon', rang: 0, i: 0 })).toEqual(['pos', 'larg', 'haut', 'prof']);
    expect(ids({ type: 'lucarne', rang: 0, i: 0 })).toEqual(['pos', 'larg', 'haut']);
    expect(ids({ type: 'cheminee', rang: 0, i: 0 })).toEqual(['pos']);
    expect(ids({ type: 'solaire', rang: 0, i: 1 })).toEqual(['pos', 'taille']);
    expect(ids({ type: 'facade', rang: 0, i: 0, mur: 0 })).toEqual(['haut', 'long', 'egout']);
    expect(ids({ type: 'pignon', rang: 0, i: 9 })).toEqual([]);
  });

  it('vue de dessus, les poignees qui etirent un corps sont sur ses bords a la hauteur de son egout, ou le plan trace sa silhouette', () => {
    const corps = avecTout(), c = corps[0]!;
    const p = Object.fromEntries(poigneesDe(corps, { type: 'corps', rang: 0, i: 0 }).map((q) => [q.id, q.point]));
    expect(p.etirerL!.z).toBeCloseTo(Math.min(...c.egouts), 5);
    expect(p.etirerW!.z).toBeCloseTo(Math.min(...c.egouts), 5);
    expect(p.deplacer!.z).toBeCloseTo(c.faitage, 5);
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

  it('avance un pignon au-dela du mur : borne a 2,5 m, la saillie nulle s efface, les poignees suivent la face avancee', () => {
    const corps = avecTout(), cible = { type: 'pignon', rang: 0, i: 0 } as const;
    const a = glisser(corps, cible, 'prof', { prof: 1.03 });
    expect(a.corps[0]!.pignons[0]!.saillieM).toBe(1.05);
    expect(cotesDe(a.corps, cible).find((c) => c.cle === 'prof')!.texte).toBe('1,05 m');
    expect(glisser(a.corps, cible, 'prof', { prof: 9 }).corps[0]!.pignons[0]!.saillieM).toBe(2.5);
    // De retour au nu du mur, le champ disparait : le fichier est celui d'avant.
    expect('saillieM' in glisser(a.corps, cible, 'prof', { prof: -5 }).corps[0]!.pignons[0]!).toBe(false);
    const avant = poigneesDe(corps, cible).find((p) => p.id === 'haut')!.point, apres = poigneesDe(a.corps, cible).find((p) => p.id === 'haut')!.point;
    expect(Math.hypot(apres.x - avant.x, apres.y - avant.y)).toBeCloseTo(1.05, 5);
    // Le corps de depart n'a pas bouge.
    expect(corps[0]!.pignons[0]!.saillieM).toBeUndefined();
  });

  it('une galerie a deux bords et un retrait de mur qui se tirent, un bow-window non', () => {
    const o = maison();
    appliquerPiece(o, 'facade:galerie');
    const corps = o.batiment!.corpsToit!, rang = corps.findIndex((c) => c.saillie?.genre === 'galerie'), cible = { type: 'saillie', rang, i: 0 } as const;
    expect(poigneesDe(corps, cible).map((p) => p.id)).toEqual(['pos', 'larg', 'prof', 'haut', 'gauche', 'retrait']);
    const g0 = corps[rang]!.saillie!, droite = g0.centreM + g0.largeurM / 2;
    // Le bord gauche recule d'un metre : le bord droit ne bouge pas.
    const a = glisser(corps, cible, 'gauche', { long: -1 }).corps[rang]!.saillie!;
    expect(a.largeurM).toBeCloseTo(g0.largeurM + 1, 1);
    expect(a.centreM + a.largeurM / 2).toBeCloseTo(droite, 5);
    // Le retrait : tirer vers la maison le recule (0,1 m), borne a 1 m ou a la moitie de la profondeur, et la bulle le dit.
    const r = glisser(corps, cible, 'retrait', { prof: -0.1 }).corps;
    expect(r[rang]!.retraitM).toBeCloseTo((corps[rang]!.retraitM ?? 0) + 0.1, 5);
    expect(glisser(corps, cible, 'retrait', { prof: -9 }).corps[rang]!.retraitM).toBe(Math.min(1, g0.profondeurM / 2));
    expect(glisser(corps, cible, 'retrait', { prof: 9 }).corps[rang]!.retraitM).toBe(0);
    expect(cotesDe(r, cible).some((c) => c.cle === 'retrait')).toBe(true);
    const bow = avecTout();
    expect(poigneesDe(bow, { type: 'saillie', rang: 1, i: 0 }).map((p) => p.id)).toEqual(['pos', 'larg', 'prof', 'haut']);
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
    const h = glisser(corps, { type: 'facade', rang: 0, i: 0, mur: 0 }, 'haut', { vert: 1 }).corps[0]!;
    expect(h.faitage).toBeCloseTo(corps[0]!.faitage + 1, 2);
    const e = glisser(corps, { type: 'facade', rang: 0, i: 0, mur: 0 }, 'long', { long: 2 }).corps;
    expect(repere(e[0]!.pts).L).toBeCloseTo(12, 1);
    expect(e[1]!.saillie).toBeDefined();
    // Trop court : borne a 2,5 m.
    expect(repere(glisser(corps, { type: 'facade', rang: 0, i: 0, mur: 0 }, 'long', { long: -50 }).corps[0]!.pts).L).toBeCloseTo(2.5, 1);
    // Une facade de bout change la largeur et garde le faitage au meme endroit relatif.
    const w = glisser(corps, { type: 'facade', rang: 0, i: 0, mur: 1 }, 'long', { long: 2 }).corps[0]!;
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

  it('la poignee de l egout est au quart du mur, sur la ligne d egout de la facade, et la bulle dit l egout', () => {
    const corps = avecTout(), c = corps[0]!;
    const p = poigneesDe(corps, { type: 'facade', rang: 0, i: 0, mur: 0 }).find((q) => q.id === 'egout')!;
    expect(p.libelle).toBe('Hauteur à l’égout');
    expect(p.axes).toEqual(['vert']);
    expect(p.point.z).toBeCloseTo(c.egouts[0], 5);
    const f = cadreDe(corps, { type: 'facade', rang: 0, i: 0, mur: 0 })!;
    expect(p.point.x).toBeCloseTo(f.o.x + f.u.x * f.L / 4, 5);
    expect(cotesDe(corps, { type: 'facade', rang: 0, i: 0, mur: 0 }).find((q) => q.cle === 'egout')!.texte).toBe('égout ' + c.egouts[0].toFixed(2).replace('.', ',') + ' m');
    // Un bow-window a sa propre hauteur a l'egout (son element) : sa facade n'a pas celle du corps.
    expect(poigneesDe(corps, { type: 'facade', rang: 1, i: 0, mur: 0 }).some((q) => q.id === 'egout')).toBe(false);
  });

  it('tirer l egout monte ou descend le corps entier, pente gardee, et donne l elevation du corps principal', () => {
    const corps = avecTout(), c = corps[0]!;
    const r = glisser(corps, { type: 'facade', rang: 0, i: 0, mur: 0 }, 'egout', { vert: 1.52 });
    const n = r.corps[0]!;
    // Arrondi a 5 cm : 1,52 m devient 1,50 m.
    expect(n.egouts[0]).toBeCloseTo(c.egouts[0] + 1.5, 5);
    expect(n.egouts[1]).toBeCloseTo(c.egouts[1] + 1.5, 5);
    expect(n.faitage - Math.min(...n.egouts)).toBeCloseTo(c.faitage - Math.min(...c.egouts), 5);
    expect(n.pignons[0]!.faitage).toBeCloseTo(c.pignons[0]!.faitage + 1.5, 5);
    expect(n.cheminees![0]!.sommetM).toBeCloseTo(c.cheminees![0]!.sommetM + 1.5, 5);
    expect(n.lucarnes![0]!.faitageM).toBeCloseTo(c.lucarnes![0]!.faitageM + 1.5, 5);
    expect(n.pts).toEqual(c.pts);
    expect(r.elevation).toBeCloseTo(Math.min(...n.egouts), 5);
    // Le bow-window reste pose sur le corps, sur le meme mur.
    expect(r.corps[1]!.saillie!.hote).toBe(0);
    // Le depart n'a pas bouge : le glisser se rejoue toujours a partir de lui.
    expect(corps[0]!.egouts).toEqual(c.egouts);
  });

  it('l egout ne descend pas sous 1,5 m, et un autre corps que le principal ne change pas l elevation', () => {
    const corps = avecTout();
    const bas = glisser(corps, { type: 'facade', rang: 0, i: 0, mur: 0 }, 'egout', { vert: -50 });
    expect(Math.min(...bas.corps[0]!.egouts)).toBeCloseTo(EGOUT_MIN_M, 5);
    expect(bas.corps[0]!.faitage).toBeGreaterThan(Math.min(...bas.corps[0]!.egouts));
    const grand: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }], posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0 };
    const aile: CorpsToit = { pts: [{ x: 12, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 3 }, { x: 12, y: 3 }], posFaitage: 1.5, faitage: 5, egouts: [3, 3], pignons: [], ecart: 0 };
    const r = glisser([grand, aile], { type: 'facade', rang: 1, i: 0, mur: 0 }, 'egout', { vert: 1 });
    expect(r.corps[1]!.egouts).toEqual([4, 4]);
    expect(r.corps[0]).toEqual(grand);
    expect(r.elevation).toBeUndefined();
  });

  it('une galerie plus haute que l egout de la maison qui descend reste dessous', () => {
    const o = maison();
    appliquerPiece(o, 'facade:galerie');
    const corps = o.batiment!.corpsToit!;
    const rang = corps.findIndex((k) => k.saillie?.genre === 'galerie');
    const haute = glisser(corps, { type: 'saillie', rang, i: 0 }, 'haut', { vert: 0.5 }).corps;
    const r = glisser(haute, { type: 'facade', rang: 0, i: 0, mur: 0 }, 'egout', { vert: -1 });
    const egoutMaison = Math.min(...r.corps[0]!.egouts), g = r.corps[rang]!;
    expect(g.saillie!.hauteurM!).toBeLessThanOrEqual(egoutMaison + 1e-9);
    expect(Math.min(...g.egouts)).toBeLessThanOrEqual(egoutMaison + 1e-9);
  });
});

describe('la cible des poignees suit le corps choisi (28 octobre 2026, « les poignées ne sont pas sur le bon corps »)', () => {
  // La maison 10 x 6 m, et une aile 5 x 4 m contre son bout est ; on regarde la facade nord de la maison (mur 2, y = 6).
  const maisonC: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0 };
  const aile: CorpsToit = { pts: [{ x: 10, y: 1 }, { x: 15, y: 1 }, { x: 15, y: 5 }, { x: 10, y: 5 }], posFaitage: 2, faitage: 5, egouts: [3, 3], pignons: [], ecart: 0 };
  const corps = [maisonC, aile];
  const oeil = { x: 5, y: 60 };
  const nord = { rang: 0, mur: 2 };

  it('un corps choisi de face : son mur tourne vers l oeil, pas la facade courante de l autre corps', () => {
    const t = cibleDesPoignees(corps, { type: 'corps', rang: 1, i: 0 }, { dessus: false, facade: nord, oeil });
    expect(t).toEqual({ type: 'facade', rang: 1, i: 0, mur: 2 });
    // Les poignees sont sur l'aile : sur son mur nord (y = 5), a ses hauteurs.
    const p = poigneesDe(corps, t!);
    expect(p.find((q) => q.id === 'haut')!.point.z).toBe(5);
    for (const q of p) { expect(q.point.y).toBeCloseTo(5, 5); expect(q.point.x).toBeGreaterThanOrEqual(10 - 1e-9); }
    expect(cotesDe(corps, t!).find((c) => c.cle === 'w')!.texte).toBe('5,00 m');
  });

  it('le mur des poignees est celui de la silhouette', () => {
    for (const o of [oeil, { x: 40, y: 3 }, { x: 12, y: -30 }, { x: -20, y: 20 }]) {
      const m = murVersLOeil(aile, o), s = silhouetteVersLOeil(aile, o)!, a = aile.pts[m]!, b = aile.pts[(m + 1) % 4]!;
      // Tous les points de la silhouette sont dans le plan du mur choisi.
      for (const q of s) expect(Math.abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x))).toBeLessThan(1e-6);
      expect(silhouetteVersLOeil(aile, o, m)).toEqual(s);
    }
  });

  it('de dessus, seul un corps choisi ; sans choix, la facade courante ; un pignon devant sa facade seulement', () => {
    expect(cibleDesPoignees(corps, { type: 'corps', rang: 1, i: 0 }, { dessus: true, facade: nord, oeil })).toEqual({ type: 'corps', rang: 1, i: 0 });
    expect(cibleDesPoignees(corps, { type: 'cheminee', rang: 0, i: 0 }, { dessus: true, facade: nord, oeil })).toBeNull();
    expect(cibleDesPoignees(corps, null, { dessus: false, facade: nord, oeil })).toEqual({ type: 'facade', rang: 0, i: 0, mur: 2 });
    expect(cibleDesPoignees(corps, null, { dessus: false, facade: null, oeil })).toBeNull();
    const avecPignon = [{ ...maisonC, pignons: [{ pan: 1 as const, debut: 3, fin: 6, faitage: 8, profondeur: 3 }] }, aile];
    expect(cibleDesPoignees(avecPignon, { type: 'pignon', rang: 0, i: 0 }, { dessus: false, facade: nord, oeil })).toEqual({ type: 'pignon', rang: 0, i: 0 });
    expect(cibleDesPoignees(avecPignon, { type: 'pignon', rang: 0, i: 0 }, { dessus: false, facade: { rang: 0, mur: 0 }, oeil })).toEqual({ type: 'facade', rang: 0, i: 0, mur: 0 });
  });
});
