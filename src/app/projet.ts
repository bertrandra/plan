// Le projet cote serveur : ouvrir, creer, enregistrer, supprimer (spec-ihm-zones §4.1).
//
// Cette logique vivait dans `ui/projectBar.ts::setupProjectBar`, melee a la construction de la
// barre : chaque bouton etait une fermeture qui fabriquait son element. Elle est ici sans un seul
// noeud DOM — des commandes dans le registre, et un statut que le magasin publie. La barre
// d'application (zones/BarreApplication.tsx) ne fait que les afficher et les declencher.
//
// Ce qui n'a pas change : les gestes eux-memes. Changer de projet ou en creer un recharge la page
// avec `?projet=…`, exactement comme avant ; enregistrer remet a zero l'etat initial qui sert au
// bouton « Reinitialiser » ; supprimer retire le parametre d'URL et recharge.

import { tailleFichier } from '../util/format.js';
import { jsonParPaquets, octetsUtf8 } from '../util/jsonParPaquets.js';
import { PERMISSION_ECRITURE, compteProjetsCourant } from './acces.js';
import { QUOTA_PROJETS } from '../plateforme/quotaProjets.js';
import { CAPACITES } from '../plateforme/capacites.js';
import { showConfirm, showPrompt, showToast, showErrBanner } from '../shell/dialogs.js';
import { dialogues } from '../shell/dialogues.js';
import { schemaAEcrire, migrationsDepuis } from '../model/migrations.js';
import { cleDesAttributs } from '../core/controleurObjets.js';
import { APP_VERSION, SCHEMA_VERSION } from '../model/version.js';
import type { ObjetSerialise } from '../model/creation.js';
import type { EtatApp } from '../core/state.js';
import type { ProjetResume } from '../io/api.js';
import type { ObjetBrut, ObjetPlan, Mesure } from '../model/types.js';
import type { RegistreCommandes } from './commandes.js';
import type { Magasin } from './magasin.js';
import { objetsHorsSession } from './toits/modeToit.js';

/** Ce que le demarrage sait du projet : le serveur repond-il, lequel est ouvert, lesquels existent. */
export interface SeedProjet {
  apiAvailable: boolean;
  meta?: ProjetResume | null | undefined;
  list: ProjetResume[];
  /** Vrai quand le demarrage demande l'import cadastre (un plan vierge, ou un projet neuf a remplir). */
  ouvrirAdresse?: boolean;
}

/**
 * Le projet neuf que l'import cadastre remplira, s'il y en a un : ouvert avec un document vide
 * (`{}`), et ou rien n'a encore ete dessine. Le remplir ne cree pas de projet : aucun quota.
 */
export function projetARemplir(seed: SeedProjet, etat: EtatApp): ProjetResume | null {
  return seed.ouvrirAdresse && seed.meta && etat.objects.length === 0 ? seed.meta : null;
}

/** Ce que les commandes de projet demandent au reste du programme. */
export interface ContexteProjet {
  etat: EtatApp;
  apiSave: (payload: unknown) => Promise<{ id: string; updatedAt?: string }>;
  apiDelete: (id: string) => Promise<unknown>;
  serializeObjects: (objs: ObjetPlan[]) => ObjetSerialise[];
  serializeMeasures: (ms: Mesure[]) => unknown[];
  initialState: () => ObjetBrut[];
  initialMeasures: () => unknown[];
  withProjectParam: (id: string) => string;
  cleDernierProjet: string;
  /** Le compteur des modifications du plan (core/historique.ts) : une modification pendant l'enregistrement le laisse a enregistrer. */
  modifications?: () => number;
  /** Rend la main entre deux paquets d'objets serialises ; un tour de boucle par defaut (remplacable dans les tests). */
  ceder?: () => Promise<void>;
  /** Branche le rafraichissement du statut sur l'historique, qui sait quand le plan devient sale. */
  definirRafraichisseurStatut: (f: () => void) => void;
  ouvrirImportCadastre: () => void;
  ouvrirDialogueActualisation: () => void;
  /** « Actualiser le projet » : la question, puis l'actualisation complete aux valeurs par defaut (app/cadastre/actualiserProjet.ts). */
  ouvrirActualisationProjet: () => void;
  /** Une actualisation tourne : la commande se grise, une seule a la fois. */
  actualisationEnCours: () => boolean;
}

