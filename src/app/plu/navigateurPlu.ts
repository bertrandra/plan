// La lecture du PLU dans le navigateur (lot L4) : le client des routes `admin/claude/…` (le jeton de la plateforme, ou le cookie de
// l'admin), l'identite de la parcelle pour le journal du serveur, l'heure. Le client est relu a chaque lecture : une personne qui se
// connecte apres l'ouverture de la page y a droit sans recharger ; hors plateforme et hors admin, pas de client.

import { enAdmin, sessionCourante } from '../acces.js';
import { creerClientAnalyse } from '../../io/analyseClaude.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import type { ObjetPlan } from '../../model/types.js';
import type { ContexteLecturePlu } from './lecturePlu.js';

export function lecturePluDuNavigateur(etat: { objects: ObjetPlan[] }, projetCourant: () => string | null): ContexteLecturePlu {
  const jeton = () => sessionCourante()?.jeton()?.valeur ?? null;
  const client = creerClientAnalyse((entree, init) => fetch(entree, init), jeton);
  return {
    client: () => (enAdmin() || jeton() ? client : null),
    identite: () => {
      const cad = (parcelleDuProjet(etat.objects)?.cadastre ?? null) as { idu?: unknown; adresse?: unknown } | null;
      return { projet: projetCourant(), idu: typeof cad?.idu === 'string' ? cad.idu : null, adresse: typeof cad?.adresse === 'string' ? cad.adresse.slice(0, 300) : null };
    },
    maintenant: () => new Date(),
  };
}
