// Les facades de l'audit de la parcelle suivent leur mur quand le contour du batiment change (MD/spec-ouvrages.md, « Les toits dans
// l'audit de la parcelle », point 4 de « Ce qu'il faut ranger »).
//
// Une facade de la capture se designe par le rang de son cote dans le contour (`BatimentCapture.facades`, cle `cote`). Un sommet
// ajoute ou retire (app/assemblage/gestes.ts, une retouche a la main) decale tous les rangs suivants : les photos, les corrections
// et la mention « inaccessible » allaient au mur voisin. La capture vit hors du projet (le brouillon de l'appareil) : un decalage
// fait au moment du geste ne serait pas defait par Ctrl+Z. Elle garde donc le contour sur lequel ses rangs ont ete comptes
// (`contour`), et se recale par la geometrie sur le contour du moment : chaque ancien cote va au cote d'aujourd'hui qui le porte
// (meme droite, la plus longue part commune), et une annulation se recale de meme dans l'autre sens.
//
// Pur : pas de DOM, pas de stockage.

import type { BatimentCapture, FacadeCapturee } from './auditParcelle.js';
import { PHOTOS_PAR_FACADE_MAX } from './auditParcelle.js';
import type { PtBrut } from './types.js';
import { correspondanceDesCotes, memeContour } from '../geometry/correspondanceCotes.js';

export { correspondanceDesCotes, memeContour };

/** Deux facades qui tombent sur le meme mur (un coin retire) : les photos de l'une a la suite de l'autre, leurs corrections aussi. */
function fondre<P>(a: FacadeCapturee<P>, b: FacadeCapturee<P>): FacadeCapturee<P> {
  const photos = [...a.photos, ...b.photos].slice(0, PHOTOS_PAR_FACADE_MAX);
  const corrections = { ...(a.corrections ?? {}) };
  for (const [rang, c] of Object.entries(b.corrections ?? {})) { const r = Number(rang) + a.photos.length; if (r < photos.length) corrections[String(r)] = c; }
  const inaccessible = a.inaccessible ?? b.inaccessible;
  return { photos, ...(Object.keys(corrections).length ? { corrections } : {}), ...(inaccessible !== undefined ? { inaccessible } : {}) };
}

/**
 * Le batiment de la capture, ses facades rangees sur le contour d'aujourd'hui `pts`. Sans contour garde, celui-ci est adopte tel
 * quel (les rangs ont ete comptes dessus). Rend le meme objet quand rien ne change. Une facade dont aucun mur ne reste est gardee a
 * son rang : rien de ce qui a ete photographie ne se perd (model/fichierAuditParcelle.ts les redit).
 */
export function facadesSurLeContour<P>(b: BatimentCapture<P>, pts: readonly PtBrut[]): BatimentCapture<P> {
  if (!b.contour) return { ...b, contour: pts.map((p) => ({ x: p.x, y: p.y })) };
  if (memeContour(b.contour, pts)) return b;
  const vers = correspondanceDesCotes(b.contour, pts);
  const facades: Record<string, FacadeCapturee<P>> = {};
  for (const [rang, f] of Object.entries(b.facades).sort(([x], [y]) => Number(x) - Number(y))) {
    const j = vers[Number(rang)];
    const cle = j === undefined || j < 0 ? rang : String(j);
    const deja = facades[cle];
    facades[cle] = deja ? fondre(deja, f) : f;
  }
  return { ...b, facades, contour: pts.map((p) => ({ x: p.x, y: p.y })) };
}
