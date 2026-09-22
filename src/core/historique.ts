// Annulation : instantanes, restauration, et le signal « quelque chose a change » (spec §3.2).
//
// La pile elle-meme vit dans `core/history.ts` et ne connait rien du plan. Ce module-ci est
// l'orchestrateur : il sait fabriquer un instantane, le reposer sur le plan, et prevenir
// l'interface. Il a ete sorti de `legacy.ts` **tel quel**, sans changer un comportement, dans
// l'idee d'etre reecrit ensuite — d'ou la section « Ce qu'une reecriture doit savoir » plus bas,
// qui dit ce que le code fait aujourd'hui et pourquoi.
//
// ---------------------------------------------------------------------------------------------
// Ce qu'une reecriture doit savoir
// ---------------------------------------------------------------------------------------------
//
// **1. L'instantane est une copie complete, pas un diff.** Soixante pas d'annulation, soixante
// copies entieres du plan. C'est volontairement simple : un diff demanderait de decrire chaque
// mutation, et le plan est petit. Une reecriture qui passerait aux diffs devrait couvrir les
// operations qui ajoutent, suppriment, reordonnent ou remplacent des objets entiers — c'est
// exactement ce que l'ancienne implementation « patch des champs connus » ratait en silence.
//
// **2. Les cotes sont dans l'instantane, et il le faut.** Elles vivent dans un tableau separe des
// objets : un instantane des seuls objets perdait sans bruit tout ajout, retrait ou basculement de
// cote. Toute reecriture doit garder les deux.
//
// **3. L'instantane passe par la meme liste blanche que l'enregistrement.** `serializeObjects` ne
// retient que les champs qu'elle nomme ; annuler fait donc un aller-retour serialisation →
// normalisation, exactement comme enregistrer puis rouvrir. Consequence a connaitre : un champ
// ajoute a une forme sans etre ajoute a la liste blanche est perdu **aussi par une annulation**,
// pas seulement par une sauvegarde.
//
// **4. La restauration demonte tout et reconstruit.** Elle ne repose pas des valeurs sur les
// objets en place : elle detruit les vues, recree les objets, refait les poignees et l'ordre
// d'empilement. C'est ce qui lui permet de faire revenir un objet supprime.
//
// **5. Il n'y a pas de retablissement (redo).** Depiler perd l'avenir. C'est le manque le plus
// visible, et probablement la premiere chose qu'une reecriture apportera : il faudra alors une
// seconde pile, et decider ce qu'une nouvelle action fait de la branche abandonnee.
//
// **6. La selection survit a l'annulation, ou retombe sur le premier objet.** Si l'objet
// selectionne n'existe plus dans l'instantane restaure, la selection glisse sur le premier objet
// disponible plutot que de rester pendante.

import { PileAnnulation, type Instantane } from './history.js';
import type { ObjetPlan, ObjetBrut, Mesure } from '../model/types.js';

/**
 * Ce que l'historique doit pouvoir faire au plan et a l'interface.
 *
 * Generique sur la forme des objets et des cotes : l'historique ne lit que `key`, et c'est
 * l'appelant (la racine de composition, ou un test) qui sait ce qu'il empile vraiment.
 */
export interface ContexteHistorique<O extends { key: string } = ObjetPlan, M = Mesure> {
  serializeObjects: (objets: O[]) => unknown[];
  serializeMeasures: (mesures: M[]) => unknown[];
  normalizeObjects: (bruts: ObjetBrut[]) => O[];
  detruireVue: (obj: O) => void;
  createObjectDOM: (obj: O) => void;
  rebuildHandles: (obj: O) => void;
  reapplyStackingOrder: () => void;
  rebuildSelector: () => void;
  renderMeasureResults: () => void;
  render: () => void;
  /** Le bouton « Annuler » de la barre d'outils, s'il existe. */
  boutonAnnuler: () => HTMLButtonElement | null;
  /** Dit si la pile est vide, a chaque changement : c'est ce que la palette (zones/) lit. */
  signalerPile?: (vide: boolean) => void;
  /**
   * Refait les panneaux de resultats (le tiroir, Z6) apres une restauration. Une annulation qui
   * rend sa valeur d'avant a un champ de construction ne change ni la selection ni le contexte :
   * sans ce rappel, le BOM affiche encore les quantites de l'etat annule.
   */
  rafraichirResultats?: () => void;
}

