// Le statut d'enregistrement, en mots (spec-ihm-zones §4.7, spec-ihm-mobile §6.7).
//
// La barre d'etat l'ecrit en entier ; sur telephone, la barre haute en ecrit une forme courte sous
// le nom du projet. Une seule source, pour que les deux ne disent jamais deux choses differentes.

import type { ProjetObservable } from '../app/magasin.js';

// Un plan qui n'est pas encore un projet (le premier pas « Dessiner sans adresse ») ne s'enregistre pas de lui-meme : creer le
// projet compte dans le quota de l'organisation (app/enregistrementAuto.ts). La barre le dit, et dit quoi faire.
const pasEncoreUnProjet = (p: ProjetObservable) => p.apiDisponible && !p.courant;

export function texteStatut(p: ProjetObservable): string {
  return p.statut === 'local'
    ? 'Mode local — jeu de donnees de demonstration (api.php introuvable : aucune sauvegarde serveur).'
    : p.statut === 'partage' ? 'Projet partagé, en lecture seule : rien ne s’enregistre.'
    : p.statut === 'enregistrement' ? 'Enregistrement…'
    : p.statut === 'modifie' ? (p.echec || (pasEncoreUnProjet(p) ? 'Pas encore enregistré : Fichier › Nouveau projet pour le garder' : 'Modifications non enregistrées'))
    : (p.enregistreA || (pasEncoreUnProjet(p) ? 'Pas encore enregistré' : 'À jour'));
}

export function texteStatutCourt(p: ProjetObservable): string {
  return p.statut === 'local' ? 'Mode local'
    : p.statut === 'partage' ? 'Projet partagé'
    : p.statut === 'enregistrement' ? 'Enregistrement…'
    : p.statut === 'modifie' ? (p.echec ? p.echec.replace('Échec de l’enregistrement', 'Échec').replace(/ — nouvelle tentative à .*$/, '') : pasEncoreUnProjet(p) ? 'Pas encore enregistré' : 'Non enregistré')
    : (p.enregistreA || (pasEncoreUnProjet(p) ? 'Pas encore enregistré' : 'À jour'));
}
