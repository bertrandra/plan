// Grille du plan (spec §3.2, render/stage.ts).
//
// Comme le decor, elle ne depend que de la transformation de scene et d'une bascule : elle sort
// donc avec l'etat en parametre, avant le reste du rendu.

import { creerSvg } from './svg.js';
import { SVG_GRID_MAJOR } from './theme.js';
import { niceStep } from '../util/format.js';
import { versEcran, versMonde, type EtatScene } from '../geometry/vue.js';

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
 * Depuis la 2.1.1, la trame est un semis de points aux croisements (le papier pointe de la
 * maquette) : elle se lit aussi bien pour estimer une distance, et elle charge moins le plan. Les
 * axes X = 0 et Y = 0 restent des traits : ils reperent l'origine du plan, c'est-a-dire le sommet
 * nord de la parcelle. Les points sont un motif SVG, un seul rectangle quelle que soit la vue.
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
        stroke: SVG_GRID_MAJOR,
        'stroke-width': surAxe ? 1.3 : 0.8
      })
    );
  };

  const pasPx = pasM * scene.scale;
  const origine = versEcran(scene, { x: 0, y: 0 });
  const motif = creerSvg('pattern', {
    id: 'trameGrille', patternUnits: 'userSpaceOnUse', width: pasPx, height: pasPx,
    x: ((origine.x % pasPx) + pasPx) % pasPx - pasPx / 2, y: ((origine.y % pasPx) + pasPx) % pasPx - pasPx / 2
  });
  motif.appendChild(creerSvg('circle', { cx: pasPx / 2, cy: pasPx / 2, r: 1.3, fill: SVG_GRID_MAJOR }));
  const defs = creerSvg('defs');
  defs.appendChild(motif);
  groupe.appendChild(defs);
  groupe.appendChild(creerSvg('rect', { x: 0, y: 0, width: scene.W, height: scene.H, fill: 'url(#trameGrille)' }));
  if (xMin <= 0 && xMax >= 0) ligne({ x: 0, y: yMin }, { x: 0, y: yMax }, true);
  if (yMin <= 0 && yMax >= 0) ligne({ x: xMin, y: 0 }, { x: xMax, y: 0 }, true);
}
