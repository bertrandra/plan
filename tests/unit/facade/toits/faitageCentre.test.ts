import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reconstruireCorps, creteMesuree, hautMesure, pentesEgales, centreSaufPreuve, ecartAuCorps } from '../../../../src/facade/toits/toitCorps.js';
import { repere, type Mesure } from '../../../../src/facade/toits/toitCorps/ajustement.js';
import { toitMesureDepuisGrille } from '../../../../src/model/toitMesure.js';
import { SEUILS_TOITS as S } from '../../../../src/regles/toits/reglages.js';
import type { GrilleRelief } from '../../../../src/model/relief.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../../src/model/types.js';

// Le faitage est le haut du toit, et il est au milieu sauf preuve du contraire (MD/spec-toit-ign.md §13.9 ; retour du proprietaire,
// 27 novembre 2026 : « je vois beaucoup de toits ou le faitage n'est pas centre »). Sur des releves reels du Vesinet et
// d'Hardencourt-Cocherel, et sur des toits de synthese ou la reponse est connue.

interface Releve { contour: PtBrut[]; grille: GrilleRelief }
const releve = (nom: string): Releve => JSON.parse(readFileSync(new URL(`../../../fixtures/toits/${nom}.json`, import.meta.url), 'utf8'));
const corpsDe = (nom: string, coupes: boolean): CorpsToit[] => {
  const r = releve(nom);
  return reconstruireCorps(toitMesureDepuisGrille(r.grille, r.contour) as ToitMesure, r.contour, { grille: r.grille, coupes }) ?? [];
};
const largeur = (c: CorpsToit): number => repere(c.pts).W;
const horsAxe = (c: CorpsToit): number => Math.abs(c.posFaitage - largeur(c) / 2);

describe('le faitage est le haut du toit, au milieu sauf preuve du contraire', () => {
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
    expect(Math.abs((c?.egouts[0] ?? 0) - (c?.egouts[1] ?? 9))).toBeLessThan(0.3);
  });

  it('Le Vesinet 228945 : un vrai toit asymetrique reste hors de l axe - la crete s y lit, les pentes sont egales, le grand pan descend plus bas', () => {
    const corps = corpsDe('vesinet-228945', false);
    const asymetriques = corps.filter((c) => horsAxe(c) >= S.DECENTRAGE_MIN_M && c.posFaitage > 0.01 && c.posFaitage < largeur(c) - 0.01);
    expect(asymetriques.length).toBeGreaterThanOrEqual(2);
    for (const c of asymetriques) {
      expect(pentesEgales(c, largeur(c))).toBe(true);
      // Le grand pan est celui dont l'egout est le plus bas.
      const grand = c.posFaitage > largeur(c) / 2 ? 0 : 1;
      expect(c.egouts[grand]).toBeLessThan(c.egouts[1 - grand] as number);
    }
  });

  it('Hardencourt 6501004 : la longere garde ses pignons de facade, son faitage revient dans l axe (« centre dans la realite »)', () => {
    // Avant : faitage a 3,71 m sur 5,7 (86 cm hors de l'axe) entre deux egouts de 4,5 et 5 m : le contour de la BD TOPO est trace
    // 70 cm a cote du toit, ce que le proprietaire a dit en voyant la carte des hauteurs.
    const [c] = corpsDe('hardencourt-6501004', true);
    expect(horsAxe(c as CorpsToit)).toBeLessThan(0.01);
    expect(c?.pignons.length).toBeGreaterThanOrEqual(3);
    expect(c?.faitage).toBeGreaterThan(6.2);
  });

  it('Hardencourt 6501003 : le petit corps au bout de la longere, faitage au milieu', () => {
    const [c] = corpsDe('hardencourt-6501003', true);
    expect(horsAxe(c as CorpsToit)).toBeLessThan(0.01);
  });
});

// Un toit de synthese sur un rectangle de 10 x 8 m : deux pans droits, faitage en `p`, egouts `e0` et `e1`, a pas de 50 cm.
const RECT: PtBrut[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -8 }, { x: 0, y: -8 }];
function toit(p: number, F: number, e0: number, e1: number, bosse?: (s: number, t: number) => number): ToitMesure {
  const pas = 0.5, nx = 24, ny = 20, x0 = -1, y0 = 1, z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = x0 + i * pas, t = -(y0 - j * pas);
    if (s < 0 || s > 10 || t < 0 || t > 8) { z.push(null); continue; }
    const pan = t <= p ? e0 + ((F - e0) * t) / p : e1 + ((F - e1) * (8 - t)) / (8 - p);
    z.push(Math.max(pan, bosse ? bosse(s, t) : 0));
  }
  return { pas, x0, y0, nx, ny, z, egout: Math.min(e0, e1), faite: F } as ToitMesure;
}
const mesures = (m: ToitMesure): Mesure[] => {
  const out: Mesure[] = [];
  for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) { const z = m.z[j * m.nx + i]; if (z !== null && z !== undefined) out.push({ s: m.x0 + i * m.pas, t: -(m.y0 - j * m.pas), z }); }
  return out;
};
const corps = (p: number, F: number, e0: number, e1: number): CorpsToit => ({ pts: RECT, posFaitage: p, faitage: F, egouts: [e0, e1], pignons: [], ecart: 0 });

