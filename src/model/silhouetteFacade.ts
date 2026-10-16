// La silhouette du haut d'une facade : ce que la ligne au-dessus de l'egout dit du toit (spec des toits §14).
// Une photo la donne a Plan (facade/toit.ts, `classerProfil`) et Claude la lit sur la meme photo : les deux
// parlent ce vocabulaire, que le moteur des toits relit (facade/regles/toits/silhouettes.ts).

/**
 * - `pignon` : un triangle de MUR au-dessus de l'egout (le toit s'appuie sur le haut du mur : bout d'un deux-pans) ;
 * - `croupe` : un pan de TOIT incline au-dessus de l'egout (triangle ou trapeze couvert, vu de face : bout d'un toit a croupes) ;
 * - `trapeze` : un bandeau de toit dont le haut est plus court que l'egout, vu de cote (long pan d'un toit a croupes) ;
 * - `rectangle` : un bandeau a hauteur constante, ou rien (long pan d'un deux-pans, toit plat, acrotere) ;
 * - `rampe` : le haut monte d'un seul cote (mur d'un appentis) ;
 * - `indetermine` : la photo ne le dit pas.
 */
export type SilhouetteFacade = 'pignon' | 'croupe' | 'trapeze' | 'rectangle' | 'rampe' | 'indetermine';

export const SILHOUETTES_FACADE: readonly { code: Exclude<SilhouetteFacade, 'indetermine'>; libelle: string }[] = [
  { code: 'pignon', libelle: 'Pignon (triangle de mur)' },
  { code: 'croupe', libelle: 'Croupe (pan de toit incliné)' },
  { code: 'trapeze', libelle: 'Trapèze (long pan d’un toit à croupes)' },
  { code: 'rectangle', libelle: 'Rectangle (haut droit)' },
  { code: 'rampe', libelle: 'Rampe (appentis)' },
];

const CODES: readonly string[] = SILHOUETTES_FACADE.map((s) => s.code);

/** Une valeur du schema de Claude, ramenee au vocabulaire ; ce qu'il ne connait pas est `indetermine`. */
export const silhouetteLue = (v: unknown): SilhouetteFacade => (typeof v === 'string' && CODES.includes(v) ? (v as SilhouetteFacade) : 'indetermine');

export const libelleSilhouette = (s: SilhouetteFacade): string => SILHOUETTES_FACADE.find((x) => x.code === s)?.libelle.split(' (')[0]?.toLowerCase() ?? 'non lue';
