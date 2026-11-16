// « Mes projets » (lot 2 de la simplification de l'IHM, 16 novembre 2026) : la liste des projets de la personne, dans Plan.
//
// Le lien « Mes projets ↗ » de la barre menait a la plateforme, dans un autre onglet : pour rouvrir hier son plan, il fallait y
// trouver le bon projet, puis revenir. La commande ouvre le dialogue (zones/parcours/MesProjets.tsx) sur la liste que Plan tient
// deja (la plateforme la donne au demarrage) ; la plateforme reste a un lien depuis le dialogue.

import { BACKPROD_API_URL, vitrinePlateforme } from '../plateforme/config.js';
import { contexteCourant, enAdmin, sessionCourante } from './acces.js';
import { parcours } from './parcours.js';
import type { RegistreCommandes } from './commandes.js';

/** Les projets de l'organisation sur la plateforme (la page qu'ouvrait le lien « Mes projets ↗ »). */
export function projetsSurLaPlateforme(): string {
  const slug = contexteCourant()?.courant()?.tenant.slug;
  return BACKPROD_API_URL.replace(/\/+$/, '') + (slug ? '/' + slug : '') + '/projects';
}

/** Declare `projet.mesProjets`, avec une session de la plateforme (pas d'essai, pas de partage, pas d'admin des demos). */
export function brancherMesProjets(cmd: RegistreCommandes, p: { apiDisponible: boolean; ouvrir: (id: string) => void }): void {
  if (!sessionCourante() || enAdmin()) return;
  cmd.declarer({
    id: 'projet.mesProjets', libelle: 'Mes projets', groupe: 'projet',
    description: 'La liste de vos projets : ouvrir l’un d’eux, ou en commencer un depuis une adresse',
    actif: () => p.apiDisponible,
    executer: () => parcours.ouvrir({ type: 'mesProjets', service: { ouvrir: p.ouvrir, offres: () => vitrinePlateforme(), plateforme: projetsSurLaPlateforme } })
  });
}
