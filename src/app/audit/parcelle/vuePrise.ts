// La Vue 3D de « Photographier en marchant » (MD/spec-audit.md §12.1, demande de l'utilisateur du
// 14 octobre 2026) : une vue a hauteur d'homme, prise quelques metres derriere vous pour avoir le
// recul qui fait reconnaitre la facade, et qui suit votre position et votre cap (boussole, sinon sens
// de la marche). Ce n'est pas une image fixe : chaque position et chaque cap la redessinent.
//
// L'essai sur le terrain d'AE 101 (14 octobre) a montre ce qu'il fallait de plus :
// - la facade visee etait a moitie cachee par l'ecran de prise, pose en bas de la vue : la camera
//   cadre desormais la partie visible au-dessus de lui (`cadrer`), avec un champ plus large, et le
//   regard monte vers le milieu de la facade visee plutot que d'un angle fixe ;
// - adosse a un mur ou a une haie de batiments, le recul mettait la camera dedans : il s'arrete
//   avant le premier mur derriere vous ;
// - la vue sautait a chaque position : elle glisse de l'une a l'autre.
//
// Un doigt qui fait tourner la vue la garde un moment (PAUSE_GESTE_MS) : le suivi reprend tout seul
// ensuite, sans bouton de plus sur l'ecran de prise.
//
// Le second essai d'AE 101 (15 octobre) : pour CHOISIR une facade (la toucher), la vue a hauteur
// d'homme est trop pres, on n'y voit qu'un mur. Tant que rien n'est vise depuis votre position, la
// vue est une vue d'ensemble en grand angle (`poseEnsemble`) : tout le batiment audite, d'un peu
// haut, au-dessus de l'ecran de prise, ou chaque facade se touche. La vue a hauteur d'homme ne sert
// plus qu'a la prise elle-meme (une position et une facade visee) : c'est elle qui montre le mur
// tel que l'appareil photo le voit. Son champ s'elargit pour que la facade entiere y tienne.
//
// Les calculs sont dans le repere du plan (y vers le nord) ; la pose dans la scene passe par son
// repere local (three/primitives.ts::versLocalDepuis : x vers l'est, z vers le sud, y vers le haut).

import { vue3d } from '../../../three/etat3d.js';
import { versLocalDepuis } from '../../../three/primitives.js';
import { solDeLaFacadeDevant } from '../../../three/facadeDevant3d.js';
import { distancePointSegment, lineSegIntersect } from '../../../geometry/segments.js';
import { sommetDe } from '../../../geometry/anneau.js';
import { au } from '../../../util/tableaux.js';
import { TOLERANCE_CAP_DEG } from '../../../facade/priseDeVue.js';
import type { Facade } from '../../../facade/geometrie.js';
import type { PtBrut } from '../../../model/types.js';

/** La hauteur des yeux au-dessus du sol. */
export const OEIL_M = 1.7;
/** La camera se tient derriere vous de cela : a 3 m d'un mur, on le voit encore en entier. */
export const RECUL_PIETON_M = 6;
/** Le recul s'arrete a cela d'un mur derriere vous : la camera ne passe jamais au travers. */
export const MARGE_MUR_M = 0.6;
/** Sans facade visee, le regard monte de cela au-dessus de l'horizontale. */
export const REGARD_HAUT_DEG = 10;
/** Le point vise, sans facade, est a cela devant vous : c'est aussi le centre autour duquel le doigt fait tourner la vue. */
const VISEE_M = 12;
/** Le regard vise la facade a cette part de sa hauteur : un peu au-dessus du milieu, la ou sont les fenetres. */
const PART_HAUTEUR_VISEE = 0.55;
/** Le champ vertical de la partie visible de la vue, au-dessus de l'ecran de prise. */
export const CHAMP_VISIBLE_DEG = 50;
/** Le champ vertical, au plus, quand la vue s'elargit pour que la facade visee tienne en entier. */
export const CHAMP_PIETON_MAX_DEG = 75;
/** Le grand angle de la vue d'ensemble : le champ vertical de sa partie visible. */
export const CHAMP_ENSEMBLE_DEG = 60;
/** La vue d'ensemble regarde le batiment de cette hauteur au-dessus de l'horizontale. */
export const ELEVATION_ENSEMBLE_DEG = 35;
/** Le batiment ne touche pas les bords de la vue d'ensemble : un peu d'air autour. */
const MARGE_ENSEMBLE = 1.12;
/** Apres un geste du doigt sur la vue, le suivi attend cela avant de reprendre. */
export const PAUSE_GESTE_MS = 6000;
/** Plus pres que cela du milieu de la facade, la direction vers elle ne veut plus rien dire. */
const PROCHE_M = 0.5;
/**
 * Le temps de glissement de la camera vers sa nouvelle pose : les deux tiers du chemin en autant de
 * millisecondes, quelle que soit la cadence des images (un telephone charge en dessine moins).
 */
