// La facade devant laquelle on se tient, par sa position et son cap (MD/spec-audit.md §6.1, §12.2).
//
// Avant la photo, en direct : parmi les murs des batiments charges, ceux dont on voit le cote
// exterieur, d'assez pres et sans autre batiment entre soi et eux ; puis, la boussole aidant, celui
// que l'on regarde. C'est lui que l'audit surligne et nomme, et c'est sur lui qu'une photo se range.
//
// Tout est en metres, dans le repere du plan (Y vers le nord) ; aucun etat, aucun DOM.

import { vueCachee, type Obstacle } from '../../geometry/ligneDeVue.js';
import type { PtBrut } from '../../model/types.js';
import { facadeFaceAuCap, type Facade } from '../geometrie.js';

/** Plus pres, le mur deborde de la photo ; plus loin, il n'en occupe plus assez (comme Panoramax). */
export const DISTANCE_DEVANT_MIN_M = 3;
export const DISTANCE_DEVANT_MAX_M = 40;
/** Vu plus de biais que cela, on longe le mur plus qu'on ne lui fait face. */
export const OBLIQUITE_DEVANT_MAX_DEG = 70;
/** L'ecart admis entre le cap et le mur : la boussole d'un telephone se trompe de 5 a 15 degres pres d'un mur. */
export const TOLERANCE_CAP_DEG = 50;
/** Les points du mur vises pour savoir s'il se voit : il suffit d'en voir un (un arbre, un angle de voisin). */
const POINTS_VISES = [0.5, 0.25, 0.75, 0.1, 0.9];
/** Les points vises sont un peu devant le mur : sinon le contour du batiment lui-meme couperait la vue. */
const DEVANT_MUR_M = 0.2;

/** Les facades d'un batiment, avec sa cle dans le plan. */
export interface FacadesDUnBatiment { cle: string; facades: readonly Facade[] }

/** Une facade devant laquelle on se tient. */
export interface FacadeDevant {
  /** Le batiment. */
  cle: string;
  facade: Facade;
  /** La distance au mur (au point le plus proche), en metres. */
  distance: number;
  /** L'ecart entre le cap et le mur, en degres ; null sans cap. */
  ecartCap: number | null;
}

