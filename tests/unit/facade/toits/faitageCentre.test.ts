import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reconstruireCorps, creteMesuree, egoutsMesures, hautMesure, toitDehors, toitSymetrique, estAsymetrique, sansPreuveDAsymetrie, symetriqueSaufPreuve, ecartAuCorps } from '../../../../src/facade/toits/toitCorps.js';
import { repere, type Mesure } from '../../../../src/facade/toits/toitCorps/ajustement.js';
import { toitMesureDepuisGrille } from '../../../../src/model/toitMesure.js';
import { SEUILS_TOITS as S } from '../../../../src/regles/toits/reglages.js';
import type { GrilleRelief } from '../../../../src/model/relief.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../../src/model/types.js';

// Un toit est symetrique sauf preuve du contraire, et son faitage est le haut du toit (MD/spec-toit-ign.md §13.9 ; le proprietaire,
// 27 novembre 2026 : « je vois beaucoup de toits ou le faitage n'est pas centre » ; « la forme du toit est de la meme hauteur a
// gauche et a droite, et faitage centre »). Sur des releves reels du Vesinet et d'Hardencourt-Cocherel, et sur des toits de
// synthese ou la reponse est connue.

interface Releve { contour: PtBrut[]; grille: GrilleRelief }
const releve = (nom: string): Releve => JSON.parse(readFileSync(new URL(`../../../fixtures/toits/${nom}.json`, import.meta.url), 'utf8'));
const corpsDe = (nom: string, coupes: boolean): CorpsToit[] => {
  const r = releve(nom);
  return reconstruireCorps(toitMesureDepuisGrille(r.grille, r.contour) as ToitMesure, r.contour, { grille: r.grille, coupes }) ?? [];
};
const largeur = (c: CorpsToit): number => repere(c.pts).W;
const horsAxe = (c: CorpsToit): number => Math.abs(c.posFaitage - largeur(c) / 2);

describe('un toit est symetrique sauf preuve du contraire, son faitage au haut du toit', () => {
  it('Le Vesinet 229075 : un quatre-pans, que le modele ecrasait a 5,4 m contre un mur avec le vrai toit pour pignon', () => {
    // Avant : faitage a 5,4 m, a 2,65 m de l'axe, un « pignon » qui portait le toit ; le haut mesure est a 7,5 m.
    const [c, ...autres] = corpsDe('vesinet-229075', true);
    expect(autres).toHaveLength(0);
    expect(c?.croupes?.every((h) => h > 3)).toBe(true);
    expect(c?.pignons).toHaveLength(0);
    expect(horsAxe(c as CorpsToit)).toBeLessThan(0.01);
    expect(c?.faitage).toBeGreaterThan(7.5);
    expect(c?.egouts[0]).toBe(c?.egouts[1]);
  });

  it('Le Vesinet 228957 : un pavillon dont le faitage etait a 1,5 m d un mur, un metre sous le haut du toit', () => {
    // Avant : faitage a 6,7 m, a 2,79 m de l'axe, pour un haut mesure a 7,8 m.
    const [c] = corpsDe('vesinet-228957', false);
    expect(horsAxe(c as CorpsToit)).toBeLessThan(0.01);
    expect(c?.faitage).toBeGreaterThanOrEqual(7.7);
    expect(c?.egouts[0]).toBe(c?.egouts[1]);
  });

  it('Le Vesinet 228945 : des pans lus hors de l axe la ou le toit continue chez le voisin - un toit symetrique dont on ne voit qu un morceau', () => {
    // Avant : deux corps au faitage a 1,1 et 1,2 m de l'axe, egouts a 5,9 et 7,9 m. Au-dela du mur de l'egout haut, la grille voit
    // encore du bati sur 86 % de la longueur : ce mur n'est pas le bord du toit.
    for (const c of corpsDe('vesinet-228945', false)) expect(estAsymetrique(c) && c.posFaitage > 0.01 && c.posFaitage < largeur(c) - 0.01).toBe(false);
  });

  it('Hardencourt 6501004 : la longere, faitage dans l axe et meme egout des deux cotes (« centre dans la realite »)', () => {
    // Avant : faitage a 3,71 m sur 5,7 (86 cm hors de l'axe) entre deux egouts de 4,5 et 5 m : le contour de la BD TOPO est trace
    // 70 cm a cote du toit, ce que le proprietaire a dit en voyant la carte des hauteurs.
    const [c] = corpsDe('hardencourt-6501004', true);
    expect(horsAxe(c as CorpsToit)).toBeLessThan(0.01);
    expect(c?.egouts[0]).toBe(c?.egouts[1]);
    expect(c?.faitage).toBeGreaterThan(6.2);
  });

  it('Hardencourt 6501003 : le petit corps au bout de la longere, symetrique lui aussi', () => {
    const [c] = corpsDe('hardencourt-6501003', true);
    expect(horsAxe(c as CorpsToit)).toBeLessThan(0.01);
    expect(c?.egouts[0]).toBe(c?.egouts[1]);
  });
});

