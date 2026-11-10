// La palette des couleurs lues sur une facade (lot L1 de MD/spec-lecture-ia-elargie.md §4.1) : les mots que Claude emploie pour une
// menuiserie, des volets ou un garde-corps, et la couleur qui en tient lieu dans le dessin. Un reglage (regles/facades/reglages.json,
// `palette`), pas une constante : l'administrateur le voit avec les autres reglages des facades. Claude dit un mot, jamais un
// hexadecimal (risque 2 de la spec : la balance des blancs, l'ombre, le contre-jour) ; un mot hors de la liste ne se traduit pas.

import fichier from '../../../regles/facades/reglages.json';

/** Les mots de la palette, dans l'ordre du fichier : le vocabulaire ferme du run d'une facade. */
export type CouleurLue = keyof typeof fichier.palette.couleurs;

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** La palette d'un fichier de reglages : mot -> couleur ; leve sur une couleur mal ecrite ou une palette vide. */
export function lirePalette(donnees: unknown): Readonly<Record<string, string>> {
  const c = (donnees as { palette?: { couleurs?: unknown } } | null)?.palette?.couleurs;
  if (!c || typeof c !== 'object' || Array.isArray(c) || !Object.keys(c).length) throw new Error('regles/facades/reglages.json : palette manquante');
  for (const [mot, hex] of Object.entries(c)) if (typeof hex !== 'string' || !HEX.test(hex)) throw new Error('regles/facades/reglages.json : la couleur de « ' + mot + ' » n’est pas un hexadécimal (#RRVVBB)');
  return c as Record<string, string>;
}

/** La palette livree. */
export const PALETTE_FACADES: Readonly<Record<string, string>> = lirePalette(fichier);
/** Les mots de la palette livree, pour le schema du run. */
export const MOTS_PALETTE = Object.keys(PALETTE_FACADES) as CouleurLue[];

/** La couleur d'un mot de la palette, en hexadecimal minuscule ; null pour un mot inconnu (rien n'est invente). */
export const couleurDuMot = (mot: string | null | undefined, palette: Readonly<Record<string, string>> = PALETTE_FACADES): string | null => {
  const h = mot ? palette[mot] : undefined;
  return h ? h.toLowerCase() : null;
};
