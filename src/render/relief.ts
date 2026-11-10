// Les courbes de niveau du relief sur le plan (MD/spec-relief.md §5.3, render/).
//
// La grille d'altitudes vit sur la parcelle du projet (model/relief.ts) ; ici on en tire les
// isolignes (geometry/isolignes.ts) et on les pose en pixels sous les objets, au-dessus de la
// grille. Une courbe sur quatre est maitresse : trait plus fort, etiquette d'altitude NGF.
//
// Le calcul des courbes (`courbesDeNiveau`) est partage avec les exports : plan.svg et le plan de
// masse (DP2) dessinent les memes lignes, dans leur propre repere.
//
// Avec un maillage secondaire (`relief.paysage`, la grille du voisinage), l'ecran trace aussi ses
// courbes hors de la grille de la parcelle, a une equidistance de paysage (1 a 10 m). Les exports
// gardent les seules courbes de la parcelle : ce sont des pieces de projet, pas une carte.

import { au } from '../util/tableaux.js';
import { creerSvg } from './svg.js';
import { SVG_LABEL_HALO, SVG_RELIEF } from './theme.js';
import { isolignes, type GrilleScalaire } from '../geometry/isolignes.js';
import { versEcran, type EtatScene } from '../geometry/vue.js';
import {
  affichageRelief, cellule, centreCellule, empriseGrille, equidistanceRelief, estCourbeMaitresse, etendueAltitudes, niveauxCourbes, reliefDe,
  type GrilleRelief
} from '../model/relief.js';
import { parcelleDuProjet } from '../model/fonctions.js';
import type { GrillePaysage, ObjetPlan, PtBrut, Relief } from '../model/types.js';

/** Une courbe de niveau : son altitude NGF, si elle est maitresse, et ses points dans le repere du plan. */
export interface CourbeNiveau { niveau: number; maitresse: boolean; pts: PtBrut[] }

/** La grille du relief vue par l'algorithme des isolignes : un noeud par cellule, a son centre. */
export function grilleScalaireDe(r: GrilleRelief): GrilleScalaire {
  return { nx: r.nx, ny: r.ny, valeur: (i, j) => cellule(r, i, j), position: (i, j) => centreCellule(r, i, j) };
}

/**
 * Les courbes de niveau d'un relief, a l'equidistance en vigueur (reglee, sinon automatique sur le
 * denivele de la parcelle). Les courbes plus courtes que deux points n'existent pas.
 */
export function courbesDeNiveau(r: Relief, parcelle?: readonly PtBrut[]): { equidistance: number; courbes: CourbeNiveau[] } {
  const equidistance = equidistanceRelief(r, parcelle);
  const g = grilleScalaireDe(r);
  const courbes: CourbeNiveau[] = [];
  niveauxCourbes(r, equidistance).forEach(niveau => {
    const maitresse = estCourbeMaitresse(niveau, equidistance);
    isolignes(g, niveau).forEach(pts => courbes.push({ niveau, maitresse, pts }));
  });
  return { equidistance, courbes };
}

/** « 167,50 » : l'altitude NGF d'une courbe, au centimetre, a la francaise. */
export const etiquetteNiveau = (niveau: number): string => niveau.toFixed(2).replace('.', ',');

/** Le point du milieu d'une polyligne, a mi-longueur : la ou se pose son etiquette. */
export function milieuPolyligne(pts: readonly PtBrut[]): PtBrut {
  let reste = longueurPolyligne(pts) / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = au(pts, i - 1), b = au(pts, i);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d >= reste && d > 0) { const t = reste / d; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
    reste -= d;
  }
  return au(pts, 0);
}

