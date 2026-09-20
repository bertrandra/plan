// Les commandes qui n'appartiennent à aucun groupe (spec §6.4, app/).
//
// Cinq écouteurs isolés, plus les deux filets d'erreur globaux. Les regrouper ici n'est pas un
// fourre-tout : c'est ce qui reste quand tout le reste a trouvé sa place, et le dire évite d'inventer
// des modules d'un seul élément.

import { showConfirm, showErrBanner } from '../../shell/dialogs.js';
import { mesure } from '../../interaction/outilMesure.js';
import type { Atelier } from '../atelier.js';
import type { ObjetPlan } from '../../model/types.js';

/** Ce que ces commandes déclenchent. */
export interface ContexteDivers {
  renderMeasureResults: () => void;
  rebuildMeasurePanel: () => void;
  renderPanneauPlu: () => void;
  interrogerPluDepuisBouton: (bouton: HTMLButtonElement) => void;
  basculerOptimisation: () => boolean;
  renderOptimResult: (obj: ObjetPlan) => void;
  /** Recalcule la taille du plan et le redessine autour de son centre. */
  redimensionnerLePlan: () => void;
}

/**
 * Les deux filets d'erreur globaux.
 *
 * Ils s'installent **avant** tout le reste, y compris avant le démarrage : une erreur pendant le
 * démarrage doit s'afficher, pas disparaître dans la console d'un utilisateur qui ne l'ouvrira
 * jamais. C'est pour cela qu'ils vivent hors de `boot()`.
 */
export function brancherFiletsDErreur(): void {
  window.addEventListener('error', e => {
    showErrBanner((e.message || 'inconnue') + '  (ligne ' + e.lineno + ', col ' + e.colno + ')');
  });
  window.addEventListener('unhandledrejection', e => {
    showErrBanner('Promise rejetee: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
  });
}

/** Le délai d'apaisement du redimensionnement, en millisecondes. */
const APAISEMENT_RESIZE_MS = 150;

export function brancherDivers(a: Atelier, ctx: ContexteDivers): void {
  const el = (id: string) => document.getElementById(id) as HTMLButtonElement;

  /**
   * « Cadrer » : sur l'objet sélectionné, et c'est le mode qui dit lequel — en mode Terrasse la
   * sélection qui compte est celle de la terrasse, pas celle du plan.
   */
  el('fitBtn').addEventListener('click', () => {
    const cle = a.etat.appMode === 'terrasse' ? a.etat.terrasseSelectedKey : a.etat.selectedKey;
    a.fitToObject(a.etat.objects.find(o => o.key === cle) || null);
  });

  /**
   * Le redimensionnement est **apaisé** : un glisser de fenêtre émet des dizaines d'événements, et
   * chacun refait la mise en page complète. On attend 150 ms de calme avant de redessiner.
   *
   * Le centre du monde est relevé *avant* le changement de taille et remis au centre après : sans
   * cela, agrandir la fenêtre ferait dériver le plan hors de l'écran au lieu de l'élargir.
   */
  let apaisement: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('resize', () => {
    if (apaisement) clearTimeout(apaisement);
    apaisement = setTimeout(ctx.redimensionnerLePlan, APAISEMENT_RESIZE_MS);
  });

  el('recalcMeasureBtn').addEventListener('click', () => {
    ctx.renderMeasureResults();
    a.render();
  });

  /**
   * Vider les cotes. La confirmation n'est demandée que s'il y en a : confirmer la suppression de
   * rien est une question sans objet.
   */
  el('clearMeasureBtn').addEventListener('click', () => {
    const vider = () => {
      a.etat.measures = [];
      mesure.cibles = []; mesure.ref = null; mesure.pointage = null;
      ctx.renderMeasureResults(); ctx.rebuildMeasurePanel(); a.render();
    };
    if (a.etat.measures.length) showConfirm('Supprimer toutes les mesures enregistrees ?', vider);
    else vider();
  });

  el('pluInterrogerBtn').addEventListener('click', function () { ctx.interrogerPluDepuisBouton(this); });

  /**
   * Le bloc d'optimisation reste ouvert une fois demandé, et se reclasse à chaque changement : on
   * peut ainsi voir monter ou descendre la configuration qu'on est en train d'éditer.
   */
  el('terrasseOptimBtn').addEventListener('click', () => {
    const obj = a.etat.objects.find(o => o.key === a.etat.terrasseSelectedKey);
    if (!obj) return;
    el('terrasseOptimBtn').textContent = ctx.basculerOptimisation()
      ? 'Masquer l\'optimisation'
      : 'Optimisation des parametres';
    ctx.renderOptimResult(obj);
  });
}
