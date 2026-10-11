import { describe, it, expect, vi } from 'vitest';
import { creerToitsFond, batimentsALire, LOT_TOITS_FOND, ECHECS_AVANT_ARRET, type ProgressionToits } from '../../../src/app/toitsFond.js';
import { toitsDepuisLidar, toitLu, VERSION_LECTURE_TOITS, type ObjetAToit } from '../../../src/app/toitsLidar.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// La lecture des toits en tache de fond (app/toitsFond.ts) : par lots, du plus proche au plus loin,
// sur des copies ; un batiment modifie pendant la lecture n'est pas ecrase ; un service muet arrete.

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const bdtopo = { forme: 'deux-pans' as const, hauteur: 3, angleFaitage: 0, source: 'bdtopo' as const };

function plan(n: number): ObjetPlan[] {
  const objets = [{ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: rect(0, 0, 20, 20), cadastre: { origineLat: 48.9, origineLon: 2.13 } }] as unknown as ObjetPlan[];
  for (let k = 0; k < n; k++) objets.push({ key: 'b' + k, fonction: 'batiment', type: 'polygon', pts: rect(30 + k * 10, 0, 6, 5), toit: { ...bdtopo } } as unknown as ObjetPlan);
  return objets;
}

/** Une lecture qui marque chaque copie lue et lui pose un toit plat ; `muet` : le service ne repond pas. */
const lecteur = (lus: string[][], muet = () => false) => vi.fn(async (_o: readonly ObjetAToit[], _p: unknown, opt?: { candidats?: readonly ObjetAToit[] }) => {
  lus.push((opt?.candidats ?? []).map((c) => c.key as string));
  if (!muet()) for (const c of opt?.candidats ?? []) { c.toitLidarLu = VERSION_LECTURE_TOITS; c.toit = { forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'lidar' }; }
  return { ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: false };
}) as unknown as typeof toitsDepuisLidar;

async function finir(fond: { enCours: () => boolean }) { for (let i = 0; i < 200 && fond.enCours(); i++) await new Promise((r) => setTimeout(r, 0)); }

