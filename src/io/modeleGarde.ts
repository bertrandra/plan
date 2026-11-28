// Ce que la question « Mettre a jour le modele ? » sait d'un projet, sur cet appareil (app/projet.ts).
//
// Un projet s'ecrit au plus petit schema qui le decrit (model/migrations.ts), pour rester lisible
// par les versions precedentes de Plan et par une plateforme qui n'accepte pas encore le dernier
// schema. Ouvert par une version plus recente, il est donc « en retard », et Plan propose de le
// monter. Deux cas ou la question n'a pas lieu d'etre, retenus ici par projet et pour le schema
// du programme :
//
// - la personne a repondu « Garder tel quel » ;
// - le projet vient d'etre cree par cette version (le premier pas, « Nouveau projet », l'import
//   cadastre) : il a ete ecrit au schema que ce programme a choisi pour lui, personne ne l'a garde
//   a l'ancien. Poser la question a sa premiere ouverture, c'etait demander a la personne de mettre
//   a jour ce qu'elle venait de creer (signale par le proprietaire, 8 novembre 2026).
//
// Le jour ou le schema du programme monte, la memoire ne vaut plus : le projet a ete ecrit par une
// version precedente, et la question revient, comme pour tout autre projet.

import { SCHEMA_VERSION } from '../model/version.js';

/** Cle localStorage, par projet ; la valeur est le schema du programme qui l'a retenu. */
const cle = (id: string) => 'planInteractif.modeleGarde.' + id;

/** Retient ce projet tel quel pour le schema `schema`, ou l'oublie (`null`). Sans stockage, la question reviendra. */
export function retenirModeleGarde(id: string, schema: number | null): void {
  try {
    if (schema === null) localStorage.removeItem(cle(id));
    else localStorage.setItem(cle(id), String(schema));
  } catch { /* navigation privee, stockage plein : rien a retenir */ }
}

/** Un projet que cette version vient de creer : rien a lui proposer tant que le schema du programme ne monte pas. */
export function retenirProjetNeuf(id: string): void {
  retenirModeleGarde(id, SCHEMA_VERSION);
}

/** Vrai si ce projet est garde tel quel (refus ou creation) pour le schema que ce programme propose. */
export function modeleGarde(id: string): boolean {
  try { return localStorage.getItem(cle(id)) === String(SCHEMA_VERSION); } catch { return false; }
}

/**
 * L'arrivee dans le projet qu'un import par adresse vient de creer (audit UX de la 5.45.0, constat 4) : il s'ouvre cadre sur la
 * maison et la terrasse de depart, une fois, dans cet onglet (io/api.ts, `ouvrirSurLaTerrasse`). Rouvert ensuite, il est cadre
 * sur son terrain comme tout projet.
 */
const CLE_ARRIVEE = 'planInteractif.arriveeImport';
export function retenirArriveeImport(id: string): void {
  try { sessionStorage.setItem(CLE_ARRIVEE, id); } catch { /* sans stockage : cadre sur le terrain */ }
}
/** Vrai une seule fois, a la premiere ouverture du projet que l'import vient de creer. */
export function prendreArriveeImport(id: string): boolean {
  try {
    if (sessionStorage.getItem(CLE_ARRIVEE) !== id) return false;
    sessionStorage.removeItem(CLE_ARRIVEE);
    return true;
  } catch { return false; }
}
