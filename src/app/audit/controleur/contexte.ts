// Le controleur de l audit : ce qu il demande au reste du programme, ce qu il rend, et ses seuils.
// Un morceau de app/audit/controleur.ts, qui le reexporte : le reste du programme importe depuis lui.

import { suivrePositionGps, type SansPosition } from '../../../shell/geolocalisation.js';
import { partagerFichier } from '../../../shell/partage.js';
import { type DialogueChoix } from '../../../shell/dialogues.js';
import { type StockageBrouillon } from '../../../io/brouillonAudit.js';
import { autoriserBoussole, suivreBoussole } from '../../../shell/boussole.js';
import { geocoderBAN, geocoderInverseBAN } from '../../../geo/apiIgn.js';
import { lireGrilleSous } from '../../../geo/mnh.js';
import type { FacadeDevant } from '../../../facade/calage/priseDeVue.js';
import { type PrisePhoto } from '../../../model/audit.js';
import { type DependancesChargement } from '../chargement.js';
import { type Promenade } from '../promenade.js';
import { type CouleursPhotos } from '../couleurFacade.js';
import type { EtatApp } from '../../../core/state.js';
import type { ObjetBrut, ObjetPlan, PtBrut } from '../../../model/types.js';

/** Au-dela de cette precision annoncee, le GPS ne designe pas la parcelle sous les pieds : on attend. */
export const PRECISION_DEPART_MAX_M = 30;
/** Le cap suivi ne fait tourner la vue que s'il a change d'au moins cela : la boussole tremble. */
export const PAS_ORIENTATION_DEG = 3;
/** La facade devant vous ne se recherche que si la boussole a tourne d'au moins cela : elle tremble. */
export const PAS_RECONNAISSANCE_DEG = 2;

export interface ContexteAudit {
  etat: EtatApp;
  /** Remplace les objets du plan (atelier.restoreState). */
  remplacerObjets: (objets: ObjetBrut[]) => void;
  /** Rebatit la Vue 3D (nouveaux batiments) ; repeint un objet (une marque). */
  reconstruire3d: () => void;
  repeindre3d: (cles: string[]) => void;
  ouvrir3d: () => void;
  notifier: () => void;
  signaler: (message: string) => void;
  suivre?: typeof suivrePositionGps;
  geocoder?: typeof geocoderBAN;
  chargement?: DependancesChargement;
  lireGrille?: typeof lireGrilleSous;
  adresse?: typeof geocoderInverseBAN;
  partager?: typeof partagerFichier;
  boussole?: { suivre: typeof suivreBoussole; autoriser: typeof autoriserBoussole };
  /** Ou se range le brouillon de la promenade ; par defaut IndexedDB, `null` pour ne rien garder. */
  stockageBrouillon?: StockageBrouillon | null;
  /** Le delai entre un changement et son ecriture dans le brouillon. */
  delaiBrouillonMs?: number;
  /** Une question a deux issues (Z8) ; par defaut shell/dialogues.ts. */
  questionner?: (d: DialogueChoix) => void;
}

export interface ControleurAudit {
  promenade: Promenade;
  /** La couleur de la facade lue sur les photos des cas (MD/spec-audit.md §6.2). */
  couleurs: CouleursPhotos;
  /** La couleur d'affichage d'un batiment marque (rouge), pour la Vue 3D. */
  couleur: (o: ObjetPlan) => string | null;
  /** « Me suivre » : recadre dans l'axe du cap, et le suit. */
  reprendreSuivi: () => void;
  /** Le doigt tourne la vue : le cap n'est plus suivi (le centre reste votre position). */
  lacherSuivi: () => void;
  /** Ou vous etes et vers ou pointe le telephone, pour la photo d'un cas. */
  prisePhoto: () => PrisePhoto | null;
  /** La facade devant laquelle vous etes (MD/spec-audit.md §6.1), surlignee dans la Vue 3D ; null sinon. */
  facadeDevant: () => FacadeDevant | null;
  ouvrirListe: () => void;
  partager: () => Promise<void>;
  /** Une position, dans le repere du plan (le GPS, ou le doigt au depart d'une adresse). */
  nouvellePosition: (p: PtBrut, precisionM: number | null) => void;
  /** Un tapotement ou un appui long sur l'ecran, en coordonnees normalisees -1..1. */
  tapoter: (ndc: { x: number; y: number }) => void;
  appuiLong: (ndc: { x: number; y: number }) => void;
  /** Une Vue 3D vient d'etre batie : la camera reprend le suivi sur elle. */
  sceneBatie: () => void;
  /** Ecrit le brouillon tout de suite : l'ecran se verrouille, l'onglet passe en arriere-plan. */
  ecrireBrouillon: () => Promise<boolean>;
  arreter: () => void;
}

export const MESSAGES_GPS: Record<SansPosition['raison'], string> = {
  refusee: 'Position refusée : autorisez la localisation pour ce site dans les réglages du navigateur.',
  indisponible: 'Position momentanément indisponible.',
  delai: 'La position tarde à venir.',
};
