// Les capteurs de distance du releve (spec-releve-facade §5.1).
//
// Deux sources actives :
//
// 1. **WebXR sur Android** (Chrome) : une seance de realite augmentee lance un rayon depuis le
//    centre de l'ecran et rend la distance au premier plan touche - le mur.
// 2. **Le cadrage** : partout ailleurs, la distance se deduit de la largeur connue du mur (lue sur
//    le plan) et de la place qu'elle occupe dans l'image (facade/cadrage.ts). C'est le repli,
//    toujours disponible.
//
// **Le LiDAR est desactive** (`LIDAR_ACTIF`). Safari n'y donne pas acces, et le module natif iOS
// (`native/ios/`) qui l'apportait n'y change pas l'essentiel : le LiDAR d'un iPhone ne porte qu'a
// environ 5 m, quand une facade se photographie le plus souvent de plus loin. Le code du canal reste
// ici, eteint : dans le module natif, la page se comporte comme dans Safari (camera du navigateur,
// cadrage), et ne lui envoie aucune commande.

export type SourceDistance = 'lidar' | 'webxr' | 'cadrage' | 'rue';

export interface MesureDistance {
  distance: number;
  source: SourceDistance;
  /**
   * La geometrie de l'image que voit le capteur, quand il la donne (module natif) : sans video dans
   * la page, c'est elle - et non la taille de l'ecran - qui dit ce que la photo couvrira.
   */
  camera?: { largeurPx: number; hauteurPx: number; focalePx: number };
}

/** Le canal de messages que le module natif installe dans sa vue web (WKScriptMessageHandler). */
interface CanalNatif {
  postMessage(m: unknown): void;
}

function canalNatif(): CanalNatif | null {
  const w = window as unknown as { webkit?: { messageHandlers?: { planCapture?: CanalNatif } } };
  return w.webkit?.messageHandlers?.planCapture ?? null;
}

/**
 * Le LiDAR par le module natif iOS. Eteint : sa portee (environ 5 m) est en deca du recul qu'il faut
 * pour photographier une facade, pignon compris. Le rallumer rend au module natif la visee AR et la
 * photo a focale exacte.
 */
export const LIDAR_ACTIF = false;

/** Plan tourne-t-il dans le module natif de capture, LiDAR allume ? */
export function natifDisponible(): boolean {
  return LIDAR_ACTIF && canalNatif() !== null;
}

/** Demande au module natif de commencer (ou d'arreter) a mesurer. Rien tant que le LiDAR est eteint. */
export function commanderNatif(action: 'demarrer' | 'arreter' | 'photo'): void {
  if (LIDAR_ACTIF) canalNatif()?.postMessage({ action });
}

/**
 * S'abonne aux mesures du module natif. Renvoie de quoi se desabonner. L'evenement porte
 * `{ distance: metres, confiance: 0..2 }` (la confiance ARKit de la carte de profondeur), et
 * `largeurPx`, `hauteurPx`, `focalePx` : l'image du capteur, telle que la photo sera livree.
 */
export function ecouterNatif(surMesure: (m: MesureDistance) => void): () => void {
  const f = (e: Event) => {
    const d = (e as CustomEvent<{ distance?: number; confiance?: number; largeurPx?: number; hauteurPx?: number; focalePx?: number }>).detail;
    if (!d || typeof d.distance !== 'number' || !(d.distance > 0) || (d.confiance ?? 2) < 1) return;
    const camera = d.largeurPx && d.hauteurPx && d.focalePx ? { largeurPx: d.largeurPx, hauteurPx: d.hauteurPx, focalePx: d.focalePx } : undefined;
    surMesure(camera ? { distance: d.distance, source: 'lidar', camera } : { distance: d.distance, source: 'lidar' });
  };
  window.addEventListener('plan:profondeur', f);
  commanderNatif('demarrer');
  return () => {
    window.removeEventListener('plan:profondeur', f);
    commanderNatif('arreter');
  };
}

/** Attend la prochaine photo livree par le module natif. */
export function attendrePhotoNative(delaiMs = 8000): Promise<{ dataUrl: string; focalePx: number | null } | null> {
  return new Promise((resolve) => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ dataUrl?: string; focalePx?: number }>).detail;
      window.removeEventListener('plan:photo', f);
      clearTimeout(t);
      resolve(d && d.dataUrl ? { dataUrl: d.dataUrl, focalePx: d.focalePx ?? null } : null);
    };
    const t = setTimeout(() => {
      window.removeEventListener('plan:photo', f);
      resolve(null);
    }, delaiMs);
    window.addEventListener('plan:photo', f);
    commanderNatif('photo');
  });
}

/* ------------------------------------------------------------------------------------------------
 * WebXR (Android)
 *
 * Les types WebXR ne sont pas dans la bibliotheque DOM de TypeScript : on decrit ici le strict
 * necessaire, sans dependance.
 * --------------------------------------------------------------------------------------------- */