// Un toit de synthese sur un rectangle de 10 x 8 m : deux pans droits, faitage en `p`, egouts `e0` et `e1`, a pas de 50 cm.
const RECT: PtBrut[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -8 }, { x: 0, y: -8 }];
function toit(p: number, F: number, e0: number, e1: number): ToitMesure {
  const pas = 0.5, nx = 24, ny = 22, x0 = -1, y0 = 1, z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = x0 + i * pas, t = -(y0 - j * pas);
    if (s < 0 || s > 10 || t < 0 || t > 8) { z.push(null); continue; }
    z.push(t <= p ? (p > 0 ? e0 + ((F - e0) * t) / p : F) : e1 + ((F - e1) * (8 - t)) / (8 - p));
  }
  return { pas, x0, y0, nx, ny, z, egout: Math.min(e0, e1), faite: F } as ToitMesure;
}
const mesures = (m: ToitMesure): Mesure[] => {
  const out: Mesure[] = [];
  for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) { const z = m.z[j * m.nx + i]; if (z !== null && z !== undefined) out.push({ s: m.x0 + i * m.pas, t: -(m.y0 - j * m.pas), z }); }
  return out;
};
const corps = (p: number, F: number, e0: number, e1: number): CorpsToit => ({ pts: RECT, posFaitage: p, faitage: F, egouts: [e0, e1], pignons: [], ecart: 0 });
// La meme mesure, avec du bati (6 m) au-dela du mur t = 8 : le toit continue chez le voisin.
const avecVoisin = (m: ToitMesure): ToitMesure => ({ ...m, z: m.z.map((z, k) => { const j = Math.floor(k / m.nx), t = -(m.y0 - j * m.pas); return z === null && t > 8 ? 6 : z; }) });

describe('ce que la mesure dit d un toit', () => {
  it('la crete passe ou le toit est le plus haut, sans dispersion sur un toit net', () => {
    const c = creteMesuree(mesures(toit(4, 7, 4, 4)), 0.5);
    expect(c?.t).toBeCloseTo(4, 1);
    expect(c?.dispersion).toBeLessThan(0.1);
    expect(c?.profils).toBeGreaterThanOrEqual(S.CRETE_PROFILS_MIN);
    expect(creteMesuree(mesures(toit(6, 7, 3, 5.67)), 0.5)?.t).toBeCloseTo(6, 1);
    // Un toit plat : aucun profil n'a de relief.
    expect(creteMesuree(mesures(toit(4, 5, 4.9, 4.9)), 0.5)).toBe(null);
  });

  it('la difference des egouts se lit le long des deux murs, profil par profil', () => {
    const egal = egoutsMesures(mesures(toit(4, 7, 4, 4)), 8, 0.5);
    expect(Math.abs(egal?.difference ?? 9)).toBeLessThan(0.1);
    const haut = egoutsMesures(mesures(toit(6, 7, 3, 5.67)), 8, 0.5);
    expect(haut?.difference).toBeGreaterThan(2);
    expect(haut?.accord).toBe(1);
  });

  it('le haut mesure est le 95e centile : le faitage, pas une cheminee', () => {
    const m = toit(4, 7, 4, 4);
    m.z[5 * m.nx + 10] = 12;
    expect(hautMesure(mesures(m))).toBeLessThan(7.1);
    expect(hautMesure(mesures(m))).toBeGreaterThan(6.4);
  });

  it('au-dela d un mur de facade, la grille voit le sol ; au-dela d un mur mitoyen, le toit du voisin', () => {
    const m = toit(6, 7, 3, 5.67), r = repere(RECT);
    expect(toitDehors(m, r, 1)).toBe(0);
    expect(toitDehors(avecVoisin(m), r, 1)).toBe(1);
    expect(toitDehors(null, r, 1)).toBe(null);
  });
});