const GLISSEMENT_MS = 140;

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * La camera a poser : l'oeil et le point vise, avec leurs hauteurs au-dessus du sol ; `champ`, le champ
 * vertical de la partie visible (CHAMP_VISIBLE_DEG par defaut).
 */
export interface PosePieton { oeil: PtBrut; hauteurOeil: number; vise: PtBrut; hauteurVise: number; champ?: number }

/**
 * Ce que la vue d'ensemble doit montrer : le centre et le rayon (en plan) de ce qu'elle cadre, sa
 * hauteur, et la direction du regard (depuis le nord, sens horaire) ; `null` garde celle de la camera.
 */
export interface CadreEnsemble { centre: PtBrut; rayon: number; hauteur: number; azimutDeg: number | null }

/** Le cadre de ces contours (en plan) et de cette hauteur ; null s'il n'y a aucun point. */
export function cadreDe(contours: readonly (readonly PtBrut[])[], hauteur: number, azimutDeg: number | null): CadreEnsemble | null {
  const pts = contours.flat();
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const rayon = Math.max(...pts.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)));
  return { centre, rayon, hauteur, azimutDeg };
}

/**
 * La vue d'ensemble : le regard sur le centre du cadre, a mi-hauteur, incline de ELEVATION_ENSEMBLE_DEG,
 * d'assez loin pour que la sphere qui l'entoure tienne dans la partie visible (`rapport` : sa largeur
 * sur sa hauteur ; un telephone debout est plus etroit que haut, c'est alors la largeur qui borne).
 */
export function poseEnsemble(c: CadreEnsemble, azimutDeg: number, rapport: number): PosePieton {
  const demiV = rad(CHAMP_ENSEMBLE_DEG) / 2;
  const demi = Math.atan(Math.min(Math.tan(demiV), Math.tan(demiV) * Math.max(0.1, rapport)));
  const sphere = Math.max(1, Math.hypot(c.rayon, c.hauteur / 2));
  const d = (sphere / Math.sin(demi)) * MARGE_ENSEMBLE;
  const a = rad(azimutDeg), el = rad(ELEVATION_ENSEMBLE_DEG);
  const recul = d * Math.cos(el);
  return {
    oeil: { x: c.centre.x - Math.sin(a) * recul, y: c.centre.y - Math.cos(a) * recul }, hauteurOeil: c.hauteur / 2 + d * Math.sin(el),
    vise: c.centre, hauteurVise: c.hauteur / 2, champ: CHAMP_ENSEMBLE_DEG,
  };
}

/**
 * Le champ de la vue a hauteur d'homme pour que la facade visee tienne en largeur dans la partie
 * visible, vue d'ici : CHAMP_VISIBLE_DEG au moins, CHAMP_PIETON_MAX_DEG au plus (au-dela, tout se
 * deforme sur les bords).
 */
export function champPourLaFacade(oeil: PtBrut, facade: Facade, rapport: number): number {
  const mx = (facade.gauche.x + facade.droite.x) / 2 - oeil.x, my = (facade.gauche.y + facade.droite.y) / 2 - oeil.y;
  const d = Math.max(PROCHE_M, Math.hypot(mx, my));
  const demiLargeur = Math.hypot(facade.droite.x - facade.gauche.x, facade.droite.y - facade.gauche.y) / 2 * MARGE_ENSEMBLE;
  const demiH = Math.atan(demiLargeur / d);
  const demiV = Math.atan(Math.tan(demiH) / Math.max(0.1, rapport));
  return Math.min(CHAMP_PIETON_MAX_DEG, Math.max(CHAMP_VISIBLE_DEG, (2 * demiV * 180) / Math.PI));
}

/**
 * Le cap de la vue : celui des capteurs (boussole, sinon marche) tant que la facade visee est dans
 * l'axe, a TOLERANCE_CAP_DEG pres ; sans eux, ou quand vous lui tournez le dos (la vue epuree ne
 * montrait alors que le ciel et le gazon), la direction de la facade visee, pour qu'elle soit au
 * milieu de l'image ; sinon le nord.
 */
