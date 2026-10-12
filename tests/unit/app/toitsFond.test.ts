import { describe, it, expect, vi } from 'vitest';

// La couleur des toits se lit sur l'orthophoto : ici, une lecture simulee qui pose une teinte a chaque toit.
const couleursEspion = vi.hoisted(() => ({
  appels: [] as string[][],
  lire: vi.fn(async (objets: readonly { key?: string; toit?: { couleur?: string; origineCouleur?: string } | null }[]) => {
    couleursEspion.appels.push(objets.map((o) => o.key as string));
    for (const o of objets) if (o.toit) { o.toit.couleur = '#884422'; o.toit.origineCouleur = 'orthophoto'; }
    return { lus: objets.length, replis: 0 };
  })
}));
vi.mock('../../../src/render/couleurToitOrtho.js', () => ({ couleursToitsDepuisOrtho: couleursEspion.lire }));
import { creerToitsFond, batimentsALire, texteFinToitsFond, LOT_TOITS_FOND, PARALLELE_TOITS_FOND, ECHECS_PAR_BATIMENT, ECHECS_AVANT_ARRET, INTERVALLE_ENREGISTREMENT_MS, type ProgressionToits } from '../../../src/app/toitsFond.js';
import { toitsDepuisLidar, toitLu, VERSION_LECTURE_TOITS, type ObjetAToit } from '../../../src/app/toitsLidar.js';
import type { lireMursEnFond } from '../../../src/app/mursFond.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// La lecture des toits en tache de fond (app/toitsFond.ts) : une file continue, du plus proche au plus
// loin, sur des copies, dessinee par paquets ; un batiment modifie pendant la lecture n'est pas ecrase ;
// un service muet arrete.

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const bdtopo = { forme: 'deux-pans' as const, hauteur: 3, angleFaitage: 0, source: 'bdtopo' as const };

function plan(n: number): ObjetPlan[] {
  const objets = [{ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: rect(0, 0, 20, 20), cadastre: { origineLat: 48.9, origineLon: 2.13 } }] as unknown as ObjetPlan[];
  // Les murs deja lus (rien de concluant) : seuls les toits se lisent, sauf dans les tests des murs.
  for (let k = 0; k < n; k++) objets.push({ key: 'b' + k, fonction: 'batiment', type: 'polygon', pts: rect(30 + k * 10, 0, 6, 5), toit: { ...bdtopo }, couleurMurs: { photo: null } } as unknown as ObjetPlan);
  return objets;
}

/** Une lecture qui marque chaque copie lue et lui pose un toit plat ; `muet` : le service ne repond pas. */
const lecteur = (lus: string[][], muet = () => false) => vi.fn(async (_o: readonly ObjetAToit[], _p: unknown, opt?: { candidats?: readonly ObjetAToit[] }) => {
  lus.push((opt?.candidats ?? []).map((c) => c.key as string));
  if (!muet()) for (const c of opt?.candidats ?? []) { c.toitLidarLu = VERSION_LECTURE_TOITS; c.toit = { ...(c.toit?.couleur ? { couleur: c.toit.couleur } : {}), forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'lidar' }; }
  return { ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: false };
}) as unknown as typeof toitsDepuisLidar;

async function finir(fond: { enCours: () => boolean }) { for (let i = 0; i < 200 && fond.enCours(); i++) await new Promise((r) => setTimeout(r, 0)); }

