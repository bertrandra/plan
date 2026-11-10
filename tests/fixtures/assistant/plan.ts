// Le plan de reference de l'assistant (lot L6) : la demonstration, sans DOM, avec les VRAIES declarations des commandes (les ecouteurs
// des objets et de l'affichage, app/ecouteurs/) et les VRAIS descripteurs de l'inspecteur (ui/champs/), l'historique de Plan
// (core/historique.ts) et la creation des objets (model/creation.ts). Ce qui ne se dessine pas (vues, poignees, 3D) ne fait rien.
//
// Il sert aux tests (les dix demandes de reference rejouees hors ligne, « Appliquer » puis Ctrl+Z) et a la mesure contre la vraie
// API (scripts/assistant-reference.ts) : le catalogue envoye est celui que Plan genere, jamais un texte ecrit a la main.

import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import { creerRegistre, type RegistreCommandes } from '../../../src/app/commandes.js';
import { brancherObjets } from '../../../src/app/ecouteurs/objets.js';
import { brancherAffichage } from '../../../src/app/ecouteurs/affichage.js';
import { creerHistorique } from '../../../src/core/historique.js';
import { creerCreation } from '../../../src/model/creation.js';
import { serializeObjects, serializeMeasures } from '../../../src/io/serialisation.js';
import { normaliserEnObjetsDuPlan } from '../../../src/app/assemblage/formes.js';
import { libelleTypeObjet } from '../../../src/app/assemblage/gestes.js';
import { sectionsInspecteur } from '../../../src/ui/champs/sections.js';
import { ensureConstruction } from '../../../src/engine/construction.js';
import { champAnnulable, ecritLeProjet } from '../../../src/app/administration/ecritures.js';
import { champsDuCatalogue, type SourceCatalogue } from '../../../src/app/assistant/catalogue.js';
import type { ContexteApplication } from '../../../src/app/assistant/appliquer.js';
import type { ValeurChamp } from '../../../src/app/assistant/etapes.js';
import type { Classe } from '../../../src/app/exposition.js';
import type { Atelier } from '../../../src/app/atelier.js';
import type { ContexteChamps } from '../../../src/ui/champs/types.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetBrut, ObjetPlan, Mesure } from '../../../src/model/types.js';

export interface PlanDeReference {
  etat: EtatApp;
  commandes: RegistreCommandes;
  historique: ReturnType<typeof creerHistorique<ObjetPlan, Mesure>>;
  source: (classe?: Classe) => SourceCatalogue;
  application: ContexteApplication;
  /** Le projet tel qu'il s'enregistre : de quoi dire « a l'identique ». */
  projet: () => string;
  /**
   * Le meme, sans les preferences d'affichage que la parcelle garde (`affichage` : la grille, le voisinage) : elles ne s'annulent pas,
   * ni a la main ni apres une liste de l'assistant ; c'est sur lui que Ctrl+Z rend le projet a l'identique.
   */
  projetHorsAffichage: () => string;
}

/** Ce que les descripteurs demandent, sans le plan : un contexte qui repond « rien » a tout le reste (comme l'inventaire de l'inspecteur). */
const neutre = new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => null) }) as Record<string | symbol, unknown>;

