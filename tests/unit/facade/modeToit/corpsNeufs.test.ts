import { describe, it, expect } from 'vitest';
import { corpsNeuf, deplacerCorps, orienterFaitage, rangPrincipal, rangsDeCorps, supprimerCorps, tournerCorps } from '../../../../src/facade/modeToit/corpsNeufs.js';
import { pousserLeMur } from '../../../../src/facade/modeToit/pousserMur.js';
import { glisser } from '../../../../src/facade/modeToit/poignees.js';
import { corpsDeSaillie } from '../../../../src/facade/modeToit/saillies.js';
import { appliquerPiece, raisonIndisponible } from '../../../../src/three/gestesToits.js';
import { listerElements } from '../../../../src/facade/modeToit/elements.js';
import { repere } from '../../../../src/facade/toits/toitCorps.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';

const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
const hote = (): CorpsToit => ({ pts: rect, posFaitage: 3, faitage: 7, egouts: [3.5, 3.5], pignons: [], ecart: 0 });
const maison = (): ObjetPlan => ({ key: 'b', type: 'polygon', fonction: 'batiment', elevation: 3, pts: rect, batiment: { toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' } } } as unknown as ObjetPlan);
const aire = (c: CorpsToit) => { const r = repere(c.pts); return r.L * r.W; };

describe('poser un corps', () => {
  it('une aile : un pan contre le mur de bout, faitage contre l hote', () => {
    const a = corpsNeuf(hote(), 'aile', [hote()])!;
    expect(a).not.toBeNull();
    const r = repere(a.pts);
    expect(r.L).toBeCloseTo(5, 1);
    expect(r.W).toBeCloseTo(3, 1);
    expect(a.posFaitage).toBe(0);
    expect(a.faitage).toBeGreaterThan(Math.min(...a.egouts));
    // Elle est contre l'hote : tous ses sommets sont a droite de x = 10 (ou sur le mur).
    expect(Math.min(...a.pts.map((p) => p.x))).toBeGreaterThanOrEqual(9.99);
  });

  it('une deuxieme aile se pose de l autre cote, une troisieme plus loin', () => {
    const h = hote(), a1 = corpsNeuf(h, 'aile', [h])!, a2 = corpsNeuf(h, 'aile', [h, a1])!, a3 = corpsNeuf(h, 'aile', [h, a1, a2])!;
    expect(Math.max(...a2.pts.map((p) => p.x))).toBeLessThanOrEqual(0.01);
    expect(a3).not.toBeNull();
    expect(Math.min(...a3.pts.map((p) => p.x))).toBeGreaterThanOrEqual(12.99);
  });

  it('un retour : deux pans, en equerre a l arriere, qui entre dans le toit', () => {
    const r = corpsNeuf(hote(), 'retour', [hote()])!;
    expect(r.posFaitage).toBeCloseTo(1.5, 5);
    expect(Math.max(...r.pts.map((p) => p.y))).toBeCloseTo(9.5, 1);
    expect(Math.min(...r.pts.map((p) => p.y))).toBeCloseTo(4.5, 1);
  });

  it('une aile biaise : tournee de 35 degres, devant', () => {
    const b = corpsNeuf(hote(), 'biaise', [hote()])!;
    const [p0, p1] = [b.pts[0]!, b.pts[1]!];
    expect((Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI).toBeCloseTo(35, 0);
    expect(Math.max(...b.pts.map((p) => p.y))).toBeLessThan(0.5);
    // Deux biaises ne se superposent pas a la meme place.
    const b2 = corpsNeuf(hote(), 'biaise', [hote(), b])!;
    expect(Math.abs(b2.pts[0]!.x - b.pts[0]!.x) + Math.abs(b2.pts[0]!.y - b.pts[0]!.y)).toBeGreaterThan(1);
  });

  it('les gestes de la palette posent les corps, et un contour en L demande d abord la forme', () => {
    const o = maison();
    for (const id of ['corps:aile', 'corps:retour', 'corps:biaise']) { expect(raisonIndisponible(o, id)).toBeNull(); expect(appliquerPiece(o, id)).toBe(true); }
    expect(o.batiment?.corpsToit).toHaveLength(4);
    expect(o.batiment?.toitFige).toBe(true);
    const enL = { ...maison(), pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 8 }, { x: 0, y: 8 }] } as unknown as ObjetPlan;
    expect(raisonIndisponible(enL, 'corps:aile')).toMatch(/forme du toit/);
  });
});

describe('les corps dans le plan', () => {
  it('liste les corps quand il y en a plusieurs, le principal d abord', () => {
    const o = maison();
    appliquerPiece(o, 'corps:aile');
    const l = listerElements(o.batiment!.corpsToit!).filter((e) => e.cible.type === 'corps');
    expect(l.map((e) => e.libelle)).toEqual(['Corps principal', 'Corps 2']);
    expect(rangPrincipal(o.batiment!.corpsToit!)).toBe(0);
  });

  it('deplace, tourne et etire un corps sans toucher aux autres, et ce qui est pose dessus suit', () => {
    const h = hote(), aile = corpsNeuf(h, 'aile', [h])!;
    const bow = corpsDeSaillie(aile, { genre: 'bow-window', hote: 1, mur: 0, centreM: 2.5, largeurM: 2, profondeurM: 0.8, forme: 'rectangle', niveau: 'rdc', toit: 'pan' });
    const corps = [h, aile, bow];
    const d = deplacerCorps(corps, 1, 2, 1);
    expect(d[0]).toBe(corps[0]);
    expect(d[1]!.pts[0]!.x).toBeCloseTo(aile.pts[0]!.x + 2, 1);
    // Le bow suit : son rectangle a bouge avec son hote.
    expect(d[2]!.pts[0]!.x).toBeCloseTo(bow.pts[0]!.x + 2, 0);
    const t = tournerCorps(corps, 1, 90);
    expect(aire(t[1]!)).toBeCloseTo(aire(aile), 1);
    expect(t[1]!.pts[0]).not.toEqual(aile.pts[0]);
    // Etirer : le bout s = L (mur 1) ou le cote t = W (mur 2) avance, l'autre reste (facade/modeToit/pousserMur.ts).
    const e = pousserLeMur(corps, 1, 1, 2).corps;
    expect(repere(e[1]!.pts).L).toBeCloseTo(7, 1);
    expect(repere(pousserLeMur(corps, 1, 1, -50).corps[1]!.pts).L).toBeCloseTo(2.5, 1);
    expect(repere(pousserLeMur(corps, 1, 2, 1).corps[1]!.pts).W).toBeCloseTo(4, 1);
  });

  it('retire un corps et ce qui est pose dessus, jamais le principal', () => {
    const h = hote(), aile = corpsNeuf(h, 'aile', [h])!;
    const bow = corpsDeSaillie(aile, { genre: 'bow-window', hote: 1, mur: 0, centreM: 2.5, largeurM: 2, profondeurM: 0.8, forme: 'rectangle', niveau: 'rdc', toit: 'pan' });
    const corps = [h, aile, bow];
    expect(supprimerCorps(corps, 0)).toHaveLength(3);
    const sans = supprimerCorps(corps, 1);
    expect(sans).toHaveLength(1);
    expect(rangsDeCorps(sans)).toEqual([0]);
  });

  it('met le faitage dans le sens de la longueur, tout seul, quand rien n y fait obstacle', () => {
    const c = { ...hote(), pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 8 }, { x: 0, y: 8 }], posFaitage: 4, faitage: 6 };
    const r = orienterFaitage([c], 0)[0]!;
    const rep = repere(r.pts);
    expect(rep.L).toBeCloseTo(8, 1);
    expect(r.posFaitage).toBeCloseTo(2, 1);
    // Un pignon ou un appentis garde son sens.
    expect(orienterFaitage([{ ...c, pignons: [{ pan: 0, debut: 0, fin: 3, faitage: 6, profondeur: 2 }] }], 0)[0]!.pts).toEqual(c.pts);
    expect(orienterFaitage([{ ...c, posFaitage: 0 }], 0)[0]!.pts).toEqual(c.pts);
  });
});