describe('symetrique sauf preuve du contraire', () => {
  const ecartDe = (m: ToitMesure) => (x: CorpsToit) => ecartAuCorps(m, x, RECT);

  it('le toit symetrique : faitage au milieu, le meme egout des deux cotes', () => {
    const s = toitSymetrique(toit(4, 7, 4, 4), RECT, RECT);
    expect(s?.posFaitage).toBeCloseTo(4, 2);
    expect(s?.egouts[0]).toBe(s?.egouts[1]);
    expect(s?.faitage).toBeCloseTo(7, 1);
  });

  it('un toit symetrique lu avec un faitage pousse d un metre et deux egouts revient a la symetrie', () => {
    const m = toit(4, 7, 4, 4);
    const c = symetriqueSaufPreuve(m, RECT, corps(5, 6.6, 4.2, 3.6), null, ecartDe(m));
    expect(c?.posFaitage).toBeCloseTo(4, 2);
    expect(c?.egouts[0]).toBe(c?.egouts[1]);
    expect(c?.faitage).toBeCloseTo(7, 1);
  });

  it('des egouts lus a 60 cm l un de l autre sous un faitage centre : le meme egout', () => {
    const m = toit(4, 7, 4, 4);
    const c = symetriqueSaufPreuve(m, RECT, corps(4, 7, 4.3, 3.7), null, ecartDe(m));
    expect(c?.egouts[0]).toBe(c?.egouts[1]);
  });

  it('un vrai toit asymetrique est prouve : il colle nettement mieux, sa crete et ses egouts se lisent tout le long, son mur haut est une facade', () => {
    const m = toit(6, 7, 3, 5.67), lu = corps(6, 7, 3, 5.7);
    expect(sansPreuveDAsymetrie(lu, mesures(m), 0.5, m, true)).toBe(null);
    expect(symetriqueSaufPreuve(m, RECT, lu, null, ecartDe(m), m)).toBe(lu);
  });

  it('le meme toit, quand il continue au-dela du mur de son egout haut, n est pas asymetrique : on n en voit qu un morceau', () => {
    // Un toit de 10 m de large dont le contour ne couvre que 8 m : faitage lu a 5 m, le mur t = 8 coupe le pan a 4,6 m.
    const m = toit(5, 7, 3, 4.6), lu = corps(5, 7, 3, 4.6), g = avecVoisin(m);
    expect(sansPreuveDAsymetrie(lu, mesures(m), 0.5, m, true)).toBe(null);
    expect(sansPreuveDAsymetrie(lu, mesures(m), 0.5, g, true)).toMatch(/continue au-dela du mur/);
    const c = symetriqueSaufPreuve(m, RECT, lu, null, ecartDe(m), g);
    expect(c?.posFaitage).toBeCloseTo(4, 2);
    expect(c?.egouts[0]).toBe(c?.egouts[1]);
  });

  it('chaque piece de la preuve manque a son tour, et se dit', () => {
    const m = toit(6, 7, 3, 5.67);
    expect(sansPreuveDAsymetrie(corps(6, 7, 3, 5.7), mesures(m), 0.5, m, false)).toMatch(/nettement mieux/);
    expect(sansPreuveDAsymetrie(corps(2, 7, 3, 5.7), mesures(m), 0.5, m, true)).toMatch(/crete se lit ailleurs/);
    expect(sansPreuveDAsymetrie(corps(6, 7, 4, 4.5), mesures(m), 0.5, m, true)).toMatch(/ne different pas assez/);
    expect(sansPreuveDAsymetrie(corps(6, 7, 5.7, 3), mesures(m), 0.5, m, true)).toMatch(/ne se lit pas le long des murs/);
  });

  it('un toit a un pan reste un pan : il colle nettement mieux que le toit symetrique', () => {
    const m = toit(8, 7, 3, 7), pan = corps(8, 7, 3, 7);
    expect(estAsymetrique(pan)).toBe(true);
    expect(symetriqueSaufPreuve(m, RECT, pan, null, ecartDe(m))).toBe(pan);
  });

  it('un pan lu sur un toit a deux pans symetrique n en est pas un', () => {
    const m = toit(4, 7, 4, 4);
    const c = symetriqueSaufPreuve(m, RECT, corps(8, 6, 4, 6), null, ecartDe(m));
    expect(c?.posFaitage).toBeCloseTo(4, 2);
  });

  it('un toit ecrase sous le haut mesure est releve par celui qui l atteint en collant mieux', () => {
    const m = toit(4, 8, 4, 4);
    const c = symetriqueSaufPreuve(m, RECT, corps(4, 5.5, 4, 4), corps(4, 8, 4, 4), ecartDe(m));
    expect(c?.faitage).toBeGreaterThanOrEqual(7.9);
  });

  it('un toit plat, un toit symetrique a sa hauteur ne sont pas touches', () => {
    const m = toit(4, 7, 4, 4);
    const juste = corps(4, 7, 4, 4), plat = corps(4, 4.1, 4, 4);
    expect(estAsymetrique(juste)).toBe(false);
    expect(symetriqueSaufPreuve(m, RECT, juste, null, ecartDe(m))).toBe(juste);
    expect(symetriqueSaufPreuve(m, RECT, plat, null, ecartDe(m))).toBe(plat);
    expect(symetriqueSaufPreuve(m, RECT, null, null, ecartDe(m))).toBe(null);
  });
});
