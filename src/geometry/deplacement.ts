// Le deplacement rigide d'un contour : une rotation puis une translation, sans deformation (MD/spec-ouvrages.md, etape 6.3).
//
// Un objet glisse, aligne par rotation ou remis a sa place bouge d'un bloc ; ce qu'il porte en coordonnees absolues (les corps
// d'un toit, ses cheminees) doit le suivre exactement. Un contour deforme (un sommet tire) n'est pas un deplacement rigide :
// rien ne suit, faute de savoir comment.

import { au } from '../util/tableaux.js';
import type { PtBrut } from '../model/types.js';

/** p' = R(angle) . p + (dx, dy), l'angle en radians, sens trigonometrique. */
export interface DeplacementRigide {
  angle: number;
  dx: number;
  dy: number;
}

/** L'image d'un point par le deplacement. */
export function deplacerPoint(d: DeplacementRigide, p: PtBrut): PtBrut {
  const c = Math.cos(d.angle), s = Math.sin(d.angle);
  return { x: c * p.x - s * p.y + d.dx, y: s * p.x + c * p.y + d.dy };
}

/** Le deplacement rigide qui mene `avant` sur `apres`, point a point ; `null` s'il n'y en a pas, ou s'il ne bouge rien. */
export function deplacementRigide(avant: readonly PtBrut[], apres: readonly PtBrut[], tolerance = 1e-6): DeplacementRigide | null {
  if (avant.length !== apres.length || avant.length < 2) return null;
  const a0 = au(avant, 0), a1 = au(avant, 1), b0 = au(apres, 0), b1 = au(apres, 1);
  const angle = Math.atan2(b1.y - b0.y, b1.x - b0.x) - Math.atan2(a1.y - a0.y, a1.x - a0.x);
  const c = Math.cos(angle), s = Math.sin(angle);
  const d: DeplacementRigide = { angle, dx: b0.x - (c * a0.x - s * a0.y), dy: b0.y - (s * a0.x + c * a0.y) };
  for (let i = 0; i < avant.length; i++) {
    const q = deplacerPoint(d, au(avant, i)), b = au(apres, i);
    if (Math.abs(q.x - b.x) > tolerance || Math.abs(q.y - b.y) > tolerance) return null;
  }
  const immobile = Math.abs(Math.sin(angle)) < 1e-12 && Math.cos(angle) > 0 && Math.abs(d.dx) < 1e-12 && Math.abs(d.dy) < 1e-12;
  return immobile ? null : d;
}
