// Le nom des rues sur le plan (MD/spec-rues.md, render/).
//
// Les etiquettes viennent de model/rues.ts ; ici on les pose en pixels, dans leur calque, sous les
// objets et au-dessus du relief : un nom de rue situe le projet, il ne doit rien cacher. L'encre du
// plan, en italique et un peu effacee, avec le halo des etiquettes : lisible sur l'orthophoto comme
// sur le fond clair. La taille suit le zoom (un nom fait environ 2,4 m de haut sur le terrain), bornee
// pour rester lisible de loin et discrete de pres.

import { creerSvg } from './svg.js';
import { SVG_INK, SVG_LABEL_HALO } from './theme.js';
import { versEcran, versMonde, type EtatScene } from '../geometry/vue.js';
import { etiquettesDesRues } from '../model/rues.js';
import { voisinage3dDe } from '../model/voisinage3d.js';
import { parcelleDuProjet } from '../model/fonctions.js';
import type { ObjetPlan } from '../model/types.js';

/** La hauteur d'un nom de rue sur le terrain, en metres, et ses bornes a l'ecran, en pixels. */
export const HAUTEUR_NOM_RUE_M = 2.4;
export const TAILLE_NOM_RUE_MIN_PX = 9;
export const TAILLE_NOM_RUE_MAX_PX = 16;

/** La taille du texte a l'echelle de la vue. */
export function tailleNomRue(echelle: number): number {
  return Math.max(TAILLE_NOM_RUE_MIN_PX, Math.min(TAILLE_NOM_RUE_MAX_PX, HAUTEUR_NOM_RUE_M * echelle));
}

/** Dessine le nom des rues dans `groupe`, si la case « Nom des rues » est cochee et que des rues ont ete lues. */
export function dessinerNomsDesRues(groupe: SVGElement, objets: ObjetPlan[], scene: EtatScene, masque: (o: ObjetPlan) => boolean = () => false): void {
  groupe.innerHTML = '';
  const parcelle = parcelleDuProjet(objets);
  if (!parcelle || masque(parcelle) || !voisinage3dDe(parcelle).rues.afficher || !parcelle.ruesVoisinage?.rues.length) return;
  const taille = tailleNomRue(scene.scale);
  // Les rues sont decoupees a l'ecran, un peu en retrait des bords : le nom se pose au milieu de ce
  // qu'on voit de la rue, et ne deborde pas.
  const retrait = 2 * taille;
  const hautGauche = versMonde(scene, { x: retrait, y: retrait }), basDroit = versMonde(scene, { x: scene.W - retrait, y: scene.H - retrait });
  const ecran = { xMin: hautGauche.x, xMax: basDroit.x, yMin: basDroit.y, yMax: hautGauche.y };
  for (const e of etiquettesDesRues(parcelle.ruesVoisinage.rues, ecran)) {
    const p = versEcran(scene, e);
    // L'ecran a son y vers le bas : l'angle de la voie s'y inverse.
    const t = creerSvg('text', {
      x: 0, y: 0, transform: 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ') rotate(' + (-e.angleDeg).toFixed(1) + ')',
      'font-size': taille.toFixed(1), 'font-style': 'italic', 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: SVG_INK, 'fill-opacity': 0.72, 'paint-order': 'stroke', stroke: SVG_LABEL_HALO, 'stroke-width': 3,
      'font-family': 'system-ui, sans-serif', 'letter-spacing': '0.04em'
    });
    t.textContent = e.nom;
    groupe.appendChild(t);
  }
}
