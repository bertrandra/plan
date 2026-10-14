// La Vue 3D de « Photographier en marchant » (MD/spec-audit.md §12.1, demande de l'utilisateur du
// 14 octobre 2026) : une vue a hauteur d'homme, un peu vers le haut pour voir la facade entiere,
// prise quelques metres derriere vous pour avoir le recul qui la fait reconnaitre, et qui suit votre
// position et votre cap (boussole, sinon sens de la marche). Ce n'est pas une image fixe : chaque
// position et chaque cap la redessinent.
//
// Un doigt qui fait tourner la vue la garde un moment (PAUSE_GESTE_MS) : le suivi reprend tout seul
// ensuite, sans bouton de plus sur l'ecran de prise.
//
// Les calculs sont dans le repere du plan (y vers le nord) ; la pose dans la scene passe par son
// repere local (three/primitives.ts::versLocalDepuis : x vers l'est, z vers le sud, y vers le haut).

import { vue3d } from '../../../three/etat3d.js';
import { versLocalDepuis } from '../../../three/primitives.js';
import { solDeLaFacadeDevant } from '../../../three/facadeDevant3d.js';
import { distancePointSegment } from '../../../geometry/segments.js';
import type { Facade } from '../../../facade/geometrie.js';
import type { PtBrut } from '../../../model/types.js';

/** La hauteur des yeux au-dessus du sol. */
export const OEIL_M = 1.7;
/** La camera se tient derriere vous de cela : a 3 m d'un mur, on le voit encore en entier. */
export const RECUL_PIETON_M = 6;
/** Le regard monte de cela au-dessus de l'horizontale : le haut d'un pavillon a deux etages entre dans l'image. */
export const REGARD_HAUT_DEG = 10;
/** Le point vise est a cela devant vous : c'est aussi le centre autour duquel le doigt fait tourner la vue. */
const VISEE_M = 12;
/** Apres un geste du doigt sur la vue, le suivi attend cela avant de reprendre. */
export const PAUSE_GESTE_MS = 6000;
/** Plus pres que cela du milieu de la facade, la direction vers elle ne veut plus rien dire. */
const PROCHE_M = 0.5;

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

/** La pose de la camera pour une position `p` et un cap (depuis le nord, sens horaire, en degres). */
export function posePieton(p: PtBrut, capDeg: number): PosePieton {
  const c = rad(capDeg), dx = Math.sin(c), dy = Math.cos(c);
  return {
    oeil: { x: p.x - dx * RECUL_PIETON_M, y: p.y - dy * RECUL_PIETON_M },
    hauteurOeil: OEIL_M,
    vise: { x: p.x + dx * VISEE_M, y: p.y + dy * VISEE_M },
    hauteurVise: OEIL_M + Math.tan(rad(REGARD_HAUT_DEG)) * (RECUL_PIETON_M + VISEE_M),
  };
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

/** La camera de la Vue 3D pilotee a hauteur d'homme. Sans scene, rien ne bouge (et rend faux). */
export interface VuePieton { poser(pose: PosePieton): boolean }

export function vuePieton(): VuePieton {
  return {
    poser(pose) {
      const sc = vue3d.scene;
      if (!sc) return false;
      const local = versLocalDepuis(sc.cen), sol = solDeLaFacadeDevant();
      const o = local(pose.oeil), v = local(pose.vise);
      const so = sol ? sol(pose.oeil) : 0, sv = sol ? sol(pose.vise) : 0;
      sc.camera.position.set(o.x, so + pose.hauteurOeil, o.z);
      sc.controls.target.set(v.x, sv + pose.hauteurVise, v.z);
      sc.controls.update();
      return true;
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
    /** L'ecran de prise s'ouvre (vrai) ou se ferme (faux). */
    activer(oui: boolean): void { actif = oui; if (oui) pauseJusqua = 0; },
    actif: () => actif,
    /** Un doigt a fait tourner la vue : elle reste ou il l'a mise pendant PAUSE_GESTE_MS. */
    lacher(): void { if (actif) pauseJusqua = horloge() + PAUSE_GESTE_MS; },
    /** Pose la camera pour `p` et ce cap ; `force` passe outre la pause (une scene rebatie, l'ecran qui s'ouvre). */
    suivre(p: PtBrut | null, cap: number | null, facade: Facade | null, force = false): boolean {
      if (!actif || !p) return false;
      if (!force && horloge() < pauseJusqua) return false;
      return vue.poser(posePieton(p, capDeLaVue(p, cap, facade)));
    },
  };
}
