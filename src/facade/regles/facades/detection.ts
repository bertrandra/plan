// Les reglages nommes de la detection des ouvertures (MD/spec-facades-calage-detection.md §9, lot L14).
//
// Les seuils de la detection sortent du code avec leur raison, comme ceux des toits
// (MD/spec-regles-toits.md §6) : quand le banc ou les corrections d'un audit montrent qu'un seuil se
// trompe, on sait lequel toucher et pourquoi il valait ce qu'il vaut. Le code lit ces reglages ; il ne
// porte plus de nombre en dur pour ce qui decide d'une ouverture.
//
// Une valeur changee ici change ce que propose le releve : elle se justifie par le banc
// (`.claude/skills/facades`), avant et apres, jamais par une seule scene.

import { surchargesCalibrees } from './surcharges.js';

export interface Reglage {
  valeur: number;
  unite: 'm' | 'm2' | 'niveaux' | 'rapport' | 'part' | 'nombre';
  pourquoi: string;
}

export const REGLAGES_DETECTION = {
  'facades.detection.largeurMinM': {
    valeur: 0.35,
    unite: 'm',
    pourquoi: "Plus etroit qu'un fenestron : un tuyau de descente, un joint, une ombre de poteau.",
  },
  'facades.detection.largeurMaxM': {
    valeur: 5.5,
    unite: 'm',
    pourquoi: 'Plus large que deux portes de garage : un soubassement, une bande, pas une baie.',
  },
  'facades.detection.hauteurMinM': {
    valeur: 0.4,
    unite: 'm',
    pourquoi: "Plus bas qu'un soupirail : un bandeau, un appui saillant, l'ombre d'une corniche.",
  },
  'facades.detection.hauteurMaxM': {
    valeur: 3.2,
    unite: 'm',
    pourquoi: "Plus haut qu'une baie d'un seul niveau : une ombre de toit, un arbre, une colonne.",
  },
  'facades.detection.remplissageMin': {
    valeur: 0.55,
    unite: 'part',
    pourquoi: "Une baie remplit sa boite ; une ombre d'arbre ou un dessin d'appareil la troue. Sous ce seuil, il faut des aretes nettes pour la garder.",
  },
  'facades.detection.remplissageAretesMin': {
    valeur: 0.4,
    unite: 'part',
    pourquoi: 'Remplissage minimal quand les quatre aretes de la boite sont nettes (indice B fort) : une baie ton sur ton se lit par son pourtour.',
  },
  'facades.detection.petiteSurfaceM2': {
    valeur: 0.4,
    unite: 'm2',
    pourquoi: "Sous cette surface, une tache n'est gardee que si ses quatre aretes sont nettes : un fenestron a un dormant ; une roue, une touffe de haie, un pot n'en ont pas.",
  },
  'facades.detection.bandeMaxPart': {
    valeur: 0.85,
    unite: 'part',
    pourquoi: 'Une tache qui traverse presque toute la facade est un soubassement, une ombre de toiture ou le bas du cadrage.',
  },
  'facades.detection.debordHauteurMaxM': {
    valeur: 0.8,
    unite: 'm',
    pourquoi: "Une tache basse collee au haut de l'elevation est le plus souvent l'ombre du debord de toit.",
  },
  'facades.detection.seuilMin': {
    valeur: 28,
    unite: 'niveaux',
    pourquoi: "Ecart de teinte minimal a son fond : en dessous, on detecterait les ombres portees d'une gouttiere et le grain de l'enduit.",
  },
  'facades.detection.seuilFacteur': {
    valeur: 3,
    unite: 'rapport',
    pourquoi: "Le seuil vaut ce facteur fois l'ecart median de la zone (grain de l'enduit, joints de la brique, bruit du capteur).",
  },
  'facades.detection.seuilChromaMin': {
    valeur: 24,
    unite: 'niveaux',
    pourquoi: "Ecart de teinte seule (chromaticite, en niveaux) minimal a son fond : un vitrage bleute sur une pierre ocre se detache par sa teinte meme quand le grain de la pierre releve le seuil d'ecart de couleur.",
  },
  'facades.detection.fenetreFondM': {
    valeur: 1.5,
    unite: 'm',
    pourquoi: "Cote de la fenetre glissante du fond local : plus grande qu'une baie, assez petite pour qu'un soubassement ou un bandeau soit le fond de sa zone.",
  },
  'facades.detection.bandeRangM': {
    valeur: 0.5,
    unite: 'm',
    pourquoi: "Hauteur de la bande horizontale du fond de rang : un soubassement, un bandeau, l'ombre du debord sont des bandes ; leur teinte devient le fond de leur rang.",
  },
  'facades.detection.ebrasementContrasteMin': {
    valeur: 0.06,
    unite: 'rapport',
    pourquoi: "Une face d'ebrasement ne regarde pas le meme ciel que le nu du mur : sa luminosite s'ecarte de celle du fond d'au moins cette part (plus claire ou plus sombre), sa teinte restant celle du mur.",
  },
  'facades.detection.ebrasementPartMin': {
    valeur: 0.8,
    unite: 'part',
    pourquoi: "Une colonne (ou une ligne) le long d'une baie n'appartient a l'ebrasement que si cette part de ses pixels en a l'aspect : une face court sur toute la hauteur de la baie.",
  },
  'facades.detection.ebrasementUniformiteMax': {
    valeur: 0.06,
    unite: 'rapport',
    pourquoi: "Une face d'ebrasement est lisse : l'ecart type de sa luminance reste sous cette part de la moyenne, la ou un parement de pierre ou de brique montre ses joints et son grain.",
  },
  'facades.detection.ebrasementMinM': {
    valeur: 0.1,
    unite: 'm',
    pourquoi: "Sous cette largeur, la bande le long d'une baie est le dormant ou l'ombre d'un tableau, pas une face d'ebrasement.",
  },
  'facades.detection.ebrasementMaxM': {
    valeur: 0.5,
    unite: 'm',
    pourquoi: "La face d'ebrasement visible ne passe pas l'epaisseur d'un mur de pierre (50 cm) vue de biais : au-dela, ce n'est plus elle.",
  },
  'facades.detection.ombreChromaMax': {
    valeur: 0.025,
    unite: 'rapport',
    pourquoi: 'Une ombre baisse la luminance sans changer la chromaticite (r/(r+g+b), g/(r+g+b)) : sous cet ecart de chromaticite au fond, un pixel plus sombre est une ombre possible.',
  },
  'facades.detection.ombreLuminanceMin': {
    valeur: 0.25,
    unite: 'rapport',
    pourquoi: "Une ombre portee laisse au moins le quart de la lumiere ; plus sombre, c'est un vitrage ou une menuiserie sombre.",
  },
  'facades.detection.ombreLuminanceMax': {
    valeur: 0.92,
    unite: 'rapport',
    pourquoi: "Au-dessus de ce rapport de luminance au fond, l'ecart n'est pas une ombre mais le grain du mur.",
  },
  'facades.detection.areteNette': {
    valeur: 0.6,
    unite: 'part',
    pourquoi: "Part d'un cote de la boite ou le profil de contours montre une arete : au-dessus, le cote est net.",
  },
  'facades.detection.voletsPartMin': {
    valeur: 0.3,
    unite: 'part',
    pourquoi: "Un volet battant ouvert fait environ la moitie de la baie : au moins cette part de sa largeur.",
  },
  'facades.detection.voletsPartMax': {
    valeur: 0.7,
    unite: 'part',
    pourquoi: 'Et au plus cette part de la largeur de la baie.',
  },
  'facades.detection.voletsContrasteMin': {
    valeur: 45,
    unite: 'niveaux',
    pourquoi: "Ecart de teinte minimal entre les volets et la baie qu'ils encadrent : en dessous, c'est une seule menuiserie.",
  },
  'facades.detection.voletsEcartMax': {
    valeur: 30,
    unite: 'niveaux',
    pourquoi: 'Les deux volets d une baie sont de la meme teinte : ecart maximal entre eux.',
  },
  'facades.detection.alignementM': {
    valeur: 0.07,
    unite: 'm',
    pourquoi: "Linteaux et appuis d'un meme niveau, a cet ecart pres, sont ramenes a la meme cote : sur une maison, ils sont alignes.",
  },
} as const satisfies Record<string, Reglage>;

export type NomReglageDetection = keyof typeof REGLAGES_DETECTION;

/** Les valeurs des reglages, eventuellement surchargees (banc, profil de facade a venir). */
export type ValeursDetection = Record<NomReglageDetection, number>;

export function reglagesDetection(surcharges: Partial<ValeursDetection> = {}): ValeursDetection {
  const v = {} as ValeursDetection;
  for (const nom of Object.keys(REGLAGES_DETECTION) as NomReglageDetection[]) v[nom] = surcharges[nom] ?? surchargesCalibrees()[nom] ?? REGLAGES_DETECTION[nom].valeur;
  return v;
}
