// Le magasin : l'etat observable que les zones de la nouvelle interface lisent (spec-ihm-zones §5.1).
//
// `EtatApp` est mute en place par tout le programme — `etat.selectedKey = …`, puis `render()`. Le
// remplacer d'un coup par un etat immuable reviendrait a reecrire chaque geste, et c'est exactement
// ce que la migration a refuse de faire. Le magasin est donc un **pont** : il tient une reference a
// l'etat tel qu'il est, et un compteur de version que `render()` incremente. Un composant React qui
// s'abonne au compteur se redessine a chaque rendu du plan et lit l'etat directement — il voit ce
// que le plan voit, au meme moment.
//
// A cote de ce pont, quelques champs **immuables** : ce que les zones affichent et que l'etat du plan
// ne porte pas — la vue courante, le lieu, le projet et son statut d'enregistrement, le pointeur.
// Ils sont poses par le programme (`definir*`) et lus par les zones ; c'est la forme que prendra
// tout l'etat, une zone a la fois.

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EtatApp } from '../core/state.js';
import type { PtBrut } from '../model/types.js';
import type { ProjetResume } from '../io/api.js';
import type { Vue } from './modes.js';
import type { HauteurTiroir } from './tiroir.js';
import type { Classe } from './exposition.js';

/**
 * Les feuilles du telephone (spec-ihm-mobile §5.5) : une seule ouverte a la fois. Chacune porte une
 * zone existante — la palette, l'explorateur, l'inspecteur, le tiroir, les menus — sous une autre
 * forme ; aucune n'ajoute de commande.
 */
export type Feuille = 'projet' | 'outils' | 'objets' | 'proprietes' | 'resultats' | 'reglages3d';
/** La hauteur d'une feuille : un apercu, la moitie de l'ecran, l'ecran entier. */
export type HauteurFeuille = 'apercu' | 'mi' | 'plein';

/** Ou en est le projet vis-a-vis du serveur. `local` : pas de serveur, jeu de demonstration. */
export type StatutProjet = 'local' | 'a-jour' | 'modifie' | 'enregistrement';

export interface ProjetObservable {
  apiDisponible: boolean;
  courant: ProjetResume | null;
  liste: ProjetResume[];
  statut: StatutProjet;
  /** « Enregistré à 18:38 (820 Ko) », ou vide tant que rien n'a ete enregistre dans cette session. */
  enregistreA: string;
  /**
   * Le dernier enregistrement a echoue : « Échec de l’enregistrement (2,4 Mo) », avec la taille de ce
   * qui a ete refuse. Vide sinon ; un enregistrement reussi l'efface.
   */
  echec?: string;
  /** Le projet ouvert est d'un schema anterieur au programme : « Mettre a jour le modele » s'offre. */
  schemaEnRetard: boolean;
  /** Les projets de l'organisation et ce que l'abonnement en autorise ; `null` : hors plateforme. */
  quota: { utilise: number; limite: number | null; illimite: boolean } | null;
}

export interface EtatMagasin {
  /** La reference vivante : la meme que celle que `boot()` mute. */
  etat: EtatApp;
  /** Incremente a chaque `render()` : c'est le signal d'abonnement, pas une donnee. */
  version: number;
  vue: Vue;
  /** Le lieu de la parcelle, formate pour le titre, ou vide. */
  lieu: string;
  projet: ProjetObservable;
  /** Position du pointeur sur le plan, en metres, ou `null` hors du plan. */
  pointeur: PtBrut | null;
  /** La pile d'annulation a quelque chose a rendre. */
  peutAnnuler: boolean;
  /** L'explorateur (Z3) est deplie ; replie, il rend sa largeur au plan. */
  explorateurOuvert: boolean;
  /** La hauteur du tiroir des resultats (Z6). */
  tiroir: HauteurTiroir;
  /** L'inspecteur (Z5) est deplie ; replie, il rend sa largeur au plan. */
  inspecteurOuvert: boolean;
  /**
   * Les sections de l'inspecteur s'ouvrent repliees : on n'y voit que leurs titres (les etapes d'une
   * terrasse ou d'une piscine). Preference de l'utilisateur, gardee par le navigateur, jamais du projet.
   */
  sectionsRepliees: boolean;
  /** La classe d'ecran (app/classe.ts). */
  classe: Classe;
  /** La feuille ouverte sur telephone, ou aucune. */
  feuille: Feuille | null;
  hauteurFeuille: HauteurFeuille;
  /** Les options des commandes de fichier et d'export : de la session, jamais du projet. */
  options: OptionsCommandes;
}

/**
 * Les options que les menus Fichier et Exporter reglent et que leurs commandes lisent. Elles vivaient
 * dans des cases de la page, relues par les commandes (et par io/importSvg) avec `getElementById` :
 * le magasin les tient desormais, les menus les ecrivent, les commandes les recoivent.
 */
