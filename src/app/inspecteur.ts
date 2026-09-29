// Ce que l'inspecteur (zones/Inspecteur.tsx) demande au plan (spec-ihm-zones §4.5, app/).
//
// La zone rend des descripteurs (ui/champs/) ; ce service leur fournit leur contexte — l'objet
// selectionne, ce qu'ils lisent, les gestes qu'ils declenchent — et applique leurs ecritures :
// l'historique si le champ le demande, le marquage « modifie », puis les effets declares. C'est le
// seul endroit ou une ecriture de l'inspecteur touche le reste du programme.

import { mesure } from '../interaction/outilMesure.js';
import { cibleAlignement } from '../interaction/outilAlignement.js';
import { ensureConstruction } from '../engine/construction.js';
import { vue3d } from '../three/etat3d.js';
import { ouvrirSelecteurTexture } from './parcours.js';
import { showToast } from '../shell/dialogs.js';
import { terrasseCourante } from '../core/contexteTerrasse.js';
import { sectionsObjet, titreObjet } from '../ui/champs/objet.js';
import { sectionsConstruction, type ContexteOptimisation } from '../ui/champs/construction.js';
import { sectionReleve, estBatiment } from '../ui/champs/facade.js';
import type { Champ, ContexteChamps, Effet, Section } from '../ui/champs/types.js';
import type { EtatApp } from '../core/state.js';
import type { ObjetPlan } from '../model/types.js';
import type { Magasin } from './magasin.js';
import type { RegistreCommandes } from './commandes.js';
import type { Resultats } from './resultats.js';

/** Ce que l'inspecteur doit pouvoir declencher ailleurs. */
export interface ContexteInspecteur extends Pick<ContexteChamps,
  'libelleType' | 'elevationOf' | 'interiorAngleDeg' | 'refLabel' | 'measureSegCoords' | 'contexteSoleil' | 'dejaRectangle'
  | 'applyAngleEdit' | 'applyLengthEdit' | 'deleteVertex' | 'alignObjectByRotation' | 'allerAuPointDeVue' | 'startPick' | 'pushHistory' | 'render'> {
  markDirty: () => void;
  refreshTerrasseView: () => void;
  buildThreeScene: (obj: ObjetPlan | null) => void;
  reapplyStackingOrder: () => void;
  rebuildHandles: (obj: ObjetPlan) => void;
  trouverParcelle: () => ObjetPlan | undefined;
  optimisation: ContexteOptimisation;
  resultats: Resultats;
  /** Le plan reprend ou rend la largeur de l'inspecteur. */
  redimensionner: () => void;
}

export interface Inspecteur {
  /** L'objet selectionne, ou rien. */
  objet(): ObjetPlan | undefined;
  contexte(obj: ObjetPlan): ContexteChamps;
  titre(c: ContexteChamps): string;
  sections(c: ContexteChamps): Section[];
  /** Applique une ecriture et ce qui doit la suivre ; `false` quand le champ l'a refusee. */
  appliquer(champ: Champ, c: ContexteChamps, ecrire: () => void | boolean): boolean;
  executer(champ: Champ, c: ContexteChamps): void;
  /** Replie ou deplie la zone : le conteneur (index.html) porte la classe, le plan reprend la largeur. */
  basculerOuverture(): void;
  /** Le service du tiroir, pour le tableau d'optimisation et ses « Appliquer ». */
  resultats?: Resultats;
}

export function creerInspecteur(etat: EtatApp, ctx: ContexteInspecteur, magasin: Magasin, commandes: RegistreCommandes): Inspecteur {
  const objet = () => etat.objects.find(o => o.key === etat.selectedKey);

  function contexte(obj: ObjetPlan): ContexteChamps {
    return {
      etat, obj, objets: etat.objects, parcelle: ctx.trouverParcelle(),
      construction: () => ensureConstruction(obj),
      pointage: () => mesure.pointage,
      cibleAlignement,
      libelleType: ctx.libelleType, elevationOf: ctx.elevationOf, interiorAngleDeg: ctx.interiorAngleDeg,
      refLabel: ctx.refLabel, measureSegCoords: ctx.measureSegCoords, contexteSoleil: ctx.contexteSoleil, dejaRectangle: ctx.dejaRectangle,
      applyAngleEdit: ctx.applyAngleEdit, applyLengthEdit: ctx.applyLengthEdit, deleteVertex: ctx.deleteVertex,
      alignObjectByRotation: ctx.alignObjectByRotation, allerAuPointDeVue: ctx.allerAuPointDeVue, startPick: ctx.startPick,
      choisirTexture: ouvrirSelecteurTexture,
      executerCommande: (id) => { commandes.executer(id); },
      pushHistory: ctx.pushHistory, render: ctx.render, toast: showToast
    };
  }

  function effet(e: Effet, c: ContexteChamps): void {
    switch (e) {
      case 'rendu': ctx.render(); break;
      case 'inspecteur': magasin.notifier(); break;
      case 'terrasse': ctx.refreshTerrasseView(); ctx.render(); break;
      case 'scene3d': if (vue3d.scene) ctx.buildThreeScene(terrasseCourante(etat) || null); break;
      case 'empilement': ctx.reapplyStackingOrder(); break;
      case 'poignees': ctx.rebuildHandles(c.obj); break;
    }
  }

  return {
    objet,
    contexte,
    resultats: ctx.resultats,
    titre: titreObjet,
    sections(c) {
      const sections = sectionsObjet(c);
      if (c.obj.fonction === 'terrasse' && c.obj.type === 'polygon') sections.push(...sectionsConstruction(ctx.optimisation));
      if (estBatiment(c.obj)) sections.push(sectionReleve(c));
      return sections;
    },
    appliquer(champ, c, ecrire) {
      if (champ.historique) ctx.pushHistory();
      if (ecrire() === false) { magasin.notifier(); return false; }
      if (champ.sale !== false) ctx.markDirty();
      (champ.effets || []).forEach(e => effet(e, c));
      // Une ecriture sans effet declare doit quand meme se voir : l'inspecteur relit l'etat.
      if (!champ.effets || !champ.effets.length) magasin.notifier();
      return true;
    },
    executer(champ, c) {
      if (champ.type === 'bouton') { champ.executer(c); magasin.notifier(); }
    },
    basculerOuverture() {
      const ouvert = !magasin.store.getState().inspecteurOuvert;
      magasin.definirInspecteurOuvert(ouvert);
      document.getElementById('zoneInspecteur')?.classList.toggle('replie', !ouvert);
      ctx.redimensionner();
    }
  };
}
