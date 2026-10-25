import { describe, it, expect } from 'vitest';
import { corpsNeuf, deplacerCorps, etirerCorps, orienterFaitage, rangPrincipal, rangsDeCorps, supprimerCorps, tournerCorps } from '../../../../src/facade/modeToit/corpsNeufs.js';
import { corpsDeSaillie } from '../../../../src/facade/modeToit/saillies.js';
import { appliquerPiece, raisonIndisponible } from '../../../../src/three/gestesToits.js';
import { listerElements } from '../../../../src/facade/modeToit/elements.js';
import { repere } from '../../../../src/facade/toits/toitCorps.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';

const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
const hote = (): CorpsToit => ({ pts: rect, posFaitage: 3, faitage: 7, egouts: [3.5, 3.5], pignons: [], ecart: 0 });
const maison = (): ObjetPlan => ({ key: 'b', type: 'polygon', fonction: 'batiment', elevation: 3, pts: rect, toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' } } as unknown as ObjetPlan);
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
    expect(o.corpsToit).toHaveLength(4);
    expect(o.toitFige).toBe(true);
    const enL = { ...maison(), pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 8 }, { x: 0, y: 8 }] } as unknown as ObjetPlan;
    expect(raisonIndisponible(enL, 'corps:aile')).toMatch(/forme du toit/);
  });
});

describe('les corps dans le plan', () => {
  it('liste les corps quand il y en a plusieurs, le principal d abord', () => {
    const o = maison();
    appliquerPiece(o, 'corps:aile');
    const l = listerElements(o.corpsToit!).filter((e) => e.cible.type === 'corps');
    expect(l.map((e) => e.libelle)).toEqual(['Corps principal', 'Corps 2']);
    expect(rangPrincipal(o.corpsToit!)).toBe(0);
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
    const e = etirerCorps(corps, 1, 'L', 2);
    expect(repere(e[1]!.pts).L).toBeCloseTo(7, 1);
    expect(repere(etirerCorps(corps, 1, 'L', -50)[1]!.pts).L).toBeCloseTo(2.5, 1);
    expect(repere(etirerCorps(corps, 1, 'W', 1)[1]!.pts).W).toBeCloseTo(4, 1);
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
