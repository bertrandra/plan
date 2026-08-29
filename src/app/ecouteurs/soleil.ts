// Les commandes du soleil, pour les deux vues 3D (spec §6.4, app/).
//
// La Vue 3D et la visionneuse GLB ont chacune leur date, leur heure, leur intensité et leur lumière
// d'appoint. Ce sont **les mêmes cinq commandes**, sur deux états séparés — les deux vues peuvent
// être réglées à des moments différents sans se marcher dessus.
//
// Elles étaient donc écrites deux fois, à quelques identifiants près. Elles le sont désormais une
// seule, et branchées deux fois. C'est la dernière des symétries que la migration a mises au jour :
// le calcul lui-même avait déjà été réuni dans `three/lumiere.ts`, il ne restait que le câblage.
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

/** Une vue et ses commandes : le préfixe de ses identifiants, son état, ce qu'elle déclenche. */
export interface VueSoleil {
  /** `vue3d` ou `glbViewer` : les identifiants du HTML en dérivent. */
  prefixe: string;
  etat: EtatSoleil;
  /** Recale le curseur « semaine » sur la date. */
  syncSemaine: () => void;
  /** Repose le soleil sur la scène et rend. */
  appliquer: () => void;
  formatHeureMin: (minutes: number) => string;
}

export function brancherCommandesSoleil(v: VueSoleil): void {
  const el = (suffixe: string) => document.getElementById(v.prefixe + suffixe) as HTMLInputElement;
  const texte = (suffixe: string, valeur: string) => {
    const e = document.getElementById(v.prefixe + suffixe);
    if (e) e.textContent = valeur;
  };

  el('Date').addEventListener('change', function () {
    // Un champ vidé ne veut pas dire « le 1er janvier de l'an zéro » : on ignore.
    if (!this.value) return;
    v.etat.dateStr = this.value;
    v.syncSemaine();
    v.appliquer();
  });

  /**
   * Le curseur affiche une position dans l'année, mais chaque cran décale la date **courante** de
   * sept jours. `semaineAffichee` mémorise la dernière position pour en tirer le delta — sans elle,
   * on recalculerait une position absolue et la date sauterait d'un nombre de jours irrégulier au
   * premier cran (voir `util/semaine.ts`).
   */
  el('Semaine').addEventListener('input', function () {
    const nouvelleValeur = parseInt(this.value, 10);
    const deltaSemaines = nouvelleValeur - v.etat.semaineAffichee;
    v.etat.semaineAffichee = nouvelleValeur;
    if (deltaSemaines === 0) return;
    v.etat.dateStr = dateDecaleeDeSemaines(v.etat.dateStr, deltaSemaines);
    el('Date').value = v.etat.dateStr;
    v.appliquer();
  });

  el('Heure').addEventListener('input', function () {
    v.etat.minutes = parseInt(this.value, 10);
    texte('HeureTexte', v.formatHeureMin(v.etat.minutes));
    v.appliquer();
  });

  el('Intensite').addEventListener('input', function () {
    const pct = parseInt(this.value, 10);
    v.etat.intensiteSoleil = pct / 100;
    texte('IntensiteTexte', pct + ' %');
    v.appliquer();
  });

  // Bascule de visibilité sur des lumières déjà construites : rien à reconstruire.
  el('LumiereAppoint').addEventListener('change', function () {
    v.etat.lumiereAppoint = this.checked;
    v.appliquer();
  });
}
