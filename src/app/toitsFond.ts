// La lecture des toits en tache de fond (MD/roadmap-toits-fond.md, MD/spec-toit-ign.md §10).
//
// A l'import et a l'actualisation, seuls les trente batiments les plus proches sont lus sur le LiDAR
// avant que le plan s'ouvre (app/toitsLidar.ts, MAX_BATIMENTS_LIDAR). Les autres le sont ici, apres,
// par lots, du plus proche au plus loin, sans bloquer l'interface : une pause entre deux batiments
// rend la main au navigateur, et chaque lot fini se dessine.
//
// Chaque lot se lit sur des copies des batiments. Un resultat ne s'ecrit dans le plan que si le
// batiment y est encore, a l'identique (meme contour, meme toit) : un batiment que l'utilisateur a
// deplace, supprime ou dont il a saisi le toit pendant la lecture n'est pas ecrase. Les ecritures ne
// passent pas par l'historique (Ctrl+Z ne defait pas une lecture), mais marquent le projet a
// enregistrer : le marque `toitLidarLu` de chaque batiment lu evite de le relire a la reouverture.
//
// Un service muet n'use pas la file en vain : un lot dont aucun batiment ne s'est lu fait attendre
// le suivant, et apres quelques lots muets d'affilee la lecture s'arrete jusqu'a la prochaine
// ouverture (ou « Reprendre »). Sans dalle LiDAR sur le secteur, elle s'arrete tout de suite.

import { toitsDepuisLidar, toitAAjuster, toitLu, type ObjetAToit } from './toitsLidar.js';
import { projecteurLocal, type ProjecteurLocal } from '../geo/projection.js';
import { parcelleDuProjet } from '../model/fonctions.js';
import { aDesSommets } from '../model/formes.js';
import { centroid } from '../geometry/basic.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';
import type { ProgressionToits } from '../core/lectureToits.js';

/** Combien de batiments par lot : assez pour que le dessin ne se refasse pas a chaque toit. */
export const LOT_TOITS_FOND = 12;
/** Les lectures en meme temps : un peu plus qu'a l'import, le service repond vite a ces petites grilles. */
export const PARALLELE_TOITS_FOND = 6;
/** Apres un lot muet, on attend avant de redemander ; apres tant de lots muets d'affilee, on s'arrete. */
export const ATTENTE_APRES_ECHEC_MS = 30000;
export const ECHECS_AVANT_ARRET = 3;
/** Un batiment que le service refuse deux fois de suite est laisse pour cette seance : il ne bouche pas la file. */
export const ECHECS_PAR_BATIMENT = 2;

export type { ProgressionToits };

export interface ContexteToitsFond {
  /** Les objets du plan courant : relus a chaque lot (une annulation remplace le tableau). */
  objets: () => ObjetPlan[];
  /** Un plan en lecture seule n'enregistrera pas ce qu'on lirait : rien ne se lance. */
  lectureSeule: () => boolean;
  /** Un lot vient d'etre ecrit dans le plan : redessiner, marquer a enregistrer. */
  apresLot: (ecrits: number) => void;
  /** La progression, pour la barre d'etat ; null quand il n'y a rien a lire. */
  progression: (p: ProgressionToits | null) => void;
  /** La lecture d'un lot (app/toitsLidar.ts) ; remplacable dans les tests, qui ne touchent pas le reseau. */
  lire?: typeof toitsDepuisLidar;
  /** Rend la main au navigateur entre deux batiments ; remplacable dans les tests. */
  pause?: () => Promise<void>;
  /** L'attente apres un lot muet ; remplacable dans les tests. */
  attendre?: (ms: number) => Promise<void>;
}

/** Le projecteur du plan : son origine est le calage cadastral de la parcelle du projet (app/importCadastre.ts). */
function projecteurDuProjet(objets: ObjetPlan[]): ProjecteurLocal | null {
  const cad = parcelleDuProjet(objets)?.cadastre;
  return typeof cad?.origineLat === 'number' && typeof cad.origineLon === 'number' ? projecteurLocal(cad.origineLat, cad.origineLon) : null;
}

/** Les batiments dont Plan choisit le toit, et ceux qui restent a lire, du plus proche au plus loin. */
export function batimentsALire(objets: ObjetPlan[]): { eligibles: number; restants: ObjetPlan[] } {
  const eligibles = objets.filter((o) => toitAAjuster(o as ObjetAToit));
  const parcelle = parcelleDuProjet(objets);
  const contour = parcelle && aDesSommets(parcelle) ? parcelle.pts : [];
  const centre: PtBrut = contour.length ? centroid(contour) : { x: 0, y: 0 };
  const d = (o: ObjetPlan) => { const c = centroid((o as ObjetAToit).pts as PtBrut[]); return Math.hypot(c.x - centre.x, c.y - centre.y); };
  const restants = eligibles.filter((o) => !toitLu(o)).map((o) => ({ o, d: d(o) })).sort((a, b) => a.d - b.d).map((x) => x.o);
  return { eligibles: eligibles.length, restants };
}