export function capDeLaVue(p: PtBrut, cap: number | null, facade: Facade | null): number {
  let versFacade: number | null = null;
  if (facade) {
    const mx = (facade.gauche.x + facade.droite.x) / 2 - p.x, my = (facade.gauche.y + facade.droite.y) / 2 - p.y;
    if (Math.hypot(mx, my) > PROCHE_M) versFacade = ((Math.atan2(mx, my) * 180) / Math.PI + 360) % 360;
  }
  if (cap !== null && (versFacade === null || Math.abs(((cap - versFacade + 540) % 360) - 180) <= TOLERANCE_CAP_DEG)) return cap;
  return versFacade ?? cap ?? 0;
}

/**
 * Le recul possible derriere `p`, a l'oppose de la direction (dx, dy) : RECUL_PIETON_M, sauf si un
 * mur se trouve avant (moins la marge). Un point pose dans un batiment (le GPS se trompe) ne recule pas.
 */
export function reculLibre(p: PtBrut, dx: number, dy: number, murs: readonly (readonly PtBrut[])[]): number {
  let libre = Infinity;
  const arriere = { x: -dx, y: -dy };
  for (const m of murs) for (let i = 0; i < m.length; i++) {
    const r = lineSegIntersect(p, arriere, au(m, i), sommetDe(m, i + 1));
    if (r && r.t >= 0 && r.t < libre) libre = r.t;
  }
  return Math.max(0, Math.min(RECUL_PIETON_M, libre - MARGE_MUR_M));
}

/**
 * La pose de la camera pour une position `p` et un cap (depuis le nord, sens horaire, en degres).
 * Avec une facade visee, le regard monte vers elle, a PART_HAUTEUR_VISEE de sa hauteur, a la
 * distance ou l'axe du cap passe a sa hauteur ; sinon de REGARD_HAUT_DEG. Les murs bornent le recul.
 */
export function posePieton(p: PtBrut, capDeg: number, facade: Facade | null = null, murs: readonly (readonly PtBrut[])[] = [], rapport: number | null = null): PosePieton {
  const c = rad(capDeg), dx = Math.sin(c), dy = Math.cos(c);
  const recul = reculLibre(p, dx, dy, murs);
  const oeil = { x: p.x - dx * recul, y: p.y - dy * recul };
  if (facade) {
    const milieu = { x: (facade.gauche.x + facade.droite.x) / 2, y: (facade.gauche.y + facade.droite.y) / 2 };
    // La distance de l'oeil a la facade, comptee le long du cap ; jamais moins que le recul plus 3 m.
    const loin = Math.max(recul + 3, (milieu.x - oeil.x) * dx + (milieu.y - oeil.y) * dy);
    const pose: PosePieton = { oeil, hauteurOeil: OEIL_M, vise: { x: oeil.x + dx * loin, y: oeil.y + dy * loin }, hauteurVise: facade.hauteur * PART_HAUTEUR_VISEE };
    return rapport === null ? pose : { ...pose, champ: champPourLaFacade(oeil, facade, rapport) };
  }
  const loin = recul + VISEE_M;
  return { oeil, hauteurOeil: OEIL_M, vise: { x: oeil.x + dx * loin, y: oeil.y + dy * loin }, hauteurVise: OEIL_M + Math.tan(rad(REGARD_HAUT_DEG)) * loin };
}

/**
 * La facade d'un batiment que le doigt a touchee : celle dont le mur passe le plus pres du point
 * touche. Les facades mitoyennes n'ont rien a photographier : elles ne sont pas proposees.
 */
export function facadeTouchee<T extends { facade: Facade; statut: string }>(facades: readonly T[], point: PtBrut): T | null {
  let meilleure: T | null = null, d = Infinity;
  for (const f of facades) {
    if (f.statut === 'mitoyenne') continue;
    const e = distancePointSegment(point, f.facade.gauche, f.facade.droite);
    if (e < d) { d = e; meilleure = f; }
  }
  return meilleure;
}

/**
 * Le champ vertical de la camera entiere pour que la partie visible (la hauteur `h` moins l'ecran de
 * prise, `bas`) ait `champ` degres : la camera couvre aussi ce qu'il cache.
 */
export function champComplet(h: number, bas: number, champ: number = CHAMP_VISIBLE_DEG): number {
  const visible = Math.max(1, h - bas);
  return (2 * Math.atan(Math.tan(rad(champ) / 2) * (h + bas) / visible) * 180) / Math.PI;
}