describe('les toits en tache de fond', () => {
  it('lit tout, par lots, du plus proche au plus loin, et marque chaque batiment', async () => {
    let objets = plan(30);
    const lus: string[][] = [];
    const progres: (ProgressionToits | null)[] = [];
    const apresLot = vi.fn();
    const fond = creerToitsFond({ objets: () => objets, lectureSeule: () => false, apresLot, progression: (pr) => progres.push(pr), lire: lecteur(lus), pause: async () => {}, attendre: async () => {} });
    fond.relancer();
    await finir(fond);
    expect(lus.map((l) => l.length)).toEqual([LOT_TOITS_FOND, LOT_TOITS_FOND, 30 - 2 * LOT_TOITS_FOND]);
    expect(lus[0]!.slice(0, 3)).toEqual(['b0', 'b1', 'b2']);
    expect(objets.filter((o) => o.fonction === 'batiment').every(toitLu)).toBe(true);
    expect(objets.find((o) => o.key === 'b5')?.toit?.source).toBe('lidar');
    expect(apresLot).toHaveBeenCalledTimes(3);
    expect(progres.at(-1)).toEqual({ faits: 30, total: 30, etat: 'finie' });
    // Rien a relire ensuite : une relance ne lit rien.
    lus.length = 0;
    fond.relancer();
    await finir(fond);
    expect(lus).toEqual([]);
    objets = [];
  });

  it('n ecrase pas un batiment modifie pendant la lecture : il reste a lire', async () => {
    const objets = plan(3);
    const lus: string[][] = [];
    const lire = lecteur(lus);
    let premier = true;
    const fond = creerToitsFond({
      objets: () => objets, lectureSeule: () => false, apresLot: () => {}, progression: () => {}, pause: async () => {}, attendre: async () => {},
      lire: (async (o, pr, opt) => {
        const r = await lire(o, pr, opt);
        // Pendant le premier lot, l'utilisateur deplace b1.
        if (premier) { premier = false; const b1 = objets.find((x) => x.key === 'b1') as unknown as { pts: PtBrut[] }; b1.pts = rect(200, 0, 6, 5); }
        return r;
      }) as typeof toitsDepuisLidar
    });
    fond.relancer();
    await finir(fond);
    // b1 n'a pas recu le toit lu sur l'ancien contour ; il est relu au lot suivant, sur le nouveau.
    expect(lus).toEqual([['b0', 'b1', 'b2'], ['b1']]);
    expect(objets.every((o) => o.fonction !== 'batiment' || toitLu(o))).toBe(true);
  });

  it('s arrete apres quelques lots muets, et reprend a la demande', async () => {
    const objets = plan(5);
    const lus: string[][] = [];
    let muet = true;
    const progres: (ProgressionToits | null)[] = [];
    const attendre = vi.fn(async () => {});
    const fond = creerToitsFond({ objets: () => objets, lectureSeule: () => false, apresLot: () => {}, progression: (pr) => progres.push(pr), lire: lecteur(lus, () => muet), pause: async () => {}, attendre });
    fond.relancer();
    await finir(fond);
    // Un batiment refuse deux fois est laisse pour la seance : le deuxieme lot muet vide la file.
    expect(lus.length).toBeLessThanOrEqual(ECHECS_AVANT_ARRET);
    expect(objets.some(toitLu)).toBe(false);
    expect(progres.at(-1)?.etat).not.toBe('enCours');
    muet = false;
    expect(fond.enCours()).toBe(false);
  });

  it('se met en pause, ne demarre pas en lecture seule, et s arrete sans dalle LiDAR', async () => {
    const objets = plan(30);
    const lus: string[][] = [];
    const progres: (ProgressionToits | null)[] = [];
    const lent = creerToitsFond({ objets: () => objets, lectureSeule: () => false, apresLot: () => {}, progression: (pr) => progres.push(pr), lire: lecteur(lus), pause: async () => {}, attendre: async () => {} });
    lent.relancer();
    lent.arreter();
    await new Promise((r) => setTimeout(r, 0));
    expect(lent.enCours()).toBe(false);
    expect(progres.at(-1)?.etat).toBe('pause');
    // En lecture seule, rien ne part.
    const ro = creerToitsFond({ objets: () => plan(3), lectureSeule: () => true, apresLot: () => {}, progression: () => {}, lire: lecteur(lus) });
    ro.relancer();
    expect(ro.enCours()).toBe(false);
    // Sans dalle LiDAR : arretee.
    const sans = creerToitsFond({
      objets: () => plan(3), lectureSeule: () => false, apresLot: () => {}, progression: (pr) => progres.push(pr), pause: async () => {}, attendre: async () => {},
      lire: (async () => ({ ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: true })) as unknown as typeof toitsDepuisLidar
    });
    sans.relancer();
    await finir(sans);
    expect(progres.at(-1)?.etat).toBe('arretee');
  });

  it('range les batiments a lire du plus proche au plus loin, sans ceux deja lus ni les toits saisis', () => {
    const objets = plan(4);
    (objets[1] as { toitLidarLu?: number }).toitLidarLu = VERSION_LECTURE_TOITS;
    (objets[2] as { toit?: unknown }).toit = { ...bdtopo, source: 'saisie' };
    const { eligibles, restants } = batimentsALire(objets);
    expect(eligibles).toBe(3);
    // b0 est deja lu, b1 a un toit saisi : restent b2 et b3, du plus proche au plus loin.
    expect(restants.map((o) => o.key)).toEqual(['b2', 'b3']);
  });
});

describe('le marque des batiments lus', () => {
  const proj = projecteurLocal(48.9, 2.13);
  it('marque un batiment lu, meme sans mesure dessous, mais pas quand le service ne repond pas', async () => {
    const objets: ObjetAToit[] = [{ key: 'parcelle', fonction: 'terrain', pts: rect(0, 0, 20, 20) }, { key: 'a', fonction: 'batiment', pts: rect(30, 0, 6, 5), toit: { ...bdtopo } }, { key: 'b', fonction: 'batiment', pts: rect(50, 0, 6, 5), toit: { ...bdtopo } }];
    const lire = vi.fn(async (pts: readonly PtBrut[]) => { if (pts[0]!.x === 50) throw new Error('muet'); return []; });
    await toitsDepuisLidar(objets, proj, { lire, dalles: async () => true });
    expect(objets[1]!.toitLidarLu).toBe(VERSION_LECTURE_TOITS);
    expect(objets[2]!.toitLidarLu).toBeUndefined();
  });

  it('lit les candidats donnes, dans leur ordre, au lieu des plus proches', async () => {
    const objets: ObjetAToit[] = [{ key: 'parcelle', fonction: 'terrain', pts: rect(0, 0, 20, 20) }];
    for (let k = 0; k < 5; k++) objets.push({ key: 'b' + k, fonction: 'batiment', pts: rect(30 + k * 10, 0, 6, 5), toit: { ...bdtopo } });
    const lus: number[] = [];
    const lire = vi.fn(async (pts: readonly PtBrut[]) => { lus.push(pts[0]!.x); return []; });
    await toitsDepuisLidar(objets, proj, { lire, dalles: async () => true, candidats: [objets[5]!, objets[4]!], enParallele: 1 });
    expect(lus).toEqual([70, 60]);
  });
});
