// Le soleil du projet et ses commandes, pour le plan et les deux vues 3D (spec §6.4, app/ ;
// MD/spec-ouvrages.md, etape 6.7).
//
// Un seul soleil (core/soleil.ts) : la date et l'heure du plan, de la Vue 3D et de la visionneuse
// sont les memes. Chaque vue garde la facon de le montrer : son intensite, sa lumiere d'appoint, et
// la position de son curseur « semaine ». Les cinq commandes d'un panneau sont donc ecrites une fois
// et servies deux fois (zones/vue3d/) ; la date et l'heure vont au soleil du projet, l'intensite et
// l'appoint a la vue.
//
// Aucune de ces commandes ne reconstruit la scène — seules les lumières déjà en place bougent. C'est
// ce qui permet au réglage de suivre le glisser en direct, sans à-coup, là où cocher « ombres »
// coûte une scène entière.

import { dateDecaleeDeSemaines } from '../../util/semaine.js';
import { soleilDuProjet } from '../../core/soleil.js';
import type { SoleilProjet } from '../../model/soleilProjet.js';
import type { EtatApp } from '../../core/state.js';

/** Ce qu'une vue garde du soleil : la facon de le montrer, plus la memoire du curseur. */
export interface EtatVueSoleil {
  intensiteSoleil: number;
  lumiereAppoint: boolean;
  semaineAffichee: number;
}

/** Ce que le panneau d'une vue lit : le soleil du projet, et la facon dont la vue le montre. */
export type EtatSoleil = SoleilProjet & EtatVueSoleil;

/** Une vue et son soleil : son etat, ce qu'elle declenche. */
export interface VueSoleil {
  /** Lu seulement : chaque ecriture passe par `regler` (three/etat3d.ts, AD-14). */
  etat: Readonly<EtatVueSoleil>;
  regler: (r: Partial<EtatVueSoleil>) => void;
  /** Repose le soleil sur la scene et rend. */
  appliquer: () => void;
  /** Dit au panneau que l'etat a change. */
  signaler: () => void;
}

/** Les cinq reglages d'un soleil, tels que le panneau de la vue (zones/vue3d/) les appelle. */
export interface ReglagesSoleil {
  /** Relu a chaque acces : le soleil du projet peut avoir change ailleurs (le plan, l'autre vue). */
  readonly etat: Readonly<EtatSoleil>;
  date(valeur: string): void;
  semaine(valeur: number): void;
  heure(minutes: number): void;
  intensite(pourcent: number): void;
  appoint(actif: boolean): void;
}

export function reglagesSoleil(v: VueSoleil): ReglagesSoleil {
  const apres = () => { v.appliquer(); v.signaler(); };
  return {
    get etat() { return { ...soleilDuProjet.lire(), ...v.etat }; },
    // Un champ vidé ne veut pas dire « le 1er janvier de l'an zéro » : le soleil du projet l'ignore.
    // Le reste (lumières, curseurs, plan) suit par l'écouteur du soleil (`brancherSoleilDuProjet`).
    date(valeur) { soleilDuProjet.regler({ dateStr: valeur }); },
    /**
     * Le curseur affiche une position dans l'année, mais chaque cran décale la date **courante** de
     * sept jours. `semaineAffichee` mémorise la dernière position pour en tirer le delta — sans elle,
     * on recalculerait une position absolue et la date sauterait d'un nombre de jours irrégulier au
     * premier cran (voir `util/semaine.ts`). Posée après la date : l'écouteur recale les curseurs sur
     * la date, et celui qu'on glisse doit rester sous le doigt.
     */
    semaine(valeur) {
      const delta = valeur - v.etat.semaineAffichee;
      if (delta !== 0) soleilDuProjet.regler({ dateStr: dateDecaleeDeSemaines(soleilDuProjet.lire().dateStr, delta) });
      v.regler({ semaineAffichee: valeur });
      v.signaler();
    },
    heure(minutes) { soleilDuProjet.regler({ minutes }); },
    intensite(pourcent) { v.regler({ intensiteSoleil: pourcent / 100 }); apres(); },
    // Bascule de visibilité sur des lumières déjà construites : rien à reconstruire.
    appoint(actif) { v.regler({ lumiereAppoint: actif }); apres(); }
  };
}

/** Ce que l'ecouteur du soleil du projet fait suivre. */
export interface SuiteSoleil {
  etat: EtatApp;
  markDirty: () => void;
  /** Redessine le plan (l'ombre des parasols) et les zones qui montrent la date et l'heure. */
  render: () => void;
  /** Recale le curseur « semaine » de chaque vue sur la nouvelle date. */
  syncSemaines: () => void;
  /** Repose le soleil sur la Vue 3D et sur la visionneuse, si elles sont ouvertes. */
  appliquer3d: () => void;
  appliquerGlb: () => void;
  signaler3d: () => void;
}

/**
 * Ce que fait un changement du soleil du projet, d'ou qu'il vienne (l'inspecteur du parasol, les
 * panneaux des deux vues, l'heure doree, la vitrine) : le ranger sur la parcelle, marquer le projet a
 * enregistrer comme « Relief » (hors lecture seule, sans pas d'annulation), puis le montrer partout.
 */
export function brancherSoleilDuProjet(s: SuiteSoleil): () => void {
  return soleilDuProjet.abonner(() => {
    soleilDuProjet.ranger(s.etat.objects);
    // Une fois suffit : le curseur de l'heure appelle ceci a chaque pas du glisser.
    if (!s.etat.lectureSeule && !s.etat.dirty) s.markDirty();
    s.syncSemaines();
    s.appliquer3d();
    s.appliquerGlb();
    s.signaler3d();
    s.render();
  });
}
