// Les projets enregistres : la ressource `projects` de la plateforme (spec-connexion-plateforme §6).
//
// Ce module etait le client d'`api.php`, un fichier PHP pose a cote du HTML qui rangeait un JSON
// par projet dans un dossier `data/`. Depuis l'etape 4, il delegue au depot de la plateforme
// (io/depotPlateforme.ts). Ce qu'il garde, et qui n'a jamais ete du transport : la forme des
// resumes, la lecture de `?projet=`, la memoire du dernier projet ouvert, et surtout la regle de
// demarrage de `chargerProjetInitial()`, qui est la vraie subtilite de ce fichier.
//
// Chaque erreur porte un `motif` (`network`, `notfound`, `server`, `badjson`) : l'appelant en a
// besoin pour distinguer « injoignable » de « a repondu de travers », et ne pas afficher le meme
// ecran dans les deux cas. Le depot traduit les codes de la plateforme dans ce vocabulaire-la.

import { au } from '../util/tableaux.js';
import type { DepotProjets } from './depotPlateforme.js';
import type { ObjetBrut, Mesure } from '../model/types.js';

/**
 * Le depot, pose par la racine de composition une fois la porte franchie.
 *
 * Injecte, et non construit ici : le depot a besoin d'une session, la session vient de la porte, et
 * la porte est au niveau de l'application. Aller la chercher depuis `io/` serait un import
 * remontant, que le test d'architecture refuse a juste titre — c'est exactement le genre de
 * dependance qui transforme une couche basse en racine de composition deguisee.
 */
let depot: DepotProjets | null = null;

export function definirDepot(d: DepotProjets): void { depot = d; }

function leDepot(): DepotProjets {
  if (!depot) throw Object.assign(new Error('Aucun depot : la porte n a pas ete franchie.'), { reason: 'network' as const });
  return depot;
}

/** Cle localStorage du dernier projet ouvert, pour retrouver son travail en revenant. */
export const LS_LAST_PROJECT = 'planInteractif.lastProjectId';

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

/**
 * Le projet demande par l'adresse, s'il y en a un.
 *
 * Deux orthographes, et c'est voulu (2026-09-22). `projet` est celle de
 * Plan, qu'il ecrit lui-meme dans la barre d'adresse depuis toujours ;
 * `project` est celle de la plateforme, qui l'ajoute quand on quitte un
 * projet pour venir ici (ADR-051 §3, `docs/plan-service.md` §5.5). Le
 * contrat de passage est le sien et il est le meme mot sur tous ses
 * produits, donc c'est Plan qui apprend l'anglais, pas la plateforme qui
 * apprend le francais. La forme locale gagne : c'est celle que la page a
 * pu reecrire apres coup.
 */
export function getProjectIdFromUrl(): string | null {
  const parametres = new URLSearchParams(location.search);
  return parametres.get('projet') ?? parametres.get('project');
}

/** L'URL courante avec le projet demande : ce qu'on met dans la barre d'adresse apres un import. */
export function withProjectParam(id: string): string {
  const url = new URL(location.href);
  url.searchParams.set('projet', id);
  return url.toString();
}

// `async`, et pas seulement parce que le depot l'est : un depot absent doit se voir comme une
// promesse rejetee et non comme une exception jetee a l'appel, sinon le `.catch()` de l'appelant ne
// l'attrape pas et la page tombe.
export async function apiList(): Promise<ProjetResume[]> {
  return leDepot().lister();
}

export async function apiLoad(id: string): Promise<ProjetServeur> {
  return leDepot().ouvrir(id);
}

export async function apiSave(payload: unknown): Promise<{ id: string; updatedAt?: string }> {
  return leDepot().enregistrer(payload as Parameters<DepotProjets['enregistrer']>[0]);
}

export async function apiDelete(id: string): Promise<unknown> {
  return leDepot().supprimer(id);
}

/**
 * La question posee quand il n'y a aucun plan a ouvrir, et ce qu'elle rend.
 *
 * Injectee, et non importee : l'ecran vit dans `zones/`, une couche plus haute, et `io/` n'y
 * remonte pas. Absente — sous vitest, par exemple — le jeu de demonstration est cree sans rien
 * demander, ce qui etait le comportement jusqu'au 25 septembre 2026.
 *
 * @param projetsEtrangers vrai quand l'organisation a des projets, mais qu'aucun n'est un plan :
 *                         la phrase a dire n'est pas la meme que sur une organisation neuve.
 */
