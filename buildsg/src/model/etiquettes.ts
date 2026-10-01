// Etiquettes des cotes et des coins (spec §3.2, model/).
//
// Une meme regle decide, a six endroits du programme, ce qui s'ecrit le long d'un cote ou a cote
// d'un coin : le nom, la mesure, les deux joints par un separateur, ou rien. Elle etait recopiee a
// chacun de ces endroits - a l'ecran, dans l'export SVG, dans le PDF du plan et dans celui du
// dossier - et deux des copies employaient une ponctuation differente sans que rien ne dise si
// c'etait voulu.
//
// Ca l'est : un PDF ecrit ses textes en WinAnsi et un tiret cadratin ou un signe degre n'y
// survivent pas. Les exports composent donc en ASCII. Le separateur et le suffixe d'angle sont
// desormais des parametres nommes, et la difference se lit au lieu de se deviner.

/** A l'ecran, ou l'on dispose de toute la typographie. */
export const SEP_ECRAN = ' — ';
export const DEGRE_ECRAN = '°';

/** Dans les exports PDF et SVG, qui doivent rester lisibles en ASCII. */
export const SEP_EXPORT = ' - ';
export const DEGRE_EXPORT = 'deg';

/**
 * Compose une etiquette a partir d'un nom et d'une mesure, selon ce que l'utilisateur a choisi
 * d'afficher. Les deux cases decochees rendent la chaine vide : c'est ce qui fait disparaitre
 * l'etiquette, chaque appelant testant le resultat avant de dessiner quoi que ce soit.
 */
export function etiquetteComposee(
  nom: string,
  mesure: string,
  montrerNom: boolean | undefined,
  montrerMesure: boolean | undefined,
  separateur: string
): string {
  if (montrerNom && montrerMesure) return nom + separateur + mesure;
  if (montrerNom) return nom;
  if (montrerMesure) return mesure;
  return '';
}

/** Longueur d'un cote, au centimetre : c'est la precision d'un plan de masse. */
export function longueurEnMetres(longueur: number): string {
  return longueur.toFixed(2) + ' m';
}

/** Angle d'un coin, au dixieme de degre. */
export function angleEnDegres(angle: number, suffixe: string): string {
  return angle.toFixed(1) + suffixe;
}
