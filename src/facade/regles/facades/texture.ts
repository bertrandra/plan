// Les reglages nommes de la texture des facades en 3D sans ses ombres (facade/sansOmbres.ts).
//
// Ils ne touchent que l'affichage : ni la detection, ni les cotes, ni la photo enregistree, ni l'export. Une valeur changee ici
// se justifie par le banc (`.claude/skills/facades`, section « Façades sans ombres »), avant et apres.

import type { Reglage } from './detection.js';

export const REGLAGES_TEXTURE = {
  'facades.texture.rayonEclairageM': {
    valeur: 0.4,
    unite: 'm',
    pourquoi: "Demi-cote de la fenetre ou se lit l'eclairage : plus grand que le grain d'une pierre ou d'une brique, plus petit que l'ombre d'un debord.",
  },
  'facades.texture.quantileSoleil': {
    valeur: 0.75,
    unite: 'part',
    pourquoi: "L'eclairage du mur au soleil : ce quantile des eclairages lus sur le mur. Plus haut, une tache claire (reflet, enduit neuf) passerait pour le soleil.",
  },
  'facades.texture.ecartTeinteMax': {
    valeur: 0.035,
    unite: 'rapport',
    pourquoi: "Une ombre garde la teinte du mur ; au-dela de cet ecart de chromaticite, c'est un autre materiau (soubassement, bandeau), que l'on n'eclaircit pas.",
  },
  'facades.texture.soubassementMaxM': {
    valeur: 1.5,
    unite: 'm',
    pourquoi: "Un soubassement monte rarement plus haut ; une bande sombre sur toute la largeur, depuis le pied, jusqu'a cette hauteur, garde sa teinte.",
  },
  'facades.texture.soubassementPart': {
    valeur: 0.5,
    unite: 'part',
    pourquoi: "Une rangee du pied du mur assombrie sur au moins cette part de sa largeur est un soubassement (ses joints clairs ne le sont pas) : une ombre portee au pied n'en couvre pas tant.",
  },
  'facades.texture.ombreMin': {
    valeur: 1.15,
    unite: 'rapport',
    pourquoi: "Une ombre portee prend au moins 13 % de la lumiere ; un ecart moindre est le grain du parement (brique, meuliere, pierre plus sombre) et reste tel quel.",
  },
  'facades.texture.gainMax': {
    valeur: 2.2,
    unite: 'rapport',
    pourquoi: "Une ombre portee laisse 40 a 60 % de la lumiere ; au-dela d'un tel gain, le pixel n'a plus assez d'information et l'on n'invente pas.",
  },
  'facades.texture.force': {
    valeur: 0.85,
    unite: 'part',
    pourquoi: "La part de l'ombre que l'on retire : un mur parfaitement egal parait faux, un reste d'ombre garde le modele de la photo.",
  },
  'facades.texture.margeBaieM': {
    valeur: 0.08,
    unite: 'm',
    pourquoi: "Autour d'une baie (encadrement, ebrasement), l'eclairage ne se lit pas : il se reprend du mur voisin.",
  },
} as const satisfies Record<string, Reglage>;

export type NomReglageTexture = keyof typeof REGLAGES_TEXTURE;
export type ValeursTexture = Record<NomReglageTexture, number>;

export function reglagesTexture(surcharges: Partial<ValeursTexture> = {}): ValeursTexture {
  const v = {} as ValeursTexture;
  for (const nom of Object.keys(REGLAGES_TEXTURE) as NomReglageTexture[]) v[nom] = surcharges[nom] ?? REGLAGES_TEXTURE[nom].valeur;
  return v;
}
