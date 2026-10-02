// Le depot des fichiers de demonstration de l'admin (MD/spec-demos-admin.md).
//
// Meme contrat que le depot de la plateforme (io/depotPlateforme.ts) : lister, ouvrir, enregistrer,
// supprimer. Ce qui change est l'endroit — `/admin/demos` sur le serveur qui sert la page
// (buildsg/demosAdmin.mjs) — et la forme du document : celle de l'export JSON, `{meta, objects,
// measures}`, pour qu'un fichier de demo et un fichier exporte soient interchangeables.
//
// La session admin est un cookie que le serveur a pose ; ce module ne voit jamais le mot de passe.

import { schemaMinimal, migrer } from '../model/migrations.js';
import type { DepotProjets } from './depotPlateforme.js';
import type { ProjetResume, MotifEchec } from './api.js';
import type { ObjetBrut, Mesure } from '../model/types.js';

/** Un fichier de demo : le format de l'export (io/exportProjet.ts). */
interface FichierDemo {
  meta?: { name?: unknown; schemaVersion?: unknown; [cle: string]: unknown } | null;
  objects: ObjetBrut[];
  measures?: Mesure[];
}

/**
 * Relatif a la page, et non `/admin` : Plan peut etre depose dans un sous-dossier de l'hote. Sous
 * Apache, `.htaccess` renvoie `admin/…` vers `admin.php` ; sous Node, `app.js` le sert lui-meme.
 */
export const RACINE_ADMIN = 'admin';
/** L'en-tete que le serveur exige sur toute ecriture : un autre site ne peut pas le poser. */
export const ENTETE_ADMIN = { 'X-Plan-Admin': '1' } as const;

type Fetch = (entree: string, init?: RequestInit) => Promise<Response>;

function echec(message: string, motif: MotifEchec): Error & { reason: MotifEchec } {
  return Object.assign(new Error(message), { reason: motif });
}

/** Le message du serveur, ou le statut a defaut. */
async function refus(r: Response, quoi: string): Promise<Error & { reason: MotifEchec }> {
  let message = 'HTTP ' + r.status;
  try {
    const d = await r.json() as { error?: { message?: string } };
    if (d.error?.message) message = d.error.message;
  } catch { /* corps vide ou illisible : le statut suffit */ }
  if (r.status === 401) message = 'session admin expirée, rechargez la page pour retaper le mot de passe';
  return echec(quoi + ' : ' + message, r.status === 404 ? 'notfound' : 'server');
}

async function appeler(f: Fetch, chemin: string, quoi: string, init?: RequestInit): Promise<Response> {
  let r: Response;
  try {
    r = await f(RACINE_ADMIN + chemin, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch (e) {
    throw echec(quoi + ' : ' + ((e as Error).message || String(e)), 'network');
  }
  if (!r.ok) throw await refus(r, quoi);
  return r;
}

export function creerDepotDemos(f: Fetch): DepotProjets {
  return {
    async lister() {
      const r = await appeler(f, '/demos', 'liste des démos');
      const d = await r.json() as { demos?: ProjetResume[] };
      return Array.isArray(d.demos) ? d.demos : [];
    },

    async ouvrir(id) {
      const r = await appeler(f, '/demos/' + encodeURIComponent(id), 'ouverture de la démo');
      let d: FichierDemo;
      try { d = await r.json() as FichierDemo; } catch { throw echec('La démo « ' + id + ' » n’est pas un JSON lisible.', 'badjson'); }
      if (!d || !Array.isArray(d.objects)) throw echec('La démo « ' + id + ' » n’a pas la forme d’un plan (aucun objet).', 'badjson');
      // Un fichier ancien se lit dans la forme courante, comme un projet de la plateforme. Le schema
      // est dans `meta`, la ou l'export l'ecrit ; a defaut, le plus petit qui decrit le document.
      const schema = typeof d.meta?.schemaVersion === 'number' ? d.meta.schemaVersion : schemaMinimal(d.objects);
      const lu = migrer(d, schema);
      const modifie = r.headers.get('Last-Modified');
      const nom = typeof d.meta?.name === 'string' && d.meta.name ? d.meta.name : id;
      return {
        objects: lu.objects || [],
        ...(lu.measures ? { measures: lu.measures } : {}),
        schemaVersion: schema,
        meta: { id, name: nom, ...(modifie ? { updatedAt: new Date(modifie).toISOString() } : {}) }
      };
    },

    async enregistrer(charge) {
      const { id, name, objects, measures, ...reste } = charge as typeof charge & { schemaVersion?: number; appVersion?: string };
      const maintenant = new Date().toISOString();
      // Le format de l'export, champ pour champ (io/exportProjet.ts) : le fichier se relit aussi
      // par « Importer un JSON », et un export se depose tel quel dans le dossier des demos.
      const document = {
        meta: {
          id: id ?? null,
          name: name || 'Démo sans nom',
          updatedAt: maintenant,
          exportedBy: 'plan.html (admin des démos)',
          appVersion: reste.appVersion ?? null,
          schemaVersion: typeof reste.schemaVersion === 'number' ? reste.schemaVersion : schemaMinimal(objects),
          writtenAt: maintenant
        },
        objects,
        measures: measures ?? []
      };
      const r = await appeler(f, id ? '/demos/' + encodeURIComponent(id) : '/demos', 'enregistrement de la démo', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN },
        body: JSON.stringify(document)
      });
      const res = await r.json() as ProjetResume;
      return { id: res.id, ...(res.updatedAt ? { updatedAt: res.updatedAt } : {}) };
    },

    async supprimer(id) {
      await appeler(f, '/demos/' + encodeURIComponent(id), 'suppression de la démo', { method: 'DELETE', headers: { ...ENTETE_ADMIN } });
      return {};
    }
  };
}

