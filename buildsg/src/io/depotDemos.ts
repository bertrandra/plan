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

/**
 * La palette de l'interface enregistree sur le serveur (`admin/palette`, styles/paletteServeur.ts),
 * ou `null` s'il n'y en a pas. Lue SANS session : chaque page de Plan l'applique au demarrage.
 */
export async function lirePalette(f: Fetch): Promise<unknown> {
  let r: Response;
  try {
    r = await f(RACINE_ADMIN + '/palette', { credentials: 'same-origin', cache: 'no-cache' });
  } catch (e) {
    throw echec('lecture de la palette : ' + ((e as Error).message || String(e)), 'network');
  }
  if (r.status === 404) return null;
  if (!r.ok) throw await refus(r, 'lecture de la palette');
  return r.json() as Promise<unknown>;
}

/** Remplace la palette du serveur ; il garde la precedente en `.bak`. */
export async function enregistrerPalette(f: Fetch, document: unknown): Promise<void> {
  await appeler(f, '/palette', 'enregistrement de la palette', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN },
    body: JSON.stringify(document)
  });
}

// --- La consommation de Claude (MD/spec-audit.md 13.3, lot L16 bis) ------------------------------

/** Les filtres de `GET admin/consommation` ; un filtre vide n'est pas envoye. */
export interface FiltresConsommation {
  du: string;
  au: string;
  organisation?: string;
  modele?: string;
  usage?: string;
  parcelle?: string;
}

/** Le journal filtre (model/consommation.ts le lit), tel que le serveur le rend. */
export async function lireConsommation(f: Fetch, filtres: FiltresConsommation): Promise<unknown> {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtres)) if (typeof v === 'string' && v !== '') p.set(k, v);
  const r = await appeler(f, '/consommation?' + p.toString(), 'lecture de la consommation');
  return r.json() as Promise<unknown>;
}

/** La table des tarifs datee (`admin/claude/tarifs`). */
export async function lireTarifsClaude(f: Fetch): Promise<unknown> {
  return (await appeler(f, '/claude/tarifs', 'lecture des tarifs')).json() as Promise<unknown>;
}

/** Remplace la table des tarifs ; le serveur refuse qu'un tarif passe soit reecrit (409). */
export async function enregistrerTarifsClaude(f: Fetch, tarifs: unknown): Promise<unknown> {
  return (await appeler(f, '/claude/tarifs', 'enregistrement des tarifs', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN }, body: JSON.stringify(tarifs)
  })).json() as Promise<unknown>;
}

/** Les plafonds par organisation, par jour et par mois (`admin/claude/plafonds`). */
export async function lirePlafondsClaude(f: Fetch): Promise<unknown> {
  return (await appeler(f, '/claude/plafonds', 'lecture des plafonds')).json() as Promise<unknown>;
}

export async function enregistrerPlafondsClaude(f: Fetch, plafonds: unknown): Promise<unknown> {
  return (await appeler(f, '/claude/plafonds', 'enregistrement des plafonds', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN }, body: JSON.stringify(plafonds)
  })).json() as Promise<unknown>;
}

/** Le modele de chaque usage (`admin/claude/modeles`), les defauts et les modeles admis. */
export async function lireModelesClaude(f: Fetch): Promise<unknown> {
  return (await appeler(f, '/claude/modeles', 'lecture des modèles')).json() as Promise<unknown>;
}

/** Remplace le reglage ; le serveur refuse un modele hors de sa liste et garde le precedent en `.bak`. */
export async function enregistrerModelesClaude(f: Fetch, reglage: unknown): Promise<unknown> {
  return (await appeler(f, '/claude/modeles', 'enregistrement des modèles', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN }, body: JSON.stringify(reglage)
  })).json() as Promise<unknown>;
}

// --- Les indicateurs de conformite (MD/spec-regles-toits.md 13.5, lot G3) ----------------------

/** L'historique des mesures (`GET admin/conformite`) ; model/conformite.ts le relit. */
export async function lireMesuresConformiteServeur(f: Fetch): Promise<unknown> {
  return (await appeler(f, '/conformite', 'lecture des mesures de conformité')).json() as Promise<unknown>;
}

/** Range une mesure de plus ; le serveur y ajoute l'heure de reception et garde les dernieres. */
export async function enregistrerMesureConformite(f: Fetch, mesure: unknown): Promise<unknown> {
  return (await appeler(f, '/conformite', 'enregistrement de la mesure', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN }, body: JSON.stringify(mesure)
  })).json() as Promise<unknown>;
}

/**
 * Un audit de parcelle recu (`GET admin/audits`) : sa fiche, sans le fichier. `marque` : pourquoi il
 * a ete depose, `sauvegarde` de la capture ou partage pour le `corpus` (un ancien depot sans marque
 * est du corpus).
 */
export interface AuditRecu { id: string; recuLe: string; organisation: string | null; idu: string; adresse: string | null; marque: 'corpus' | 'sauvegarde' }

/** Les audits partages recus, les plus recents d'abord (lot L21). */
export async function listerAuditsRecus(f: Fetch): Promise<AuditRecu[]> {
  const d = await (await appeler(f, '/audits', 'liste des audits reçus')).json() as { audits?: unknown };
  return (Array.isArray(d.audits) ? d.audits as Partial<AuditRecu>[] : [])
    .filter((a): a is AuditRecu => typeof a.id === 'string' && typeof a.idu === 'string')
    // Les promenades des toits deposees par l'administrateur (spec-audit 15.4) ne sont pas des audits
    // de parcelle : la Conformite ne les rejoue pas ici.
    .filter((a) => (a as { nature?: unknown }).nature !== 'promenade')
    .map((a) => ({ id: a.id, recuLe: typeof a.recuLe === 'string' ? a.recuLe : '', organisation: typeof a.organisation === 'string' ? a.organisation : null, idu: a.idu, adresse: typeof a.adresse === 'string' ? a.adresse : null, marque: a.marque === 'sauvegarde' ? 'sauvegarde' : 'corpus' }));
}

/** Le fichier d'un audit recu, tel qu'il est arrive (model/fichierAuditParcelle.ts le relit). */
export async function lireAuditRecu(f: Fetch, id: string): Promise<unknown> {
  return (await appeler(f, '/audits/' + encodeURIComponent(id), 'lecture de l’audit « ' + id + ' »')).json() as Promise<unknown>;
}