export interface OptionsCommandes {
  /** Import SVG : supprimer les objets existants avant d'importer. */
  remplacerImportSvg: boolean;
  /** Import JSON : remplacer le plan actuel (decoche, les objets s'ajoutent). */
  remplacerImportJson: boolean;
  /** Export JSON : sans la parcelle ni le voisinage. */
  exportSansParcelle: boolean;
  /** Dossier PDF : inclure l'emprise des equipements. */
  dossierEquipements: boolean;
  /** PDF du plan : le denominateur de l'echelle (1/200). */
  echellePdf: number;
}

export const OPTIONS_PAR_DEFAUT: OptionsCommandes = {
  remplacerImportSvg: false, remplacerImportJson: true, exportSansParcelle: false, dossierEquipements: true, echellePdf: 200
};

export interface Magasin {
  store: StoreApi<EtatMagasin>;
  /** A appeler apres chaque rendu du plan. */
  notifier(): void;
  version(): number;
  definirVue(vue: Vue): void;
  definirLieu(lieu: string): void;
  definirProjet(projet: Partial<ProjetObservable>): void;
  definirPointeur(p: PtBrut | null): void;
  definirPeutAnnuler(peut: boolean): void;
  definirExplorateurOuvert(ouvert: boolean): void;
  definirTiroir(hauteur: HauteurTiroir): void;
  definirInspecteurOuvert(ouvert: boolean): void;
  definirSectionsRepliees(replier: boolean): void;
  definirClasse(classe: Classe): void;
  /** Ouvre une feuille (et ferme la precedente), ou ferme tout avec `null`. */
  definirFeuille(feuille: Feuille | null, hauteur?: HauteurFeuille): void;
  definirHauteurFeuille(hauteur: HauteurFeuille): void;
  definirOption<K extends keyof OptionsCommandes>(cle: K, valeur: OptionsCommandes[K]): void;
}

/** La hauteur d'ouverture de chaque feuille : les listes a mi-hauteur, les resultats en entier. */
export const HAUTEUR_PAR_DEFAUT: Record<Feuille, HauteurFeuille> = {
  projet: 'plein', outils: 'mi', objets: 'mi', proprietes: 'plein', resultats: 'plein', reglages3d: 'mi'
};

export function creerMagasin(etat: EtatApp): Magasin {
  const store = createStore<EtatMagasin>(() => ({
    etat,
    version: 0,
    vue: 'plan',
    lieu: '',
    projet: { apiDisponible: false, courant: null, liste: [], statut: 'local', enregistreA: '', schemaEnRetard: false, quota: null },
    pointeur: null,
    peutAnnuler: false,
    explorateurOuvert: true,
    tiroir: 'mi',
    inspecteurOuvert: true,
    sectionsRepliees: false,
    classe: 'large',
    feuille: null,
    hauteurFeuille: 'mi',
    options: { ...OPTIONS_PAR_DEFAUT }
  }));
  // La feuille ouverte se lit aussi sur `<html data-feuille>` : la feuille de style montre la zone
  // qui la porte. Hors navigateur (tests Node), il n'y a pas de document a marquer.
  const marquer = (f: Feuille | null, h: HauteurFeuille) => {
    if (typeof document === 'undefined') return;
    if (f) { document.documentElement.dataset.feuille = f; document.documentElement.dataset.hauteurFeuille = h; }
    else { delete document.documentElement.dataset.feuille; delete document.documentElement.dataset.hauteurFeuille; }
  };
  return {
    store,
    notifier: () => store.setState((s) => ({ version: s.version + 1 })),
    version: () => store.getState().version,
    definirVue: (vue) => store.setState({ vue }),
    definirLieu: (lieu) => store.setState({ lieu }),
    definirProjet: (projet) => store.setState((s) => ({ projet: { ...s.projet, ...projet } })),
    definirPointeur: (pointeur) => store.setState({ pointeur }),
    definirPeutAnnuler: (peutAnnuler) => store.setState({ peutAnnuler }),
    definirExplorateurOuvert: (explorateurOuvert) => store.setState({ explorateurOuvert }),
    definirTiroir: (tiroir) => store.setState({ tiroir }),
    definirInspecteurOuvert: (inspecteurOuvert) => store.setState({ inspecteurOuvert }),
    definirSectionsRepliees: (sectionsRepliees) => store.setState({ sectionsRepliees }),
    definirClasse: (classe) => store.setState({ classe }),
    definirFeuille: (feuille, hauteur) => {
      const h = hauteur ?? (feuille ? HAUTEUR_PAR_DEFAUT[feuille] : 'mi');
      store.setState({ feuille, hauteurFeuille: h });
      marquer(feuille, h);
    },
    definirOption: (cle, valeur) => store.setState((s) => ({ options: { ...s.options, [cle]: valeur } })),
    definirHauteurFeuille: (hauteurFeuille) => {
      store.setState({ hauteurFeuille });
      marquer(store.getState().feuille, hauteurFeuille);
    }
  };
}