/** La session admin est-elle ouverte ? `null` : le serveur n'a pas d'admin (pas d'`app.js`, ou pas d'`ADMIN_PASSWORD`). */
export async function sessionAdmin(f: Fetch): Promise<boolean | null> {
  try {
    const r = await f(RACINE_ADMIN + '/session', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 200) return true;
    if (r.status === 401) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Ferme la session admin (`DELETE admin/session`) : le serveur l'oublie et efface le cookie. Rend
 * vrai si c'est fait ; faux si le serveur n'a pas repondu — la session reste alors ouverte de son
 * cote, et il ne faut pas laisser croire le contraire.
 */
export async function deconnecterAdmin(f: Fetch): Promise<boolean> {
  try {
    const r = await f(RACINE_ADMIN + '/session', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store', headers: { ...ENTETE_ADMIN } });
    return r.ok;
  } catch {
    return false;
  }
}

/** Ouvre la session ; rend le message de refus, ou `null` si c'est ouvert. */
export async function connecterAdmin(f: Fetch, motDePasse: string): Promise<string | null> {
  try {
    const r = await f(RACINE_ADMIN + '/session', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN },
      body: JSON.stringify({ motDePasse })
    });
    if (r.ok) return null;
    try {
      const d = await r.json() as { error?: { message?: string } };
      if (d.error?.message) return d.error.message;
    } catch { /* corps illisible */ }
    return 'Refusé (HTTP ' + r.status + ').';
  } catch (e) {
    return 'Le serveur ne répond pas : ' + ((e as Error).message || String(e));
  }
}

/** Le registre des controleurs enregistre (app/controleurs.ts), ou `null` s'il n'y en a pas encore. */
export async function lireControleurs(f: Fetch): Promise<unknown> {
  let r: Response;
  try {
    r = await f(RACINE_ADMIN + '/controleurs', { credentials: 'same-origin', cache: 'no-store' });
  } catch (e) {
    throw echec('lecture du registre des contrôleurs : ' + ((e as Error).message || String(e)), 'network');
  }
  if (r.status === 404) return null;
  if (!r.ok) throw await refus(r, 'lecture du registre des contrôleurs');
  return r.json() as Promise<unknown>;
}

/** Remplace le registre des controleurs ; le serveur garde le precedent en `.bak`. */
export async function enregistrerControleurs(f: Fetch, registre: unknown): Promise<void> {
  await appeler(f, '/controleurs', 'enregistrement du registre des contrôleurs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN },
    body: JSON.stringify(registre)
  });
}
