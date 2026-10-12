import { describe, it, expect, vi } from 'vitest';
import { zonesDeMurs, lireMursEnFond, mursALire, avancementMurs, ZONES_MUETTES_AVANT_ARRET, ECHECS_MURS_PAR_BATIMENT, VERSION_LECTURE_MURS } from '../../../src/app/mursFond.js';
import { COTE_ZONE_MURS_M, type IssueMurs } from '../../../src/render/couleurMurPhoto.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// La couleur des murs du voisinage en tache de fond (app/mursFond.ts) : par zones, de la plus proche
// a la plus loin, sans limite de distance ; chaque batiment lu porte sa lecture, ou null, et n'est
// pas relu ; un echec le laisse a relire, deux le laissent pour la seance.

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const proj = projecteurLocal(48.9, 2.13);
const photo = (couleur: string) => ({ couleur, id: 'ph', date: null, auteur: null, licence: null });

/** La parcelle du projet en (0, 0), et des batiments aux abscisses donnees, en metres. */
function plan(xs: number[]): ObjetPlan[] {
  const objets = [{ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: rect(0, 0, 20, 20) }] as unknown as ObjetPlan[];
  xs.forEach((x, k) => objets.push({ key: 'b' + k, fonction: 'batiment', type: 'polygon', pts: rect(x, 2, 8, 6), elevation: 6 } as unknown as ObjetPlan));
  return objets;
}

describe('les zones de murs', () => {
  it('range les batiments a lire par zone, de la plus proche a la plus loin, sans limite de distance', () => {
    const objets = plan([2, 5, 3 * COTE_ZONE_MURS_M + 1, 40 * COTE_ZONE_MURS_M, COTE_ZONE_MURS_M + 1]);
    expect(zonesDeMurs(objets)).toEqual([['b0', 'b1'], ['b4'], ['b2'], ['b3']]);
    // Deja lu (une lecture, ou rien de concluant) : pas relu ; refuse : laisse de cote.
    Object.assign(objets[2]!, { couleurMurs: { photo: null, lecture: VERSION_LECTURE_MURS } });
    Object.assign(objets[5]!, { couleurMurs: { photo: photo('#D9D2C4'), source: 'materiau' } });
    expect(zonesDeMurs(objets, (o) => o.key !== 'b3')).toEqual([['b0'], ['b2']]);
    expect(mursALire(objets[1]!)).toBe(true);
    expect(mursALire(objets[2]!)).toBe(false);
    expect(avancementMurs(objets)).toEqual({ faits: 2, total: 5 });
    // Sans conclusion a une version plus ancienne (ou a l'import, sans version) : relu.
    Object.assign(objets[2]!, { couleurMurs: { photo: null } });
    expect(mursALire(objets[2]!)).toBe(true);
  });
});

describe('la lecture des murs en tache de fond', () => {
  const lecteur = (issue: (cle: string) => IssueMurs | null, appels: string[][] = []) =>
    vi.fn(async (cibles: readonly { key?: string }[]) => {
      appels.push(cibles.map((c) => c.key as string));
      return cibles.map((c) => issue(c.key as string)).filter((r): r is IssueMurs => !!r);
    });

  it('ecrit chaque lecture, ou null, zone apres zone, et dessine ce qui est ecrit', async () => {
    const objets = plan([2, 5, 2 * COTE_ZONE_MURS_M + 1]);
    Object.assign(objets[1]!, { couleurMurs: { source: 'plan' } });
    const appels: string[][] = [];
    const ecrire = vi.fn(async () => {});
    const avance = vi.fn();
    const r = await lireMursEnFond({
      objets: () => objets, proj, vivant: () => true, ecrire, avance, refus: new Map(),
      lireZone: lecteur((k) => (k === 'b1' ? { cle: k, photo: null } : { cle: k, photo: photo('#AA0000') }), appels),
    });
    expect(appels).toEqual([['b0', 'b1'], ['b2']]);
    expect(r).toEqual({ photos: 2, ecrits: 3, arret: false });
    // La source choisie a la main reste ; seule la lecture s'ecrit.
    expect(objets[1]!.couleurMurs).toEqual({ source: 'plan', photo: photo('#AA0000') });
    expect(objets[2]!.couleurMurs).toEqual({ photo: null, lecture: VERSION_LECTURE_MURS });
    expect(ecrire).toHaveBeenCalledTimes(2);
    expect(avance).toHaveBeenCalledTimes(2);
    expect(objets.filter(mursALire)).toEqual([]);
  });

  it('n ecrit pas sur un batiment deplace pendant la lecture, et compte un echec', async () => {
    const objets = plan([2, 5]);
    const refus = new Map<string, number>();
    const r = await lireMursEnFond({
      objets: () => objets, proj, vivant: () => true, ecrire: async () => {}, avance: () => {}, refus,
      lireZone: (async (cibles: readonly { key?: string }[]) => {
        (objets[1] as unknown as { pts: PtBrut[] }).pts = rect(60, 2, 8, 6);
        return cibles.map((c) => (c.key === 'b0' ? { cle: 'b0', photo: photo('#AA0000') } : { cle: c.key as string, echec: true as const }));
      }) as never,
    });
    expect(r.ecrits).toBe(0);
    expect(mursALire(objets[1]!)).toBe(true);
    expect(refus.get('b1')).toBe(1);
    // Refuse deux fois : laisse pour la seance.
    refus.set('b1', ECHECS_MURS_PAR_BATIMENT);
    expect(zonesDeMurs(objets, (o) => (refus.get(o.key) ?? 0) < ECHECS_MURS_PAR_BATIMENT)).toEqual([['b0']]);
  });

  it('s arrete quand le service de photos se tait, et des que la lecture est arretee', async () => {
    const xs = Array.from({ length: ZONES_MUETTES_AVANT_ARRET + 3 }, (_, k) => k * COTE_ZONE_MURS_M + 1);
    const appels: string[][] = [];
    const r = await lireMursEnFond({
      objets: () => plan(xs), proj, vivant: () => true, ecrire: async () => {}, avance: () => {}, refus: new Map(),
      lireZone: lecteur((k) => ({ cle: k, echec: true }), appels),
    });
    expect(r.arret).toBe(true);
    expect(appels.length).toBe(ZONES_MUETTES_AVANT_ARRET);
    let vivant = true;
    const objets = plan(xs);
    const r2 = await lireMursEnFond({
      objets: () => objets, proj, vivant: () => vivant, ecrire: async () => {}, avance: () => {}, refus: new Map(),
      lireZone: (async (c: readonly { key?: string }[]) => { vivant = false; return c.map((o) => ({ cle: o.key as string, photo: null })); }) as never,
    });
    // Arretee pendant la premiere zone : rien n'est ecrit.
    expect(r2).toEqual({ photos: 0, ecrits: 0, arret: false });
    expect(objets.filter(mursALire).length).toBe(xs.length);
  });
});
