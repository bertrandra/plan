// Export DXF du plan (spec §3.2, export/).
//
// Le DXF est le format qu'un bureau d'etudes ou un artisan ouvrira dans son logiciel de CAO. Il ne
// porte donc ni couleur ni etiquette : seulement des entites geometriques, rangees par calque.
//
// Le calque d'une forme est **son nom**, nettoye de tout ce qui n'est pas alphanumerique. C'est ce
// qui permet, a l'arrivee, d'allumer et d'eteindre « Terrasse » ou « Maison » separement.

import { dxfNum } from './dxf.js';
import { escapeXml } from '../util/escape.js';
import { geometrieMesure, type Mesure } from '../render/measures.js';
import type { PtBrut } from '../model/types.js';

interface ObjetPlan {
  key: string;
  type?: string;
  name: string;
  pts?: PtBrut[];
  center?: PtBrut;
  r?: number;
}

/** Nom de calque DXF : un nom d'objet ne peut pas y garder ses espaces ni ses accents. */
function calque(nom: string): string {
  return escapeXml(nom).replace(/[^\w-]/g, '_');
}

/**
 * Construit le fichier DXF complet.
 *
 * `signature` est ecrite en commentaire `999` avant toute section — admis par le format, et lu par
 * la plupart des logiciels. Ce fichier arrive souvent seul chez un tiers : il doit dire de quelle
 * version du logiciel il sort (RELEASE.md §5.2).
 */
export function construireDXF(
  objets: ObjetPlan[],
  mesures: (Mesure & { show?: boolean })[],
  signature: string
): string {
  let ents = '';
  objets.forEach((obj) => {
    if (obj.type === 'polygon') {
      // 70/1 = polyligne fermee : un terrain ou une terrasse est un contour, pas une ligne brisee.
      ents += '0\nLWPOLYLINE\n8\n' + calque(obj.name) + '\n90\n' + obj.pts!.length + '\n70\n1\n';
      obj.pts!.forEach((p) => {
        ents += '10\n' + dxfNum(p.x) + '\n20\n' + dxfNum(p.y) + '\n';
      });
    } else if (obj.type === 'path') {
      // 70/0 = polyligne ouverte : un cheminement ou une limite ne se referme pas.
      ents += '0\nLWPOLYLINE\n8\n' + calque(obj.name) + '\n90\n' + obj.pts!.length + '\n70\n0\n';
      obj.pts!.forEach((p) => {
        ents += '10\n' + dxfNum(p.x) + '\n20\n' + dxfNum(p.y) + '\n';
      });
    } else {
      ents += '0\nCIRCLE\n8\n' + calque(obj.name) + '\n10\n' + dxfNum(obj.center!.x) + '\n20\n' + dxfNum(obj.center!.y) + '\n40\n' + dxfNum(obj.r!) + '\n';
    }
  });

  // Les cotes vont toutes sur un calque unique : on les eteint d'un geste a l'arrivee.
  mesures.forEach((m) => {
    if (!m.show) return;
    const g = geometrieMesure(objets, m);
    if (!g) return;
    ents += '0\nLINE\n8\nMESURES\n10\n' + dxfNum(g.foot.x) + '\n20\n' + dxfNum(g.foot.y) + '\n11\n' + dxfNum(g.p.x) + '\n21\n' + dxfNum(g.p.y) + '\n';
    ents += '0\nLINE\n8\nMESURES\n10\n' + dxfNum(g.A.x) + '\n20\n' + dxfNum(g.A.y) + '\n11\n' + dxfNum(g.foot.x) + '\n21\n' + dxfNum(g.foot.y) + '\n';
  });

  return '999\n' + signature.replace(/[\r\n]/g, ' ') + '\n'
    + '0\nSECTION\n2\nENTITIES\n' + ents + '0\nENDSEC\n0\nEOF\n';
}
