// Ce qui se passe avant que l'atelier ne s'ouvre (spec-connexion-plateforme §3.1, §16 etape 2).
//
// La sequence est courte et son ordre est tout :
//
//   reprendre la session par le cookie  →  401 : le formulaire
//   lire /me/context                    →  403/404 : « ce compte ne tient pas Plan »
//   alors seulement, monter les zones
//
// **Rien ne s'affiche derriere la porte avant que `/me/context` ait repondu.** Un atelier qui
// apparait une seconde avant d'etre remplace par un formulaire a montre le plan de quelqu'un
// d'autre pendant une seconde.
//
// Tant que `BACKPROD_API_URL` est vide, cette porte n'existe pas et Plan demarre exactement comme
// en 1.2.0 (spec §16.1). Ce drapeau est temporaire : l'etape 4 le retire.

import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { Porte } from '../zones/Porte.js';
import { creerSession, EchecPlateforme, type Session } from '../plateforme/session.js';
import { creerContexte, fermetureDe, type Contexte, type Fermeture, type ServiceContexte } from '../plateforme/contexte.js';
import { BACKPROD_API_URL, plateformeBranchee } from '../plateforme/config.js';

export interface Acces {
  session: Session;
  contexte: ServiceContexte;
  /** Le contexte lu a l'ouverture : qui, quel locataire, quels droits. */
  ouvert: Contexte;
}

/** L'element qui porte la porte. Cree a la demande : une page sans plateforme n'en a pas besoin. */
function conteneur(): HTMLElement {
  let e = document.getElementById('zonePorte');
  if (!e) {
    e = document.createElement('div');
    e.id = 'zonePorte';
    document.body.appendChild(e);
  }
  return e;
}

/**
 * Ouvre la porte, et ne rend la main que lorsqu'elle est franchie.
 *
 * Rend `null` quand aucune plateforme n'est branchee : l'appelant demarre alors comme avant.
 */
export async function franchirLaPorte(): Promise<Acces | null> {
  if (!plateformeBranchee()) return null;

  let racine: Root | null = null;
  let resoudre: ((a: Acces) => void) | null = null;

  const session = creerSession({
    fetch: (...a) => fetch(...a),
    maintenant: () => Date.now(),
    planifier: (quand, quoi) => { const t = window.setTimeout(quoi, quand); return () => { window.clearTimeout(t); }; },
    // Une session perdue en pleine edition ne jette rien : la porte se repose par-dessus l'atelier,
    // et le plan non enregistre attend derriere (spec §3.3).
    surPerte: () => { contexte.oublier(); afficher({ raison: 'anonyme' }); }
  });
  const contexte = creerContexte(session);

  function afficher(fermeture: Fermeture): void {
    racine ||= createRoot(conteneur());
    racine.render(createElement(Porte, { fermeture, ouvrir, plateforme: BACKPROD_API_URL }));
  }

  function refermer(): void {
    if (racine) { racine.unmount(); racine = null; }
    document.getElementById('zonePorte')?.remove();
  }

  async function entrer(): Promise<boolean> {
    try {
      const ouvertContexte = await contexte.charger();
      refermer();
      resoudre?.({ session, contexte, ouvert: ouvertContexte });
      return true;
    } catch (e) {
      afficher(e instanceof EchecPlateforme ? fermetureDe(e.erreur)
        : { raison: 'panne', code: 'INJOIGNABLE', message: String(e), requestId: '' });
      return false;
    }
  }

  async function ouvrir(email: string, motDePasse: string): Promise<string | null> {
    try {
      await session.ouvrir(email, motDePasse);
    } catch (e) {
      if (e instanceof EchecPlateforme) {
        // On relaie le message de la plateforme : les regles du mot de passe sont les siennes, et
        // les redire ici serait les redire faux le jour ou elles changent.
        return e.erreur.statut === 401 ? 'Adresse ou mot de passe refusé.' : e.erreur.message;
      }
      return 'La plateforme est injoignable.';
    }
    return (await entrer()) ? null : ' ';
  }

  const attendu = new Promise<Acces>((r) => { resoudre = r; });

  // Le cookie de la plateforme est `SameSite=Strict` sur son hote : une page servie par un
  // sous-domaine frere le porte. C'est toute la condition du signe unique (spec §1).
  const repris = await session.reprendre().catch(() => false);
  if (repris) { if (await entrer()) return attendu; } else afficher({ raison: 'anonyme' });

  return attendu;
}
