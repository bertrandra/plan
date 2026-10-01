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
// Depuis l'etape 4, il n'y a plus de « sans plateforme » : les projets vivent chez elle, et le
// build refuse de produire un fichier sans son origine.

import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { Porte } from '../zones/Porte.js';
import { creerSession, EchecPlateforme, type Session } from '../plateforme/session.js';
import { creerContexte, fermetureDe, type Contexte, type Fermeture, type ServiceContexte } from '../plateforme/contexte.js';
import { BACKPROD_API_URL } from '../plateforme/config.js';

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

/** Ouvre la porte, et ne rend la main que lorsqu'elle est franchie. */
export async function franchirLaPorte(): Promise<Acces> {
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
    racine.render(createElement(Porte, { fermeture, ouvrir, reessayer: () => { void demarrer(); }, plateforme: BACKPROD_API_URL }));
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

  /**
   * Reprend la session par le cookie, puis entre ; sinon, dit pourquoi.
   *
   * Le cookie de la plateforme est `SameSite=Strict; Domain=raillard.org` : une page servie par un
   * sous-domaine frere le porte. C'est toute la condition du signe unique (spec §1).
   *
   * **Seul un `401` montre le formulaire** (2.2.1). Une plateforme injoignable, un `5xx` ou un appel
   * que le navigateur a bloque ne disent pas que personne n'est connecte : les confondre envoyait
   * sur le formulaire quelqu'un dont la session etait intacte, avec une pastille verte a cote. On
   * montre la panne, avec de quoi reessayer sans recharger la page.
   */
  async function demarrer(): Promise<void> {
    let repris: boolean;
    try {
      repris = await session.reprendre();
    } catch (e) {
      afficher(e instanceof EchecPlateforme ? fermetureDe(e.erreur)
        : { raison: 'panne', code: 'INJOIGNABLE', message: 'La plateforme n’a pas pu reprendre votre session : ' + String((e as Error)?.message || e), requestId: '' });
      return;
    }
    if (repris) await entrer(); else afficher({ raison: 'anonyme' });
  }

  await demarrer();
  return attendu;
}
