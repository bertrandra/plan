// Ce que le mode audit charge (MD/spec-audit.md §4 et §18.1 a §18.2) : la parcelle de depart, puis tout ce
// qui est a moins de 70 m de la position, a chaque pas de 10 m.
//
// Les memes lectures que l'import et l'actualisation : le cadastre et la BD TOPO
// (app/actualisationIgn.ts::construireVoisinage, centre sur la position), la couleur des toits sur
// l'orthophoto, leur forme sur le LiDAR HD. Une seule difference voulue : le toit de chaque batiment
// est lu en **calcul entier** (recalage, coupes par le modele, surface mesuree gardee), celui que
// l'application reserve au projet et aux mitoyens. L'audit eprouve la chaine complete (spec §11,
// point 4). La couleur des murs vient du materiau BD TOPO, lu avec le batiment : pas de photos de rue.

import { interrogerCadastre, empriseGeoJSON, construireCandidats, classerCandidats } from '../../geo/apiIgn.js';
import { objetsDepuisCadastre } from '../../geo/cadastreObjets.js';
import { projecteurLocal, type ProjecteurLocal } from '../../geo/projection.js';
import { construireVoisinage } from '../actualisationIgn.js';
import { projecteurDuPlan } from '../importCadastre.js';
import { toitsDepuisLidar } from '../toitsLidar.js';
import { couleursToitsDepuisOrtho } from '../../render/couleurToitOrtho.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import type { ObjetPlan, ObjetBrut, PtBrut } from '../../model/types.js';

/** Le rayon lu autour de la position : ce que la vue « drone » montre devant vous (demande de l'utilisateur). */
export const RAYON_AUDIT_M = 70;
/** Un deplacement de plus que cela depuis la derniere lecture en declenche une nouvelle. */
export const PAS_RECHARGE_M = 10;
/** La recherche de la parcelle de depart : un carre de ce demi-cote autour du point. */
const RAYON_DEPART_M = 30;
/** Les toits d'une lecture : assez de temps pour une centaine de batiments, quatre a la fois. */
const DELAI_TOITS_MS = 240000;

export interface DependancesChargement {
  interrogerCadastre?: typeof interrogerCadastre;
  construireVoisinage?: typeof construireVoisinage;
  toitsDepuisLidar?: typeof toitsDepuisLidar;
  couleursToits?: typeof couleursToitsDepuisOrtho;
}

/**
 * Le plan de depart : la parcelle sous le point (lon, lat), seule, dans le repere de son calage
 * cadastral (le sommet le plus au nord), comme a l'import. `null` si aucune parcelle n'est trouvee.
 */
export async function planDeDepart(lon: number, lat: number, d: DependancesChargement = {}): Promise<{ objets: ObjetPlan[]; proj: ProjecteurLocal } | null> {
  const projPoint = projecteurLocal(lat, lon);
  const features = await (d.interrogerCadastre ?? interrogerCadastre)(empriseGeoJSON(lon, lat, projPoint, RAYON_DEPART_M), null);
  // Le point est l'origine du repere de la recherche : la parcelle qui le contient vient en tete.
  const principale = classerCandidats(construireCandidats(features, projPoint, { x: 0, y: 0 }, false))[0];
  if (!principale) return null;
  const objets = objetsDepuisCadastre({
    principale, parcellesPropriete: () => [], proj: projPoint, simplifier: false,
    voisinesRetenues: () => [], importerBatiments: false, batiments: [], haies: [], vegetation: [], voisinageEtendu: null,
  });
  return { objets, proj: projecteurDuPlan(objets, projPoint) };
}

/**
 * Ce qui est a moins de RAYON_AUDIT_M de `centre` (repere du plan) et n'est pas encore dans `objets` :
 * parcelles et batiments, toits lus. Rend les objets a ajouter ; une lecture qui echoue rend `[]`.
 */
export async function chargerAutour(objets: readonly ObjetPlan[], centre: PtBrut, proj: ProjecteurLocal, d: DependancesChargement = {}): Promise<ObjetBrut[]> {
  const parcelle = parcelleDuProjet(objets as ObjetPlan[]);
  const cad = parcelle?.cadastre as Parameters<typeof construireVoisinage>[1] | undefined;
  if (!parcelle || !cad || typeof cad.origineLat !== 'number') return [];
  const lu = await (d.construireVoisinage ?? construireVoisinage)(parcelle, cad, proj, false,
    { batiments: true, rayonM: RAYON_AUDIT_M, centre, batiPrincipal: true }, objets as ObjetBrut[]).catch(() => null);
  if (!lu || !lu.objets.length) return [];
  const batis = lu.objets.filter((o) => o.fonction === 'batiment');
  if (batis.length) {
    await (d.couleursToits ?? couleursToitsDepuisOrtho)(batis as never, proj).catch(() => null);
    // Calcul entier pour tous : chaque batiment lu est traite comme un mitoyen (recalage, coupes, surface gardee).
    await (d.toitsDepuisLidar ?? toitsDepuisLidar)([...objets, ...lu.objets] as never, proj, {
      candidats: batis as never, mitoyens: new Set(batis.flatMap((o) => (o.key ? [o.key] : []))), delaiMs: DELAI_TOITS_MS,
    }).catch(() => null);
  }
  return lu.objets;
}

/** Faut-il relire autour de `position` : jamais lu, ou deplace de plus de PAS_RECHARGE_M depuis la derniere lecture. */
export function fautRecharger(derniere: PtBrut | null, position: PtBrut): boolean {
  return !derniere || Math.hypot(position.x - derniere.x, position.y - derniere.y) > PAS_RECHARGE_M;
}
