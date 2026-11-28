// Les pieces du toit : ce que la personne choisit en images dans l'atelier du toit (Z10), en donnees. Une forme (famille `toit`), un
// corps (`corps`), ce qui se pose sur le toit (`sur`) ou contre un mur (`facade`).
//
// Les identifiants sont stables (`famille:nom`) : ce sont eux que les boutons passent au controleur (facade/modeToit/controleurToit.ts).
// Les images sont dessinees ailleurs (three/catalogueToits.ts, three/vueSaillie.ts) : ce module ne dit que ce qu'est chaque piece. Pur.

import { EXEMPLES_TOITS } from './exemplesToits.js';

export type FamillePiece = 'corps' | 'toit' | 'sur' | 'facade';

export interface PieceCatalogue {
  /** Stable : `famille:nom`. C'est la valeur que l'ecran passe au controleur. */
  id: string;
  famille: FamillePiece;
  libelle: string;
  /** L'exemple du catalogue (facade/modeToit/exemplesToits.ts) dont la vignette est l'image de la piece ; absent : un glyphe. */
  exemple?: string;
  /** Pas proposee en vignette : une variante montree sous une autre (les trois pans), ou un ancien identifiant encore compris. */
  cachee?: true;
}

/** Les tourelles ne se posent pas sur un batiment entier : le catalogue les garde, l'atelier non. */
const TOURELLES = new Set(['conique', 'polygonal', 'fleche', 'dome', 'imperiale']);

const formes = EXEMPLES_TOITS.filter((e) => e.famille === 'toit' && !TOURELLES.has(e.id));
const lucarnes = EXEMPLES_TOITS.filter((e) => e.famille === 'lucarne');

export const PIECES: readonly PieceCatalogue[] = [
  // Les corps : leur vignette est la forme de toit qu'ils prennent a la pose.
  { id: 'corps:aile', famille: 'corps', libelle: 'Aile', exemple: 'appentis' },
  { id: 'corps:retour', famille: 'corps', libelle: 'Retour', exemple: 'deux-pans' },
  { id: 'corps:biaise', famille: 'corps', libelle: 'Biaise', exemple: 'croupes' },
  ...formes.map((e) => ({ id: 'forme:' + e.id, famille: 'toit' as const, libelle: e.titre, exemple: e.id })),
  // Les trois pans : le quatre-pans avec une seule croupe, l'autre bout en pignon. Des options sous la vignette du quatre-pans.
  { id: 'forme:croupes-debut', famille: 'toit', libelle: 'Trois pans, croupe au début du faîtage', exemple: 'croupes', cachee: true },
  { id: 'forme:croupes-fin', famille: 'toit', libelle: 'Trois pans, croupe à la fin du faîtage', exemple: 'croupes', cachee: true },
  { id: 'sur:pignon', famille: 'sur', libelle: 'Pignon' },
  { id: 'sur:cheminee', famille: 'sur', libelle: 'Cheminée' },
  { id: 'sur:fenetre-toit', famille: 'sur', libelle: 'Fenêtre de toit' },
  { id: 'sur:solaire', famille: 'sur', libelle: 'Solaire' },
  ...lucarnes.map((e) => ({ id: 'sur:' + e.id, famille: 'sur' as const, libelle: e.titre.replace(/^Lucarne /, ''), exemple: e.id })),
  { id: 'facade:bow-window', famille: 'facade', libelle: 'Bow-window' },
  { id: 'facade:bow-rectangle', famille: 'facade', libelle: 'Bow-window', cachee: true },
  { id: 'facade:bow-arc', famille: 'facade', libelle: 'Bow en arc', cachee: true },
  { id: 'facade:bow-conge', famille: 'facade', libelle: 'Bow arrondi', cachee: true },
  { id: 'facade:galerie', famille: 'facade', libelle: 'Galerie' },
  { id: 'facade:appentis-ferme', famille: 'facade', libelle: 'Appentis fermé' },
  // L'auvent au-dessus d'une porte (une marquise sur consoles) : la saillie `auvent` que la lecture des photos pose aussi (lot L1).
  { id: 'facade:auvent', famille: 'facade', libelle: 'Auvent' },
  // Une travee du mur regarde (schema 14) : un mur recule sous le toit, ou, sous un appentis, un garde-corps entre ses poteaux.
  { id: 'facade:travee', famille: 'facade', libelle: 'Travée' },
  // Un decroche au point touche : la personne touche l'egout ou le mur dans la Vue 3D, choisit le cote et la profondeur.
  { id: 'facade:decroche', famille: 'facade', libelle: 'Décroché' }
];

export const piece = (id: string): PieceCatalogue | undefined => PIECES.find((p) => p.id === id);
export const piecesDe = (famille: FamillePiece): PieceCatalogue[] => PIECES.filter((p) => p.famille === famille && !p.cachee);

/** Les variantes d'une piece, montrees sous sa vignette : le quatre-pans se pose aussi en trois pans. */
export const OPTIONS_PIECE: Readonly<Record<string, readonly { id: string; libelle: string }[]>> = {
  'forme:croupes': [{ id: 'forme:croupes-debut', libelle: 'Croupe au début' }, { id: 'forme:croupes-fin', libelle: 'Croupe à la fin' }]
};

/** Les quatre formes du parcours simple, dans l'ordre de la maquette du 27 novembre 2026. */
export const FORMES_SIMPLES: readonly { piece: string; libelle: string }[] = [
  { piece: 'forme:plat', libelle: 'Plat' }, { piece: 'forme:appentis', libelle: 'Un pan' },
  { piece: 'forme:deux-pans', libelle: 'Deux pans' }, { piece: 'forme:croupes', libelle: 'Quatre pans' }
];

/** Les six pieces du parcours simple : la piece, son mot, et le bouton qui la pose (« Poser la lucarne »). */
export const PIECES_SIMPLES: readonly { piece: string; libelle: string; poser: string }[] = [
  { piece: 'sur:jacobine', libelle: 'Lucarne', poser: 'Poser la lucarne' },
  { piece: 'sur:fenetre-toit', libelle: 'Fenêtre de toit', poser: 'Poser la fenêtre de toit' },
  { piece: 'sur:cheminee', libelle: 'Cheminée', poser: 'Poser la cheminée' },
  { piece: 'facade:auvent', libelle: 'Auvent', poser: 'Poser l’auvent' },
  { piece: 'facade:appentis-ferme', libelle: 'Appentis', poser: 'Poser l’appentis' },
  { piece: 'facade:galerie', libelle: 'Galerie', poser: 'Poser la galerie' }
];
