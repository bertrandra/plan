// Les commandes du soleil, pour les deux vues 3D (spec §6.4, app/).
//
// La Vue 3D et la visionneuse GLB ont chacune leur date, leur heure, leur intensité et leur lumière
// d'appoint. Ce sont **les mêmes cinq commandes**, sur deux états séparés — les deux vues peuvent
// être réglées à des moments différents sans se marcher dessus.
//
// Elles étaient donc écrites deux fois, à quelques identifiants près. Elles le sont désormais une
// seule, et servies deux fois, au panneau de chaque vue (zones/vue3d/). Le calcul lui-même vit dans
// `three/lumiere.ts`, partagé lui aussi.
//
// Aucune de ces commandes ne reconstruit la scène — seules les lumières déjà en place bougent. C'est
// ce qui permet au réglage de suivre le glisser en direct, sans à-coup, là où cocher « ombres »
// coûte une scène entière.

import { dateDecaleeDeSemaines } from '../../util/semaine.js';

/** L'état du soleil d'une vue : les quatre réglages, plus la mémoire du curseur. */
export interface EtatSoleil {
  dateStr: string;
  minutes: number;
  intensiteSoleil: number;
  lumiereAppoint: boolean;
  semaineAffichee: number;
}

/** Une vue et son soleil : son etat, ce qu'elle declenche. */
export interface VueSoleil {
  etat: EtatSoleil;
  /** Recale le curseur « semaine » sur la date. */
  syncSemaine: () => void;
  /** Repose le soleil sur la scene et rend. */
  appliquer: () => void;
  /** Dit au panneau que l'etat a change. */
  signaler: () => void;
}

/** Les cinq reglages d'un soleil, tels que le panneau de la vue (zones/vue3d/) les appelle. */
export interface ReglagesSoleil {
  etat: EtatSoleil;
  date(valeur: string): void;
  semaine(valeur: number): void;
  heure(minutes: number): void;
  intensite(pourcent: number): void;
  appoint(actif: boolean): void;
}

export function reglagesSoleil(v: VueSoleil): ReglagesSoleil {
  const apres = () => { v.appliquer(); v.signaler(); };
  return {
    etat: v.etat,
    date(valeur) {
      // Un champ vidé ne veut pas dire « le 1er janvier de l'an zéro » : on ignore.
      if (!valeur) return;
      v.etat.dateStr = valeur;
      v.syncSemaine();
      apres();
    },
    /**
     * Le curseur affiche une position dans l'année, mais chaque cran décale la date **courante** de
     * sept jours. `semaineAffichee` mémorise la dernière position pour en tirer le delta — sans elle,
     * on recalculerait une position absolue et la date sauterait d'un nombre de jours irrégulier au
     * premier cran (voir `util/semaine.ts`).
     */
    semaine(valeur) {
      const delta = valeur - v.etat.semaineAffichee;
      v.etat.semaineAffichee = valeur;
      if (delta === 0) { v.signaler(); return; }
      v.etat.dateStr = dateDecaleeDeSemaines(v.etat.dateStr, delta);
      apres();
    },
    heure(minutes) { v.etat.minutes = minutes; apres(); },
    intensite(pourcent) { v.etat.intensiteSoleil = pourcent / 100; apres(); },
    // Bascule de visibilité sur des lumières déjà construites : rien à reconstruire.
    appoint(actif) { v.etat.lumiereAppoint = actif; apres(); }
  };
}
