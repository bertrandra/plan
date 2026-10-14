// Les reglages nommes de la structure et du classement des ouvertures (MD/spec-facades-calage-detection.md
// §10 et §11, lot L15), sur le modele de `reglagesDetection.ts`.
//
// Une valeur changee ici change ce que propose le releve : elle se justifie par le banc
// (`.claude/skills/facades`), avant et apres, jamais par une seule scene.

import type { Reglage } from './reglagesDetection.js';

export const REGLAGES_STRUCTURE = {
  'facades.structure.niveauRecouvrementMin': {
    valeur: 0.5,
    unite: 'part',
    pourquoi: "Deux baies sont du meme niveau si leurs hauteurs se recouvrent sur cette part de la plus basse : une porte et une fenetre du rez-de-chaussee n'ont pas le meme appui, mais elles partagent l'etage.",
  },
  'facades.structure.traveeM': {
    valeur: 0.1,
    unite: 'm',
    pourquoi: "Ecart maximal entre les centres de deux baies d'une meme travee, d'une rangee a l'autre : une travee de maconnerie est montee a l'aplomb.",
  },
  'facades.structure.egaliserM': {
    valeur: 0.05,
    unite: 'm',
    pourquoi: "Une baie a moins de cet ecart de la mediane de sa travee (largeur) ou de sa rangee (hauteur, meme type) en prend la valeur : la mesure tremble de quelques centimetres, la menuiserie non.",
  },
  'facades.structure.gardeFouM': {
    valeur: 0.1,
    unite: 'm',
    pourquoi: "La regularisation ne deplace jamais un bord de plus de cet ecart de sa mesure : au-dela, la mesure l'emporte, une facade peut etre irreguliere.",
  },
  'facades.structure.symetrieM': {
    valeur: 0.1,
    unite: 'm',
    pourquoi: 'Travees symetriques autour du milieu de la facade a cet ecart pres : la facade est marquee symetrique, ce qui aide a completer et ne deplace rien.',
  },
  'facades.structure.etageMinM': {
    valeur: 2.5,
    unite: 'm',
    pourquoi: "Hauteur d'etage minimale entre deux linteaux successifs : en dessous, deux rangees de baies ne sont pas deux niveaux d'une maison.",
  },
  'facades.structure.etageMaxM': {
    valeur: 3.2,
    unite: 'm',
    pourquoi: "Hauteur d'etage maximale entre deux linteaux successifs : au-dela, une rangee manque peut-etre, ou la facade n'est pas reguliere.",
  },
  'facades.structure.cacheMin': {
    valeur: 0.5,
    unite: 'part',
    pourquoi: "Part d'un croisement de la grille cachee sur toutes les vues (masque d'occlusion) au-dessus de laquelle la zone est dite cachee : une baie peut s'y trouver sans qu'on la voie.",
  },
  'facades.structure.murNetMin': {
    valeur: 0.8,
    unite: 'part',
    pourquoi: "Part d'un croisement vu qui ressemble au fond du mur au-dessus de laquelle la zone est nettement « mur » : on n'y devine jamais de baie.",
  },
  'facades.structure.devineeCocheeMin': {
    valeur: 0.6,
    unite: 'rapport',
    pourquoi: "Confiance d'une baie devinee a partir de laquelle elle est proposee cochee ; en dessous, elle reste en pointille, decochee, a garder d'une touche.",
  },
  'facades.classement.coffreMinM': {
    valeur: 0.12,
    unite: 'm',
    pourquoi: "Hauteur minimale d'un coffre de volet roulant (ou d'une bande de mur) retiree du haut d'une baie : en dessous, c'est le dormant.",
  },
  'facades.classement.coffreMaxM': {
    valeur: 0.32,
    unite: 'm',
    pourquoi: "Hauteur maximale d'un coffre de volet roulant : au-dela, la bande fait partie de la baie (une imposte, un vitrage).",
  },
  'facades.classement.coffreUniMax': {
    valeur: 0.35,
    unite: 'rapport',
    pourquoi: "Un coffre est uni dans sa largeur : ses aretes verticales valent au plus cette part de celles de la baie en dessous (meneau, dormant, petits bois).",
  },
  'facades.classement.coupureMin': {
    valeur: 30,
    unite: 'niveaux',
    pourquoi: "Ecart de teinte minimal entre la bande du haut et la baie, de part et d'autre de la coupure : une arete franche separe le coffre (ou le mur) du dormant.",
  },
  'facades.classement.balconDebordMinM': {
    valeur: 0.15,
    unite: 'm',
    pourquoi: "Un balcon deborde des tableaux de la baie d'au moins cet ecart de chaque cote ; un appui de fenetre, non.",
  },
  'facades.classement.balconPartMin': {
    valeur: 0.6,
    unite: 'part',
    pourquoi: "Part de la largeur d'une bande sous l'appui qui s'ecarte du fond du mur pour y lire une dalle de balcon.",
  },
  'facades.classement.parementBruitMax': {
    valeur: 0.3,
    unite: 'part',
    pourquoi: "Part du mur a cote d'une baie, a mi-hauteur, qui s'ecarte du fond au-dela de laquelle le parement (brique, pierre) est trop heurte pour y lire une dalle ou des barreaux : on ne dit rien.",
  },
  'facades.classement.barreauxMin': {
    valeur: 4,
    unite: 'nombre',
    pourquoi: "Nombre minimal de barreaux reguliers (aretes verticales a pas constant) dans le bas d'une baie pour y lire un garde-corps.",
  },
  'facades.classement.persiennesLamesMin': {
    valeur: 8,
    unite: 'nombre',
    pourquoi: 'Nombre minimal de lames horizontales a pas regulier (3 a 12 cm) dans une baie pour la dire fermee par des persiennes.',
  },
  'facades.classement.vitreeRapportMin': {
    valeur: 1.2,
    unite: 'rapport',
    pourquoi: "Une grande baie au sol est vitree (porte-fenetre) si ses aretes verticales l'emportent de ce rapport sur les horizontales (meneau, dormant) ; une porte de garage a des rainures horizontales.",
  },
  'facades.classement.cintrePartMax': {
    valeur: 0.45,
    unite: 'part',
    pourquoi: "Remplissage maximal des deux coins du haut d'une baie pour la dire cintree, quand le haut du milieu est plein.",
  },
} as const satisfies Record<string, Reglage>;

export type NomReglageStructure = keyof typeof REGLAGES_STRUCTURE;

export type ValeursStructure = Record<NomReglageStructure, number>;

export function reglagesStructure(surcharges: Partial<ValeursStructure> = {}): ValeursStructure {
  const v = {} as ValeursStructure;
  for (const nom of Object.keys(REGLAGES_STRUCTURE) as NomReglageStructure[]) v[nom] = surcharges[nom] ?? REGLAGES_STRUCTURE[nom].valeur;
  return v;
}
