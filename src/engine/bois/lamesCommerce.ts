// Les lames du commerce : ce qu'on trouve en negoce et en grande surface de bricolage, en France.
//
// Choisir « une lame de pin classe 4 de 145 x 27 » est ce que fait la personne qui achete : elle ne
// saisit pas une largeur, une epaisseur et une essence separement (lot 2 de la simplification de
// l'IHM, 16 novembre 2026). Chaque lame du catalogue pose ces trois reglages d'un coup, et le
// coefficient de raideur de son essence, exactement comme les champs le feraient un par un :
// aucune quantite n'est calculee autrement. Le catalogue ne change rien a un projet tant qu'on n'y
// choisit pas une lame ; une construction dont les cotes n'y sont pas se lit « autre lame ».

/** Une lame vendue : son essence (cle de `ESSENCE_PRICES`), sa largeur et son epaisseur en mm. */
export interface LameCommerce { id: string; libelle: string; essence: string; largeur: number; epaisseur: number }

export const LAMES_COMMERCE: readonly LameCommerce[] = [
  { id: 'pin-145x27', libelle: 'Pin autoclave classe 4 — 145 × 27 mm', essence: 'pin-classe4', largeur: 145, epaisseur: 27 },
  { id: 'pin-120x21', libelle: 'Pin autoclave classe 4 — 120 × 21 mm', essence: 'pin-classe4', largeur: 120, epaisseur: 21 },
  { id: 'douglas-145x27', libelle: 'Douglas — 145 × 27 mm', essence: 'douglas', largeur: 145, epaisseur: 27 },
  { id: 'douglas-120x27', libelle: 'Douglas — 120 × 27 mm', essence: 'douglas', largeur: 120, epaisseur: 27 },
  { id: 'ipe-145x21', libelle: 'Ipé (exotique) — 145 × 21 mm', essence: 'exotique', largeur: 145, epaisseur: 21 },
  { id: 'cumaru-140x21', libelle: 'Cumaru (exotique) — 140 × 21 mm', essence: 'exotique', largeur: 140, epaisseur: 21 },
  { id: 'composite-145x21', libelle: 'Composite alvéolaire — 145 × 21 mm', essence: 'composite', largeur: 145, epaisseur: 21 },
  { id: 'composite-140x25', libelle: 'Composite plein — 140 × 25 mm', essence: 'composite', largeur: 140, epaisseur: 25 }
];

/** La lame du catalogue que portent ces reglages, ou `null` : une autre lame, aux cotes saisies. */
export function lameDuCommerce(c: { essenceBois?: string | undefined; largeurLame?: number | undefined; epaisseurLame?: number | undefined }): LameCommerce | null {
  return LAMES_COMMERCE.find((l) => l.essence === c.essenceBois && l.largeur === c.largeurLame && l.epaisseur === c.epaisseurLame) ?? null;
}