/** La longueur d'une polyligne, dans son repere. */
export function longueurPolyligne(pts: readonly PtBrut[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(au(pts, i).x - au(pts, i - 1).x, au(pts, i).y - au(pts, i - 1).y);
  return L;
}

/** La largeur ajoutee du lisere clair sous chaque courbe, en pixels. */
const LISERE_COURBE_PX = 1.8;

/** En deca de cette longueur a l'ecran, une maitresse ne porte pas d'etiquette : elle ne tiendrait pas. */
const LONGUEUR_MIN_ETIQUETTE_PX = 60;

/**
 * Dessine les courbes de niveau du relief du projet dans `groupe`, en pixels. Rien sans relief, ni
 * quand la preference d'affichage « Courbes de niveau » est fermee ; le paysage seulement `avecPaysage`.
 */
export function dessinerCourbesRelief(groupe: SVGElement, objets: ObjetPlan[], scene: EtatScene, avecPaysage = true): void {
  groupe.innerHTML = '';
  const r = reliefDe(objets);
  if (!r || !affichageRelief(r).courbes) return;
  const parcelle = parcelleDuProjet(objets);
  // Le paysage d'abord, sous les courbes de la parcelle, coupe a la grille de la parcelle ; pas quand
  // le voisinage est masque (`avecPaysage`).
  if (r.paysage && avecPaysage) {
    const e = empriseGrille(r);
    const coins = [versEcran(scene, { x: e.xMin, y: e.yMax }), versEcran(scene, { x: e.xMax, y: e.yMin })];
    const [a, b] = coins as [PtBrut, PtBrut];
    const defs = creerSvg('defs', {});
    const clip = creerSvg('clipPath', { id: ID_HORS_PARCELLE });
    // Un tres grand rectangle perce de la grille de la parcelle (regle evenodd) : tout sauf elle.
    clip.appendChild(creerSvg('path', {
      'clip-rule': 'evenodd',
      d: 'M-1e6,-1e6H1e6V1e6H-1e6Z M' + a.x.toFixed(1) + ',' + a.y.toFixed(1) + 'H' + b.x.toFixed(1) + 'V' + b.y.toFixed(1) + 'H' + a.x.toFixed(1) + 'Z'
    }));
    defs.appendChild(clip);
    groupe.appendChild(defs);
    const paysage = creerSvg('g', { 'clip-path': 'url(#' + ID_HORS_PARCELLE + ')' });
    poserCourbes(paysage, courbesDuPaysage(r.paysage), scene);
    groupe.appendChild(paysage);
  }
  const { courbes } = courbesDeNiveau(r, parcelle && parcelle.type === 'polygon' ? parcelle.pts : undefined);
  poserCourbes(groupe, courbes, scene);
}

const ID_HORS_PARCELLE = 'reliefHorsParcelle';

/** Pose des courbes en pixels : un lisere clair, le trait, l'altitude des maitresses assez longues. */
function poserCourbes(groupe: SVGElement, courbes: readonly CourbeNiveau[], scene: EtatScene): void {
  courbes.forEach(c => {
    const ecran = c.pts.map(p => versEcran(scene, p));
    const points = ecran.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    // Un lisere clair sous la courbe, comme le halo des etiquettes : sur la photo aerienne, un trait
    // brun de 0,7 px se perdait dans les feuillages et les toits.
    groupe.appendChild(creerSvg('polyline', {
      class: 'halo', points, fill: 'none', stroke: SVG_LABEL_HALO, 'stroke-opacity': 0.75,
      'stroke-width': (c.maitresse ? 1.2 : 0.7) + LISERE_COURBE_PX, 'stroke-linejoin': 'round'
    }));
    groupe.appendChild(creerSvg('polyline', {
      points, fill: 'none', stroke: SVG_RELIEF, 'stroke-width': c.maitresse ? 1.2 : 0.7, 'stroke-linejoin': 'round'
    }));
    if (!c.maitresse || longueurPolyligne(ecran) < LONGUEUR_MIN_ETIQUETTE_PX) return;
    const m = milieuPolyligne(ecran);
    const t = creerSvg('text', {
      x: m.x, y: m.y - 2, 'font-size': 10, 'text-anchor': 'middle', fill: SVG_RELIEF,
      'paint-order': 'stroke', stroke: SVG_LABEL_HALO, 'stroke-width': 3, 'font-family': 'system-ui, sans-serif'
    });
    t.textContent = etiquetteNiveau(c.niveau);
    groupe.appendChild(t);
  });
}

/** L'equidistance des courbes du paysage d'apres son denivele : 1 m sous 10 m, 2 m sous 40 m, 5 m sous 100 m, 10 m au-dela. */
export function equidistancePaysage(deniveleM: number): number {
  if (deniveleM < 10) return 1;
  if (deniveleM < 40) return 2;
  if (deniveleM < 100) return 5;
  return 10;
}

/**
 * Les courbes du maillage secondaire, dans le repere du plan. Calculees une fois par grille : le plan
 * se redessine a chaque deplacement, et le paysage compte jusqu'a des centaines de milliers de points.
 */
const courbesPaysage = new WeakMap<GrillePaysage, CourbeNiveau[]>();
export function courbesDuPaysage(q: GrillePaysage): CourbeNiveau[] {
  const deja = courbesPaysage.get(q);
  if (deja) return deja;
  const e = etendueAltitudes(q);
  const equidistance = equidistancePaysage(e ? e.zMax - e.zMin : 0);
  const g = grilleScalaireDe(q);
  const courbes: CourbeNiveau[] = [];
  niveauxCourbes(q, equidistance).forEach(niveau => {
    const maitresse = estCourbeMaitresse(niveau, equidistance);
    isolignes(g, niveau).forEach(pts => courbes.push({ niveau, maitresse, pts }));
  });
  courbesPaysage.set(q, courbes);
  return courbes;
}