/** Ce que l'historique lit et ecrit dans l'etat du plan — rien de plus. */
interface EtatAnnulable<O extends { key: string }, M> {
  objects: O[];
  measures: M[];
  selectedKey: string | null;
  dirty: boolean;
}

export function creerHistorique<O extends { key: string }, M>(etat: EtatAnnulable<O, M>, ctx: ContexteHistorique<O, M>) {
  const pile = new PileAnnulation();

  // Remplace par la barre de projet une fois construite. Avant cela, marquer le plan modifie ne
  // doit pas echouer : d'ou la fonction vide plutot qu'un `null` a tester partout.
  let rafraichirStatut: () => void = () => {};

  function instantane(): Instantane {
    return {
      objects: ctx.serializeObjects(etat.objects),
      measures: ctx.serializeMeasures(etat.measures)
    };
  }

  /**
   * Point d'entree unique du « quelque chose a change ». Tout ce qui modifie une donnee du projet
   * passe par ici — directement, ou via `empiler()` / `muter()` — pour que l'indicateur
   * « modifications non enregistrees » ne puisse pas rater un changement, comme le faisaient les
   * affectations `dirty = true` dispersees a chaque appelant.
   */
  function marquerModifie(): void {
    etat.dirty = true;
    rafraichirStatut();
  }

  /** Prend un instantane de l'etat **avant** la modification qui va suivre. */
  function empiler(): void {
    pile.empiler(instantane());
    majBoutonAnnuler();
    marquerModifie();
  }

  function restaurer(snap: Instantane): void {
    etat.objects.forEach(ctx.detruireVue);
    const restaures = ctx.normalizeObjects(snap.objects as ObjetBrut[]);
    etat.objects.length = 0;
    restaures.forEach((o) => {
      etat.objects.push(o);
      ctx.createObjectDOM(o);
      ctx.rebuildHandles(o);
    });
    ctx.reapplyStackingOrder();
    if (snap.measures) {
      etat.measures = (snap.measures as M[]).map((m) => ({ ...m }));
    }
    if (!etat.objects.some((o: { key: string }) => o.key === etat.selectedKey)) {
      etat.selectedKey = etat.objects.length ? etat.objects[0]!.key : null;
    }
    ctx.rebuildSelector();
    ctx.renderMeasureResults();
    if (ctx.rafraichirResultats) ctx.rafraichirResultats();
    ctx.render();
    majBoutonAnnuler();
  }

  function annuler(): void {
    if (pile.vide) return;
    const snap = pile.depiler();
    if (snap) restaurer(snap);
  }

  function majBoutonAnnuler(): void {
    const b = ctx.boutonAnnuler();
    if (b) b.disabled = pile.vide;
    if (ctx.signalerPile) ctx.signalerPile(pile.vide);
  }

  /** Ctrl+Z / Cmd+Z. Pas de Ctrl+Y : il n'y a pas de retablissement (voir le point 5 en tete). */
  function brancherRaccourci(): void {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        annuler();
      }
    });
  }

  return {
    instantane,
    marquerModifie,
    empiler,
    restaurer,
    annuler,
    majBoutonAnnuler,
    brancherRaccourci,
    definirRafraichisseurStatut(f: () => void) { rafraichirStatut = f; },
    /** Redemande l'affichage du statut, sans rien marquer comme modifie. */
    declencherRafraichissementStatut() { rafraichirStatut(); },
    get pile() { return pile; }
  };
}
