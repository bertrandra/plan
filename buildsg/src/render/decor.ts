// Reperes fixes du plan : flèche du Nord et echelle graphique (spec §3.2, render/decor.ts).
//
// Ces deux dessins ne dependent pas des objets : seulement de la transformation de scene et d'une
// bascule d'affichage. Ce sont donc les premiers a sortir de `boot()` avec l'etat en parametre -
// leur signature dit exactement de quoi ils ont besoin, ce que la fermeture cachait.
//
// Ils s'ecrivent dans leur propre groupe SVG, qu'on leur passe : c'est le meme principe applique
// au DOM, un groupe recu plutot qu'un groupe capture.

import { creerSvg, attrs } from './svg.js';
import { SVG_INK } from './theme.js';
import { niceStep } from '../util/format.js';
import type { EtatScene } from '../geometry/vue.js';

/** Ce que le decor a besoin de connaitre de l'etat : la scene et la bascule du Nord. */
export interface EtatDecor {
  scene: EtatScene;
  showNorth: boolean;
}

/**
 * Flèche du Nord, en haut a droite. Le plan a pour convention Y+ = nord : la flèche pointe donc
 * toujours vers le haut de l'ecran, et ne tourne pas avec la vue - c'est un repere, pas une
 * boussole.
 */
export function dessinerFlecheNord(groupe: SVGElement, etat: EtatDecor): void {
  groupe.innerHTML = '';
  if (!etat.showNorth) return;
  const nx = etat.scene.W - 30;
  const ny = 34;
  const g = creerSvg('g', { transform: 'translate(' + nx + ',' + ny + ')' });
  g.innerHTML =
    '<line x1="0" y1="18" x2="0" y2="-14" stroke="' + SVG_INK + '" stroke-width="2"/>' +
    '<polygon points="0,-20 -7,-6 7,-6" fill="' + SVG_INK + '"/>' +
    '<text x="0" y="30" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" ' +
    'font-size="12" font-weight="700" fill="' + SVG_INK + '">N</text>';
  groupe.appendChild(g);
}

/**
 * Echelle graphique, en bas a droite. Sa longueur vise 110 px puis tombe sur un pas rond
 * (`niceStep`) : une barre qui annoncerait « 3,7 m » ne servirait a rien pour estimer une
 * distance a l'oeil.
 */
export function dessinerEchelle(groupe: SVGElement, etat: EtatDecor): void {
  groupe.innerHTML = '';
  const cibleEnPixels = 110;
  const metres = niceStep(cibleEnPixels / etat.scene.scale);
  const barrePx = metres * etat.scene.scale;
  const x0 = etat.scene.W - barrePx - 24;
  const y0 = etat.scene.H - 22;

  groupe.appendChild(
    creerSvg('line', { x1: x0, y1: y0, x2: x0 + barrePx, y2: y0, stroke: SVG_INK, 'stroke-width': '2' })
  );

  [0, metres].forEach((v) => {
    const x = x0 + v * etat.scene.scale;
    groupe.appendChild(
      creerSvg('line', { x1: x, y1: y0 - 5, x2: x, y2: y0 + 5, stroke: SVG_INK, 'stroke-width': '1.5' })
    );
    const t = creerSvg('text');
    attrs(t, {
      x,
      y: y0 + 17,
      'text-anchor': 'middle',
      'font-family': 'Helvetica Neue, Arial, sans-serif',
      'font-size': '10',
      fill: SVG_INK
    });
    t.textContent = v === 0 ? '0' : metres >= 1 ? metres + ' m' : metres * 100 + ' cm';
    groupe.appendChild(t);
  });
}