export interface Projet {
  /** Change de projet ; demande confirmation si le plan courant a des modifications. */
  ouvrir(id: string): void;
  /**
   * A l'ouverture : si le projet est d'un schema anterieur, propose de le mettre a jour — sauf si
   * la personne a deja repondu « Garder tel quel » pour ce projet et ce schema.
   */
  proposerMiseAJour(): void;
  /**
   * Enregistre sans toast ni bandeau de succes : la tache de fond des toits, qui ne range que ce
   * qu'elle a lu. Un echec s'affiche comme d'habitude (bandeau). Rend vrai si la plateforme l'a accepte.
   */
  enregistrerSansBruit(): Promise<boolean>;
}

/** Cle localStorage d'un refus de mise a jour : par projet, et pour le schema propose. */
const cleRefus = (id: string) => 'planInteractif.modeleGarde.' + id;

/** Retient « Garder tel quel » pour ce projet et ce schema, ou l'oublie (`null`). Sans stockage, la question reviendra. */
function retenirRefus(id: string, schema: number | null): void {
  try {
    if (schema === null) localStorage.removeItem(cleRefus(id));
    else localStorage.setItem(cleRefus(id), String(schema));
  } catch { /* navigation privee, stockage plein : rien a retenir */ }
}

/** Vrai si la personne a deja garde ce projet tel quel, pour le schema que ce programme propose. */
function refusRetenu(id: string): boolean {
  try { return localStorage.getItem(cleRefus(id)) === String(SCHEMA_VERSION); } catch { return false; }
}

// Le schema ecrit est celui qui decrit le document, jamais sous celui ou le projet a ete monte
// (model/migrations.ts). La plateforme le recoit dans `schema_version` (io/depotPlateforme.ts).
/** Les objets serialises par paquet : assez petit pour qu'un paquet reste sous 50 ms sur un poste lent. */
const PAQUET_OBJETS = 400;

/**
 * Serialise le plan par paquets, en rendant la main entre deux (util/jsonParPaquets.ts) : une seule
 * serialisation et une seule ecriture en JSON, qui servent a l'envoi, a la taille affichee et a l'etat
 * de reference. D'un seul tenant, un voisinage d'un kilometre figeait l'ecran pres de deux secondes.
 */
async function chargeParPaquets(ctx: ContexteProjet, id: string, name: string) {
  // Le batiment d'une session du mode Toit s'ecrit a son depart : rien de la session avant « Valider » (app/toits/modeToit.ts).
  const ecrits = await jsonParPaquets(objetsHorsSession(ctx.etat.objects), ctx.serializeObjects, PAQUET_OBJETS, ctx.ceder);
  const measures = ctx.serializeMeasures(ctx.etat.measures);
  const donnees = { appVersion: APP_VERSION, schemaVersion: schemaAEcrire(ecrits.valeurs, ctx.etat.schemaProjet), objects: ecrits.valeurs, measures };
  // La taille de ce qui part, en octets UTF-8 : celle que la plateforme compare a sa limite.
  const autour = JSON.stringify({ id, name, ...donnees, objects: [] });
  return { donnees, objetsJson: ecrits.json, taille: octetsUtf8(autour) - 2 + ecrits.json.size };
}

/** L'etat de reference (« Revenir a l'enregistre ») : ce qui vient d'etre ecrit, sans le serialiser une seconde fois. */
function remplacerEtatDeReference(ctx: ContexteProjet, donnees: { objects: ObjetSerialise[]; measures: unknown[] }): void {
  ctx.initialState().length = 0;
  for (const o of donnees.objects) ctx.initialState().push(o as unknown as ObjetBrut);
  ctx.initialMeasures().length = 0;
  ctx.initialMeasures().push(...donnees.measures);
}

