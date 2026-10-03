// La palette enregistree sur le serveur web (`admin/palette`, ecran `?palette`).
//
// Les couleurs de l'interface ont deux sources : les valeurs d'origine, dans `jetons.ts` et dans la
// feuille (que le test confronte et dont il verifie les contrastes), et un document JSON sur le
// serveur, que l'admin regle depuis l'ecran de la palette. Le document ne remplace que ce qu'il
// porte de valide : un jeton inconnu est ignore, une valeur qui n'est pas `#RRGGBB` aussi, et un
// jeton absent garde sa valeur d'origine. Une palette abimee ne peut donc pas casser l'interface,
// au pire elle n'a pas d'effet.
//
// Rien ici ne touche au DOM ni au reseau : app/paletteServeur.ts la charge et l'applique.

import { JETONS, type NomJeton } from './jetons.js';

export const FORMAT_PALETTE = 'plan-palette';
export type Theme = 'clair' | 'sombre';
export type Couleurs = Record<Theme, Record<NomJeton, string>>;

export interface DocumentPalette {
  format: typeof FORMAT_PALETTE;
  version: 1;
  modifieLe: string;
  couleurs: Couleurs;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const THEMES: Theme[] = ['clair', 'sombre'];
const NOMS = Object.keys(JETONS.clair) as NomJeton[];

/** Une valeur de couleur acceptable : `#RRGGBB`, ecrite en majuscules comme dans jetons.ts. */
export function couleurValide(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v);
}

/** Les valeurs d'origine, en copie : on peut les modifier sans toucher a `JETONS`. */
export function couleursParDefaut(): Couleurs {
  return { clair: { ...JETONS.clair }, sombre: { ...JETONS.sombre } };
}

/**
 * Lit un document de palette : les couleurs d'origine, remplacees par celles du document qui sont
 * valides. `null` si ce n'est pas une palette (format absent ou autre).
 */
export function lireDocumentPalette(d: unknown): { couleurs: Couleurs; modifieLe: string | null } | null {
  if (!d || typeof d !== 'object' || (d as { format?: unknown }).format !== FORMAT_PALETTE) return null;
  const source = (d as { couleurs?: unknown }).couleurs;
  const couleurs = couleursParDefaut();
  if (source && typeof source === 'object') {
    for (const t of THEMES) {
      const valeurs = (source as Record<string, unknown>)[t];
      if (!valeurs || typeof valeurs !== 'object') continue;
      for (const n of NOMS) {
        const v = (valeurs as Record<string, unknown>)[n];
        if (couleurValide(v)) couleurs[t][n] = v.toUpperCase();
      }
    }
  }
  const le = (d as { modifieLe?: unknown }).modifieLe;
  return { couleurs, modifieLe: typeof le === 'string' ? le : null };
}

/** Le document a enregistrer ou a exporter : toutes les couleurs, dans l'ordre de jetons.ts. */
export function documentPalette(couleurs: Couleurs, modifieLe: string = new Date().toISOString()): DocumentPalette {
  const ordonne = (t: Theme) => Object.fromEntries(NOMS.map(n => [n, couleurs[t][n]])) as Record<NomJeton, string>;
  return { format: FORMAT_PALETTE, version: 1, modifieLe, couleurs: { clair: ordonne('clair'), sombre: ordonne('sombre') } };
}

/** Les jetons qui different des valeurs d'origine, theme par theme. */
export function ecartsAuxOrigines(couleurs: Couleurs): { theme: Theme; nom: NomJeton }[] {
  return THEMES.flatMap(t => NOMS.filter(n => couleurs[t][n] !== JETONS[t][n]).map(nom => ({ theme: t, nom })));
}

/** Deux palettes identiques ? */
export function memesCouleurs(a: Couleurs, b: Couleurs): boolean {
  return THEMES.every(t => NOMS.every(n => a[t][n] === b[t][n]));
}

/**
 * La feuille qui applique une palette a la page : les memes declarations que les deux blocs de
 * `app.css`, posees apres elle. Seuls les jetons qui different de l'origine y figurent : une
 * palette egale a l'origine donne une feuille vide.
 *
 * Le bloc clair est enferme dans `not all and (prefers-color-scheme: dark)` : pose apres la feuille,
 * un `:root` nu l'emporterait aussi sur le bloc sombre d'`app.css`, et un reglage du theme clair
 * deteindrait sur le sombre.
 */
export function cssPalette(couleurs: Couleurs): string {
  const bloc = (t: Theme) => NOMS.filter(n => couleurs[t][n] !== JETONS[t][n]).map(n => '--' + n + ':' + couleurs[t][n] + ';').join('');
  const clair = bloc('clair'), sombre = bloc('sombre');
  return (clair ? '@media not all and (prefers-color-scheme: dark){:root{' + clair + '}}' : '') + (sombre ? '@media (prefers-color-scheme: dark){:root{' + sombre + '}}' : '');
}

/** Ce qui change de `avant` a `apres`, theme par theme, dans l'ordre des jetons : le recapitulatif de l'enregistrement. */
export function differences(avant: Couleurs, apres: Couleurs): { theme: Theme; nom: NomJeton; avant: string; apres: string }[] {
  return THEMES.flatMap(t => NOMS.filter(n => avant[t][n] !== apres[t][n]).map(nom => ({ theme: t, nom, avant: avant[t][nom], apres: apres[t][nom] })));
}
