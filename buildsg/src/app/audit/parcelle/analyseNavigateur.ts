// L'analyse par Claude dans le navigateur (MD/spec-audit.md §13.2, lot L17) : ce que la session de
// l'audit recoit de la page. Le client des routes `admin/claude/…`, qui parle par le jeton de la
// plateforme (ou le cookie de l'admin) ; l'identite de la parcelle pour le journal du serveur ;
// l'accord garde par projet sur cet appareil (decision D2) ; la notification hors de la page quand
// l'onglet est en arriere-plan.
//
// Le client est relu a chaque audit (accesseur) : une personne qui se connecte apres l'ouverture de
// la page y a droit sans recharger. Hors plateforme et hors admin, pas de client : seules les
// mesures sont proposees.

import { enAdmin, sessionCourante } from '../../acces.js';
import { creerClientAnalyse, type ClientAnalyse } from '../../../io/analyseClaude.js';
import { creerMemoireAccords, stockageAccordsNavigateur } from '../../../io/accordAnalyse.js';
import { parcelleDuProjet } from '../../../model/fonctions.js';
import type { ObjetPlan } from '../../../model/types.js';
import type { AccordAnalyse } from '../../../model/auditParcelle.js';

export interface AnalyseDuNavigateur {
  readonly client: ClientAnalyse | null;
  identite(): { projet: string | null; idu: string | null; adresse: string | null };
  memoire: { lire(): AccordAnalyse | null; ecrire(a: AccordAnalyse | null): void };
  notifier(message: string): void;
  preparerNotification(): void;
}

/** La cle de l'accord : le projet enregistre, a defaut la parcelle (un projet pas encore enregistre). */
export function cleAccord(projet: string | null, idu: string | null): string | null {
  return projet ? 'projet:' + projet : idu ? 'parcelle:' + idu : null;
}

export function analyseClaudeDuNavigateur(etat: { objects: ObjetPlan[] }, projetCourant: () => string | null): AnalyseDuNavigateur {
  const jeton = () => sessionCourante()?.jeton()?.valeur ?? null;
  const client = creerClientAnalyse((entree, init) => fetch(entree, init), jeton);
  const accords = creerMemoireAccords(stockageAccordsNavigateur());
  const identite = () => {
    const cad = (parcelleDuProjet(etat.objects)?.cadastre ?? null) as { idu?: unknown; adresse?: unknown } | null;
    const idu = typeof cad?.idu === 'string' ? cad.idu : null;
    return { projet: projetCourant(), idu, adresse: typeof cad?.adresse === 'string' ? cad.adresse.slice(0, 300) : null };
  };
  const cle = () => { const i = identite(); return cleAccord(i.projet, i.idu); };
  return {
    get client() { return enAdmin() || jeton() ? client : null; },
    identite,
    memoire: {
      lire: () => { const k = cle(); return k ? accords.lire(k) : null; },
      ecrire: (a) => { const k = cle(); if (k) accords.ecrire(k, a); },
    },
    notifier(message) {
      if (typeof Notification === 'undefined' || document.visibilityState !== 'hidden' || Notification.permission !== 'granted') return;
      try { new Notification('Plan', { body: message }); } catch { /* un navigateur sans notifications : le toast suffit */ }
    },
    preparerNotification() {
      // Demandee au geste de l'accord, seul moment ou le navigateur l'admet ; un refus laisse le toast.
      if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
      try { void Notification.requestPermission().catch(() => {}); } catch { /* ancien Safari : rien */ }
    },
  };
}