/**
 * Une operation a la fois : un nouvel appel attend la fin du precedent, puis repart (l'enregistrement
 * seul de la tache de fond et Ctrl+S peuvent se croiser ; chacun ecrit l'etat de son moment).
 */
export function uneALaFois<A extends unknown[], R>(f: (...a: A) => Promise<R>): (...a: A) => Promise<R> {
  let enCours: Promise<unknown> | null = null;
  return async (...a: A) => {
    while (enCours) await enCours.catch(() => null);
    const p = f(...a);
    enCours = p;
    try { return await p; } finally { if (enCours === p) enCours = null; }
  };
}

function chargeDuProjet(ctx: ContexteProjet) {
  const objects = ctx.serializeObjects(objetsHorsSession(ctx.etat.objects));
  return {
    appVersion: APP_VERSION, schemaVersion: schemaAEcrire(objects, ctx.etat.schemaProjet),
    objects, measures: ctx.serializeMeasures(ctx.etat.measures)
  };
}

/**
 * « Mettre a jour le modele » : la commande du menu Fichier, et la question posee a l'ouverture.
 * Rend la fonction qui pose cette question si elle a lieu d'etre.
 *
 * Le document a deja ete lu dans la forme courante (les migrations s'appliquent a la lecture) :
 * mettre a jour, c'est l'enregistrer en declarant le schema du programme. Si la plateforme refuse
 * ce schema, le projet reste a l'ancien, et le bandeau d'erreur dit a qui s'adresser.
 */
function declarerMiseAJour(cmd: RegistreCommandes, etat: EtatApp, courant: ProjetResume | null, p: {
  enRetard: () => boolean; enregistrer: (annonce: string) => Promise<boolean>; publier: () => void;
}): () => void {
  async function mettreAJour(): Promise<void> {
    const avant = etat.schemaProjet;
    etat.schemaProjet = SCHEMA_VERSION;
    const ok = await p.enregistrer('Modèle mis à jour : le projet est au schéma ' + SCHEMA_VERSION + '.');
    if (!ok) { etat.schemaProjet = avant; p.publier(); }
    else if (courant) retenirRefus(courant.id, null);
  }
  const demander = () => { if (courant) ouvrirDialogueMiseAJour(courant.id, etat.schemaProjet, mettreAJour); };
  cmd.declarer({
    id: 'projet.mettreAJourModele', libelle: 'Mettre à jour le modèle', groupe: 'projet',
    permission: PERMISSION_ECRITURE,
    description: 'Enregistre le projet au schema de cette version de Plan',
    actif: p.enRetard,
    executer: demander
  });
  return () => {
    if (!courant || !cmd.etat('projet.mettreAJourModele').utilisable || refusRetenu(courant.id)) return;
    demander();
  };
}

/** La question posee a l'ouverture d'un projet de schema `de` anterieur au programme. */
function ouvrirDialogueMiseAJour(id: string, de: number, mettreAJour: () => Promise<void>): void {
  dialogues.ouvrir({
    type: 'choix',
    titre: 'Mettre à jour le modèle ?',
    texte: 'Ce projet a été enregistré au schéma ' + de + ' ; Plan ' + APP_VERSION + ' écrit le schéma ' + SCHEMA_VERSION
      + '. La mise à jour ne change rien au plan : elle l’enregistre dans la forme actuelle, qui apporte :',
    points: [
      ...migrationsDepuis(de).map((m) => m.apporte.charAt(0).toUpperCase() + m.apporte.slice(1) + '.'),
      'Tel quel, il reste lisible par les versions précédentes de Plan ; il sera mis à jour de lui-même le jour où vous y ajouterez un relevé.'
    ],
    principal: { libelle: 'Mettre à jour le modèle', executer: () => { void mettreAJour(); } },
    secondaire: { libelle: 'Garder tel quel', executer: () => retenirRefus(id, SCHEMA_VERSION) }
  });
}

