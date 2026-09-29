// Les ouvertures relevees, dessinees sur le plan (spec-releve-facade §9.2, render/).
//
// Convention d'architecte : une baie coupe le mur. Sur le trait du batiment, chaque ouverture
// relevee devient une interruption du trait (un segment de la couleur du fond) bornee par deux
// tableaux, et une porte recoit son arc de debattement vers l'interieur. Seul le plan a l'ecran
// les montre : l'export SVG garde sa forme, figee par son empreinte.

import { facadesDuContour, pointDeFacade } from '../facade/geometrie.js';
import { SVG_INK, SVG_LABEL_HALO } from './theme.js';
import type { EtatApp } from '../core/state.js';
import type { PtBrut, PtEcran } from '../model/types.js';

const NS = 'http://www.w3.org/2000/svg';
/** Hauteur du plan de coupe, en metres depuis le sol. */
const COUPE = 1.1;

export function dessinerReleves(groupe: SVGGElement, etat: EtatApp, versEcran: (p: PtBrut) => PtEcran, masque: (o: EtatApp['objects'][number]) => boolean): void {
  while (groupe.firstChild) groupe.removeChild(groupe.firstChild);
  // Toujours au-dessus des objets, crees apres le groupe.
  groupe.parentNode?.appendChild(groupe);
  const ligne = (a: PtEcran, b: PtEcran, couleur: string, epaisseur: number) => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(a.x));
    l.setAttribute('y1', String(a.y));
    l.setAttribute('x2', String(b.x));
    l.setAttribute('y2', String(b.y));
    l.setAttribute('stroke', couleur);
    l.setAttribute('stroke-width', String(epaisseur));
    groupe.appendChild(l);
  };
  const echelle = etat.scene.scale;
  etat.objects.forEach((o) => {
    if (o.type !== 'polygon' || !o.facades?.length || masque(o)) return;
    const facades = facadesDuContour(o.pts, 0);
    o.facades.forEach((r) => {
      const f = facades.find((x) => x.cote === r.cote);
      if (!f) return;
      // Les tableaux : 20 cm de mur, vers l'interieur.
      const dedans = { x: -f.normale.x * 0.2, y: -f.normale.y * 0.2 };
      r.ouvertures.forEach((ov) => {
        if (ov.x + ov.l > f.largeur + 0.01) return;
        // Un plan est une coupe horizontale a hauteur d'appui : les baies de l'etage n'y sont pas.
        if (ov.y > COUPE || ov.y + ov.h < COUPE) return;
        const a = pointDeFacade(f, ov.x),
          b = pointDeFacade(f, ov.x + ov.l);
        ligne(versEcran(a), versEcran(b), SVG_LABEL_HALO, 3.4);
        // Les deux tableaux, perpendiculaires au mur.
        ligne(versEcran(a), versEcran({ x: a.x + dedans.x, y: a.y + dedans.y }), SVG_INK, 1.2);
        ligne(versEcran(b), versEcran({ x: b.x + dedans.x, y: b.y + dedans.y }), SVG_INK, 1.2);
        if (ov.type === 'fenetre' || ov.type === 'porte-fenetre') {
          // La vitre : un trait fin au milieu du tableau.
          const m = { x: dedans.x / 2, y: dedans.y / 2 };
          ligne(versEcran({ x: a.x + m.x, y: a.y + m.y }), versEcran({ x: b.x + m.x, y: b.y + m.y }), SVG_INK, 0.8);
        } else {
          // Le vantail d'une porte, ouvert a 90 degres vers l'interieur, et son arc.
          const n = { x: -f.normale.x * ov.l, y: -f.normale.y * ov.l };
          const bout = { x: a.x + n.x, y: a.y + n.y };
          ligne(versEcran(a), versEcran(bout), SVG_INK, 1);
          const pa = versEcran(bout),
            pb = versEcran(b),
            pc = versEcran(a);
          const rayon = ov.l * echelle;
          // Sens de l'arc a l'ecran (Y vers le bas) : du vantail vers le tableau oppose.
          const croix = (pa.x - pc.x) * (pb.y - pc.y) - (pa.y - pc.y) * (pb.x - pc.x);
          const arc = document.createElementNS(NS, 'path');
          arc.setAttribute('d', `M${pa.x} ${pa.y} A${rayon} ${rayon} 0 0 ${croix > 0 ? 1 : 0} ${pb.x} ${pb.y}`);
          arc.setAttribute('fill', 'none');
          arc.setAttribute('stroke', SVG_INK);
          arc.setAttribute('stroke-width', '0.7');
          arc.setAttribute('stroke-dasharray', '3 2');
          groupe.appendChild(arc);
        }
      });
    });
  });
}
