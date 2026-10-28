// Les essences de bois et leur prix au m² (MD/spec-ouvrages.md, etape 6.6).
//
// Partagees par les ouvrages en bois : la terrasse (ses lames), la plage en bois d'une piscine. Deplacees sans retouche de
// engine/constantes.ts, qui les reexporte : ces valeurs sortent dans un devis (MD/RELEASE.md §2.1).

/** Une essence au catalogue : son libelle et sa fourchette de prix au m². */
export interface Essence { label: string; bas: number; haut: number }

// Indexe par une chaine venue d'un projet enregistre : elle n'est pas garantie d'etre au catalogue,
// et chaque lecture porte donc son repli. Record<string, …> dit cela ; figer les cinq clefs
// obligerait a valider la saisie en amont, ce qui n'est pas le contrat d'aujourd'hui.
const ESSENCE_AUTRE: Essence = { label:'Autre (prix libre)', bas:0, haut:0 };
export const ESSENCE_PRICES: Record<string, Essence> = {
  'pin-classe4': { label:'Pin classe 4 (autoclave)', bas:25, haut:40 },
  'douglas':     { label:'Douglas',                   bas:35, haut:55 },
  'composite':   { label:'Composite',                 bas:50, haut:90 },
  'exotique':    { label:'Exotique (cumaru, ipe...)',  bas:60, haut:120 },
  'autre':       ESSENCE_AUTRE
};
/** L'essence d'une construction ; « autre » (prix libre) si la clef n'est pas au catalogue. */
export function essenceDe(cle: string | undefined): Essence { return ESSENCE_PRICES[cle ?? ''] || ESSENCE_AUTRE; }