const heure = (iso: string | number) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Le schema a ecrire est-il anterieur a celui du programme ? Repris tant que les attributs des objets n'ont pas change
 * (core/controleurObjets.ts, `cleDesAttributs`) : le schema minimal parcourt tous les objets et ne lit que leurs champs poses, jamais
 * leur forme (un glisser ne le change pas), et l'etat de « Mettre a jour le modele » se lit a chaque rendu du plan.
 */
function retardMemorise(): (etat: EtatApp) => boolean {
  let retard: { cle: string; valeur: boolean } | null = null;
  return (etat) => {
    const cle = cleDesAttributs(etat.objects) + '|' + etat.schemaProjet;
    if (retard?.cle !== cle) retard = { cle, valeur: schemaAEcrire(etat.objects, etat.schemaProjet) < SCHEMA_VERSION };
    return retard.valeur;
  };
}

export function creerProjet(seed: SeedProjet, ctx: ContexteProjet, magasin: Magasin, cmd: RegistreCommandes): Projet {
  const courant = seed.meta ?? null;
  const schemaEnRetard = retardMemorise();
  let enregistreA = courant && courant.updatedAt ? 'Enregistré à ' + heure(courant.updatedAt) : '';
  let echec = '';

  function publier(statut?: 'enregistrement'): void {
    magasin.definirProjet({
      apiDisponible: seed.apiAvailable, courant, liste: seed.list, enregistreA, echec,
      schemaEnRetard: enRetard(),
      quota: seed.apiAvailable ? compteProjetsCourant() : null,
      statut: statut ?? (!seed.apiAvailable ? 'local' : ctx.etat.dirty || echec ? 'modifie' : 'a-jour')
    });
  }
  ctx.definirRafraichisseurStatut(() => publier());
  publier();

  function aller(id: string): void {
    localStorage.setItem(ctx.cleDernierProjet, id);
    location.href = ctx.withProjectParam(id);
  }

  /** Le projet ouvert est d'un schema anterieur au programme, et ce qu'il porte ne l'a pas deja monte. */
  function enRetard(): boolean {
    return seed.apiAvailable && !!courant && schemaEnRetard(ctx.etat);
  }

  const charge = () => chargeDuProjet(ctx);


  /** Enregistre le projet ouvert ; rend vrai si la plateforme l'a accepte. Un enregistrement a la fois. */
  const enregistrer = uneALaFois(enregistrerUneFois);

  async function enregistrerUneFois(annonce: string | null): Promise<boolean> {
    if (!courant) return false;
    publier('enregistrement');
    let taille: number | null = null;
    const avant = ctx.modifications?.() ?? null;
    try {
      const { donnees, objetsJson, taille: octets } = await chargeParPaquets(ctx, courant.id, courant.name);
      taille = octets;
      const res = await ctx.apiSave({ id: courant.id, name: courant.name, ...donnees, objetsJson });
      // Ce qui a ete ecrit devient le plancher : un releve ajoute puis retire ne redescend pas le projet.
      ctx.etat.schemaProjet = donnees.schemaVersion;
      // Modifie pendant l'enregistrement : ce qui est parti n'est plus tout le plan, il reste a enregistrer.
      if (avant === null || ctx.modifications?.() === avant) ctx.etat.dirty = false;
      enregistreA = 'Enregistré à ' + heure(res.updatedAt || Date.now()) + ' (' + tailleFichier(taille) + ')';
      echec = '';
      remplacerEtatDeReference(ctx, donnees);
      if (annonce) showToast(annonce);
      return true;
    } catch (e) {
      // La taille de ce qui a ete refuse reste sous les yeux, a la place de l'heure du dernier succes.
      const poids = taille === null ? '' : ' (' + tailleFichier(taille) + ')';
      echec = 'Échec de l’enregistrement' + poids;
      showErrBanner('Echec de l\'enregistrement' + poids + ' : ' + ((e as Error).message || e));
      return false;
    } finally {
      publier();
    }
  }

  const proposerMiseAJour = declarerMiseAJour(cmd, ctx.etat, courant, { enRetard, enregistrer, publier });

  cmd.declarer({
    id: 'projet.nouveau', libelle: 'Nouveau projet', groupe: 'projet',
    permission: PERMISSION_ECRITURE, quota: QUOTA_PROJETS,
    description: 'Cree un projet sur le serveur, copie du plan actuel',
    actif: () => seed.apiAvailable,
    executer: () => {
      showPrompt('Nom du nouveau projet (copie du plan actuel) :', courant ? (courant.name + ' (copie)') : 'Nouveau projet', async (name) => {
        try {
          const created = await ctx.apiSave({ name, ...charge() });
          aller(created.id);
        } catch (e) {
          showErrBanner('Impossible de creer le projet : ' + ((e as Error).message || e));
        }
      });
    }
  });

  cmd.declarer({
    id: 'projet.enregistrer', libelle: 'Enregistrer', groupe: 'projet', raccourci: 'Ctrl+S',
    permission: PERMISSION_ECRITURE,
    actif: () => seed.apiAvailable && !!courant,
    executer: () => { void enregistrer('Projet enregistre.'); }
  });

  cmd.declarer({
    id: 'projet.supprimer', libelle: 'Supprimer le projet', groupe: 'projet',
    permission: PERMISSION_ECRITURE,
    description: 'Supprimer ce projet du serveur',
    actif: () => seed.apiAvailable && !!courant && seed.list.length > 1,
    executer: () => {
      if (!courant) return;
      showConfirm('Supprimer definitivement le projet "' + courant.name + '" ? Cette action est irreversible.', async () => {
        try {
          await ctx.apiDelete(courant.id);
          localStorage.removeItem(ctx.cleDernierProjet);
          const url = new URL(location.href); url.searchParams.delete('projet');
          location.href = url.toString();
        } catch (e) {
          showErrBanner('Echec de la suppression : ' + ((e as Error).message || e));
        }
      });
    }
  });

  // Disponible avec ou sans serveur : sans, l'import cadastre charge quand meme le plan en memoire
  // (et le dit) — c'est plus utile qu'un bouton absent sans explication.
  cmd.declarer({
    id: 'projet.depuisAdresse', libelle: 'Depuis une adresse', groupe: 'projet',
    capacite: CAPACITES.cadastre.code, permission: PERMISSION_ECRITURE,
    quota: () => (projetARemplir(seed, ctx.etat) ? null : QUOTA_PROJETS),
    description: 'Cree un projet a partir du plan cadastral : adresse, parcelle, parcelles voisines',
    executer: () => {
      if (ctx.etat.dirty && seed.apiAvailable) {
        showConfirm('Des modifications ne sont pas enregistrees. Ouvrir l\'import cadastre quand meme ?', () => ctx.ouvrirImportCadastre());
        return;
      }
      ctx.ouvrirImportCadastre();
    }
  });

  cmd.declarer({
    id: 'projet.actualiserIgn', libelle: 'Actualiser IGN', groupe: 'projet',
    capacite: CAPACITES.cadastre.code,
    description: 'Rejoue les appels IGN et remplace ce qui en vient : contour cadastral, batiments et vegetation importes, zonage PLU. Les objets dessines a la main ne sont pas touches.',
    permission: PERMISSION_ECRITURE, actif: () => !ctx.actualisationEnCours(), executer: () => ctx.ouvrirDialogueActualisation()
  });

  cmd.declarer({
    id: 'projet.actualiser', libelle: 'Actualiser le projet', groupe: 'projet',
    capacite: CAPACITES.cadastre.code,
    permission: PERMISSION_ECRITURE, actif: () => !ctx.actualisationEnCours(), executer: () => ctx.ouvrirActualisationProjet()
  });

  return {
    proposerMiseAJour,
    enregistrerSansBruit: () => enregistrer(null),
    ouvrir(id) {
      if (ctx.etat.dirty) {
        showConfirm('Des modifications ne sont pas enregistrees. Changer de projet quand meme (elles seront perdues) ?', () => aller(id));
        return;
      }
      aller(id);
    }
  };
}
