// Grille du plan (spec §3.2, render/stage.ts).
//
// Comme le decor, elle ne depend que de la transformation de scene et d'une bascule : elle sort
// donc avec l'etat en parametre, avant le reste du rendu.

import { creerSvg } from './svg.js';
import { SVG_GRID_MAJOR, SVG_GRID_MINOR } from './theme.js';
import { niceStep } from '../util/format.js';
import { versEcran, versMonde, type EtatScene } from './scene.js';

export interface EtatGrille {
  scene: EtatScene;
  grilleVisible: boolean;
}

/**
 * Trace la grille couvrant la vue courante.
 *
 * Le pas vise 60 px puis tombe sur une valeur ronde : une grille au pas de 3,7 m ne permettrait
 * pas d'estimer une distance a l'oeil, ce qui est sa seule raison d'etre.
 *
 * Les axes X = 0 et Y = 0 sont traces plus fort que les autres : ils reperent l'origine du plan,
 * c'est-a-dire le sommet nord de la parcelle.
 */
export function dessinerGrille(groupe: SVGElement, etat: EtatGrille): void {
  groupe.innerHTML = '';
  // Grille masquable : elle sert a estimer les distances pendant le travail, elle gene des qu'on
  // regarde le plan pour lui-meme (fond orthophoto, capture d'ecran, presentation).
  if (!etat.grilleVisible) return;

  const scene = etat.scene;
  const pasM = niceStep(60 / scene.scale);
  const hg = versMonde(scene, { x: 0, y: 0 });
  const bd = versMonde(scene, { x: scene.W, y: scene.H });
  const xMin = Math.floor(Math.min(hg.x, bd.x) / pasM) * pasM;
  const xMax = Math.ceil(Math.max(hg.x, bd.x) / pasM) * pasM;
  const yMin = Math.floor(Math.min(hg.y, bd.y) / pasM) * pasM;
  const yMax = Math.ceil(Math.max(hg.y, bd.y) / pasM) * pasM;

  const ligne = (a: { x: number; y: number }, b: { x: number; y: number }, surAxe: boolean) => {
    const p1 = versEcran(scene, a);
    const p2 = versEcran(scene, b);
    groupe.appendChild(
      creerSvg('line', {
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        stroke: surAxe ? SVG_GRID_MAJOR : SVG_GRID_MINOR,
        'stroke-width': surAxe ? 1.3 : 0.8
      })
    );
  };

  for (let x = xMin; x <= xMax + 1e-9; x += pasM) ligne({ x, y: yMin }, { x, y: yMax }, Math.abs(x) < 1e-6);
  for (let y = yMin; y <= yMax + 1e-9; y += pasM) ligne({ x: xMin, y }, { x: xMax, y }, Math.abs(y) < 1e-6);
}
