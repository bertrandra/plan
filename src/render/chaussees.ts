// Les rues dessinees sur le plan : l'option « Rues » du menu Affichage (MD/spec-rues.md §7, render/).
//
// Chaque troncon lu a la BD TOPO (geo/rues.ts) devient un ruban a la largeur de sa chaussee : un trait SVG de cette largeur,
// bouts et coudes arrondis, cerne d'un bord fin. Tous les bords d'abord, puis toutes les chaussees : a un carrefour, les rubans
// se fondent au lieu de se couper par leurs bords. Les couleurs sont les jetons `--chaussee` et `--chaussee-bord` (render/theme.ts),
// un ambre franc qui se detache de la photo aerienne comme du Plan IGN. Le calque est sous les objets et sous le nom des rues,
// au-dessus du fond : il situe, il ne cache rien du projet, et les clics le traversent.
//
// Dessine a l'ecran comme le nom des rues (le calque suit l'ecran) : seuls les troncons qui touchent la vue sont ecrits, et
// les traits sont groupes par largeur, un chemin SVG par largeur.

import { creerSvg } from './svg.js';
import { SVG_CHAUSSEE, SVG_CHAUSSEE_BORD } from './theme.js';
import { versEcran, versMonde, type EtatScene } from '../geometry/vue.js';
import { chausseesAffichees } from '../model/rues.js';
import { parcelleDuProjet } from '../model/fonctions.js';
import type { ChausseeRue, ObjetPlan } from '../model/types.js';

/** La plus petite largeur d'une chaussee a l'ecran : vue de loin, une rue reste un trait qui se voit. */
export const LARGEUR_CHAUSSEE_MIN_PX = 2.5;
/** L'epaisseur du bord, de chaque cote, en pixels. */
export const BORD_CHAUSSEE_PX = 1.2;

/** La largeur d'une chaussee a l'ecran, a l'echelle de la vue, au demi-pixel. */
export function largeurChausseePx(largeurM: number, echelle: number): number {
  return Math.round(Math.max(LARGEUR_CHAUSSEE_MIN_PX, largeurM * echelle) * 2) / 2;
}

/** Le troncon touche-t-il le rectangle (repere du plan), elargi de `marge` metres ? */
function visible(c: ChausseeRue, e: { xMin: number; xMax: number; yMin: number; yMax: number }, marge: number): boolean {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const p of c.pts) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); }
  return xMax >= e.xMin - marge && xMin <= e.xMax + marge && yMax >= e.yMin - marge && yMin <= e.yMax + marge;
}

/**
 * Dessine les rues dans `groupe`, si l'option « Rues » est cochee et que les chaussees ont ete lues ; le vide sinon. La parcelle
 * masquee emporte ses rues, comme le nom des rues.
 */
export function dessinerChaussees(groupe: SVGElement, objets: ObjetPlan[], scene: EtatScene, masque: (o: ObjetPlan) => boolean = () => false): void {
  groupe.innerHTML = '';
  const parcelle = parcelleDuProjet(objets);
  const chaussees = parcelle && !masque(parcelle) ? chausseesAffichees(parcelle) : [];
  if (!chaussees.length) return;
  const hautGauche = versMonde(scene, { x: 0, y: 0 }), basDroit = versMonde(scene, { x: scene.W, y: scene.H });
  const ecran = { xMin: hautGauche.x, xMax: basDroit.x, yMin: basDroit.y, yMax: hautGauche.y };
  // Les traces, par largeur a l'ecran : un chemin SVG par largeur, dans l'ordre des chaussees (les plus importantes en dernier).
  const parLargeur = new Map<number, string[]>();
  for (const c of chaussees) {
    if (c.pts.length < 2 || !visible(c, ecran, c.largeurM)) continue;
    const l = largeurChausseePx(c.largeurM, scene.scale);
    const d = c.pts.map((p, i) => { const e = versEcran(scene, p); return (i ? 'L' : 'M') + e.x.toFixed(1) + ' ' + e.y.toFixed(1); }).join('');
    const liste = parLargeur.get(l) ?? [];
    liste.push(d);
    parLargeur.set(l, liste);
  }
  if (!parLargeur.size) return;
  const commun = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const bords = creerSvg('g', { class: 'chausseesBords' }), pleins = creerSvg('g', { class: 'chausseesPleins' });
  for (const [l, traces] of parLargeur) {
    bords.appendChild(creerSvg('path', { ...commun, d: traces.join(''), stroke: SVG_CHAUSSEE_BORD, 'stroke-width': l + 2 * BORD_CHAUSSEE_PX }));
    pleins.appendChild(creerSvg('path', { ...commun, d: traces.join(''), stroke: SVG_CHAUSSEE, 'stroke-width': l }));
  }
  groupe.append(bords, pleins);
}
