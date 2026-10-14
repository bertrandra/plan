// La boussole de l'appareil : vers ou pointe le haut du telephone, en degres depuis le nord, dans le
// sens des aiguilles d'une montre (0 nord, 90 est).
//
// Deux sources selon le navigateur :
// - Safari (iOS) donne `webkitCompassHeading`, deja un cap. Il faut l'autorisation de la personne,
//   demandee pendant un geste (`DeviceOrientationEvent.requestPermission`) : `autoriserBoussole` est
//   appelee depuis un bouton.
// - Chrome (Android) donne `deviceorientationabsolute`, dont `alpha` tourne dans l'autre sens : le cap
//   est 360 - alpha.
// Dans les deux cas, un ecran tourne en paysage decale le cap de son angle.
//
// Le meme evenement donne l'attitude du telephone (`beta`, `gamma`) : l'inclinaison de la visee et
// le roulis de l'image, gardes avec une photo (MD/spec-audit.md §5).

/** Un evenement d'orientation, reduit a ce qui sert au cap. */
export interface OrientationLue {
  alpha: number | null;
  absolute: boolean;
  webkitCompassHeading?: number | undefined;
}

const modulo360 = (a: number) => ((a % 360) + 360) % 360;

/**
 * Le cap depuis un evenement d'orientation et l'angle de l'ecran (0 en portrait, 90 en paysage),
 * ou `null` si l'evenement ne dit pas ou est le nord (un `alpha` relatif, sans boussole).
 */
export function capDepuisOrientation(e: OrientationLue, angleEcran = 0): number | null {
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) return modulo360(e.webkitCompassHeading + angleEcran);
  if (e.absolute && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) return modulo360(360 - e.alpha + angleEcran);
  return null;
}

/** Lisse un cap qui tremble, par le plus court chemin autour du cercle (359 puis 1 : on passe par 0). */
export function lisserCap(ancien: number | null, nouveau: number, k = 0.25): number {
  if (ancien === null) return modulo360(nouveau);
  const ecart = modulo360(nouveau - ancien + 180) - 180;
  return modulo360(ancien + k * ecart);
}

/** L'ecart signe le plus court entre deux caps, en degres (-180 a 180). */
export const ecartCap = (a: number, b: number): number => modulo360(b - a + 180) - 180;

/** L'attitude de l'appareil photo arriere : visee au-dessus de l'horizon, et roulis de l'image. */
export interface Attitude {
  /** L'axe de visee au-dessus de l'horizon, en degres : 0 d'aplomb, negatif vers le bas. */
  inclinaisonDeg: number;
  /** La rotation de l'image autour de la visee, en degres, sens horaire positif ; `null` visee verticale. */
  roulisDeg: number | null;
}

/** Au-dela, la visee est presque verticale : le roulis ne se mesure plus (le haut de l'image est arbitraire). */
const INCLINAISON_ROULIS_MAX_DEG = 80;
const RAD = Math.PI / 180;

/**
 * L'attitude depuis `beta` et `gamma` de l'orientation (W3C, angles Z-X'-Y'').
 *
 * On ne relit pas les angles un a un : telephone debout, `beta` vaut 90 et `gamma` y perd son sens
 * (blocage de cardan). On calcule plutot ou va la verticale dans le repere du telephone : sa
 * composante sur l'axe de visee (-z) donne l'inclinaison, sa direction dans le plan de l'ecran le
 * roulis. L'appareil photo range l'image au quart de tour le plus proche : le roulis garde n'est que
 * le reste, entre -45 et 45 degres. Arrondis au degre : le capteur ne fait pas mieux.
 */
export function attitudeDepuisOrientation(beta: number | null | undefined, gamma: number | null | undefined): Attitude | null {
  if (typeof beta !== 'number' || typeof gamma !== 'number' || !Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const cb = Math.cos(beta * RAD), sb = Math.sin(beta * RAD), cg = Math.cos(gamma * RAD), sg = Math.sin(gamma * RAD);
  // La verticale (le haut) dans le repere du telephone : x a droite, y vers le haut de l'ecran, z vers vous.
  const haut = { x: -cb * sg, y: sb, z: cb * cg };
  const inclinaison = Math.asin(Math.max(-1, Math.min(1, -haut.z))) / RAD;
  let roulis: number | null = null;
  if (Math.abs(inclinaison) <= INCLINAISON_ROULIS_MAX_DEG) {
    // Tourne dans le sens horaire, le telephone voit le haut partir vers sa gauche.
    const brut = Math.atan2(-haut.x, haut.y) / RAD;
    roulis = Math.round(((brut % 90) + 135) % 90 - 45);
    if (roulis === -45) roulis = 45;
  }
  return { inclinaisonDeg: Math.round(inclinaison) + 0, roulisDeg: roulis === null ? null : roulis + 0 };
}

type DemandeAutorisation = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Le navigateur connait-il l'orientation de l'appareil ? */
export function boussoleDisponible(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/**
 * Demande l'autorisation la ou elle existe (Safari) ; ailleurs, rien a demander. A appeler pendant
 * un geste de la personne : hors d'un geste, Safari refuse sans rien montrer.
 */
export async function autoriserBoussole(): Promise<boolean> {
  if (!boussoleDisponible()) return false;
  const D = (window as unknown as { DeviceOrientationEvent: DemandeAutorisation }).DeviceOrientationEvent;
  if (typeof D.requestPermission !== 'function') return true;
  try { return (await D.requestPermission()) === 'granted'; } catch { return false; }
}

/**
 * Suit le cap de l'appareil ; rend de quoi arreter. Sans boussole, `sur` n'est jamais appele.
 * `surAttitude` recoit l'inclinaison et le roulis, meme sans nord connu.
 */
export function suivreBoussole(sur: (capDeg: number) => void, surAttitude?: (a: Attitude) => void): () => void {
  if (!boussoleDisponible()) return () => {};
  const angle = () => (typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : 0);
  const ecouter = (e: Event) => {
    const o = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    const cap = capDepuisOrientation({ alpha: o.alpha, absolute: o.absolute || e.type === 'deviceorientationabsolute', webkitCompassHeading: o.webkitCompassHeading }, angle());
    if (cap !== null) sur(cap);
    if (surAttitude) {
      const a = attitudeDepuisOrientation(o.beta, o.gamma);
      if (a) surAttitude(a);
    }
  };
  // Chrome donne le nord par l'evenement « absolu » ; Safari par `webkitCompassHeading` sur l'autre.
  const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(type, ecouter);
  return () => window.removeEventListener(type, ecouter);
}
