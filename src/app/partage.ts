// « Partager par un lien… » (lot 6 du parcours client, ADR-073 de la plateforme) : la commande et le
// service du dialogue (zones/parcours/Partage.tsx).
//
// La commande suit les trois refus du registre (app/commandes.ts) :
// - **la fonction `project_sharing` manque a l'offre** : elle disparait, comme toute capacite ;
// - **le droit d'ecrire manque** (role sans `projects.write`, ou place de lecture `plan.readonly`) :
//   grisee, avec la phrase du droit ;
// - **le projet n'a jamais ete enregistre** : grisee, « Enregistrez d'abord le projet », puisque le lien
//   montre ce que la plateforme a de lui, et qu'elle n'en a rien.
//
// Elle n'existe que dans l'atelier branche a la plateforme : ni l'admin des demos (ses projets sont des
// fichiers du serveur de la page), ni la vitrine, ni le mode audit n'ont de session a qui demander un
// lien. Hors plateforme, elle n'est pas declaree du tout (le registre laisserait tout passer).

import { PERMISSION_ECRITURE, contexteCourant, enAdmin, sessionCourante } from './acces.js';
import { parcours, type ServicePartage } from './parcours.js';
import { CAPACITE_PARTAGE, creerServicePartage, type LienPartage } from '../plateforme/partage.js';
import type { RegistreCommandes } from './commandes.js';
import type { ProjetResume } from '../io/api.js';

export const RAISON_JAMAIS_ENREGISTRE = 'Enregistrez d’abord le projet : le lien montre la dernière version enregistrée.';

export interface ProjetPartageable {
  /** Le projet ouvert chez la plateforme, ou rien (un plan vierge, avant « Nouveau projet »). */
  courant: ProjetResume | null;
  /** La plateforme a-t-elle un document de ce projet ? Faux pour un projet neuf jamais enregistre. */
  ecrit(): boolean;
  /** Des modifications non enregistrees. */
  modifie(): boolean;
}

/** Declare `projet.partager`, si une session de la plateforme existe (voir plus haut). */
export function brancherPartage(cmd: RegistreCommandes, p: ProjetPartageable): void {
  const session = sessionCourante();
  if (!session || enAdmin()) return;
  const plateforme = creerServicePartage(session);
  const courant = p.courant;
  const service: ServicePartage | null = courant && {
    nom: () => courant.name,
    modifie: p.modifie,
    // Le contexte peut etre sorti du cache (`token_expires_at`) : il se relit, plutot que de proposer un nom vide.
    nomPropose: async () => {
      const c = contexteCourant();
      return (c?.courant() ?? await c?.charger().catch(() => null))?.user.display_name ?? '';
    },
    lister: () => plateforme.lister(courant.id),
    creer: (o) => plateforme.creer(courant.id, o),
    retirer: (id) => plateforme.retirer(courant.id, id)
  };
  cmd.declarer({
    id: 'projet.partager', libelle: 'Partager par un lien…', groupe: 'projet',
    capacite: CAPACITE_PARTAGE, permission: PERMISSION_ECRITURE,
    description: 'Crée un lien en lecture seule vers ce projet : la personne qui le reçoit voit le plan, la 3D et le chiffrage sans compte, jusqu’à la date choisie',
    actif: () => !!service && p.ecrit(),
    raisonInactive: () => RAISON_JAMAIS_ENREGISTRE,
    executer: () => { if (service) parcours.ouvrir({ type: 'partage', service }); }
  });
}

/** Une date de la plateforme, a la francaise : « 16 décembre 2026 ». */
export function dateLongue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  // « 1er décembre » et non « 1 décembre » : l'usage du francais pour le premier du mois.
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/^1 /, '1er ');
}

/** Les durees du dialogue, en mots. */
export function libelleDuree(jours: number): string {
  return jours === 365 ? '1 an' : jours + ' jours';
}

/** L'etat d'un lien, en mots : la couleur ne le porte jamais seule. */
export const LIBELLE_ETAT: Record<LienPartage['status'], string> = { ACTIVE: 'Actif', EXPIRED: 'Expiré', REVOKED: 'Retiré' };

/** La phrase qui dit ce que le lien montre, et jusqu'a quand. */
export function phraseDuLien(expireLe: string): string {
  return 'Toute personne qui a ce lien voit ce projet tel qu’il est enregistré, sans pouvoir le modifier, jusqu’au ' + dateLongue(expireLe) + '.';
}
