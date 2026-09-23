// Les commandes qui n'appartiennent à aucun groupe (spec §6.4, app/).
//
// Cinq écouteurs isolés, plus les deux filets d'erreur globaux. Les regrouper ici n'est pas un
// fourre-tout : c'est ce qui reste quand tout le reste a trouvé sa place, et le dire évite d'inventer
// des modules d'un seul élément.

import { CAPACITES } from '../../plateforme/capacites.js';
import { PERMISSION_ECRITURE } from '../acces.js';
import { showConfirm, showErrBanner } from '../../shell/dialogs.js';
import { mesure } from '../../interaction/outilMesure.js';
import type { Atelier } from '../atelier.js';
import type { RegistreCommandes } from '../commandes.js';

/** Ce que ces commandes déclenchent. */
export interface ContexteDivers {
  renderMeasureResults: () => void;
  rebuildMeasurePanel: () => void;
  renderPanneauPlu: () => void;
  interrogerPluDepuisBouton: (bouton: HTMLButtonElement) => void;
  basculerOptimisation: () => boolean;
  /** Recalcule la taille du plan et le redessine autour de son centre. */
  redimensionnerLePlan: () => void;
  /** Montre un onglet du panneau lateral (ui/panelTabs.ts). */
  activerOnglet: (onglet: string) => void;
  /** Rafraichit l'inspecteur (zones/), qui affiche l'optimisation. */
  rafraichirInspecteur: () => void;
  /** Demarre un pointage : un cote de reference (`ref`) ou des sommets (`target`), pour une cote ou un alignement. */
  startPick: (mode: 'ref' | 'target', multi: boolean, purpose?: 'align' | 'measure') => void;
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

export function brancherDivers(a: Atelier, ctx: ContexteDivers, cmd: RegistreCommandes): void {

  /** « Cadrer » : sur l'objet sélectionné, sinon sur la parcelle. */
  cmd.declarer({ id: 'vue.ajuster', libelle: 'Ajuster à la sélection', groupe: 'vue', executer: () => {
    a.fitToObject(a.etat.objects.find(o => o.key === a.etat.selectedKey) || null);
  } });

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

  cmd.bouton('recalcMeasureBtn', { id: 'mesure.recalculer', libelle: 'Recalculer les mesures', groupe: 'mesure', executer: () => {
    ctx.renderMeasureResults();
    a.render();
  } });

  /**
   * Vider les cotes. La confirmation n'est demandée que s'il y en a : confirmer la suppression de
   * rien est une question sans objet.
   */
  cmd.bouton('clearMeasureBtn', { id: 'mesure.effacer', libelle: 'Effacer les mesures', groupe: 'mesure', permission: PERMISSION_ECRITURE, executer: () => {
    const vider = () => {
      a.etat.measures = [];
      mesure.cibles = []; mesure.ref = null; mesure.pointage = null;
      ctx.renderMeasureResults(); ctx.rebuildMeasurePanel(); a.render();
    };
    if (a.etat.measures.length) showConfirm('Supprimer toutes les mesures enregistrees ?', vider);
    else vider();
  } });

  // Les deux outils de la palette : une cote, un alignement. Chacun ouvre l'onglet ou le geste se
  // poursuit, puis attend le clic sur le plan — c'est `interaction/outilMesure.ts` qui sait quoi en faire.
  cmd.declarer({ id: 'mesure.nouvelle', libelle: 'Nouvelle cote', groupe: 'mesure', description: 'Choisir un côté de référence, puis les coins à coter', permission: PERMISSION_ECRITURE, executer: () => {
    ctx.activerOnglet('mesure');
    ctx.startPick('ref', false);
  } });
  cmd.declarer({ id: 'objet.aligner', libelle: 'Aligner par rotation', groupe: 'objet', description: 'Choisir un côté cible sur le plan : l\'objet sélectionné pivote pour lui devenir parallèle', permission: PERMISSION_ECRITURE, actif: () => !!a.etat.selectedKey, executer: () => {
    ctx.startPick('ref', false, 'align');
  } });

  cmd.bouton('pluInterrogerBtn', { id: 'plu.interroger', libelle: 'Interroger le Géoportail de l\'urbanisme', groupe: 'plu', capacite: CAPACITES.plu.code, executer: (source) => ctx.interrogerPluDepuisBouton(source as HTMLButtonElement) });

  /**
   * Le bloc d'optimisation reste ouvert une fois demandé, et se reclasse à chaque changement : on
   * peut ainsi voir monter ou descendre la configuration qu'on est en train d'éditer. C'est
   * l'inspecteur (zones/) qui montre le bouton et le tableau ; ici, seulement la bascule.
   */
  cmd.declarer({ id: 'terrasse.optimisation', libelle: 'Optimisation des paramètres', groupe: 'terrasse', capacite: CAPACITES.terrasse.code, executer: () => {
    ctx.basculerOptimisation();
    ctx.rafraichirInspecteur();
  } });
}
