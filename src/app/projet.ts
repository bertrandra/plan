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

import { showConfirm, showPrompt, showToast, showErrBanner } from '../shell/dialogs.js';
import { APP_VERSION, SCHEMA_VERSION } from '../model/version.js';
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
}

/** Ce que les commandes de projet demandent au reste du programme. */
export interface ContexteProjet {
  etat: EtatApp;
  apiSave: (payload: unknown) => Promise<{ id: string; updatedAt?: string }>;
  apiDelete: (id: string) => Promise<unknown>;
  serializeObjects: (objs: ObjetPlan[]) => ObjetBrut[];
  serializeMeasures: (ms: Mesure[]) => unknown[];
  initialState: () => ObjetBrut[];
  initialMeasures: () => unknown[];
  withProjectParam: (id: string) => string;
  cleDernierProjet: string;
  /** Branche le rafraichissement du statut sur l'historique, qui sait quand le plan devient sale. */
  definirRafraichisseurStatut: (f: () => void) => void;
  ouvrirImportCadastre: () => void;
  /** Le bouton qui a demande l'actualisation : le dialogue le desarme pendant l'appel. */
  ouvrirDialogueActualisation: (bouton: HTMLButtonElement) => void;
}

export interface Projet {
  /** Change de projet ; demande confirmation si le plan courant a des modifications. */
  ouvrir(id: string): void;
}

const heure = (iso: string | number) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function creerProjet(seed: SeedProjet, ctx: ContexteProjet, magasin: Magasin, cmd: RegistreCommandes): Projet {
  const courant = seed.meta ?? null;
  let enregistreA = courant && courant.updatedAt ? 'Enregistre a ' + heure(courant.updatedAt) : '';

  function publier(statut?: 'enregistrement'): void {
    magasin.definirProjet({
      apiDisponible: seed.apiAvailable, courant, liste: seed.list, enregistreA,
      statut: statut ?? (!seed.apiAvailable ? 'local' : ctx.etat.dirty ? 'modifie' : 'a-jour')
    });
  }
  ctx.definirRafraichisseurStatut(() => publier());
  publier();

  function aller(id: string): void {
    localStorage.setItem(ctx.cleDernierProjet, id);
    location.href = ctx.withProjectParam(id);
  }

  const charge = () => ({
    appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION,
    objects: ctx.serializeObjects(ctx.etat.objects), measures: ctx.serializeMeasures(ctx.etat.measures)
  });

  cmd.declarer({
    id: 'projet.nouveau', libelle: 'Nouveau projet', groupe: 'projet',
    permission: 'projects.write', quota: 'plan.documents',
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
    permission: 'projects.write',
    actif: () => seed.apiAvailable && !!courant,
    executer: async () => {
      if (!courant) return;
      publier('enregistrement');
      try {
        const res = await ctx.apiSave({ id: courant.id, name: courant.name, ...charge() });
        ctx.etat.dirty = false;
        enregistreA = 'Enregistre a ' + heure(res.updatedAt || Date.now());
        ctx.initialState().length = 0;
        ctx.initialState().push(...ctx.serializeObjects(ctx.etat.objects));
        ctx.initialMeasures().length = 0;
        ctx.initialMeasures().push(...ctx.serializeMeasures(ctx.etat.measures));
        showToast('Projet enregistre.');
      } catch (e) {
        showErrBanner('Echec de l\'enregistrement : ' + ((e as Error).message || e));
      } finally {
        publier();
      }
    }
  });

  cmd.declarer({
    id: 'projet.supprimer', libelle: 'Supprimer', groupe: 'projet',
    permission: 'projects.write',
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
    permission: 'projects.write', quota: 'plan.documents',
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
    description: 'Rejoue les appels IGN et remplace ce qui en vient : contour cadastral, batiments et vegetation importes, zonage PLU. Les objets dessines a la main ne sont pas touches.',
    executer: (source) => { if (source) ctx.ouvrirDialogueActualisation(source as HTMLButtonElement); }
  });

  return {
    ouvrir(id) {
      if (ctx.etat.dirty) {
        showConfirm('Des modifications ne sont pas enregistrees. Changer de projet quand meme (elles seront perdues) ?', () => aller(id));
        return;
      }
      aller(id);
    }
  };
}
