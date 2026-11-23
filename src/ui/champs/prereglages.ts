// Les trois departs d'une terrasse (audit de l'inspecteur, decision B5) : « Pin sur vis », « Pin sur plots », « Exotique sur plots ».
//
// Un prereglage n'est pas un calcul : c'est une suite de valeurs que la personne aurait pu saisir elle-meme, champ par champ, dans
// l'inspecteur. Il les ecrit donc par les descripteurs de ces champs (`ecrire`), dans l'ordre ou elle l'aurait fait : le type de pose
// d'abord (il decide de ce qui suit), puis la lame, puis la structure. Un champ que l'etape precedente cache ou grise (les solives
// d'une terrasse sur plots en structure simple) est saute, comme la personne n'aurait pas pu le regler. Rien du moteur ne change :
// les memes ecritures, les memes valeurs admises, et le calcul les lit comme d'habitude.
//
// Le geste est une commande du registre par depart (app/prereglages.ts) : un instantane d'annulation pour le tout, le projet marque
// modifie, refuse en lecture seule.

import type { Champ, ContexteChamps } from './types.js';

/** Une valeur posee par un depart, sous la cle du champ de l'inspecteur qui l'ecrit. */
export type ValeurPrereglage = readonly [cle: string, valeur: string | number | boolean];

export interface PrereglageTerrasse {
  /** La commande du registre qui le pose (app/prereglages.ts, app/exposition.ts). */
  commande: string;
  libelle: string;
  /** Ce qu'il regle, en une phrase : l'infobulle du bouton. */
  description: string;
  valeurs: readonly ValeurPrereglage[];
}

/**
 * Les trois departs. Les valeurs sont celles du commerce et de l'usage, deja proposees par les listes de l'inspecteur : une lame du
 * catalogue (engine/bois/lamesCommerce.ts), une section de bois de la liste, un entraxe que la lame admet (une lame de 27 mm porte
 * sur 45 cm). Sur plots, la structure simple : des lambourdes posees sur les plots, leur entraxe impose par l'epaisseur de la lame.
 */
export const PREREGLAGES_TERRASSE: readonly PrereglageTerrasse[] = [
  {
    commande: 'terrasse.prereglage.pinVis', libelle: 'Pin sur vis',
    description: 'Lames de pin autoclave 145 × 27 mm, sur solives 63 × 175 mm et lambourdes, portées par des vis de fondation',
    valeurs: [['typePose', 'vis-fondation'], ['lameCommerce', 'pin-145x27'], ['soliveSection', '63x175'], ['soliveEntraxe', 60],
      ['avecLambourde', true], ['lambourdeSection', '45x70'], ['lambourdeEntraxe', 45]]
  },
  {
    commande: 'terrasse.prereglage.pinPlots', libelle: 'Pin sur plots',
    description: 'Lames de pin autoclave 145 × 27 mm, sur lambourdes 45 × 70 mm posées sur plots réglables',
    valeurs: [['typePose', 'plots'], ['plotAvecSolives', false], ['lameCommerce', 'pin-145x27'], ['lambourdeSection', '45x70']]
  },
  {
    commande: 'terrasse.prereglage.exotiquePlots', libelle: 'Exotique sur plots',
    description: 'Lames d’ipé 145 × 21 mm, sur lambourdes 45 × 70 mm posées sur plots réglables ; leur entraxe suit l’épaisseur de la lame',
    valeurs: [['typePose', 'plots'], ['plotAvecSolives', false], ['lameCommerce', 'ipe-145x21'], ['lambourdeSection', '45x70']]
  }
];

/** Le champ qui porte cette cle, parmi ceux de l'inspecteur (une ligne depliee). */
function champDe(champs: readonly Champ[], cle: string): Champ | undefined {
  for (const ch of champs) {
    if (ch.cle === cle) return ch;
    if (ch.type === 'ligne') { const sous = champDe(ch.champs, cle); if (sous) return sous; }
  }
  return undefined;
}

/** Le champ se regle-t-il maintenant, la ou la personne le verrait ? Montre (hors mode expert) et actif. */
const reglable = (ch: Champ, c: ContexteChamps): boolean => (!ch.visible || ch.visible(c)) && (!ch.actif || ch.actif(c));

/**
 * Ecrit un depart par les descripteurs, dans son ordre. `champs` les rend a chaque valeur : un champ cache par la valeur precedente
 * (les solives sous des plots en structure simple) ne s'ecrit pas. Rend le nombre de valeurs ecrites ; l'appelant porte
 * l'annulation, le marquage et le rendu (une seule fois pour le tout).
 */
export function appliquerPrereglage(c: ContexteChamps, p: PrereglageTerrasse, champs: () => readonly Champ[]): number {
  let ecrites = 0;
  for (const [cle, valeur] of p.valeurs) {
    const ch = champDe(champs(), cle);
    if (!ch || !reglable(ch, c)) continue;
    if (ch.type === 'choix' && typeof valeur === 'string') ch.ecrire(c, valeur);
    else if (ch.type === 'nombre' && typeof valeur === 'number') { if (ch.ecrire(c, valeur) === false) continue; }
    else if (ch.type === 'case' && typeof valeur === 'boolean') { if (ch.ecrire(c, valeur) === false) continue; }
    else continue;
    ecrites++;
  }
  return ecrites;
}

/** Le depart dont la terrasse porte toutes les valeurs (les champs qu'elle montre), ou aucun. */
export function prereglageEnPlace(c: ContexteChamps, champs: readonly Champ[]): PrereglageTerrasse | undefined {
  return PREREGLAGES_TERRASSE.find((p) => p.valeurs.every(([cle, valeur]) => {
    const ch = champDe(champs, cle);
    if (!ch || !reglable(ch, c)) return true;
    if (ch.type === 'choix' || ch.type === 'nombre' || ch.type === 'case') return ch.lire(c) === valeur;
    return true;
  }));
}

/**
 * La ligne des trois departs, en tete des lames d'une terrasse : un bouton par depart, chacun liaison vers sa commande (grise en
 * lecture seule ou sans terrasse). Sa note dit lequel est en place. `champs` : ceux de la terrasse, pour cette note.
 */
export function lignePrereglages(champs: (c: ContexteChamps) => readonly Champ[]): Champ {
  return {
    type: 'ligne', cle: 'prereglages', libelle: 'Départ rapide',
    aide: 'Trois points de départ courants : chacun règle la lame et la structure d’un coup, comme vous le feriez champ par champ. Tout reste modifiable ensuite, et Ctrl+Z revient en arrière.',
    note: (c) => { const p = prereglageEnPlace(c, champs(c)); return p ? 'en place : ' + p.libelle.toLowerCase() : 'réglages personnalisés'; },
    champs: PREREGLAGES_TERRASSE.map((p): Champ => ({
      type: 'bouton', cle: p.commande, libelle: p.libelle, aide: p.description,
      agit: { commande: p.commande }, executer: (c) => c.executerCommande(p.commande)
    }))
  };
}