describe('les toits en tache de fond', () => {
  it('lit tout, un batiment a la fois, du plus proche au plus loin, dessine par paquets, et marque chaque batiment', async () => {
    let objets = plan(30);
    const lus: string[][] = [];
    const progres: (ProgressionToits | null)[] = [];
    const apresLot = vi.fn();
    const fond = creerToitsFond({ objets: () => objets, lectureSeule: () => false, apresLot, progression: (pr) => progres.push(pr), lire: lecteur(lus), pause: async () => {}, attendre: async () => {} });
    fond.relancer();
    await finir(fond);
    expect(lus.every((l) => l.length === 1)).toBe(true);
    expect(lus.flat().slice(0, 3)).toEqual(['b0', 'b1', 'b2']);
    expect(lus.flat().sort()).toEqual(Array.from({ length: 30 }, (_, k) => 'b' + k).sort());
    // Dessine par paquets de LOT_TOITS_FOND, et le reste a la fin.
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
        // Pendant la premiere lecture (b0), l'utilisateur deplace b1, deja en cours de lecture.
        if (premier) { premier = false; const b1 = objets.find((x) => x.key === 'b1') as unknown as { pts: PtBrut[] }; b1.pts = rect(200, 0, 6, 5); }
        return r;
      }) as typeof toitsDepuisLidar
    });
    fond.relancer();
    await finir(fond);
    // b1 n'a pas recu le toit lu sur l'ancien contour ; il est relu a la passe suivante, sur le nouveau.
    expect(lus.flat()).toEqual(['b0', 'b1', 'b2', 'b1']);
    expect(objets.every((o) => o.fonction !== 'batiment' || toitLu(o))).toBe(true);
  });

  it('laisse un batiment refuse deux fois, et ne tourne pas sans fin sur un service muet', async () => {
    const objets = plan(5);
    const lus: string[][] = [];
    let muet = true;
    const progres: (ProgressionToits | null)[] = [];
    const attendre = vi.fn(async () => {});
    const fond = creerToitsFond({ objets: () => objets, lectureSeule: () => false, apresLot: () => {}, progression: (pr) => progres.push(pr), lire: lecteur(lus, () => muet), pause: async () => {}, attendre });
    fond.relancer();
    await finir(fond);
    // La couleur se lit (une passe), puis chaque forme est refusee deux fois et laissee pour la seance.
    expect(lus.length).toBe(5 * (1 + ECHECS_PAR_BATIMENT));
    expect(objets.some(toitLu)).toBe(false);
    expect(progres.at(-1)?.etat).not.toBe('enCours');
    muet = false;
    expect(fond.enCours()).toBe(false);
  });

  it('attend apres une suite de batiments muets, puis s arrete, et reprend a la demande', async () => {
    const objets = plan(LOT_TOITS_FOND * ECHECS_AVANT_ARRET + 20);
    objets.forEach((o) => { if (o.toit) o.toit.couleur = '#884422'; });
    const lus: string[][] = [];
    let muet = true;
    const progres: (ProgressionToits | null)[] = [];
    const attendre = vi.fn(async () => {});
    const fond = creerToitsFond({ objets: () => objets, lectureSeule: () => false, apresLot: () => {}, progression: (pr) => progres.push(pr), lire: lecteur(lus, () => muet), pause: async () => {}, attendre });
    fond.relancer();
    await finir(fond);
    // Deux attentes, puis l'arret a la troisieme suite muette : les derniers batiments ne sont pas demandes.
    expect(attendre).toHaveBeenCalledTimes(ECHECS_AVANT_ARRET - 1);
    expect(lus.length).toBeLessThanOrEqual(LOT_TOITS_FOND * ECHECS_AVANT_ARRET + PARALLELE_TOITS_FOND);
    expect(progres.at(-1)?.etat).toBe('arretee');
    expect(fond.enCours()).toBe(false);
    // Le service revient : « Reprendre » lit ce qui reste.
    muet = false;
    fond.relancer();
    await finir(fond);
    expect(objets.filter((o) => o.fonction === 'batiment').every(toitLu)).toBe(true);
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
    // Sans dalle LiDAR : arretee (les couleurs lues, la forme non).
    const sansLidar = plan(3);
    const sans = creerToitsFond({
      objets: () => sansLidar, lectureSeule: () => false, apresLot: () => {}, progression: (pr) => progres.push(pr), pause: async () => {}, attendre: async () => {},
      lire: (async () => ({ ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: true })) as unknown as typeof toitsDepuisLidar
    });
    sans.relancer();
    await finir(sans);
    expect(progres.at(-1)?.etat).toBe('arretee');
  });

  it('demande les dalles LiDAR une fois pour toute la passe, et les mitoyens avec', async () => {
    const objets = plan(20);
    const dalles = vi.fn(async () => true);
    const options: { mitoyens?: ReadonlySet<string> }[] = [];
    const fond = creerToitsFond({
      objets: () => objets, lectureSeule: () => false, apresLot: () => {}, progression: () => {}, pause: async () => {}, attendre: async () => {}, dalles,
      lire: (async (_o, _p, opt) => {
        options.push(opt ?? {});
        // La vraie lecture demande les dalles a chaque appel : ici aussi.
        await opt?.dalles?.([], projecteurLocal(48.9, 2.13));
        for (const c of opt?.candidats ?? []) c.toitLidarLu = VERSION_LECTURE_TOITS;
        return { ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: false };
      }) as typeof toitsDepuisLidar
    });
    fond.relancer();
    await finir(fond);
    expect(options.length).toBe(20);
    expect(dalles).toHaveBeenCalledTimes(1);
    // Sur l'emprise de tout ce qui restait a lire, pas sur le seul premier batiment.
    expect((dalles.mock.calls[0] as unknown as [PtBrut[]])[0].length).toBe(20 * 4);
    expect(new Set(options.map((o) => o.mitoyens)).size).toBe(1);
  });

  it('range les batiments a lire du plus proche au plus loin, sans ceux deja lus ni les toits saisis', () => {
    const objets = plan(4);
    // Les couleurs deja lues : seule la forme compte ici.
    objets.forEach((o) => { if (o.toit) o.toit.couleur = '#884422'; });
    (objets[1] as { toitLidarLu?: number }).toitLidarLu = VERSION_LECTURE_TOITS;
    (objets[2] as { toit?: unknown }).toit = { ...bdtopo, source: 'saisie' };
    const { eligibles, restants } = batimentsALire(objets);
    expect(eligibles).toBe(3);
    // b0 est deja lu, b1 a un toit saisi : restent b2 et b3, du plus proche au plus loin.
    expect(restants.map((o) => o.key)).toEqual(['b2', 'b3']);
  });
});

