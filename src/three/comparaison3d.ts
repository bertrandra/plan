// L'avant et l'apres des propositions d'un audit, en deux vues dans la meme Vue 3D (MD/spec-audit.md
// §14.1, demande de l'utilisateur du 15 octobre 2026 : « deux vues 3D, avant / après, afin de
// pouvoir décider »).
//
// Une seule scene, un seul contexte WebGL, une seule camera, rendus deux fois par image dans deux
// rectangles du meme canevas (viewport et scissor) :
// - deux scenes, ou deux contextes, doubleraient la memoire et le temps de construction, et un
//   telephone refuse vite un contexte de plus (three/scene.ts::monterScene) ;
// - une seule camera rend la synchronisation exacte par construction : tourner, zoomer ou deplacer
//   dans l'une des vues deplace la camera que les deux montrent, il n'y a rien a recopier ;
// - ce qui differe entre les deux vues passe par les couches de three.js : les batiments touches
//   tels qu'ils sont (COUCHE_AVANT) et leurs copies avec les propositions cochees (COUCHE_APRES) ;
//   tout le reste est sur la couche 0, vue des deux cotes. Les ombres suivent les couches de la
//   camera (WebGLShadowMap r128), donc chaque vue a les siennes.
//
// Les rectangles evitent l'ecran des propositions pose sur la Vue 3D : la zone libre est le plus grand
// bandeau du canevas a cote de lui, coupee en deux cote a cote ou l'une au-dessus de l'autre selon ce
// qui laisse a chaque vue la forme la plus proche du 4:3.
//
// A l'arret, la boucle d'animation ne redessine plus a chaque image : seulement quand la camera a
// bouge, et sinon toutes les DELAI_REPOS_MS (une texture arrivee entre-temps se montre ainsi).

import type * as THREE_NS from 'three';
import { affichage3d, signaler3d, type SceneTroisBase } from './etat3d.js';

/** La couche des batiments tels qu'ils sont dans le projet, vue seulement dans « Avant ». */
export const COUCHE_AVANT = 1;
/** La couche de leurs copies avec les propositions cochees, vue seulement dans « Après ». */
export const COUCHE_APRES = 2;
/** L'ecart entre les deux vues, en pixels CSS : un filet les separe (zones/vue3d/Vue3d.tsx). */
export const ECART_VUES_PX = 4;
/** A l'arret, une image toutes les… : de quoi montrer une texture arrivee, sans tourner a vide. */
export const DELAI_REPOS_MS = 400;
/** La forme visee pour chaque vue : celle d'une photo, ou une maison se lit bien. */
const FORME_VISEE = 4 / 3;

/** Un rectangle en pixels CSS : relatif au canevas pour les vues, a la fenetre pour l'ecran pose dessus. */
export interface Rect { x: number; y: number; l: number; h: number }
/** Un rectangle de la fenetre, comme le rend `getBoundingClientRect`. */
export interface RectFenetre { left: number; top: number; right: number; bottom: number }
export interface DeuxVues { avant: Rect; apres: Rect; sens: 'cote' | 'pile' }

/**
 * La part du canevas que l'ecran des propositions ne cache pas : le plus grand des quatre bandeaux
 * autour de lui (au-dessus, au-dessous, a gauche, a droite). Sans ecran, ou hors du canevas, tout.
 */
export function zoneLibre(canevas: RectFenetre, panneau: RectFenetre | null): Rect {
  const L = canevas.right - canevas.left, H = canevas.bottom - canevas.top;
  const tout: Rect = { x: 0, y: 0, l: L, h: H };
  if (!panneau) return tout;
  const g = Math.max(0, panneau.left - canevas.left), d = Math.min(L, panneau.right - canevas.left);
  const h = Math.max(0, panneau.top - canevas.top), b = Math.min(H, panneau.bottom - canevas.top);
  if (d <= g || b <= h) return tout;
  const bandeaux: Rect[] = [
    { x: 0, y: 0, l: L, h },
    { x: 0, y: b, l: L, h: H - b },
    { x: 0, y: 0, l: g, h: H },
    { x: d, y: 0, l: L - d, h: H },
  ];
  let meilleur = bandeaux[0] as Rect;
  for (const r of bandeaux) if (r.l * r.h > meilleur.l * meilleur.h) meilleur = r;
  return meilleur;
}

