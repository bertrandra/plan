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

import { toitsDepuisLidar, toitAAjuster, toitLu, type ObjetAToit, type BilanToitsLidar } from './toitsLidar.js';
import { projecteurLocal, type ProjecteurLocal } from '../geo/projection.js';
import { couleursToitsDepuisOrtho } from '../render/couleurToitOrtho.js';
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
/**
 * Pendant la lecture, le projet s'enregistre seul au plus toutes ces millisecondes, et a la fin -
 * seulement si tout ce qui attend d'etre enregistre vient de la lecture : jamais une modification de
 * l'utilisateur a son insu. Sans cela, fermer le plan sans enregistrer faisait tout relire. Cinq
 * minutes : un voisinage d'un kilometre pese 9 Mo, et l'ecrire fige l'ecran une seconde (mesure).
 */
export const INTERVALLE_ENREGISTREMENT_MS = 300000;
/** Un batiment que le service refuse deux fois de suite est laisse pour cette seance : il ne bouche pas la file. */
export const ECHECS_PAR_BATIMENT = 2;

export type { ProgressionToits };

export interface ContexteToitsFond {
  /** Les objets du plan courant : relus a chaque lot (une annulation remplace le tableau). */
  objets: () => ObjetPlan[];
  /** Un plan en lecture seule n'enregistrera pas ce qu'on lirait : rien ne se lance. */
  lectureSeule: () => boolean;
  /** Un lot vient d'etre ecrit dans le plan (les cles des batiments ecrits) : redessiner, marquer a enregistrer. */
  apresLot: (cles: string[]) => void;
  /** La progression, pour la barre d'etat ; null quand il n'y a rien a lire. */
  progression: (p: ProgressionToits | null) => void;
  /** La lecture d'un lot (app/toitsLidar.ts) ; remplacable dans les tests, qui ne touchent pas le reseau. */
  lire?: typeof toitsDepuisLidar;
  /** La lecture des couleurs sur l'orthophoto (render/couleurToitOrtho.ts) ; remplacable dans les tests. */
  lireCouleurs?: typeof couleursToitsDepuisOrtho;
  /** Rend la main au navigateur entre deux batiments ; remplacable dans les tests. */
  pause?: () => Promise<void>;
  /** L'attente apres un lot muet ; remplacable dans les tests. */
  attendre?: (ms: number) => Promise<void>;
  /** La lecture est allee au bout, avec ce qu'elle a fait cette fois (cumul des lots) : le bilan, les questions. */
  fin?: (bilan: BilanFond) => void;
  /** Le compteur des modifications du projet (core/historique.ts) et son indicateur « a enregistrer ». */
  modifications?: () => number;
  sale?: () => boolean;
  /** Enregistre le projet sans bruit (app/projet.ts) ; absent : rien ne s'enregistre seul. */
  enregistrer?: () => Promise<boolean>;
  maintenant?: () => number;
}

/** Le projecteur du plan : son origine est le calage cadastral de la parcelle du projet (app/importCadastre.ts). */
function projecteurDuProjet(objets: ObjetPlan[]): ProjecteurLocal | null {
  const cad = parcelleDuProjet(objets)?.cadastre;
  return typeof cad?.origineLat === 'number' && typeof cad.origineLon === 'number' ? projecteurLocal(cad.origineLat, cad.origineLon) : null;
}

/**
 * La couleur de ce toit reste a lire sur l'orthophoto : Plan la pose avec son origine
 * (render/couleurToitOrtho.ts) ; un toit sans couleur ne l'a jamais ete - ou l'actualisation l'a effacee.
 */
export const couleurALire = (o: { toit?: { couleur?: string } | null }): boolean => !!o.toit && !o.toit.couleur;

/** La forme (LiDAR) ou la couleur (orthophoto) de ce batiment reste a lire. */
const resteALire = (o: ObjetPlan, lidar: boolean): boolean => (lidar && !toitLu(o)) || couleurALire(o);

/**
 * Les batiments dont Plan choisit le toit, et ceux qui restent a lire - forme ou couleur - du plus
 * proche au plus loin. `lidar` faux : le secteur n'a pas de dalle LiDAR, seule la couleur se lit.
 */
export function batimentsALire(objets: ObjetPlan[], lidar = true): { eligibles: number; restants: ObjetPlan[] } {
  const eligibles = objets.filter((o) => toitAAjuster(o as ObjetAToit));
  const parcelle = parcelleDuProjet(objets);
  const contour = parcelle && aDesSommets(parcelle) ? parcelle.pts : [];
  const centre: PtBrut = contour.length ? centroid(contour) : { x: 0, y: 0 };
  const d = (o: ObjetPlan) => { const c = centroid((o as ObjetAToit).pts as PtBrut[]); return Math.hypot(c.x - centre.x, c.y - centre.y); };
  const restants = eligibles.filter((o) => resteALire(o, lidar)).map((o) => ({ o, d: d(o) })).sort((a, b) => a.d - b.d).map((x) => x.o);
  return { eligibles: eligibles.length, restants };
}

