// L'entree de l'admin des demos : `?admin`, ou `?demofile=<id>` (MD/spec-demos-admin.md).
//
// Elle remplace la porte de la plateforme : l'admin travaille sur des fichiers du serveur qui sert
// la page, pas sur les projets d'une organisation. Rien ne s'affiche derriere avant que le serveur
// ait dit oui — meme regle que la porte de la plateforme (app/porte.ts).

import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { PorteAdmin } from '../zones/PorteAdmin.js';
import { sessionAdmin, connecterAdmin, deconnecterAdmin } from '../io/depotDemos.js';

/** L'adresse demande-t-elle l'admin des demos ? */
export function demandeAdmin(recherche: string): boolean {
  const p = new URLSearchParams(recherche);
  return p.has('admin') || p.has('demofile');
}

/** Ne rend la main qu'une fois la session admin ouverte. */
export async function franchirLaPorteAdmin(): Promise<void> {
  const f = (entree: string, init?: RequestInit) => fetch(entree, init);
  const etat = await sessionAdmin(f);
  if (etat === true) return;

  const hote = document.createElement('div');
  hote.id = 'zonePorte';
  document.body.appendChild(hote);
  const racine: Root = createRoot(hote);

  await new Promise<void>((resoudre) => {
    const ouvrir = async (motDePasse: string): Promise<string | null> => {
      const refus = await connecterAdmin(f, motDePasse);
      if (!refus) resoudre();
      return refus;
    };
    racine.render(createElement(PorteAdmin, { ouvrir, indisponible: etat === null }));
  });
  racine.unmount();
  hote.remove();
}

/**
 * Sort de l'admin : ferme la session cote serveur, puis recharge la page — la porte au mot de passe
 * revient, rien de l'atelier ne reste affiche. Rend le motif d'echec si le serveur n'a pas repondu :
 * la session serait alors encore ouverte, et recharger laisserait croire le contraire.
 */
export async function quitterAdmin(recharger: () => void = () => location.reload()): Promise<string | null> {
  const fait = await deconnecterAdmin((entree, init) => fetch(entree, init));
  if (!fait) return 'Déconnexion impossible : le serveur ne répond pas. La session admin reste ouverte.';
  recharger();
  return null;
}
