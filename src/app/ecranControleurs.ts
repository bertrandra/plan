// Monte l'ecran des controleurs de l'admin (`?admin&ecran=controleurs`, zones/EcranControleurs.tsx).
//
// A l'ouverture : le registre enregistre sur le serveur, et rien d'autre — Plan ne demarre pas.
// La decouverte ne se fait que sur demande, au bouton. La premiere fois, Plan demarre alors dessous,
// cache, sur la demonstration integree, en memoire et sans depot : rien ne peut y etre enregistre.
// Les fois suivantes, on relit ce qu'il a deja monte. Aucune commande n'est executee.

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranControleurs, type Decouverte } from '../zones/EcranControleurs.js';
import { construireArbre, echantillonsDecouverte, type RegistreControleurs, type SourceControleurs } from './controleurs.js';
import { lireControleurs, enregistrerControleurs } from '../io/depotDemos.js';
import { showErrBanner } from '../shell/dialogs.js';

/** L'adresse demande-t-elle l'ecran des controleurs ? */
export function demandeEcranControleurs(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'controleurs';
}

function estRegistre(d: unknown): d is RegistreControleurs {
  return !!d && typeof d === 'object' && (d as { format?: unknown }).format === 'plan-controleurs'
    && typeof (d as { arbre?: unknown }).arbre === 'object';
}

/** La lecture des controleurs de Plan, une fois Plan demarre. Il ne demarre qu'une fois par page. */
let lecture: Promise<() => SourceControleurs> | null = null;

function demarrerPlan(): Promise<() => SourceControleurs> {
  lecture ||= Promise.all([import('./boot.js'), import('../ui/champs/objet.js')]).then(([{ boot, graineVitrine }, { FONCTIONS }]) => new Promise((resoudre) => {
    // La demonstration, plus un echantillon par fonction qu'elle ne porte pas (app/controleurs.ts).
    const graine = graineVitrine();
    graine.objects.push(...echantillonsDecouverte(graine.objects, FONCTIONS));
    boot(graine, { controleurs: resoudre });
  }));
  return lecture;
}

async function decouvrir(): Promise<Decouverte> {
  const lire = await demarrerPlan();
  const source = lire();
  return { arbre: construireArbre(source), le: new Date().toISOString(), appVersion: source.appVersion };
}

export async function ouvrirEcranControleurs(): Promise<void> {
  const f = (entree: string, init?: RequestInit) => fetch(entree, init);
  let enregistre: RegistreControleurs | null = null;
  try {
    const d = await lireControleurs(f);
    if (d !== null && !estRegistre(d)) throw new Error('le registre enregistré n’a pas la forme attendue');
    enregistre = d;
  } catch (e) {
    showErrBanner('Registre des contrôleurs illisible : ' + ((e as Error).message || e) + '. Une découverte enregistrée le remplacera.');
  }
  let hote = document.getElementById('zoneControleurs');
  if (!hote) {
    hote = document.createElement('div');
    hote.id = 'zoneControleurs';
    document.body.appendChild(hote);
  }
  document.title = 'Admin — contrôleurs de l’écran';
  createRoot(hote).render(createElement(EcranControleurs, {
    enregistre,
    decouvrir,
    enregistrer: async (registre) => {
      try { await enregistrerControleurs(f, registre); return null; } catch (e) { return (e as Error).message || String(e); }
    }
  }));
}