/** Le coin haut gauche de l'ecran de l'audit pose sur la vue, en pixels de la fenetre. */
export interface CacheVue { haut: number; gauche: number }

/**
 * Ce que l'ecran de l'audit cache du canevas `r` : une carte en bas (telephone, tablette) cache le bas,
 * un panneau a droite (bureau) cache la droite. Jamais plus de 60 % de la vue.
 */
export function partieCachee(r: { left: number; right: number; bottom: number; width: number; height: number }, cache: CacheVue | null): { bas: number; droite: number } {
  if (!cache) return { bas: 0, droite: 0 };
  // Un panneau qui commence loin a droite du canevas en cache la droite ; sinon c'est une carte en bas.
  if (cache.gauche > r.left + r.width * 0.45) return { bas: 0, droite: Math.max(0, Math.min(r.width * 0.6, r.right - cache.gauche)) };
  return { bas: Math.max(0, Math.min(r.height * 0.6, r.bottom - cache.haut)), droite: 0 };
}

/**
 * La camera de la Vue 3D pilotee pendant l'audit. Sans scene, rien ne bouge (et rend faux).
 * `cadrer` dit ou commence l'ecran de l'audit (null : il ne cache rien) ; `rapportVisible` donne la
 * largeur sur la hauteur de ce qu'il laisse voir, `azimut` la direction du regard de la camera ;
 * `liberer` rend la camera telle qu'elle etait (champ, cadrage) quand l'ecran se ferme ; `arreter`
 * coupe le glissement en cours (un doigt prend la main).
 */
export interface VuePieton {
  poser(pose: PosePieton): boolean;
  cadrer?(cache: CacheVue | null): void;
  rapportVisible?(): number | null;
  azimut?(): number | null;
  liberer?(): void;
  arreter?(): void;
}

export function vuePieton(): VuePieton {
  let cache: CacheVue | null = null;
  let champAvant: number | null = null;
  let but: { o: { x: number; y: number; z: number }; v: { x: number; y: number; z: number } } | null = null;
  let anim: number | null = null, avant = 0;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  const maintenant = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  /** La taille du canevas et ce que l'ecran de l'audit en cache. */
  function mesure(): { w: number; h: number; bas: number; droite: number } | null {
    const sc = vue3d.scene;
    if (!sc) return null;
    const el = sc.renderer.domElement;
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    const r = el.getBoundingClientRect();
    return { w, h, ...partieCachee({ left: r.left, right: r.right, bottom: r.bottom, width: w, height: h }, cache) };
  }
  /** Le champ et le cadrage de la partie visible, a chaque pose : la vue a pu changer de taille. */
  function cadrage(champ: number): void {
    const sc = vue3d.scene, m = mesure();
    if (!sc || !m) return;
    if (champAvant === null) champAvant = sc.camera.fov;
    // La prise de vue tient la focale : la Vue 3D ne l'accorde plus a la hauteur (three/presentation.ts).
    vue3d.focaleBloquee = true;
    sc.camera.fov = champComplet(m.h, m.bas, champ);
    // La camera voit (w + droite) x (h + bas) pixels, centres sur l'axe ; on en montre les w x h du
    // haut a droite : l'axe tombe au milieu de la partie que l'ecran de l'audit laisse voir.
    sc.camera.aspect = (m.w + m.droite) / (m.h + m.bas);
    sc.camera.setViewOffset(m.w + m.droite, m.h + m.bas, m.droite, m.bas, m.w, m.h);
    sc.camera.updateProjectionMatrix();
  }
  function glisser(): void {
    anim = null;
    const sc = vue3d.scene;
    if (!sc || !but) return;
    const c = sc.camera.position, t = sc.controls.target;
    const ici = maintenant(), k = 1 - Math.exp(-Math.max(0, ici - avant) / GLISSEMENT_MS);
    avant = ici;
    c.set(c.x + (but.o.x - c.x) * k, c.y + (but.o.y - c.y) * k, c.z + (but.o.z - c.z) * k);
    t.set(t.x + (but.v.x - t.x) * k, t.y + (but.v.y - t.y) * k, t.z + (but.v.z - t.z) * k);
    sc.controls.update();
    const reste = Math.hypot(but.o.x - c.x, but.o.y - c.y, but.o.z - c.z) + Math.hypot(but.v.x - t.x, but.v.y - t.y, but.v.z - t.z);
    if (reste > 0.01 && raf) anim = raf(glisser);
  }
  return {
    poser(pose) {
      const sc = vue3d.scene;
      if (!sc) return false;
      cadrage(pose.champ ?? CHAMP_VISIBLE_DEG);
      const local = versLocalDepuis(sc.cen), sol = solDeLaFacadeDevant();
      const o = local(pose.oeil), v = local(pose.vise);
      const so = sol ? sol(pose.oeil) : 0, sv = sol ? sol(pose.vise) : 0;
      const premier = but === null;
      but = { o: { x: o.x, y: so + pose.hauteurOeil, z: o.z }, v: { x: v.x, y: sv + pose.hauteurVise, z: v.z } };
      // La premiere pose (l'ecran s'ouvre) est immediate ; les suivantes glissent.
      if (premier || !raf) {
        sc.camera.position.set(but.o.x, but.o.y, but.o.z);
        sc.controls.target.set(but.v.x, but.v.y, but.v.z);
        sc.controls.update();
      } else if (anim === null) { avant = maintenant(); anim = raf(glisser); }
      return true;
    },
    cadrer(c) { cache = c; },
    rapportVisible() {
      const m = mesure();
      return m ? Math.max(1, m.w - m.droite) / Math.max(1, m.h - m.bas) : null;
    },
    azimut() {
      const sc = vue3d.scene;
      if (!sc) return null;
      // Repere local : x vers l'est, z vers le sud ; le cap se compte depuis le nord, sens horaire.
      const dx = sc.controls.target.x - sc.camera.position.x, dz = sc.controls.target.z - sc.camera.position.z;
      return Math.hypot(dx, dz) < 1e-6 ? null : ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    },
    arreter() { but = null; },
    liberer() {
      but = null;
      vue3d.focaleBloquee = false;
      const sc = vue3d.scene;
      if (!sc || champAvant === null) return;
      const el = sc.renderer.domElement;
      sc.camera.clearViewOffset();
      sc.camera.fov = champAvant;
      sc.camera.aspect = (el.clientWidth || 1) / (el.clientHeight || 1);
      sc.camera.updateProjectionMatrix();
      champAvant = null;
    },
  };
}