export function planDeReference(options: { selection: string | null; lectureSeule?: boolean }): PlanDeReference {
  const objets = normaliserEnObjetsDuPlan(structuredClone(DEMO_OBJECTS) as ObjetBrut[]);
  const etat = {
    objects: objets, measures: [] as Mesure[], selectedKey: options.selection, terrasseSelectedKey: null, dirty: false,
    lectureSeule: !!options.lectureSeule, showNorth: true, grilleVisible: false, voisinageVisible: true,
    highlight: { type: null, index: null }, scene: { scale: 10 }, parasol: { ombreAffichee: false, carteAffichee: false }
  } as unknown as EtatApp;
  const rien = () => {};
  const historique = creerHistorique<ObjetPlan, Mesure>(etat, {
    serializeObjects: (o) => serializeObjects(o), serializeMeasures: (m) => serializeMeasures(m), normalizeObjects: normaliserEnObjetsDuPlan,
    detruireVue: rien, createObjectDOM: rien, rebuildHandles: rien, reapplyStackingOrder: rien, rebuildSelector: rien, render: rien, boutonAnnuler: () => null
  });
  let horloge = 1_800_000_000_000;
  const creation = creerCreation(etat, {
    pushHistory: () => historique.empiler(), createObjectDOM: rien, rebuildHandles: rien, reapplyStackingOrder: rien, rebuildSelector: rien, render: rien,
    detruireVue: rien, serializeObjects, normalizeObjects: (b) => normaliserEnObjetsDuPlan(b as ObjetBrut[]), showToast: rien, showConfirm: rien,
    horloge: () => horloge++
  });
  const atelier = new Proxy({
    etat, objByKey: (k: string | null) => etat.objects.find((o) => o.key === k),
    pushHistory: (...o: object[]) => historique.empiler(...o), markDirty: (...o: object[]) => historique.marquerModifie(...o), undo: () => historique.annuler(),
    initialState: () => objets, initialMeasures: () => [], render: rien, rebuildSelector: rien, rebuildHandles: rien, reapplyStackingOrder: rien,
    addNewTerrasse: () => creation.ajouterTerrasse(ensureConstruction({} as ObjetPlan)), addNewPiscine: (f: 'rectangle' | 'ronde') => creation.ajouterPiscine(f),
    addNewPergola: () => creation.ajouterAbri('pergola'), addNewCarport: () => creation.ajouterAbri('carport'), addNewParasol: () => creation.ajouterParasol(),
    duplicateSelectedObject: () => creation.dupliquer(), deleteSelectedObject: () => creation.supprimer(), selectObject: (k: string) => creation.selectionner(k)
  }, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : rien) }) as unknown as Atelier;
  const commandes = creerRegistre();
  brancherObjets(atelier, commandes);
  // Comme app/assemblage/affichage.ts : la grille et le voisinage se rangent sur la parcelle, hors historique.
  const enregistrerAffichage = () => {
    const p = etat.objects.find((o) => o.key === 'parcelle');
    if (!p || (!p.affichage && etat.voisinageVisible && !etat.grilleVisible)) return;
    p.affichage = { ...(p.affichage ?? {}), voisinage: etat.voisinageVisible, grille: etat.grilleVisible };
  };
  brancherAffichage(atelier, { enregistrerAffichage, ctxOrtho: () => ({}) as never, buildThreeScene: rien }, commandes);

  const contexte = (obj: ObjetPlan): ContexteChamps => {
    const base: Record<string, unknown> = {
      etat, obj, objets: etat.objects, parcelle: etat.objects.find((o) => o.key === 'parcelle'), construction: () => ensureConstruction(obj),
      elevationOf: () => 0, interiorAngleDeg: () => 90, libelleType: libelleTypeObjet, refLabel: () => '', commandeUtilisable: (id: string) => commandes.etat(id).utilisable,
      pointage: () => null, cibleAlignement: () => null, dejaRectangle: () => false,
      contexteSoleil: () => ({ latitude: 48.9, longitude: 2.1, date: new Date('2026-06-21T12:00:00Z') }),
      pushHistory: (...o: object[]) => historique.empiler(...o), render: rien, toast: rien
    };
    return new Proxy(base, { get: (t, k) => (k in t ? t[k as string] : neutre[k]) }) as unknown as ContexteChamps;
  };
  const champDe = (objet: string, cle: string) => {
    const obj = etat.objects.find((o) => o.key === objet);
    if (!obj) return null;
    const c = contexte(obj);
    const ch = champsDuCatalogue(c, sectionsInspecteur(c)).find((x) => x.cle === cle);
    return ch ? { c, ch } : null;
  };
  const source = (classe: Classe = 'large'): SourceCatalogue => ({
    classe, lectureSeule: !!etat.lectureSeule, commandes: commandes.lister(), etat: (id) => commandes.etat(id), objets: etat.objects,
    selection: etat.objects.find((o) => o.key === etat.selectedKey), contexte, sections: sectionsInspecteur, libelleType: libelleTypeObjet
  });
  const application: ContexteApplication = {
    lectureSeule: () => !!etat.lectureSeule,
    etat: (id) => commandes.etat(id),
    executer: (id) => commandes.executer(id),
    lireChamp: (objet, cle) => {
      const x = champDe(objet, cle);
      const d = x?.ch.descripteur;
      return x && d && 'lire' in d ? (d.lire as (c: ContexteChamps) => ValeurChamp)(x.c) : undefined;
    },
    // Ce que fait le service de l'inspecteur (app/inspecteur.ts `appliquer`) : refuser en lecture seule ce qui ecrit le projet,
    // l'instantane avant une ecriture annulable, empile seulement si elle aboutit, et le projet marque.
    ecrireChamp: (objet, cle, valeur) => {
      const x = champDe(objet, cle);
      if (!x || !x.ch.actif) return false;
      const d = x.ch.descripteur;
      if (etat.lectureSeule && ecritLeProjet(d)) return false;
      const empiler = champAnnulable(d) ? historique.preparer(x.c.obj) : null;
      if (!('ecrire' in d) || (d.ecrire as (c: ContexteChamps, v: ValeurChamp) => void | boolean)(x.c, valeur) === false) return false;
      empiler?.();
      if (d.sale !== false) historique.marquerModifie(x.c.obj);
      return true;
    },
    transaction: (f) => historique.transaction(f)
  };
  const projetHorsAffichage = () => JSON.stringify(serializeObjects(etat.objects).map((o) => (o.key === 'parcelle' ? { ...o, affichage: undefined } : o)));
  return { etat, commandes, historique, source, application, projet: () => JSON.stringify(serializeObjects(etat.objects)), projetHorsAffichage };
}
