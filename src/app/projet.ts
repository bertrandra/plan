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

import { PERMISSION_ECRITURE, limiteProjetsCourante } from './acces.js';
import { QUOTA_PROJETS } from '../plateforme/quotaProjets.js';
import { CAPACITES } from '../plateforme/capacites.js';
import { showConfirm, showPrompt, showToast, showErrBanner } from '../shell/dialogs.js';
import { dialogues } from '../shell/dialogues.js';
import { schemaAEcrire, migrationsDepuis } from '../model/migrations.js';
import { APP_VERSION, SCHEMA_VERSION } from '../model/version.js';
import type { ObjetSerialise } from '../model/creation.js';
import type { EtatApp } from '../core/state.js';
import type { ProjetResume } from '../io/api.js';
import type { ObjetBrut, ObjetPlan, Mesure } from '../model/types.js';
import type { RegistreCommandes } from './commandes.js';
import type { Magasin } from './magasin.js';

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
  /** Branche le rafraichissement du statut sur l'historique, qui sait quand le plan devient sale. */
  definirRafraichisseurStatut: (f: () => void) => void;
  ouvrirImportCadastre: () => void;
  ouvrirDialogueActualisation: () => void;
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
function chargeDuProjet(ctx: ContexteProjet) {
  const objects = ctx.serializeObjects(ctx.etat.objects);
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

export function creerProjet(seed: SeedProjet, ctx: ContexteProjet, magasin: Magasin, cmd: RegistreCommandes): Projet {
  const courant = seed.meta ?? null;
  let enregistreA = courant && courant.updatedAt ? 'Enregistré à ' + heure(courant.updatedAt) : '';

  function publier(statut?: 'enregistrement'): void {
    magasin.definirProjet({
      apiDisponible: seed.apiAvailable, courant, liste: seed.list, enregistreA,
      schemaEnRetard: enRetard(),
      quota: seed.apiAvailable ? limiteProjetsCourante() : null,
      statut: statut ?? (!seed.apiAvailable ? 'local' : ctx.etat.dirty ? 'modifie' : 'a-jour')
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
    return seed.apiAvailable && !!courant && schemaAEcrire(ctx.etat.objects, ctx.etat.schemaProjet) < SCHEMA_VERSION;
  }

  const charge = () => chargeDuProjet(ctx);

  /** Enregistre le projet ouvert ; rend vrai si la plateforme l'a accepte. */
  async function enregistrer(annonce: string): Promise<boolean> {
    if (!courant) return false;
    publier('enregistrement');
    try {
      const donnees = charge();
      const res = await ctx.apiSave({ id: courant.id, name: courant.name, ...donnees });
      // Ce qui a ete ecrit devient le plancher : un releve ajoute puis retire ne redescend pas le projet.
      ctx.etat.schemaProjet = donnees.schemaVersion;
      ctx.etat.dirty = false;
      enregistreA = 'Enregistré à ' + heure(res.updatedAt || Date.now());
      ctx.initialState().length = 0;
      ctx.initialState().push(...ctx.serializeObjects(ctx.etat.objects));
      ctx.initialMeasures().length = 0;
      ctx.initialMeasures().push(...ctx.serializeMeasures(ctx.etat.measures));
      showToast(annonce);
      return true;
    } catch (e) {
      showErrBanner('Echec de l\'enregistrement : ' + ((e as Error).message || e));
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
    id: 'projet.supprimer', libelle: 'Supprimer', groupe: 'projet',
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

  return {
    proposerMiseAJour,
    ouvrir(id) {
      if (ctx.etat.dirty) {
        showConfirm('Des modifications ne sont pas enregistrees. Changer de projet quand meme (elles seront perdues) ?', () => aller(id));
        return;
      }
      aller(id);
    }
  };
}
