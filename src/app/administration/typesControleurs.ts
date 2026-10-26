// Les noeuds de l'arbre des controleurs et ce que la decouverte lit (app/administration/controleurs.ts) : seuls, pour que les branches de l'arbre
// (app/administration/ecritures.ts) les construisent sans dependre de l'arbre qui les assemble.

import type { Commande } from '../commandes.js';
import type { Classe, Emplacement } from '../exposition.js';
import type { ChampChoix, Section } from '../../ui/champs/types.js';
import type { ControleEcran, EcartZone } from './inventaireEcran.js';

export type GenreNoeud = 'racine' | 'branche' | 'zone' | 'emplacement' | 'groupe' | 'commande' | 'famille' | 'section' | 'champ' | 'option' | 'controle' | 'manque';

export interface Noeud {
  /** La cle du controleur dans son parent : l'identifiant de la commande, la cle du champ… */
  cle: string;
  /** Son nom explicite, tel que l'ecran le montre. */
  nom: string;
  genre: GenreNoeud;
  /** Quelques faits, en clair : raccourci, type, unite, classes d'ecran… */
  details?: Record<string, string>;
  enfants?: Noeud[];
}

/** Le document enregistre sur le serveur. */
export interface RegistreControleurs {
  format: 'plan-controleurs';
  version: 1;
  appVersion: string;
  decouvertLe: string;
  arbre: Noeud;
}

/** Ce que la decouverte lit dans Plan en marche. */
export interface SourceControleurs {
  appVersion: string;
  commandes: Commande[];
  exposition: Record<string, Record<Classe, Emplacement[]>>;
  /**
   * Une entree par sorte d'objet rencontree : ses sections d'inspecteur, et de quoi lister les
   * valeurs permises d'une liste de choix (elles dependent de l'objet). `null` : illisible.
   */
  inspecteur: { cle: string; nom: string; sections: Section[]; echantillon?: boolean; optionsDe?: (ch: ChampChoix) => { valeur: string; libelle: string }[] | null }[];
  /** L'inventaire de la page (app/administration/inventaireEcran.ts) : les controles affiches hors registre. */
  ecran?: { horsRegistre: ControleEcran[]; rattaches: number; classes?: string[]; ecarts?: EcartZone[] };
}
