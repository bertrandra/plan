// Client de `api.php` : les projets enregistres cote serveur (spec §3.2, io/).
//
// Le serveur est **facultatif**. Si `api.php` est absent ou injoignable — fichier ouvert en local,
// hebergement sans backend — l'application reste entierement utilisable avec le jeu de
// demonstration. C'est ce que decide `chargerProjetInitial()`, et c'est la seule vraie subtilite de
// ce module.
//
// Chaque erreur porte un `motif` (`network`, `notfound`, `server`, `badjson`) : l'appelant en a
// besoin pour distinguer « le serveur n'existe pas » de « le serveur a repondu de travers », et ne
// pas afficher le meme ecran dans les deux cas.
//
// Toute requete porte la version du client. Le serveur peut ainsi reperer un onglet laisse ouvert
// plusieurs versions durant, et refuser une ecriture trop ancienne (RELEASE.md §5.3).

import { APP_VERSION, SCHEMA_VERSION } from '../model/version.js';
import type { ObjetBrut, Mesure } from '../model/types.js';

const API_URL = 'api.php';

/** Cle localStorage du dernier projet ouvert, pour retrouver son travail en revenant. */
export const LS_LAST_PROJECT = 'planInteractif.lastProjectId';

const ENTETES_VERSION = {
  'X-App-Version': APP_VERSION,
  'X-Schema-Version': String(SCHEMA_VERSION)
};

/**
 * Une ligne de la liste des projets du serveur — et aussi ce que porte `meta` pour le projet
 * ouvert : c'est la meme ligne. `ui/projectBar.ts` la reprend telle quelle plutot que d'en tenir une
 * seconde description, qui avait deja diverge (`name` obligatoire la-bas, facultatif ici).
 */
export interface ProjetResume { id: string; name: string; updatedAt?: string }

/**
 * Un projet complet, tel que le serveur le rend. `objects` et `measures` ont la forme du plan sans
 * que rien n'y soit verifie a la lecture : c'est `normalizeObjects`, via `creerEtat()`, qui fait
 * franchir la frontiere (core/state.ts).
 */
export interface ProjetServeur { objects: ObjetBrut[]; measures?: Mesure[]; meta?: ProjetResume | null }

/** Motif d'echec, pour que l'appelant sache quoi montrer. */
export type MotifEchec = 'network' | 'notfound' | 'server' | 'badjson';

function echec(message: string, motif: MotifEchec): Error & { reason: MotifEchec } {
  return Object.assign(new Error(message), { reason: motif });
}

export function getProjectIdFromUrl(): string | null {
  return new URLSearchParams(location.search).get('projet');
}

/** L'URL courante avec le projet demande : ce qu'on met dans la barre d'adresse apres un import. */
export function withProjectParam(id: string): string {
  const url = new URL(location.href);
  url.searchParams.set('projet', id);
  return url.toString();
}

/** Lecture commune aux deux GET : meme distinction reseau / HTTP / JSON illisible. */
async function lireJson(url: string, quoi: string): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(url, { cache: 'no-store', headers: ENTETES_VERSION });
  } catch (e) {
    throw echec('API injoignable (reseau) : ' + ((e as Error).message || e), 'network');
  }
  if (!r.ok) throw echec(quoi + ' HTTP ' + r.status, r.status === 404 ? 'notfound' : 'server');
  try {
    return await r.json();
  } catch {
    throw echec('Reponse invalide (JSON illisible) : ' + quoi, 'badjson');
  }
}

export function apiList(): Promise<ProjetResume[]> {
  return lireJson(API_URL + '?action=list', 'api list') as Promise<ProjetResume[]>;
}

export function apiLoad(id: string): Promise<ProjetServeur> {
  return lireJson(API_URL + '?action=load&id=' + encodeURIComponent(id), 'api load') as Promise<ProjetServeur>;
}

async function ecrire(action: string, corps: unknown): Promise<{ id: string }> {
  const r = await fetch(API_URL + '?action=' + action, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, ENTETES_VERSION),
    body: JSON.stringify(corps)
  });
  if (!r.ok) throw new Error('api ' + action + ' HTTP ' + r.status);
  return r.json();
}

export function apiSave(payload: unknown): Promise<{ id: string }> {
  return ecrire('save', payload);
}

export function apiDelete(id: string): Promise<unknown> {
  return ecrire('delete', { id });
}

/**
 * Decide avec quoi demarrer : un projet du serveur, ou le jeu de demonstration.
 *
 * La regle qui compte, et qui a ete apprise a l'usage : on ne retombe sur la demonstration que si
 * **ce navigateur n'a jamais ouvert aucun projet**. Dans ce cas seulement, « API absente » et
 * « premiere visite » sont indistinguables, et demarrer sur la demonstration vaut mieux qu'un ecran
 * casse. Des qu'un identifiant de projet est connu — parametre d'URL ou localStorage — un echec est
 * remonte a l'utilisateur : substituer la demonstration faisait croire qu'un vrai projet avait ete
 * perdu ou remplace alors que l'API avait seulement hoquete.
 */
export async function chargerProjetInitial(demoObjets: unknown[], demoMesures: unknown[]) {
  const projetConnu = getProjectIdFromUrl() || localStorage.getItem(LS_LAST_PROJECT);
  let liste;
  try {
    liste = await apiList();
  } catch (e) {
    if (!projetConnu) {
      return {
        apiAvailable: false,
        list: [] as ProjetResume[],
        objects: JSON.parse(JSON.stringify(demoObjets)),
        measures: JSON.parse(JSON.stringify(demoMesures)),
        meta: null as ProjetResume | null
      };
    }
    throw e;
  }

  let voulu = projetConnu;
  if (voulu && !liste.some((p) => p.id === voulu)) voulu = null;
  if (!voulu && liste.length) voulu = liste[0]!.id;
  if (!voulu) {
    const cree = await apiSave({ name: 'Parcelle AE 101', objects: demoObjets, measures: demoMesures });
    voulu = cree.id;
    liste = await apiList();
  }

  // Un echec ici remonte aussi, plutot que de retomber sur la demonstration.
  const complet = await apiLoad(voulu);
  localStorage.setItem(LS_LAST_PROJECT, voulu);
  return { apiAvailable: true, list: liste, objects: complet.objects, measures: complet.measures || [], meta: complet.meta };
}