/** L'ecart d'une forme a 4:3, en rapport : 2:3 et 8:3 en sont aussi loin l'un que l'autre. */
const ecartForme = (l: number, h: number) => Math.abs(Math.log(Math.max(1, l) / Math.max(1, h) / FORME_VISEE));

/**
 * Coupe la zone libre en deux vues de meme taille, « Avant » a gauche ou en haut : cote a cote ou
 * l'une au-dessus de l'autre, selon ce qui donne a chacune la forme la plus proche du 4:3 (a egalite,
 * cote a cote). En pixels entiers : le scissor n'en connait pas d'autres.
 */
export function decouperEnDeux(zone: Rect, ecart = ECART_VUES_PX): DeuxVues {
  const x = Math.round(zone.x), y = Math.round(zone.y), L = Math.round(zone.l), H = Math.round(zone.h);
  const lc = Math.max(1, Math.floor((L - ecart) / 2)), hp = Math.max(1, Math.floor((H - ecart) / 2));
  if (ecartForme(lc, H) <= ecartForme(L, hp)) {
    return { sens: 'cote', avant: { x, y, l: lc, h: Math.max(1, H) }, apres: { x: x + L - lc, y, l: lc, h: Math.max(1, H) } };
  }
  return { sens: 'pile', avant: { x, y, l: Math.max(1, L), h: hp }, apres: { x, y: y + H - hp, l: Math.max(1, L), h: hp } };
}

const memesVues = (a: DeuxVues | null, b: DeuxVues | null) => JSON.stringify(a) === JSON.stringify(b);

/** Ce que les deux vues gardent en main : l'ecran pose dessus, la derniere image. */
const etat: { panneau: RectFenetre | null; pose: number[] | null; t: number } = { panneau: null, pose: null, t: 0 };

/** Ce qui fait l'image : la position, l'orientation et la focale de la camera, et la taille du canevas. */
function poseDe(sc: SceneTroisBase): number[] {
  const c = sc.camera, el = sc.renderer.domElement;
  return [c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w, c.fov, c.zoom, el.clientWidth, el.clientHeight];
}

/**
 * Faut-il redessiner : la camera ou le canevas ont change depuis la derniere image, ou elle date de
 * plus de `delai` ms. Pure : le rendu a la demande se teste sans WebGL.
 */
export function aRedessiner(derniere: readonly number[] | null, pose: readonly number[], depuisMs: number, delai = DELAI_REPOS_MS): boolean {
  if (!derniere || depuisMs >= delai || derniere.length !== pose.length) return true;
  return pose.some((v, i) => Math.abs(v - (derniere[i] as number)) > 1e-9);
}

const maintenant = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** La boucle d'animation de la Vue 3D : en deux vues, elle saute les images qui seraient identiques. */
export function imageAttendue(sc: SceneTroisBase, t = maintenant()): boolean {
  if (!sc.enDeux) return true;
  return aRedessiner(etat.pose, poseDe(sc), t - etat.t);
}

/** Les deux vues du canevas de cette scene, d'apres l'ecran pose dessus. */
export function vuesDe(sc: SceneTroisBase): DeuxVues {
  const el = sc.renderer.domElement;
  const r = el.getBoundingClientRect();
  // Le canevas mesure en pixels CSS ce que l'on rend : sa boite peut etre nulle hors du document (tests).
  const canevas = r.right > r.left && r.bottom > r.top ? r : { left: 0, top: 0, right: el.clientWidth, bottom: el.clientHeight };
  return decouperEnDeux(zoneLibre(canevas, etat.panneau));
}

/**
 * Rend les deux vues : le canevas entier au fond de la scene (le bord que l'ecran ne couvre pas, le
 * filet entre les vues), puis chaque vue dans son rectangle, avec la meme camera a la forme de la
 * vue, et les couches de son cote. La camera est rendue telle qu'elle etait (forme, couches) : les
 * cadrages et les clics la lisent comme si la vue etait unique. Le rendu simple (`renderer.render`) :
 * l'occlusion de la qualite Soignee rend dans des cibles plein cadre, que le scissor ne decoupe pas.
 */
