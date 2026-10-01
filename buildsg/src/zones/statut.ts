// Le statut d'enregistrement, en mots (spec-ihm-zones §4.7, spec-ihm-mobile §6.7).
//
// La barre d'etat l'ecrit en entier ; sur telephone, la barre haute en ecrit une forme courte sous
// le nom du projet. Une seule source, pour que les deux ne disent jamais deux choses differentes.

import type { ProjetObservable } from '../app/magasin.js';

export function texteStatut(p: ProjetObservable): string {
  return p.statut === 'local'
    ? 'Mode local — jeu de donnees de demonstration (api.php introuvable : aucune sauvegarde serveur).'
    : p.statut === 'enregistrement' ? 'Enregistrement…'
    : p.statut === 'modifie' ? 'Modifications non enregistrees'
    : (p.enregistreA || 'A jour');
}

export function texteStatutCourt(p: ProjetObservable): string {
  return p.statut === 'local' ? 'Mode local'
    : p.statut === 'enregistrement' ? 'Enregistrement…'
    : p.statut === 'modifie' ? 'Non enregistré'
    : (p.enregistreA || 'À jour');
}
