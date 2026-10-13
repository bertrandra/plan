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

/** Suit le cap de l'appareil ; rend de quoi arreter. Sans boussole, `sur` n'est jamais appele. */
export function suivreBoussole(sur: (capDeg: number) => void): () => void {
  if (!boussoleDisponible()) return () => {};
  const angle = () => (typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : 0);
  const ecouter = (e: Event) => {
    const o = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    const cap = capDepuisOrientation({ alpha: o.alpha, absolute: o.absolute || e.type === 'deviceorientationabsolute', webkitCompassHeading: o.webkitCompassHeading }, angle());
    if (cap !== null) sur(cap);
  };
  // Chrome donne le nord par l'evenement « absolu » ; Safari par `webkitCompassHeading` sur l'autre.
  const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(type, ecouter);
  return () => window.removeEventListener(type, ecouter);
}
