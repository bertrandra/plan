// Calque des pergolas sur le plan : la charpente vue de dessus (render/).
//
// Le polygone de la pergola est dessine comme tout objet ; ce calque pose par-dessus ce que l'on
// verrait d'en haut, a l'echelle : les poutres du cadre, le faitage et les aretiers, les chevrons,
// et les poteaux en carres pleins — ce sont eux qui comptent au sol (un poteau au milieu d'un
// passage, sur une regard). Les contrefiches, sous les poutres, ne se voient pas d'en haut.

import { creerSvg } from './svg.js';
import { versEcran, type EtatScene } from '../geometry/vue.js';
import { calculerPergola, dimsPergola } from '../engine/pergola.js';
import { estPergola } from '../model/fonctions.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';

export interface EtatCalquePergolas {
  objects: ObjetPlan[];
  scene: EtatScene;
  /** La terrasse isolee : tout le reste est masque (app/isolement.ts). */
  isolement?: string | null;
}

function trait(g: SVGElement, scene: EtatScene, a: PtBrut, b: PtBrut, largeurM: number, couleur: string, opacite: number): void {
  const pa = versEcran(scene, a), pb = versEcran(scene, b);
  const l = creerSvg('line');
  l.setAttribute('x1', String(pa.x)); l.setAttribute('y1', String(pa.y));
  l.setAttribute('x2', String(pb.x)); l.setAttribute('y2', String(pb.y));
  l.setAttribute('stroke', couleur); l.setAttribute('stroke-opacity', String(opacite));
  // A l'echelle, mais jamais sous un pixel : un chevron de 45 mm vu de loin disparaitrait.
  l.setAttribute('stroke-width', String(Math.max(1, largeurM * scene.scale)));
  g.appendChild(l);
}

export function dessinerCalquePergolas(groupe: SVGElement, etat: EtatCalquePergolas): void {
  groupe.innerHTML = '';
  const scene = etat.scene;
  etat.objects
    .filter(o => estPergola(o) && !o.hidden && (etat.isolement == null || o.key === etat.isolement))
    .forEach(o => {
      const calc = calculerPergola(o);
      if (!calc) return;
      const couleur = o.stroke || '#6b4a2a';
      const ordre = ['poutre', 'faitage', 'aretier', 'chevron'] as const;
      ordre.forEach(role => calc.pieces.filter(p => p.role === role).forEach(p =>
        trait(groupe, scene, p.a, p.b, dimsPergola(p.section).b, couleur, role === 'chevron' ? 0.7 : 0.9)));
      // Les poteaux, alignes sur le cote de reference : ce sont eux qu'on pose au sol.
      const pts = o.type === 'polygon' ? o.pts : [];
      const ra = pts[calc.reglages.coteReference], rb = pts[(calc.reglages.coteReference + 1) % pts.length];
      const angle = ra && rb ? Math.atan2(-(rb.y - ra.y), rb.x - ra.x) * 180 / Math.PI : 0;
      calc.pieces.filter(p => p.role === 'poteau').forEach(p => {
        const c = versEcran(scene, p.a);
        const cote = Math.max(4, dimsPergola(p.section).b * scene.scale);
        const r = creerSvg('rect');
        r.setAttribute('x', String(c.x - cote / 2)); r.setAttribute('y', String(c.y - cote / 2));
        r.setAttribute('width', String(cote)); r.setAttribute('height', String(cote));
        r.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' ' + c.x + ' ' + c.y + ')');
        r.setAttribute('fill', couleur);
        groupe.appendChild(r);
      });
    });
}