/** Ce que la lecture ecrit d'un batiment, et rien d'autre : son nom, ses couleurs choisies restent. */
const CHAMPS_LUS = ['pts', 'toit', 'elevation', 'toitMesure', 'volumesToit', 'corpsToit', 'toitACheval', 'toitLidarLu'] as const;

/** L'empreinte de ce qui, change par l'utilisateur, rend une lecture caduque. */
const empreinte = (o: ObjetPlan) => JSON.stringify([(o as ObjetAToit).pts, o.toit ?? null]);

/** Ecrit dans le plan ce que la copie a lu, si le batiment y est encore tel qu'il a ete copie. Rend vrai s'il a ete ecrit. */
function reporter(objets: ObjetPlan[], copie: ObjetPlan, avant: string): boolean {
  if (!toitLu(copie)) return false;
  const o = objets.find((x) => x.key === copie.key);
  if (!o || empreinte(o) !== avant || !toitAAjuster(o as ObjetAToit)) return false;
  const cible = o as unknown as Record<string, unknown>, source = copie as unknown as Record<string, unknown>;
  for (const k of CHAMPS_LUS) cible[k] = source[k] === undefined ? null : source[k];
  return true;
}

export interface ToitsFond {
  /** Lance la lecture si des batiments restent a lire ; sans effet si elle tourne deja. */
  relancer: () => void;
  /** Met la lecture en pause ; `relancer` la reprend. */
  arreter: () => void;
  enCours: () => boolean;
}

export function creerToitsFond(ctx: ContexteToitsFond): ToitsFond {
  const lire = ctx.lire ?? toitsDepuisLidar;
  const pause = ctx.pause ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  const attendre = ctx.attendre ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // Une generation par lancement : un arret, ou un autre plan ouvert, rend caduque la boucle en cours.
  let generation = 0;
  let enCours = false;
  // Les batiments que le service a refuses, et combien de fois, pour cette seance.
  const refus = new Map<string, number>();
  const aTenter = (objets: ObjetPlan[]) => batimentsALire(objets).restants.filter((o) => (refus.get(o.key) ?? 0) < ECHECS_PAR_BATIMENT);

  const dire = (etat: ProgressionToits['etat']) => {
    const { eligibles, restants } = batimentsALire(ctx.objets());
    ctx.progression(eligibles ? { faits: eligibles - restants.length, total: eligibles, etat } : null);
  };

  async function boucle(g: number): Promise<void> {
    let muets = 0;
    while (g === generation) {
      const objets = ctx.objets();
      const proj = projecteurDuProjet(objets);
      const restants = aTenter(objets);
      if (!proj || !restants.length) { enCours = false; dire('finie'); return; }
      const lot = restants.slice(0, LOT_TOITS_FOND);
      const avant = lot.map(empreinte);
      const copies = lot.map((o) => structuredClone(o));
      const bilan = await lire(objets, proj, { candidats: copies as ObjetAToit[], delaiMs: Number.POSITIVE_INFINITY, enParallele: PARALLELE_TOITS_FOND, pause }).catch(() => null);
      if (g !== generation) return;
      if (bilan?.sansLidar) { enCours = false; dire('arretee'); return; }
      // Le plan a pu changer pendant le lot (annulation, autre plan) : on ecrit dans celui d'aujourd'hui.
      const courants = ctx.objets();
      const ecrits = copies.filter((c, i) => reporter(courants, c, avant[i] as string)).length;
      // Lu sans etre ecrit (modifie entre-temps) : il reste a lire, il sera repris au lot suivant.
      const lus = copies.filter((c) => toitLu(c)).length;
      copies.forEach((c) => { if (!toitLu(c)) refus.set(c.key, (refus.get(c.key) ?? 0) + 1); });
      if (ecrits) ctx.apresLot(ecrits);
      dire('enCours');
      if (lus) { muets = 0; continue; }
      if (++muets >= ECHECS_AVANT_ARRET) { enCours = false; dire('arretee'); return; }
      await attendre(ATTENTE_APRES_ECHEC_MS);
    }
  }

  return {
    relancer() {
      if (enCours || ctx.lectureSeule()) return;
      if (!aTenter(ctx.objets()).length || !projecteurDuProjet(ctx.objets())) { dire('finie'); return; }
      enCours = true;
      const g = ++generation;
      dire('enCours');
      void boucle(g);
    },
    arreter() {
      if (!enCours) return;
      generation++;
      enCours = false;
      dire('pause');
    },
    enCours: () => enCours,
  };
}
