// Ou Panoramax a des photos (demande du proprietaire, 15 novembre 2026 : « je veux savoir s'il y a des Panoramax dispo dans la zone
// selectionnee, sinon je zoome pour arriver a rien ») : les tuiles vectorielles de couverture du meta-catalogue, lues a tous les zooms.
// Ce qu'elles portent (verifie sur le service, 15 novembre 2026) : une grille de densite (`grid`, des points, niveaux 0 a 6), les traces
// des sequences (`sequences`, des lignes, niveaux 6 a 15) et les photos (`pictures`, niveau 15, que la recherche de la vue donne deja).
// Une tuile vide est un 204. La couverture dit ou il y a des photos, pas ou il y a des facades. Sans DOM, testable seul.

import type { Taille, Tuile } from './carte.js';
import { lireTuile } from './mvt.js';

export const COUVERTURE_URL = 'https://api.panoramax.xyz/api/map';
export const urlCouverture = (z: number, x: number, y: number): string => `${COUVERTURE_URL}/${z}/${x}/${y}.mvt`;

/** En deca, la grille de densite ; a partir de la, les traces des rues photographiees. */
export const ZOOM_TRACES = 7;
/** La grille se lit au niveau 5 au plus : au niveau 6 la tuile porte aussi toutes les sequences (6 Mo sur l'Ile-de-France). */
const NIVEAU_GRILLE_MAX = 5;
/** Au-dela du niveau 14 on etire ses tuiles : les traces y sont deja au demi-metre. */
const NIVEAU_TRACES_MAX = 14;

/**
 * La couche et le niveau des tuiles pour un zoom de la carte. Le niveau entier juste sous le zoom : peu de tuiles, etirees de deux fois
 * au plus (sauf la grille, qui grossit jusqu'aux traces, et le niveau 14, redessine en traits a chaque zoom).
 */
export function niveauCouverture(zoom: number): { couche: 'grille' | 'traces'; niveau: number } {
  return zoom < ZOOM_TRACES ? { couche: 'grille', niveau: Math.max(0, Math.min(NIVEAU_GRILLE_MAX, Math.floor(zoom))) } : { couche: 'traces', niveau: Math.min(NIVEAU_TRACES_MAX, Math.floor(zoom)) };
}

/** Le cote du damier d'occupation d'une tuile : de quoi dire si la vue contient de la couverture, sans garder ses geometries. */
export const DAMIER = 64;

export interface Cellule { x: number; y: number; n: number }
export interface TuileCouverture {
  etendue: number;
  /** Les traces des sequences, a plat (x0, y0, x1, y1…), en unites de la tuile. */
  lignes: Float32Array[];
  /** Les cases de la grille de densite : leur coin (haut, gauche) et le nombre de photos. */
  cellules: Cellule[];
  /** Le pas de la grille (largeur et hauteur d'une case), en unites de la tuile. */
  pas: { x: number; y: number };
  /** DAMIER x DAMIER cases : 1 la ou la tuile a de la couverture. */
  occupation: Uint8Array;
}

export const TUILE_VIDE: TuileCouverture = { etendue: 4096, lignes: [], cellules: [], pas: { x: 0, y: 0 }, occupation: new Uint8Array(DAMIER * DAMIER) };

/** Le plus petit ecart entre deux valeurs voisines : le pas d'une grille reguliere. */
function pasDe(valeurs: number[]): number {
  const v = [...new Set(valeurs)].sort((a, b) => a - b);
  let pas = Infinity;
  for (let i = 1; i < v.length; i++) pas = Math.min(pas, (v[i] as number) - (v[i - 1] as number));
  return Number.isFinite(pas) ? pas : 0;
}

/** Ce que la carte garde d'une tuile de couverture : la couche demandee seulement, et son damier d'occupation. */
export function lireCouverture(octets: Uint8Array, couche: 'grille' | 'traces'): TuileCouverture {
  const nom = couche === 'grille' ? 'grid' : 'sequences', c = lireTuile(octets, (n) => n === nom)[0];
  if (!c) return TUILE_VIDE;
  const occupation = new Uint8Array(DAMIER * DAMIER), k = DAMIER / c.etendue;
  const marquer = (x: number, y: number) => { const i = Math.floor(x * k), j = Math.floor(y * k); if (i >= 0 && j >= 0 && i < DAMIER && j < DAMIER) occupation[j * DAMIER + i] = 1; };
  const lignes: Float32Array[] = [], cellules: Cellule[] = [];
  for (const o of c.objets) {
    if (couche === 'grille') {
      const p = o.parties[0], n = o.attributs.nb_pictures;
      if (p && p.length >= 2) { cellules.push({ x: p[0] as number, y: p[1] as number, n: typeof n === 'number' ? n : 1 }); marquer(p[0] as number, p[1] as number); }
      continue;
    }
    for (const p of o.parties) {
      if (p.length < 2) continue;
      lignes.push(Float32Array.from(p));
      for (let i = 0; i < p.length; i += 2) {
        const x = p[i] as number, y = p[i + 1] as number;
        marquer(x, y);
        // Un long segment traverse des cases sans y poser de sommet : on le suit par demi-cases.
        if (i >= 2) {
          const x0 = p[i - 2] as number, y0 = p[i - 1] as number, pas = Math.ceil(Math.hypot(x - x0, y - y0) * k * 2);
          for (let s = 1; s < pas; s++) marquer(x0 + ((x - x0) * s) / pas, y0 + ((y - y0) * s) / pas);
        }
      }
    }
  }
  return { etendue: c.etendue, lignes, cellules, pas: { x: pasDe(cellules.map((q) => q.x)), y: pasDe(cellules.map((q) => q.y)) }, occupation };
}

/** L'opacite d'une case de la grille : plus il y a de photos, plus elle est pleine (d'une photo a cent mille, en echelle logarithmique). */
export const opaciteDeCase = (n: number): number => 0.22 + 0.58 * Math.min(1, Math.log10(Math.max(1, n)) / 5);

/** Une tuile placee a l'ecran contient-elle de la couverture dans le cadre de la carte ? */
export function couvertureVisible(t: Pick<Tuile, 'gauche' | 'haut' | 'cote'>, occupation: Uint8Array, taille: Taille): boolean {
  const c = t.cote / DAMIER;
  const i0 = Math.max(0, Math.floor(-t.gauche / c)), i1 = Math.min(DAMIER - 1, Math.floor((taille.l - t.gauche) / c));
  const j0 = Math.max(0, Math.floor(-t.haut / c)), j1 = Math.min(DAMIER - 1, Math.floor((taille.h - t.haut) / c));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (occupation[j * DAMIER + i]) return true;
  return false;
}

export type EtatCouverture = 'eteinte' | 'attente' | 'oui' | 'non' | 'panne';

/**
 * Ce que la carte dit en bas quand on est trop loin pour chercher les photos : ou zoomer s'il y a de la couverture, qu'il n'y a rien
 * sinon (des qu'on le sait), et la phrase d'avant quand on ne sait pas (couche eteinte, en cours de lecture, ou en panne : jamais
 * « aucune photo » sur une panne).
 */
export function indiceDeZoom(etat: EtatCouverture, couche: 'grille' | 'traces'): string {
  if (etat === 'oui') return couche === 'grille' ? 'Zoomez sur une zone orange pour voir ses photos de rue' : 'Zoomez sur une rue orange pour voir ses photos';
  if (etat === 'non') return 'Aucune photo de rue Panoramax dans cette zone';
  return 'Zoomez pour voir les photos de rue';
}