export function rendreEnDeux(sc: SceneTroisBase, t = maintenant()): DeuxVues {
  const { renderer: r, camera: cam, scene } = sc;
  const el = r.domElement;
  const L = el.clientWidth || 1, H = el.clientHeight || 1;
  const vues = vuesDe(sc);
  const forme = cam.aspect, masque = cam.layers.mask;
  r.setScissorTest(true);
  r.setViewport(0, 0, L, H);
  r.setScissor(0, 0, L, H);
  const fond = scene.background as THREE_NS.Color | null;
  if (fond && fond.isColor) {
    // Le fond de la scene, pas la couleur d'effacement du rendu (noire par defaut) ; rendue ensuite.
    const avant = r.getClearColor(fond.clone()), alpha = r.getClearAlpha();
    r.setClearColor(fond, 1);
    r.clear();
    r.setClearColor(avant, alpha);
  } else r.clear();
  for (const [v, couche] of [[vues.avant, COUCHE_AVANT], [vues.apres, COUCHE_APRES]] as const) {
    // Le viewport compte depuis le bas du canevas, les rectangles depuis le haut.
    const y = H - v.y - v.h;
    r.setViewport(v.x, y, v.l, v.h);
    r.setScissor(v.x, y, v.l, v.h);
    cam.aspect = v.l / v.h;
    cam.updateProjectionMatrix();
    cam.layers.set(0);
    cam.layers.enable(couche);
    r.render(scene, cam);
  }
  r.setScissorTest(false);
  r.setViewport(0, 0, L, H);
  cam.layers.mask = masque;
  cam.aspect = forme;
  cam.updateProjectionMatrix();
  etat.pose = poseDe(sc);
  etat.t = t;
  // Les etiquettes « Avant » et « Après » suivent les vues ; on ne le dit aux zones que s'il a change.
  if (!memesVues(affichage3d.comparaison, vues)) { affichage3d.comparaison = vues; signaler3d(); }
  return vues;
}

/** Passe cette scene en deux vues : tout rendu passe desormais par `rendreEnDeux` (etat3d.ts::rendre3d). */
export function activerDeuxVues(sc: SceneTroisBase): void {
  sc.enDeux = () => { rendreEnDeux(sc); };
  etat.pose = null;
}

/** Revient a la vue unique : la camera reprend la forme du canevas, les etiquettes disparaissent. */
export function couperDeuxVues(sc: SceneTroisBase | null): void {
  if (sc?.enDeux) {
    delete sc.enDeux;
    const el = sc.renderer.domElement;
    sc.camera.aspect = (el.clientWidth || 1) / (el.clientHeight || 1);
    sc.camera.updateProjectionMatrix();
  }
  etat.pose = null;
  if (affichage3d.comparaison) { affichage3d.comparaison = null; signaler3d(); }
}

/**
 * Ou est l'ecran pose sur la Vue 3D (en pixels de la fenetre ; null : il n'y en a plus). Les vues
 * l'evitent des la prochaine image, rendue tout de suite si une scene est en deux vues.
 */
export function cadrerDeuxVues(panneau: RectFenetre | null, sc: SceneTroisBase | null): void {
  etat.panneau = panneau ? { left: panneau.left, top: panneau.top, right: panneau.right, bottom: panneau.bottom } : null;
  etat.pose = null;
  if (sc?.enDeux) sc.enDeux();
}

/**
 * Ce que montre un point de la fenetre, la ou il tombe : en deux vues, la vue sous le pointeur, avec
 * la camera a sa forme le temps de `f` (un rayon lance avec la forme du canevas entier viserait a
 * cote) ; sinon le canevas entier. `f` recoit les coordonnees normalisees (-1..1) dans cette vue.
 */
export function sousLePointeur<T>(sc: SceneTroisBase, clientX: number, clientY: number, f: (ndc: { x: number; y: number }) => T): T {
  const r = sc.renderer.domElement.getBoundingClientRect();
  const px = clientX - r.left, py = clientY - r.top;
  const vues = sc.enDeux ? affichage3d.comparaison : null;
  const v = vues ? ([vues.avant, vues.apres].find((w) => px >= w.x && px <= w.x + w.l && py >= w.y && py <= w.y + w.h) ?? null) : null;
  if (!v) return f({ x: (px / (r.width || 1)) * 2 - 1, y: -(py / (r.height || 1)) * 2 + 1 });
  const cam = sc.camera, forme = cam.aspect;
  cam.aspect = v.l / v.h;
  cam.updateProjectionMatrix();
  try {
    return f({ x: ((px - v.x) / v.l) * 2 - 1, y: -((py - v.y) / v.h) * 2 + 1 });
  } finally {
    cam.aspect = forme;
    cam.updateProjectionMatrix();
  }
}
