// Les objectifs arriere d'un telephone : principal et grand-angle (MD/spec-releve-facade.md §5.6).
//
// A 3 m d'une maison, l'objectif principal (26 mm equivalent, ~67 degres sur le grand cote) ne voit
// que 4 m de mur ; le grand-angle (13 mm, ~108 degres) en voit 8. Le navigateur n'offre pourtant que
// « la camera arriere » : il faut aller chercher le grand-angle soi-meme, de deux facons selon le
// telephone.
//
// - **iPhone (Safari)** : chaque objectif est une camera a part dans `enumerateDevices`, nommee
//   « Back Ultra Wide Camera » (ou « Caméra arrière ultra grand-angle » en francais) une fois la
//   permission donnee. On l'ouvre par son identifiant.
// - **Android (Chrome)** : le plus souvent, la camera principale accepte un zoom inferieur a 1
//   (0,5 ou 0,6) qui bascule sur le grand-angle ; parfois une camera a part, rarement nommee.
//
// Ce module ne touche pas au navigateur : il classe des noms et calcule des champs.

export type Objectif = 'principal' | 'grand-angle';

/** Champ du grand cote de l'ultra grand-angle d'un telephone (13 mm equivalent 24x36), en degres. */
export const CHAMP_GRAND_ANGLE_DEFAUT = 108;

export type GenreCamera = 'avant' | 'grand-angle' | 'tele' | 'virtuelle' | 'arriere';

/** Ce que dit le nom d'une camera, tel que `MediaDeviceInfo.label` le donne (anglais ou francais). */
export function genreCamera(libelle: string): GenreCamera {
  const l = libelle.toLowerCase();
  if (/front|avant|facetime|user|selfie/.test(l)) return 'avant';
  if (/ultra ?wide|ultra[- ]grand|grand[- ]angle|0[.,]5\s*x/.test(l)) return 'grand-angle';
  if (/tele|téléobjectif/.test(l)) return 'tele';
  // Les cameras « Dual » et « Triple » d'un iPhone sont virtuelles : iOS y choisit l'objectif seul,
  // selon le zoom et la lumiere. On ne s'y fie pas pour savoir quel champ on a.
  if (/dual|triple|double/.test(l)) return 'virtuelle';
  return 'arriere';
}

/** L'identifiant du grand-angle parmi les cameras connues, s'il y en a un. */
export function grandAngleParmi(cameras: readonly { deviceId: string; label: string }[]): string | null {
  const c = cameras.find((x) => genreCamera(x.label) === 'grand-angle');
  return c ? c.deviceId : null;
}

/**
 * Champ obtenu en appliquant un zoom a un objectif de champ connu : un zoom de 0,5 double la tangente
 * du demi-champ. C'est le cas Android, ou le grand-angle s'atteint par un zoom inferieur a 1.
 */
export function champAvecZoom(champ: number, zoom: number): number {
  if (!(zoom > 0)) return champ;
  const t = Math.tan((champ * Math.PI) / 360) / zoom;
  return (2 * Math.atan(t) * 180) / Math.PI;
}

/** Le plus petit zoom en dessous de 1 que la piste accepte, s'il y en a un : c'est le grand-angle. */
export function zoomGrandAngle(zoomMin: number | undefined | null): number | null {
  return typeof zoomMin === 'number' && zoomMin > 0 && zoomMin < 0.95 ? zoomMin : null;
}