/** Ce que la lecture ecrit d'un batiment, et rien d'autre : son nom, ses couleurs choisies restent. */
const CHAMPS_LUS = ['pts', 'toit', 'elevation', 'toitMesure', 'volumesToit', 'corpsToit', 'toitACheval', 'toitLidarLu'] as const;

/** L'empreinte de ce qui, change par l'utilisateur, rend une lecture caduque. */
const empreinte = (o: ObjetPlan) => JSON.stringify([(o as ObjetAToit).pts, o.toit ?? null]);

/**
 * Ecrit dans le plan ce que la copie a lu, si le batiment y est encore tel qu'il a ete copie : la
 * forme lue (et tout ce qui vient avec), ou la seule couleur quand la forme n'a pas pu se lire - sans
 * quoi ce batiment repassait a chaque lot. Rend vrai s'il a ete ecrit.
 */
function reporter(objets: ObjetPlan[], copie: ObjetPlan, avant: string): boolean {
  const forme = toitLu(copie), couleur = !!copie.toit?.couleur;
  if (!forme && !couleur) return false;
  const o = objets.find((x) => x.key === copie.key);
  if (!o || empreinte(o) !== avant || !toitAAjuster(o as ObjetAToit)) return false;
  if (forme) {
    const cible = o as unknown as Record<string, unknown>, source = copie as unknown as Record<string, unknown>;
    for (const k of CHAMPS_LUS) cible[k] = source[k] === undefined ? null : source[k];
    return true;
  }
  if (!o.toit || !couleurALire(o) || !copie.toit) return false;
  o.toit = { ...o.toit, couleur: copie.toit.couleur as string, ...(copie.toit.origineCouleur ? { origineCouleur: copie.toit.origineCouleur } : {}) };
  return true;
}

/** Ce qu'une lecture a fait, du premier lot au dernier : les formes lues sur le LiDAR, les couleurs sur la photo. */
export type BilanFond = BilanToitsLidar & { lus: number; couleurs: number };
const vide = (): BilanFond => ({ ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: false, lus: 0, couleurs: 0 });
function ajouter(c: BilanFond, b: BilanToitsLidar | null, lus: number, couleurs: number): void {
  if (b) { c.ajustes += b.ajustes; c.mesures += b.mesures; c.corpsVoisins += b.corpsVoisins; c.recales += b.recales; c.gardes += b.gardes; }
  c.lus += lus; c.couleurs += couleurs;
}

