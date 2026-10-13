// La camera du mode audit (MD/spec-audit.md §4.3) : une vue « drone » derriere vous, qui suit votre
// position et, avec « Me suivre », votre cap.
//
// - Le centre de rotation et de zoom est votre position : a chaque deplacement, la cible y revient et
//   la camera garde l'ecart que vous lui avez donne (zoom, rotation). Le deplacement lateral du
//   doigt est coupe : il deplacerait ce centre, que le pas suivant ramenerait aussitot.
// - « Me suivre » recadre derriere vous, dans l'axe de votre cap (la boussole, sinon le sens de la
//   marche), assez haut pour voir VUE_DEVANT_M devant vous ; le cap fait ensuite tourner la vue.
//
// Les calculs sont dans le repere local de la scene (three/primitives.ts::versLocalDepuis) : x vers
// l'est, z vers le sud, y vers le haut. Un cap se compte depuis le nord, dans le sens des aiguilles.

import { vue3d } from '../../three/etat3d.js';
import { versLocalDepuis } from '../../three/primitives.js';
import type { PtBrut } from '../../model/types.js';

/** Ce que « Me suivre » laisse voir devant vous, en haut de l'ecran (demande de l'utilisateur). */
export const VUE_DEVANT_M = 70;
/** L'inclinaison de la vue « drone » sous l'horizontale. */
export const INCLINAISON_DEG = 40;
/** Un deplacement plus court ne dit pas le sens de la marche (le GPS tremble de quelques metres). */
export const PAS_CAP_M = 4;

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Le recul horizontal et la hauteur de la camera, visant votre position sous `inclinaisonDeg`, pour
 * que le haut de l'ecran tombe a `devantM` devant vous. Le champ vertical de three.js ne depend pas de
 * la largeur de l'ecran : le meme recul vaut au telephone et sur bureau.
 */
export function reculPourVoir(devantM: number, fovDeg: number, inclinaisonDeg = INCLINAISON_DEG): { recul: number; hauteur: number } {
  // Le rayon du haut de l'ecran doit descendre vers le sol : au moins 5 degres sous l'horizontale.
  const haut = rad(Math.max(5, inclinaisonDeg - fovDeg / 2));
  const t = Math.tan(rad(inclinaisonDeg));
  const recul = devantM / (t / Math.tan(haut) - 1);
  return { recul, hauteur: recul * t };
}

/** L'ecart camera - cible qui place la camera derriere vous sur le cap `capDeg` (nul : au sud, vue vers le nord). */
export function ecartDerriere(capDeg: number | null, recul: number, hauteur: number): { x: number; y: number; z: number } {
  const c = rad(capDeg ?? 0);
  return { x: -Math.sin(c) * recul, y: hauteur, z: Math.cos(c) * recul };
}

/** Le meme ecart tourne autour de la verticale pour suivre `capDeg` : distance et hauteur gardees. */
export function orienterEcart(e: { x: number; y: number; z: number }, capDeg: number): { x: number; y: number; z: number } {
  return ecartDerriere(capDeg, Math.hypot(e.x, e.z), e.y);
}

/** Le cap de la marche de `a` a `b` (repere du plan, y vers le nord), ou null sur un pas trop court. */
export function capDuDeplacement(a: PtBrut, b: PtBrut, pasMin = PAS_CAP_M): number | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.hypot(dx, dy) < pasMin) return null;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

export interface CameraAudit {
  /** Ramene la cible sur `p`, camera translatee d'autant : zoom et rotation gardes. */
  recentrer(p: PtBrut): boolean;
  /** Recadre derriere `p`, dans l'axe de `capDeg`, pour voir VUE_DEVANT_M devant. */
  cadrer(p: PtBrut, capDeg: number | null): boolean;
  /** Tourne la vue autour de la cible pour suivre `capDeg`. */
  orienter(capDeg: number): void;
}

/** La camera de la Vue 3D ouverte, pilotee pour l'audit. Sans scene, rien ne bouge (et rend faux). */
export function cameraAudit(): CameraAudit {
  const scene = () => {
    const sc = vue3d.scene;
    // Le centre est votre position : pas de deplacement lateral au doigt (three/navigation.ts le reactive par mode).
    if (sc) sc.controls.enablePan = false;
    return sc;
  };
  const poser = (sc: NonNullable<typeof vue3d.scene>, e: { x: number; y: number; z: number }) => {
    const t = sc.controls.target;
    sc.camera.position.set(t.x + e.x, t.y + e.y, t.z + e.z);
    sc.controls.update();
  };
  return {
    recentrer(p) {
      const sc = scene();
      if (!sc) return false;
      const l = versLocalDepuis(sc.cen)(p), t = sc.controls.target;
      const e = { x: sc.camera.position.x - t.x, y: sc.camera.position.y - t.y, z: sc.camera.position.z - t.z };
      t.set(l.x, t.y, l.z);
      poser(sc, e);
      return true;
    },
    cadrer(p, capDeg) {
      const sc = scene();
      if (!sc) return false;
      const l = versLocalDepuis(sc.cen)(p);
      sc.controls.target.set(l.x, sc.controls.target.y, l.z);
      const { recul, hauteur } = reculPourVoir(VUE_DEVANT_M, sc.camera.fov);
      poser(sc, ecartDerriere(capDeg, recul, hauteur));
      return true;
    },
    orienter(capDeg) {
      const sc = scene();
      if (!sc) return;
      const t = sc.controls.target;
      poser(sc, orienterEcart({ x: sc.camera.position.x - t.x, y: sc.camera.position.y - t.y, z: sc.camera.position.z - t.z }, capDeg));
    },
  };
}
