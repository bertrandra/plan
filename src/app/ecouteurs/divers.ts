// Les commandes qui n'appartiennent à aucun groupe (spec §6.4, app/).
//
// Cinq écouteurs isolés, plus les deux filets d'erreur globaux. Les regrouper ici n'est pas un
// fourre-tout : c'est ce qui reste quand tout le reste a trouvé sa place, et le dire évite d'inventer
// des modules d'un seul élément.

import { CAPACITES } from '../../plateforme/capacites.js';
import { PERMISSION_ECRITURE, enAdmin } from '../acces.js';
import { showConfirm, showErrBanner, showToast } from '../../shell/dialogs.js';
import { ROUTE_SAUVEGARDE, verifierSauvegarde } from '../../io/depotDemos.js';
import type { Atelier } from '../atelier.js';
import type { RegistreCommandes } from '../commandes.js';
import type { Resultats } from '../resultats.js';

/** Ce que ces commandes déclenchent. */
export interface ContexteDivers {
  /** Le tiroir des resultats : cotes, PLU, optimisation (app/resultats.ts). */
  resultats: Resultats;
  /** Recalcule la taille du plan et le redessine autour de son centre. */
  redimensionnerLePlan: () => void;
  /** Montre un onglet du panneau lateral (ui/panelTabs.ts). */
  activerOnglet: (onglet: string) => void;
  /** Rafraichit l'inspecteur (zones/), qui affiche l'optimisation. */
  rafraichirInspecteur: () => void;
  /** Demarre un pointage : un cote de reference (`ref`) ou des sommets (`target`), pour une cote ou un alignement. */
  startPick: (mode: 'ref' | 'target', multi: boolean, purpose?: 'align' | 'measure' | 'acces') => void;
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

  /**
   * Le tableau de bord de la consommation de Claude (MD/spec-audit.md 13.3) : un ecran de l'admin des
   * demos, dont les routes exigent sa session. L'adresse est ecrite ici plutot qu'importee
   * d'app/administration/ecranConsommation.ts : l'ecran et ses graphiques n'ont rien a faire dans le demarrage.
   */
  cmd.declarer({
    id: 'admin.consommation', libelle: 'Consommation de Claude', groupe: 'admin', actif: () => enAdmin(),
    description: 'Ouvre le tableau de bord : tokens et coût de l’analyse par Claude, par modèle, parcelle, usage et organisation ; tarifs et plafonds (administrateur seulement)',
    executer: () => { location.assign('?admin&ecran=consommation'); }
  });

  /**
   * Les indicateurs de conformite (MD/spec-regles-toits.md 13.5, lot G3) : un ecran de l'admin des
   * demos, a cote de la consommation, pour la meme raison (les audits recus et les mesures exigent
   * sa session ; le rejeu des cas n'a rien a faire dans le demarrage).
   */
  cmd.declarer({
    id: 'admin.conformite', libelle: 'Conformité', groupe: 'admin', actif: () => enAdmin(),
    description: 'Ouvre les indicateurs : part des cas observés que le calcul satisfait, par forme, région et problème, sur le corpus et les audits partagés (administrateur seulement)',
    executer: () => { location.assign('?admin&ecran=conformite'); }
  });

  /**
   * Les regles (MD/architecture.md 5.2.4) : un ecran de l'admin des demos, comme la conformite. Les sujets
   * de l'audit et le prompt de Claude qu'ils composent, recalcules a chaque frappe ; rien n'y est enregistre.
   */
  cmd.declarer({
    id: 'admin.regles', libelle: 'Règles', groupe: 'admin', actif: () => enAdmin(),
    description: 'Ouvre les règles : les sujets que l’audit sait lire et proposer, et le prompt et le schéma d’analyse de Claude qu’ils composent, recalculés en direct (administrateur seulement)',
    executer: () => { location.assign('?admin&ecran=regles'); }
  });

  /**
   * La sauvegarde des donnees du serveur (deploy/admin.php, `GET admin/sauvegarde`) : une archive zip
   * de tout data/, que le navigateur telecharge par un lien (le cookie de la session part avec). La
   * session est verifiee d'abord : sans elle, le lien enregistrerait l'erreur sous le nom de l'archive.
   */
  cmd.declarer({
    id: 'admin.sauvegarde', libelle: 'Télécharger une sauvegarde des données', groupe: 'admin', actif: () => enAdmin(),
    description: 'Télécharge une archive zip de tout le dossier des données du serveur : démos, audits et analyses, journal et réglages de Claude, palette, arbres, conformité (administrateur seulement)',
    executer: () => {
      void verifierSauvegarde((entree, init) => fetch(entree, init)).then((refus) => {
        if (refus) { showErrBanner(refus); return; }
        const lien = document.createElement('a');
        lien.href = ROUTE_SAUVEGARDE;
        lien.download = '';
        lien.rel = 'noopener';
        document.body.appendChild(lien);
        lien.click();
        lien.remove();
        showToast('La sauvegarde se prépare : le téléchargement commence dans un instant.');
      });
    }
  });

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
  const redimensionnerApaise = () => {
    if (apaisement) clearTimeout(apaisement);
    apaisement = setTimeout(ctx.redimensionnerLePlan, APAISEMENT_RESIZE_MS);
  };
  window.addEventListener('resize', redimensionnerApaise);
  // La rangee de l'atelier change aussi de largeur sans que la fenetre bouge : une barre de defilement
  // qui parait quand le tiroir s'ouvre, un panneau qui change de largeur. Le plan suit, sans rendu
  // si rien n'a change (app/assemblage/cadrage.ts).
  const atelier = document.getElementById('zoneAtelier');
  if (atelier && typeof ResizeObserver !== 'undefined') new ResizeObserver(redimensionnerApaise).observe(atelier);

  cmd.declarer({ id: 'mesure.recalculer', libelle: 'Recalculer les mesures', groupe: 'mesure', executer: () => { a.render(); } });

  /**
   * Vider les cotes. La confirmation n'est demandée que s'il y en a : confirmer la suppression de
   * rien est une question sans objet.
   */
  cmd.declarer({ id: 'mesure.effacer', libelle: 'Effacer les mesures', groupe: 'mesure', permission: PERMISSION_ECRITURE, executer: () => {
    const vider = () => ctx.resultats.effacerCotes();
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

  // Grise sans parcelle : le PLU s'interroge en son centre.
  cmd.declarer({ id: 'plu.interroger', libelle: 'Interroger le Géoportail de l\'urbanisme', groupe: 'plu', capacite: CAPACITES.plu.code, permission: PERMISSION_ECRITURE,
    actif: () => !!ctx.resultats.parcelle() && !ctx.resultats.pluEnCours(),
    executer: () => { void ctx.resultats.interrogerPlu(); } });

  /**
   * Le bloc d'optimisation reste ouvert une fois demandé, et se reclasse à chaque changement : on
   * peut ainsi voir monter ou descendre la configuration qu'on est en train d'éditer. C'est
   * l'inspecteur (zones/) qui montre le bouton et le tableau ; ici, seulement la bascule.
   */
  cmd.declarer({ id: 'terrasse.optimisation', libelle: 'Optimisation des paramètres', groupe: 'terrasse', capacite: CAPACITES.terrasse.code, executer: () => {
    ctx.resultats.basculerOptimisation();
    ctx.rafraichirInspecteur();
  } });
}