/**
 * Le suivi de la vue pendant l'audit : a hauteur d'homme, il pose la camera a chaque position et a
 * chaque cap tant que l'ecran de prise est ouvert, sauf pendant la pause qui suit un geste du doigt ;
 * en vue d'ensemble, il ne la pose qu'a la demande (`ensemble`) et laisse le doigt la tourner.
 */
export function suiviPieton(vue: VuePieton, horloge: () => number = () => Date.now()) {
  let actif = false;
  let pauseJusqua = 0;
  return {
    /** L'ecran s'ouvre (vrai) ou se ferme (faux) : a la fermeture, la camera est rendue. */
    activer(oui: boolean): void {
      if (actif && !oui) vue.liberer?.();
      actif = oui;
      if (oui) pauseJusqua = 0;
    },
    actif: () => actif,
    /** Un doigt a fait tourner la vue : elle reste ou il l'a mise pendant PAUSE_GESTE_MS. */
    lacher(): void { if (actif) { pauseJusqua = horloge() + PAUSE_GESTE_MS; vue.arreter?.(); } },
    /** Le coin de l'ecran de l'audit, en pixels de la fenetre : la vue cadre ce qu'il laisse voir. */
    cadrer(cache: CacheVue | null): void { vue.cadrer?.(cache); },
    /**
     * Pose la camera pour `p` et ce cap ; `force` passe outre la pause (une scene rebatie, l'ecran qui
     * s'ouvre). Les murs bornent le recul ; le champ s'elargit pour que la facade visee tienne.
     */
    suivre(p: PtBrut | null, cap: number | null, facade: Facade | null, force = false, murs: readonly (readonly PtBrut[])[] = []): boolean {
      if (!actif || !p) return false;
      if (!force && horloge() < pauseJusqua) return false;
      return vue.poser(posePieton(p, capDeLaVue(p, cap, facade), facade, murs, vue.rapportVisible?.() ?? null));
    },
    /** La vue d'ensemble sur ce cadre ; sans direction donnee, celle de la camera (un doigt l'a tournee). */
    ensemble(cadre: CadreEnsemble): boolean {
      if (!actif) return false;
      const azimut = cadre.azimutDeg ?? vue.azimut?.() ?? 0;
      return vue.poser(poseEnsemble(cadre, azimut, vue.rapportVisible?.() ?? 1));
    },
  };
}