interface XRPoseMin {
  transform: { position: { x: number; y: number; z: number } };
}
interface XRFrameMin {
  getViewerPose(ref: unknown): XRPoseMin | null;
  getHitTestResults(source: unknown): { getPose(ref: unknown): XRPoseMin | null }[];
}
interface XRSessionMin {
  requestReferenceSpace(t: string): Promise<unknown>;
  requestHitTestSource(o: { space: unknown }): Promise<{ cancel(): void }>;
  requestAnimationFrame(cb: (t: number, f: XRFrameMin) => void): number;
  updateRenderState(s: { baseLayer: unknown }): void;
  end(): Promise<void>;
  addEventListener(t: 'end', cb: () => void): void;
}
interface XRSystemMin {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(mode: string, init: unknown): Promise<XRSessionMin>;
}

function xr(): XRSystemMin | null {
  return (navigator as unknown as { xr?: XRSystemMin }).xr ?? null;
}

export async function webxrDisponible(): Promise<boolean> {
  try {
    const sys = xr();
    return !!sys && (await sys.isSessionSupported('immersive-ar'));
  } catch {
    return false;
  }
}

/**
 * Ouvre une seance AR : la camera passe plein ecran sous `racine` (superposition DOM), et chaque
 * image rend la distance au mur vise par le centre de l'ecran. Renvoie de quoi terminer.
 */
export async function mesurerWebXR(racine: HTMLElement, surMesure: (m: MesureDistance | null) => void, surFin: () => void): Promise<() => void> {
  const sys = xr();
  if (!sys) throw new Error('WebXR indisponible');
  const seance = await sys.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: racine },
  });
  // Une couche WebGL est obligatoire pour que la seance produise des images, meme si l'on ne dessine rien.
  const canevas = document.createElement('canvas');
  const gl = canevas.getContext('webgl', { xrCompatible: true } as WebGLContextAttributes);
  const XRWebGLLayer = (window as unknown as { XRWebGLLayer?: new (s: unknown, g: unknown) => unknown }).XRWebGLLayer;
  if (gl && XRWebGLLayer) seance.updateRenderState({ baseLayer: new XRWebGLLayer(seance, gl) });
  const local = await seance.requestReferenceSpace('local');
  const vue = await seance.requestReferenceSpace('viewer');
  const source = await seance.requestHitTestSource({ space: vue });
  let fini = false;
  seance.addEventListener('end', () => {
    fini = true;
    source.cancel();
    surFin();
  });
  const image = (_t: number, f: XRFrameMin) => {
    if (fini) return;
    const oeil = f.getViewerPose(local);
    const touche = f.getHitTestResults(source)[0]?.getPose(local);
    if (oeil && touche) {
      const a = oeil.transform.position,
        b = touche.transform.position;
      // Distance horizontale : c'est l'eloignement au pied du mur qui compte, pas la visee inclinee.
      surMesure({ distance: Math.hypot(a.x - b.x, a.z - b.z), source: 'webxr' });
    } else surMesure(null);
    seance.requestAnimationFrame(image);
  };
  seance.requestAnimationFrame(image);
  return () => {
    if (!fini) void seance.end();
  };
}

/* ------------------------------------------------------------------------------------------------
 * Inclinaison du telephone
 * --------------------------------------------------------------------------------------------- */

/**
 * Suit l'inclinaison avant-arriere du telephone (`beta`, en degres). Sur iOS la permission se
 * demande dans un geste de l'utilisateur : `demanderPermission` doit etre appele depuis un clic.
 */
export async function demanderPermissionOrientation(): Promise<boolean> {
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!D) return false;
  if (typeof D.requestPermission !== 'function') return true;
  try {
    return (await D.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export function suivreInclinaison(surBeta: (beta: number | null) => void): () => void {
  const f = (e: DeviceOrientationEvent) => surBeta(typeof e.beta === 'number' ? e.beta : null);
  window.addEventListener('deviceorientation', f);
  return () => window.removeEventListener('deviceorientation', f);
}

/** Le cap de la boussole lu dans un evenement d'orientation : iOS le donne tel quel, Android par l'angle alpha, absolu seulement. */
export function capDeLOrientation(e: { alpha?: number | null; absolute?: boolean; webkitCompassHeading?: number }): number | null {
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) return ((e.webkitCompassHeading % 360) + 360) % 360;
  if (e.absolute && typeof e.alpha === 'number') return ((360 - e.alpha) % 360 + 360) % 360;
  return null;
}

/**
 * Suit le cap de la boussole (0 = nord, 90 = est, le dos du telephone - la camera - vers l'avant).
 * Android le donne par `deviceorientationabsolute`, iOS par `deviceorientation` (apres permission).
 */
export function suivreCap(surCap: (cap: number | null) => void): () => void {
  const f = (e: Event) => surCap(capDeLOrientation(e as DeviceOrientationEvent & { webkitCompassHeading?: number }));
  window.addEventListener('deviceorientationabsolute', f);
  window.addEventListener('deviceorientation', f);
  return () => {
    window.removeEventListener('deviceorientationabsolute', f);
    window.removeEventListener('deviceorientation', f);
  };
}