describe('la fin de la lecture et l enregistrement', () => {
  /** Un plan simule : un compteur de modifications et un indicateur « a enregistrer », comme core/historique.ts. */
  function projet() {
    const p = { modifs: 0, sale: false, enregistrements: 0 };
    return {
      p,
      modifications: () => p.modifs, sale: () => p.sale,
      marquer: () => { p.modifs++; p.sale = true; },
      enregistrer: vi.fn(async () => { p.enregistrements++; p.sale = false; return true; })
    };
  }

  it('dit le bilan cumule a la fin, et enregistre seul ce qu elle seule a modifie', async () => {
    const objets = plan(30);
    const pr = projet();
    const fin = vi.fn();
    let t = 0;
    const fond = creerToitsFond({
      objets: () => objets, lectureSeule: () => false, progression: () => {}, pause: async () => {}, attendre: async () => {},
      lire: lecteur([]), apresLot: () => { pr.marquer(); t += INTERVALLE_ENREGISTREMENT_MS / 2; },
      fin, modifications: pr.modifications, sale: pr.sale, enregistrer: pr.enregistrer, maintenant: () => t
    });
    fond.relancer();
    await finir(fond);
    await new Promise((r) => setTimeout(r, 0));
    expect(fin).toHaveBeenCalledTimes(1);
    expect(fin.mock.calls[0]![0]).toMatchObject({ lus: 30 });
    // Trois lots, l'un a mi-parcours de l'intervalle : un enregistrement en route, un a la fin.
    expect(pr.p.enregistrements).toBe(2);
    expect(pr.p.sale).toBe(false);
  });

  it('n enregistre pas quand une modification de l utilisateur attend', async () => {
    const objets = plan(30);
    const pr = projet();
    let lots = 0;
    const lire = lecteur([]);
    const fond = creerToitsFond({
      objets: () => objets, lectureSeule: () => false, progression: () => {}, pause: async () => {}, attendre: async () => {},
      // Pendant la lecture du deuxieme lot, l'utilisateur deplace un objet sans enregistrer.
      lire: (async (o, prj, opt) => { if (++lots === 2) pr.marquer(); return lire(o, prj, opt); }) as typeof toitsDepuisLidar,
      apresLot: () => { pr.marquer(); },
      modifications: pr.modifications, sale: pr.sale, enregistrer: pr.enregistrer, maintenant: () => 0
    });
    fond.relancer();
    await finir(fond);
    await new Promise((r) => setTimeout(r, 0));
    expect(pr.enregistrer).not.toHaveBeenCalled();
    expect(pr.p.sale).toBe(true);
  });

  it('ne reessaie pas seul apres un enregistrement refuse', async () => {
    const objets = plan(30);
    const pr = projet();
    pr.enregistrer.mockImplementation(async () => false);
    let t = 0;
    const fond = creerToitsFond({
      objets: () => objets, lectureSeule: () => false, progression: () => {}, pause: async () => {}, attendre: async () => {},
      lire: lecteur([]), apresLot: () => { pr.marquer(); t += INTERVALLE_ENREGISTREMENT_MS; },
      modifications: pr.modifications, sale: pr.sale, enregistrer: pr.enregistrer, maintenant: () => t
    });
    fond.relancer();
    await finir(fond);
    await new Promise((r) => setTimeout(r, 0));
    expect(pr.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('ecrit le bilan en francais', () => {
    expect(texteFinToitsFond({ ajustes: 1980, mesures: 0, corpsVoisins: 120, recales: 1, gardes: 300, sansLidar: false, lus: 2400, couleurs: 2350 }))
      .toBe('Toits du voisinage lus sur le LiDAR HD : 2\u202f400 (1\u202f980 ajustés, 120 en corps et pignons, 1 recalé, 300 gardés d’après la BD TOPO). 2\u202f350 couleurs de toit lues sur la photo aérienne.');
    expect(texteFinToitsFond({ ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: false, lus: 3, couleurs: 0 })).toBe('Toits du voisinage lus sur le LiDAR HD : 3.');
  });
});

describe('la couleur des toits', () => {
  it('lit la couleur des toits qui n en ont pas, apres leur forme, et seulement eux', async () => {
    couleursEspion.appels.length = 0;
    const objets = plan(3);
    // b0 : forme et couleur deja lues ; b1 : forme lue, couleur a lire ; b2 : tout a lire.
    Object.assign(objets[1]!, { toitLidarLu: VERSION_LECTURE_TOITS, toit: { ...bdtopo, couleur: '#aa0000', origineCouleur: 'orthophoto' } });
    Object.assign(objets[2]!, { toitLidarLu: VERSION_LECTURE_TOITS });
    const lus: string[][] = [];
    const fin = vi.fn();
    const fond = creerToitsFond({ objets: () => objets, lectureSeule: () => false, apresLot: () => {}, progression: () => {}, lire: lecteur(lus), pause: async () => {}, attendre: async () => {}, fin });
    fond.relancer();
    await finir(fond);
    expect(lus).toEqual([['b2']]);
    expect(couleursEspion.appels).toEqual([['b1'], ['b2']]);
    expect(objets.slice(1).every((o) => !!o.toit?.couleur && toitLu(o))).toBe(true);
    expect(fin.mock.calls[0]![0]).toMatchObject({ lus: 1, couleurs: 2 });
  });

  it('sans dalle LiDAR, lit encore les couleurs, et se dit arretee', async () => {
    couleursEspion.appels.length = 0;
    const objets = plan(2);
    const progres: (ProgressionToits | null)[] = [];
    const fond = creerToitsFond({
      objets: () => objets, lectureSeule: () => false, apresLot: () => {}, progression: (pr) => progres.push(pr), pause: async () => {}, attendre: async () => {},
      lire: (async () => ({ ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: true })) as unknown as typeof toitsDepuisLidar
    });
    fond.relancer();
    await finir(fond);
    expect(couleursEspion.appels.flat().sort()).toEqual(['b0', 'b1']);
    expect(progres.at(-1)?.etat).toBe('arretee');
  });
});

describe('la version de la lecture', () => {
  it('relit un batiment marque par une version plus ancienne : une regle de toit a change depuis', () => {
    const objets = plan(3);
    objets.forEach((o) => { if (o.toit) o.toit.couleur = '#884422'; });
    (objets[1] as { toitLidarLu?: number }).toitLidarLu = VERSION_LECTURE_TOITS;
    (objets[2] as { toitLidarLu?: number }).toitLidarLu = VERSION_LECTURE_TOITS - 1;
    expect(toitLu(objets[1]!)).toBe(true);
    expect(toitLu(objets[2]!)).toBe(false);
    expect(batimentsALire(objets).restants.map((o) => o.key)).toEqual(['b1', 'b2']);
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

describe('les murs apres les toits', () => {
  it('lit les murs une fois les toits lus, le dit dans la barre d etat et dans le bilan', async () => {
    const objets = plan(3);
    objets.forEach((o) => { if (o.fonction === 'batiment') delete (o as { couleurMurs?: unknown }).couleurMurs; });
    const ordre: string[] = [];
    const progres: (ProgressionToits | null)[] = [];
    const fin = vi.fn();
    const lus: string[][] = [];
    const lireForme = lecteur(lus);
    const lireMurs = vi.fn(async (c: Parameters<typeof lireMursEnFond>[0]) => {
      ordre.push('murs');
      // Les toits sont tous lus quand les murs commencent.
      expect(c.objets().filter((o) => o.fonction === 'batiment').every(toitLu)).toBe(true);
      for (const o of c.objets()) if (o.fonction === 'batiment') o.couleurMurs = { photo: { couleur: '#D9D2C4', id: 'ph', date: null, auteur: null, licence: null } };
      await c.ecrire(['b0', 'b1', 'b2']);
      c.avance();
      return { photos: 3, ecrits: 3, arret: false };
    }) as unknown as typeof lireMursEnFond;
    const apresLot = vi.fn();
    const fond = creerToitsFond({
      objets: () => objets, lectureSeule: () => false, apresLot, progression: (pr) => progres.push(pr), pause: async () => {}, attendre: async () => {}, fin, lireMurs,
      lire: (async (o, pr, opt) => { ordre.push('toit'); return lireForme(o, pr, opt); }) as typeof toitsDepuisLidar,
    });
    fond.relancer();
    await finir(fond);
    expect(ordre).toEqual(['toit', 'toit', 'toit', 'murs']);
    expect(progres.some((pr) => pr?.phase === 'murs' && pr.etat === 'enCours')).toBe(true);
    expect(progres.at(-1)?.etat).toBe('finie');
    expect(apresLot).toHaveBeenLastCalledWith(['b0', 'b1', 'b2']);
    expect(fin.mock.calls[0]![0]).toMatchObject({ lus: 3, murs: 3 });
    expect(texteFinToitsFond(fin.mock.calls[0]![0])).toContain('3 couleurs de murs lues sur les photos de rue.');
  });

  it('les photos de rue muettes : arretee, sans tourner, et Reprendre leur redonne leur chance', async () => {
    const objets = plan(2);
    objets.forEach((o) => { if (o.fonction === 'batiment') { delete (o as { couleurMurs?: unknown }).couleurMurs; (o as { toitLidarLu?: number }).toitLidarLu = VERSION_LECTURE_TOITS; o.toit!.couleur = '#884422'; } });
    const progres: (ProgressionToits | null)[] = [];
    const lireMurs = vi.fn(async () => ({ photos: 0, ecrits: 0, arret: true })) as unknown as typeof lireMursEnFond;
    const fond = creerToitsFond({ objets: () => objets, lectureSeule: () => false, apresLot: () => {}, progression: (pr) => progres.push(pr), pause: async () => {}, attendre: async () => {}, lire: lecteur([]), lireMurs });
    fond.relancer();
    await finir(fond);
    expect(lireMurs).toHaveBeenCalledTimes(1);
    expect(progres.at(-1)).toEqual({ faits: 0, total: 2, etat: 'arretee', phase: 'murs' });
    fond.relancer();
    await finir(fond);
    expect(lireMurs).toHaveBeenCalledTimes(2);
  });
});
