// Navigation dans la vue : zoom molette, pincement, deplacement a trois doigts
// (spec §3.2, interaction/pointer.ts).
//
// Ce module ne contient que le calcul : il prend une scene et rend la scene suivante. Le cablage
// des evenements reste dans legacy.ts, avec les identifiants de pointeur et les rectangles du DOM.
//
// Separer ainsi n'est pas cosmetique. La transformation de vue est le seul etat que les golden
// files ne peuvent pas surveiller - un export est recalcule dans son propre repere. C'est
// precisement la que s'est glissee une regression (deux scenes en parallele, zoom inerte) : ces
// fonctions pures sont desormais couvertes par des tests.

import { versMonde, type EtatScene } from '../render/scene.js';
import type { PtEcran, PtBrut } from '../model/types.js';

/** Bornes du zoom, en pixels par metre. En dessous le plan est illisible, au-dessus il n'a plus de sens. */
export const ZOOM_MIN = 6;
export const ZOOM_MAX = 220;

/** Facteur applique a un cran de molette. */
export const FACTEUR_MOLETTE = 1.1;

const borner = (echelle: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, echelle));

/**
 * Zoom centre sur un point de l'ecran : ce point garde exactement la meme position apres le zoom.
 * C'est ce qui donne l'impression de « tirer » le plan vers soi plutot que de le voir glisser.
 */
export function zoomerAutourDe(scene: EtatScene, pointEcran: PtEcran, facteur: number): EtatScene {
  const monde = versMonde(scene, pointEcran);
  const scale = borner(scene.scale * facteur);
  return {
    ...scene,
    scale,
    origine: { x: pointEcran.x - monde.x * scale, y: pointEcran.y + monde.y * scale }
  };
}

/** Un cran de molette : vers le haut on se rapproche. */
export function zoomMolette(scene: EtatScene, pointEcran: PtEcran, deltaY: number): EtatScene {
  return zoomerAutourDe(scene, pointEcran, deltaY < 0 ? FACTEUR_MOLETTE : 1 / FACTEUR_MOLETTE);
}

/** Etat retenu au debut d'un pincement : ce qu'il faut pour que le geste reste continu. */
export interface DebutPincement {
  distance0: number;
  echelle0: number;
  /** Le point du plan sous le milieu des deux doigts : c'est lui qui reste sous les doigts. */
  milieuMonde: PtBrut;
}

export function debutPincement(scene: EtatScene, a: PtEcran, b: PtEcran): DebutPincement {
  const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return {
    distance0: Math.hypot(a.x - b.x, a.y - b.y),
    echelle0: scene.scale,
    milieuMonde: versMonde(scene, milieu)
  };
}

/**
 * Pincement en cours : l'echelle suit le rapport des ecartements, et le point du plan saisi au
 * depart reste sous le milieu des doigts - y compris quand la main se deplace en pincant.
 */
export function pincer(scene: EtatScene, debut: DebutPincement, a: PtEcran, b: PtEcran): EtatScene {
  const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  const scale = borner(debut.echelle0 * (d / debut.distance0));
  return {
    ...scene,
    scale,
    origine: { x: milieu.x - debut.milieuMonde.x * scale, y: milieu.y + debut.milieuMonde.y * scale }
  };
}

/** Deplacement : la vue suit le doigt, l'echelle ne bouge pas. */
export function deplacer(scene: EtatScene, origine0: PtEcran, depuis: PtEcran, vers: PtEcran): EtatScene {
  return {
    ...scene,
    origine: { x: origine0.x + (vers.x - depuis.x), y: origine0.y + (vers.y - depuis.y) }
  };
}

/** Moyenne d'un ensemble de points - le « centre » de plusieurs doigts. */
export function milieuDe(points: PtEcran[]): PtEcran {
  const n = points.length;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n
  };
}