describe('le faitage ne tourne pas en silence quand on tire un mur (audit du Mode Toit, 9 novembre 2026)', () => {
  const deuxPans = (x0: number, x1: number, y1 = 7, plus: Partial<CorpsToit> = {}): CorpsToit =>
    ({ pts: [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], posFaitage: y1 / 2, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0, ...plus });
  const axe = (c: CorpsToit) => { const r = repere(c.pts); return Math.abs(r.u.x) > 0.9 ? 'x' : 'y'; };

  it('un corps coupe en deux reste un toit continu quand son mur commun glisse', () => {
    // Un deux-pans de 12 x 7 m coupe a x = 1 : le mur commun recule de 1 m, la premiere moitie (6 x 7 m) devient plus large que longue.
    const corps = [deuxPans(-6, 1), deuxPans(1, 6)];
    const r = glisser(corps, { type: 'corps', rang: 0, i: 0 }, 'mur1', { long: -1, prof: 0, vert: 0 }).corps;
    expect(Math.max(...r[0]!.pts.map((p) => p.x))).toBeCloseTo(0, 5);
    expect(axe(r[0]!)).toBe('x');
    expect(axe(r[1]!)).toBe('x');
  });

  it('un corps qui touche un autre corps, ou que la personne a mis dans la largeur, garde son sens', () => {
    const aile = deuxPans(10, 14, 4);
    // Etire de 4 a 8 m de large : seul, il tournerait ; contre l'aile, non.
    const seul = deuxPans(0, 6, 4);
    expect(axe(orienterFaitage([deuxPans(0, 6, 8)], 0, [seul])[0]!)).toBe('y');
    expect(axe(orienterFaitage([deuxPans(0, 10, 14), aile], 0, [deuxPans(0, 10, 4), aile])[0]!)).toBe('x');
    // Mis dans la largeur avant le geste (10 x 6, faitage le long de y, sur 6 m) : un mur tire ne le remet pas dans la longueur.
    const court: CorpsToit = { ...deuxPans(0, 10, 6), pts: [{ x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }, { x: 0, y: 0 }], posFaitage: 5 };
    const r = glisser([court], { type: 'corps', rang: 0, i: 0 }, 'mur0', { long: 0, prof: 0.5, vert: 0 }).corps[0]!;
    expect(axe(r)).toBe('y');
  });

  it('un quatre-pans qui tourne seul garde ses croupes, a la meme part du faitage', () => {
    const c: CorpsToit = { ...deuxPans(0, 10, 8), croupes: [3, 3] };
    const r = glisser([c], { type: 'corps', rang: 0, i: 0 }, 'mur2', { long: 0, prof: -4, vert: 0 }).corps[0]!;
    expect(repere(r.pts).L).toBeCloseTo(12, 5);
    expect(r.croupes).toEqual([3.6, 3.6]);
  });
});