/** Le bilan de fin, pour un toast : combien de toits lus, et ce qu'ils sont devenus. */
export function texteFinToitsFond(b: BilanFond): string {
  const n = (v: number) => v.toLocaleString('fr-FR');
  const parts = [
    b.ajustes ? n(b.ajustes) + ' ajusté' + (b.ajustes > 1 ? 's' : '') : '',
    b.corpsVoisins ? n(b.corpsVoisins) + ' en corps et pignons' : '',
    b.recales ? n(b.recales) + ' recalé' + (b.recales > 1 ? 's' : '') : '',
    b.gardes ? n(b.gardes) + ' gardé' + (b.gardes > 1 ? 's' : '') + ' d’après la BD TOPO' : '',
  ].filter(Boolean);
  const formes = b.lus ? 'Toits du voisinage lus sur le LiDAR HD : ' + n(b.lus) + (parts.length ? ' (' + parts.join(', ') + ')' : '') + '.' : '';
  const couleurs = b.couleurs ? n(b.couleurs) + ' couleur' + (b.couleurs > 1 ? 's' : '') + ' de toit lue' + (b.couleurs > 1 ? 's' : '') + ' sur la photo aérienne.' : '';
  return [formes, couleurs].filter(Boolean).join(' ');
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
  const lireCouleurs = ctx.lireCouleurs ?? couleursToitsDepuisOrtho;
  // Le secteur n'a pas de dalle LiDAR : pour cette seance, seules les couleurs se lisent encore.
  let lidar = true;
  const pause = ctx.pause ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  const attendre = ctx.attendre ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // Une generation par lancement : un arret, ou un autre plan ouvert, rend caduque la boucle en cours.
  let generation = 0;
  let enCours = false;
  // Les batiments que le service a refuses, et combien de fois, pour cette seance.
  const refus = new Map<string, number>();
  const aTenter = (objets: ObjetPlan[]) => batimentsALire(objets, lidar).restants.filter((o) => (refus.get(o.key) ?? 0) < ECHECS_PAR_BATIMENT);

  // Ce que cette lecture a fait, lot apres lot, pour le bilan de fin.
  let cumul: BilanFond = vide();
  // L'enregistrement seul : depuis le dernier etat enregistre (`base.c`), combien de modifications
  // sont celles de la lecture (`base.nos`). Null : des modifications de l'utilisateur attendent.
  const maintenant = ctx.maintenant ?? Date.now;
  let base: { c: number; nos: number } | null = null;
  let dernierEnregistrement = 0;
  // Un enregistrement refuse (un projet trop lourd pour la plateforme) : plus d'essai seul cette seance,
  // le bandeau d'erreur ne reviendrait qu'a chaque lot.
  let enregistrementRefuse = false;
  const seulementLesNotres = () => !!base && !!ctx.sale?.() && (ctx.modifications?.() ?? 0) - base.c === base.nos;
  const enregistrerSiPermis = async (force: boolean) => {
    if (!ctx.enregistrer || enregistrementRefuse || !seulementLesNotres() || (!force && maintenant() - dernierEnregistrement < INTERVALLE_ENREGISTREMENT_MS)) return;
    dernierEnregistrement = maintenant();
    if (await ctx.enregistrer().catch(() => false)) base = { c: ctx.modifications?.() ?? 0, nos: 0 };
    else enregistrementRefuse = true;
  };

  const dire = (etat: ProgressionToits['etat']) => {
    const { eligibles, restants } = batimentsALire(ctx.objets(), lidar);
    ctx.progression(eligibles ? { faits: eligibles - restants.length, total: eligibles, etat } : null);
  };

  async function boucle(g: number): Promise<void> {
    let muets = 0;
    while (g === generation) {
      const objets = ctx.objets();
      const proj = projecteurDuProjet(objets);
      const restants = aTenter(objets);
      if (!proj || !restants.length) {
        enCours = false;
        // Sans LiDAR, la forme des toits n'a pas ete lue : « arretee » et non « finie ».
        dire(lidar ? 'finie' : 'arretee');
        if (cumul.lus || cumul.couleurs) { const b = cumul; cumul = vide(); ctx.fin?.(b); await enregistrerSiPermis(true); }
        return;
      }
      const lot = restants.slice(0, LOT_TOITS_FOND);
      const avant = lot.map(empreinte);
      const copies = lot.map((o) => structuredClone(o));
      // D'abord la forme (elle dit si le toit est plat, ce que la lecture de la couleur prend en compte),
      // puis la couleur des toits qui n'en ont pas.
      const pourForme = lidar ? copies.filter((c) => !toitLu(c)) : [];
      const bilan = pourForme.length ? await lire(objets, proj, { candidats: pourForme as ObjetAToit[], delaiMs: Number.POSITIVE_INFINITY, enParallele: PARALLELE_TOITS_FOND, pause }).catch(() => null) : null;
      if (g !== generation) return;
      if (bilan?.sansLidar) { lidar = false; dire('enCours'); continue; }
      const pourCouleur = copies.filter(couleurALire);
      const couleurs = pourCouleur.length ? await lireCouleurs(pourCouleur, proj, Number.POSITIVE_INFINITY, PARALLELE_TOITS_FOND).catch(() => null) : null;
      if (g !== generation) return;
      // Le plan a pu changer pendant le lot (annulation, autre plan) : on ecrit dans celui d'aujourd'hui.
      const courants = ctx.objets();
      const ecrits = copies.filter((c, i) => reporter(courants, c, avant[i] as string)).map((c) => c.key);
      // Lu sans etre ecrit (modifie entre-temps) : il reste a lire, il sera repris au lot suivant. Un
      // batiment dont rien de ce qui manquait n'a pu se lire compte un refus.
      const lus = pourForme.filter((c) => toitLu(c)).length;
      const nCouleurs = couleurs ? couleurs.lus + couleurs.replis : 0;
      const avance = (c: ObjetPlan) => (pourForme.includes(c) && toitLu(c)) || (pourCouleur.includes(c) && !couleurALire(c));
      copies.forEach((c) => { if (!avance(c)) refus.set(c.key, (refus.get(c.key) ?? 0) + 1); });
      ajouter(cumul, bilan, lus, nCouleurs);
      if (ecrits.length) {
        // Tout etait enregistre : nouveau depart du compte. Sinon, ce qui attend n'est peut-etre pas a nous.
        if (!ctx.sale?.()) base = { c: ctx.modifications?.() ?? 0, nos: 0 };
        const avantLot = ctx.modifications?.() ?? 0;
        ctx.apresLot(ecrits);
        if (base) base.nos += (ctx.modifications?.() ?? 0) - avantLot;
        await enregistrerSiPermis(false);
        if (g !== generation) return;
      }
      dire('enCours');
      if (copies.some(avance)) { muets = 0; continue; }
      if (++muets >= ECHECS_AVANT_ARRET) { enCours = false; dire('arretee'); return; }
      await attendre(ATTENTE_APRES_ECHEC_MS);
    }
  }

  return {
    relancer() {
      if (enCours || ctx.lectureSeule()) return;
      if (!aTenter(ctx.objets()).length || !projecteurDuProjet(ctx.objets())) { dire('finie'); return; }
      enCours = true;
      cumul = vide();
      base = ctx.sale?.() ? null : { c: ctx.modifications?.() ?? 0, nos: 0 };
      dernierEnregistrement = maintenant();
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
