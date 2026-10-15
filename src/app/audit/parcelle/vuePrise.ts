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
// Les calculs sont dans le repere du plan (y vers le nord) ; la pose dans la scene passe par son
// repere local (three/primitives.ts::versLocalDepuis : x vers l'est, z vers le sud, y vers le haut).

import { vue3d } from '../../../three/etat3d.js';
import { versLocalDepuis } from '../../../three/primitives.js';
import { solDeLaFacadeDevant } from '../../../three/facadeDevant3d.js';
import { distancePointSegment, lineSegIntersect } from '../../../geometry/segments.js';
import { sommetDe } from '../../../geometry/anneau.js';
import { au } from '../../../util/tableaux.js';
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

/** La camera a poser : l'oeil et le point vise, avec leurs hauteurs au-dessus du sol. */
export interface PosePieton { oeil: PtBrut; hauteurOeil: number; vise: PtBrut; hauteurVise: number }

/**
 * Le cap de la vue : celui des capteurs (boussole, sinon marche) ; sans eux, la direction de la
 * facade visee, pour qu'elle soit au milieu de l'image ; sinon le nord.
 */
export function capDeLaVue(p: PtBrut, cap: number | null, facade: Facade | null): number {
  if (cap !== null) return cap;
  if (facade) {
    const mx = (facade.gauche.x + facade.droite.x) / 2 - p.x, my = (facade.gauche.y + facade.droite.y) / 2 - p.y;
    if (Math.hypot(mx, my) > PROCHE_M) return ((Math.atan2(mx, my) * 180) / Math.PI + 360) % 360;
  }
  return 0;
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
export function posePieton(p: PtBrut, capDeg: number, facade: Facade | null = null, murs: readonly (readonly PtBrut[])[] = []): PosePieton {
  const c = rad(capDeg), dx = Math.sin(c), dy = Math.cos(c);
  const recul = reculLibre(p, dx, dy, murs);
  const oeil = { x: p.x - dx * recul, y: p.y - dy * recul };
  if (facade) {
    const milieu = { x: (facade.gauche.x + facade.droite.x) / 2, y: (facade.gauche.y + facade.droite.y) / 2 };
    // La distance de l'oeil a la facade, comptee le long du cap ; jamais moins que le recul plus 3 m.
    const loin = Math.max(recul + 3, (milieu.x - oeil.x) * dx + (milieu.y - oeil.y) * dy);
    return { oeil, hauteurOeil: OEIL_M, vise: { x: oeil.x + dx * loin, y: oeil.y + dy * loin }, hauteurVise: facade.hauteur * PART_HAUTEUR_VISEE };
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
 * prise, `bas`) ait CHAMP_VISIBLE_DEG : la camera couvre aussi ce qu'il cache.
 */
export function champComplet(h: number, bas: number): number {
  const visible = Math.max(1, h - bas);
  return (2 * Math.atan(Math.tan(rad(CHAMP_VISIBLE_DEG) / 2) * (h + bas) / visible) * 180) / Math.PI;
}

/**
 * La camera de la Vue 3D pilotee a hauteur d'homme. Sans scene, rien ne bouge (et rend faux).
 * `cadrer` dit ou commence l'ecran de prise (le haut de son cadre, en pixels de la fenetre ; null :
 * il ne cache rien) ; `liberer` rend la camera
 * telle qu'elle etait (champ, cadrage) quand l'ecran de prise se ferme ; `arreter` coupe le glissement
 * en cours (un doigt prend la main).
 */
export interface VuePieton {
  poser(pose: PosePieton): boolean;
  cadrer?(hautEcranPx: number | null): void;
  liberer?(): void;
  arreter?(): void;
}

export function vuePieton(): VuePieton {
  let hautEcran: number | null = null;
  let champAvant: number | null = null;
  let but: { o: { x: number; y: number; z: number }; v: { x: number; y: number; z: number } } | null = null;
  let anim: number | null = null, avant = 0;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  const maintenant = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  /** Le champ et le cadrage de la partie visible, a chaque pose : la vue a pu changer de taille. */
  function cadrage(): void {
    const sc = vue3d.scene;
    if (!sc) return;
    const el = sc.renderer.domElement;
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    const bas = hautEcran === null ? 0 : el.getBoundingClientRect().bottom - hautEcran;
    const b = Math.max(0, Math.min(h * 0.6, bas));
    if (champAvant === null) champAvant = sc.camera.fov;
    // La prise de vue tient la focale : la Vue 3D ne l'accorde plus a la hauteur (three/presentation.ts).
    vue3d.focaleBloquee = true;
    sc.camera.fov = champComplet(h, b);
    // La camera voit h + b pixels de haut, centres sur l'axe ; on montre les h du bas : l'axe tombe
    // au milieu de la partie visible, au-dessus de l'ecran de prise.
    sc.camera.aspect = w / (h + b);
    sc.camera.setViewOffset(w, h + b, 0, b, w, h);
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
      cadrage();
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
    cadrer(haut) { hautEcran = haut; },
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
 * Le suivi de la vue pendant la prise : il pose la camera a chaque position et a chaque cap tant que
 * l'ecran de prise est ouvert, sauf pendant la pause qui suit un geste du doigt.
 */
export function suiviPieton(vue: VuePieton, horloge: () => number = () => Date.now()) {
  let actif = false;
  let pauseJusqua = 0;
  return {
    /** L'ecran de prise s'ouvre (vrai) ou se ferme (faux) : a la fermeture, la camera est rendue. */
    activer(oui: boolean): void {
      if (actif && !oui) vue.liberer?.();
      actif = oui;
      if (oui) pauseJusqua = 0;
    },
    actif: () => actif,
    /** Un doigt a fait tourner la vue : elle reste ou il l'a mise pendant PAUSE_GESTE_MS. */
    lacher(): void { if (actif) { pauseJusqua = horloge() + PAUSE_GESTE_MS; vue.arreter?.(); } },
    /** Le haut de l'ecran de prise, en pixels de la fenetre : la vue cadre au-dessus. */
    cadrer(hautEcranPx: number | null): void { vue.cadrer?.(hautEcranPx); },
    /**
     * Pose la camera pour `p` et ce cap ; `force` passe outre la pause (une scene rebatie, l'ecran qui
     * s'ouvre). Les murs bornent le recul.
     */
    suivre(p: PtBrut | null, cap: number | null, facade: Facade | null, force = false, murs: readonly (readonly PtBrut[])[] = []): boolean {
      if (!actif || !p) return false;
      if (!force && horloge() < pauseJusqua) return false;
      return vue.poser(posePieton(p, capDeLaVue(p, cap, facade), facade, murs));
    },
  };
}