describe('la crete lue sur la mesure', () => {
  it('passe ou le toit est le plus haut, sans dispersion sur un toit net', () => {
    const c = creteMesuree(mesures(toit(4, 7, 4, 4)), 0.5);
    expect(c?.t).toBeCloseTo(4, 1);
    expect(c?.dispersion).toBeLessThan(0.1);
    expect(c?.profils).toBeGreaterThanOrEqual(S.CRETE_PROFILS_MIN);
    expect(creteMesuree(mesures(toit(6, 7, 3, 5)), 0.5)?.t).toBeCloseTo(6, 1);
  });

  it('ne dit rien d un toit plat : aucun profil n a de relief', () => {
    expect(creteMesuree(mesures(toit(4, 5, 4.9, 4.9)), 0.5)).toBe(null);
  });

  it('le haut mesure est le 95e centile : le faitage, pas une cheminee', () => {
    const m = toit(4, 7, 4, 4);
    m.z[5 * m.nx + 10] = 12;
    expect(hautMesure(mesures(m))).toBeLessThan(7.1);
    expect(hautMesure(mesures(m))).toBeGreaterThan(6.4);
  });
});

describe('les pentes egales, marque d un vrai toit asymetrique', () => {
  it('un grand pan qui descend plus bas a la meme pente que le petit', () => {
    // Faitage a 6 m sur 8 : 6 m de pan jusqu'a 3 m, 2 m de pan jusqu'a 5,67 m, meme pente.
    expect(pentesEgales({ posFaitage: 6, faitage: 7, egouts: [3, 5.67] }, 8)).toBe(true);
  });
  it('un faitage hors de l axe entre deux egouts de meme hauteur n en est pas un : le contour est trace a cote', () => {
    expect(pentesEgales({ posFaitage: 6, faitage: 7, egouts: [4, 4] }, 8)).toBe(false);
  });
  it('un appentis n a qu un pan', () => {
    expect(pentesEgales({ posFaitage: 0, faitage: 7, egouts: [7, 4] }, 8)).toBe(false);
  });
});

describe('centre sauf preuve du contraire', () => {
  const ecartDe = (m: ToitMesure) => (x: CorpsToit) => ecartAuCorps(m, x, RECT);

  it('un toit symetrique lu avec un faitage pousse d un metre revient au milieu', () => {
    const m = toit(4, 7, 4, 4);
    const c = centreSaufPreuve(m, RECT, corps(5, 6.6, 4.2, 3.6), null, ecartDe(m));
    expect(c?.posFaitage).toBeCloseTo(4, 2);
    expect(c?.faitage).toBeCloseTo(7, 1);
  });

  it('un vrai toit asymetrique, bien lu, garde son faitage : crete lue, pentes egales, aucun toit centre ne colle mieux', () => {
    const m = toit(6, 7, 3, 5.67);
    const lu = corps(6, 7, 3, 5.7);
    expect(centreSaufPreuve(m, RECT, lu, null, ecartDe(m))).toBe(lu);
  });

  it('un toit ecrase sous le haut mesure est releve par celui qui l atteint en collant mieux', () => {
    const m = toit(4, 8, 4, 4);
    const ecrase = corps(4, 5.5, 4, 4);
    const formes = corps(4, 8, 4, 4);
    const c = centreSaufPreuve(m, RECT, ecrase, formes, ecartDe(m));
    expect(c?.faitage).toBeGreaterThanOrEqual(7.9);
  });

  it('un toit plat, un toit au milieu et a sa hauteur ne sont pas touches', () => {
    const m = toit(4, 7, 4, 4);
    const juste = corps(4, 7, 4, 4), plat = corps(4, 4.1, 4, 4);
    expect(centreSaufPreuve(m, RECT, juste, null, ecartDe(m))).toBe(juste);
    expect(centreSaufPreuve(m, RECT, plat, null, ecartDe(m))).toBe(plat);
    expect(centreSaufPreuve(m, RECT, null, null, ecartDe(m))).toBe(null);
  });
});
