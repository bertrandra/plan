// La silhouette du haut d'une facade et ce qu'elle dit du bout du faitage, dans le vocabulaire de la reponse de Claude
// (deploy/schema-analyse.json : `facades[].silhouette` et `facades[].bout`, le meme `bout` que `bouts.gauche`/`droite`).
// Une photo la donne aussi a Plan (facade/toits/toit.ts, `classerProfil`) : les deux parlent ce vocabulaire, que le moteur des
// toits relit (facade/regles/toits/silhouettes.ts).

/** La ligne du haut du mur au-dessus de l'egout, dans les mots de « Lire les pignons d'abord » (regles/sujets/descriptions/formeToit.ts). */
export type SilhouetteFacade = 'triangle' | 'trapeze' | 'rampe' | 'ligne-droite' | 'marches' | 'plusieurs-sommets' | 'indetermine';

/** Ce qui ferme un bout du faitage, tel que le schema le dit (`$defs.bout`) ; `sans-objet` : la facade n'est pas un bout (long pan, toit plat). */
export type BoutVu = 'pignon' | 'croupe' | 'demi-croupe' | 'brisis' | 'sans-objet' | 'indetermine';

export const SILHOUETTES_FACADE: readonly { code: Exclude<SilhouetteFacade, 'indetermine'>; libelle: string }[] = [
  { code: 'triangle', libelle: 'Triangle' },
  { code: 'trapeze', libelle: 'Trapèze' },
  { code: 'rampe', libelle: 'Une seule rampe' },
  { code: 'ligne-droite', libelle: 'Ligne droite' },
  { code: 'marches', libelle: 'Marches' },
  { code: 'plusieurs-sommets', libelle: 'Plusieurs sommets' },
];

const CODES: readonly string[] = SILHOUETTES_FACADE.map((s) => s.code);
const BOUTS: readonly string[] = ['pignon', 'croupe', 'demi-croupe', 'brisis', 'sans-objet'];
/** Les mots d'un fichier d'audit fait avec la premiere ecriture de ce champ (octobre 2026) : ils se relisent. */
const ANCIENS: Record<string, SilhouetteFacade> = { pignon: 'triangle', croupe: 'trapeze', rectangle: 'ligne-droite' };

/** Une valeur de la reponse de Claude ou d'un fichier, ramenee au vocabulaire ; ce qu'il ne connait pas est `indetermine`. */
export const silhouetteLue = (v: unknown): SilhouetteFacade => (typeof v !== 'string' ? 'indetermine' : CODES.includes(v) ? (v as SilhouetteFacade) : (ANCIENS[v] ?? 'indetermine'));

export const boutLu = (v: unknown): BoutVu => (typeof v === 'string' && BOUTS.includes(v) ? (v as BoutVu) : 'indetermine');

export const libelleSilhouette = (s: SilhouetteFacade): string => SILHOUETTES_FACADE.find((x) => x.code === s)?.libelle.toLowerCase() ?? 'non lue';
