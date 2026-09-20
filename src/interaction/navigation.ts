// Navigation dans la vue : zoom molette, pincement, deplacement a trois doigts
// (spec §3.2, interaction/pointer.ts).
//
// Ce module ne contient que le calcul : il prend une scene et rend la scene suivante. Le cablage
// des evenements vit dans interaction/pointeur.ts, avec les identifiants de pointeur et les
// rectangles du DOM.
//
// Separer ainsi n'est pas cosmetique. La transformation de vue est le seul etat que les golden
// files ne peuvent pas surveiller - un export est recalcule dans son propre repere. C'est
// precisement la que s'est glissee une regression (deux scenes en parallele, zoom inerte) : ces
// fonctions pures sont desormais couvertes par des tests.

import { versMonde, type EtatScene } from '../geometry/vue.js';
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

/** Emprise rectangulaire a cadrer, en metres. */
export interface Emprise {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Cadre la vue sur une emprise : elle occupe la scene, centree, avec `marge` pixels de respiration.
 *
 * Note de migration : le plafond de zoom est ici de 400 px/m, alors que la molette et le pincement
 * sont bornes a 220 (ZOOM_MAX). L'ecart vient du fichier d'origine et est conserve tel quel
 * (§10.3) : cadrer sur un tout petit objet peut donc depasser ce que la molette autorise.
 */
export function cadrerSur(scene: EtatScene, emprise: Emprise, marge = 80): EtatScene {
  const midX = (emprise.minX + emprise.maxX) / 2;
  const midY = (emprise.minY + emprise.maxY) / 2;
  // Un objet degenere (un point, un segment) aurait une etendue nulle : le plancher de 0,5 m
  // evite une echelle infinie.
  const spanX = Math.max(0.5, emprise.maxX - emprise.minX);
  const spanY = Math.max(0.5, emprise.maxY - emprise.minY);
  const scale = Math.max(
    ZOOM_MIN,
    Math.min(400, Math.min((scene.W - marge) / spanX, (scene.H - marge) / spanY))
  );
  return {
    ...scene,
    scale,
    origine: { x: scene.W / 2 - midX * scale, y: scene.H / 2 + midY * scale }
  };
}

/** Emprise d'une forme du plan : polygone, chemin ou cercle. */
export function empriseDe(formes: { type?: string; pts?: PtBrut[]; center?: PtBrut; r?: number }[]): Emprise | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const o of formes) {
    if (o.type === 'circle' && o.center && typeof o.r === 'number') {
      xs.push(o.center.x - o.r, o.center.x + o.r);
      ys.push(o.center.y - o.r, o.center.y + o.r);
    } else if (o.pts) {
      o.pts.forEach((p) => {
        xs.push(p.x);
        ys.push(p.y);
      });
    }
  }
  if (!xs.length) return null;
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Moyenne d'un ensemble de points - le « centre » de plusieurs doigts. */
export function milieuDe(points: PtEcran[]): PtEcran {
  const n = points.length;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n
  };
}