/** L'ecart signe de deux azimuts, dans ]-180, 180]. */
function ecart(a: number, b: number): number {
  const d = (((b - a) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/** L'azimut de `p` vers `q` (0 = nord, sens horaire), en degres. */
const azimutVers = (p: PtBrut, q: PtBrut) => ((Math.atan2(q.x - p.x, q.y - p.y) * 180) / Math.PI + 360) % 360;

/**
 * La facade vue depuis `pos`, ou null : `pos` du cote exterieur du mur, entre 3 et 40 m de lui, pas
 * trop de biais, et au moins un point du mur que rien ne cache.
 */
function vue(pos: PtBrut, cle: string, f: Facade, obstacles: readonly Obstacle[]): FacadeDevant | null {
  const g = f.gauche, d = f.droite;
  const dx = d.x - g.x, dy = d.y - g.y, l2 = dx * dx + dy * dy;
  if (!(l2 > 0)) return null;
  // Du cote exterieur : la normale sortante pointe vers la position.
  const devant = (pos.x - g.x) * f.normale.x + (pos.y - g.y) * f.normale.y;
  if (devant <= 0) return null;
  const t = Math.max(0, Math.min(1, ((pos.x - g.x) * dx + (pos.y - g.y) * dy) / l2));
  const proche = { x: g.x + t * dx, y: g.y + t * dy };
  const distance = Math.hypot(pos.x - proche.x, pos.y - proche.y);
  if (distance < DISTANCE_DEVANT_MIN_M || distance > DISTANCE_DEVANT_MAX_M) return null;
  // Le biais se mesure depuis le point le plus proche : en face d'un long mur, on lui fait face meme
  // loin de son milieu ; au-dela d'un angle, on le voit de plus en plus de biais.
  const obliquite = (Math.acos(Math.min(1, devant / distance)) * 180) / Math.PI;
  if (obliquite > OBLIQUITE_DEVANT_MAX_DEG) return null;
  const visible = POINTS_VISES.some((s) => {
    const c = { x: g.x + s * dx + f.normale.x * DEVANT_MUR_M, y: g.y + s * dy + f.normale.y * DEVANT_MUR_M };
    return !vueCachee(pos, c, obstacles);
  });
  return visible ? { cle, facade: f, distance, ecartCap: null } : null;
}

/**
 * L'ecart entre le cap et le mur vu depuis `pos` : nul quand l'axe de la boussole tombe sur le mur,
 * sinon l'angle jusqu'a son bord le plus proche. Le milieu seul tromperait sur un long mur vu de
 * pres : on le regarde en plein, alors que son milieu est loin de l'axe.
 */
export function ecartAuCap(pos: PtBrut, f: Facade, cap: number): number {
  const ag = azimutVers(pos, f.gauche), ad = azimutVers(pos, f.droite);
  // Vu de dehors, la gauche du mur est a gauche : de ag a ad dans le sens horaire, moins d'un demi-tour.
  const largeur = (((ad - ag) % 360) + 360) % 360;
  const depuisGauche = (((cap - ag) % 360) + 360) % 360;
  if (depuisGauche <= largeur) return 0;
  return Math.min(Math.abs(ecart(cap, ag)), Math.abs(ecart(cap, ad)));
}

/** Les facades devant lesquelles on se tient, de la plus proche a la plus lointaine (§6.1, point 1). */
export function facadesDevant(pos: PtBrut, batiments: readonly FacadesDUnBatiment[], obstacles: readonly Obstacle[]): FacadeDevant[] {
  const out: FacadeDevant[] = [];
  for (const b of batiments) for (const f of b.facades) {
    const v = vue(pos, b.cle, f, obstacles);
    if (v) out.push(v);
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/**
 * La facade que l'on a devant soi (§6.1, points 2 et 4) : parmi celles devant lesquelles on se
 * tient, celle qui est le plus pres de l'axe de la boussole, a `tolerance` degres pres ; a egalite,
 * la plus proche. Sans cap, la plus proche. Null quand aucune ne convient.
 */
export function facadeDevant(pos: PtBrut, cap: number | null, batiments: readonly FacadesDUnBatiment[], obstacles: readonly Obstacle[], tolerance = TOLERANCE_CAP_DEG): FacadeDevant | null {
  const vues = facadesDevant(pos, batiments, obstacles);
  if (cap === null) return vues[0] ?? null;
  let meilleure: FacadeDevant | null = null;
  for (const v of vues) {
    const e = ecartAuCap(pos, v.facade, cap);
    if (e > tolerance) continue;
    // Les vues sont rangees par distance : a ecart egal, la premiere gardee est la plus proche.
    if (!meilleure || e < (meilleure.ecartCap ?? Infinity) - 1e-9) meilleure = { ...v, ecartCap: e };
  }
  return meilleure;
}

/** « Vous êtes devant la façade sud, 9,2 m » : ce que l'audit affiche. */
export function texteFacadeDevant(v: FacadeDevant): string {
  const m = (Math.round(v.distance * 10) / 10).toFixed(1).replace('.', ',');
  return 'Vous êtes devant la façade ' + v.facade.orientation.toLowerCase() + ', ' + m + ' m';
}


/**
 * Le mur propose par le releve d'une facade (zones/releve/ChoixMur.tsx) : quand la position est
 * connue, celui devant lequel on se tient, la boussole departageant ceux que l'on voit ; sinon celui
 * qui fait face au cap de la boussole. `devant` n'est donne que dans le premier cas : c'est lui qui
 * permet de dire la distance.
 */
export function murPropose(facades: readonly Facade[], cle: string, position: PtBrut | null, obstacles: readonly Obstacle[], cap: number | null): { facade: Facade; devant: FacadeDevant | null } | null {
  if (position) {
    const devant = facadeDevant(position, cap, [{ cle, facades }], obstacles);
    return devant ? { facade: devant.facade, devant } : null;
  }
  const f = cap === null ? null : facadeFaceAuCap(facades, cap);
  return f ? { facade: f, devant: null } : null;
}