export type DemandePremierPas = (projetsEtrangers: boolean) => Promise<'demo' | 'adresse'>;

/**
 * Decide avec quoi demarrer : un projet du serveur, le jeu de demonstration, ou rien du tout.
 *
 * La regle qui compte, et qui a ete apprise a l'usage : on ne retombe sur la demonstration que si
 * **ce navigateur n'a jamais ouvert aucun projet**. Dans ce cas seulement, « API absente » et
 * « premiere visite » sont indistinguables, et demarrer sur la demonstration vaut mieux qu'un ecran
 * casse. Des qu'un identifiant de projet est connu — parametre d'URL ou localStorage — un echec est
 * remonte a l'utilisateur : substituer la demonstration faisait croire qu'un vrai projet avait ete
 * perdu ou remplace alors que l'API avait seulement hoquete.
 */
export async function chargerProjetInitial(
  demoObjets: unknown[],
  demoMesures: unknown[],
  demanderPremierPas?: DemandePremierPas
) {
  const projetConnu = getProjectIdFromUrl() || localStorage.getItem(LS_LAST_PROJECT);
  let liste: ProjetResume[];
  try {
    liste = await apiList();
  } catch (e) {
    if (!projetConnu) {
      return {
        apiAvailable: false,
        list: [] as ProjetResume[],
        objects: JSON.parse(JSON.stringify(demoObjets)) as ObjetBrut[],
        measures: JSON.parse(JSON.stringify(demoMesures)) as Mesure[],
        meta: null as ProjetResume | null,
        // Pas de plateforme, donc pas d'import cadastre a ouvrir : le champ existe sur toutes les
        // branches pour que l'appelant n'ait jamais a se demander s'il est la.
        ouvrirAdresse: false
      };
    }
    throw e;
  }

  let voulu = projetConnu;
  if (voulu && !liste.some((p) => p.id === voulu)) voulu = null;
  if (!voulu && liste.length) voulu = au(liste, 0).id;

  /** Le jeu de demonstration, enregistre comme un vrai projet : c'est ce qu'il devient. */
  const creerLaDemo = async (): Promise<string> => {
    const cree = await apiSave({ name: 'Parcelle AE 101', objects: demoObjets, measures: demoMesures });
    liste = await apiList();
    return cree.id;
  };

  /** Un plan vide, sans projet : l'etat depuis lequel l'import cadastre va en creer un. */
  const planVierge = () => ({
    apiAvailable: true,
    list: liste,
    objects: [] as ObjetBrut[],
    measures: [] as Mesure[],
    meta: null as ProjetResume | null,
    ouvrirAdresse: true
  });

  if (!voulu) {
    if (demanderPremierPas && (await demanderPremierPas(liste.length > 0)) === 'adresse') return planVierge();
    voulu = await creerLaDemo();
  }

  // Un echec ici remonte aussi, plutot que de retomber sur la demonstration.
  //
  // Une exception : un projet que Plan a CHOISI lui-meme et dont le document n'est pas un plan.
  // La ressource de la plateforme est partagee par tous les produits, et rien n'oblige un projet
  // qui s'y trouve a etre un plan — le monde de demonstration en porte deux qui n'en sont pas.
  // Mourir la-dessus empecherait de demarrer sur un locataire parfaitement sain. C'est la meme
  // situation que la liste vide, vue de la personne : rien a ouvrir. On pose donc la meme question.
  // Si c'est l'utilisateur qui a NOMME ce projet, par l'URL ou par le dernier ouvert, l'echec
  // remonte : il a demande celui-la, pas un autre.
  let complet;
  try {
    complet = await apiLoad(voulu);
  } catch (e) {
    const choisiParPlan = voulu !== projetConnu;
    if (!choisiParPlan || (e as { reason?: string }).reason !== 'badjson') throw e;
    if (demanderPremierPas && (await demanderPremierPas(true)) === 'adresse') return planVierge();
    voulu = await creerLaDemo();
    complet = await apiLoad(voulu);
  }
  localStorage.setItem(LS_LAST_PROJECT, voulu);
  return {
    apiAvailable: true,
    list: liste,
    objects: complet.objects,
    measures: complet.measures || [],
    meta: complet.meta ?? null,
    ouvrirAdresse: false
  };
}
