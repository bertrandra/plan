// « Fichier › Actualiser le projet » : tout ce qui vient de l'IGN, relu et recalcule avec la version
// en cours du programme, ramene aux valeurs par defaut ; ce qui a ete dessine a la main, intact.
//
// C'est l'actualisation IGN (app/actualisationIgn.ts) avec toutes ses etapes, et une de plus : avant
// d'etre relu, chaque objet importe (la parcelle, ses limites, les parcelles et le bati du voisinage,
// la vegetation, les arbres estimes) perd ce qu'on avait regle sur lui — couleurs, textures, gazon,
// couleur des murs, mode et forme du toit — pour recevoir ce qu'un import d'aujourd'hui lui donnerait :
// les toits relus sur le LiDAR, leur couleur sur l'orthophoto, celle des murs sur les photos de rue,
// la pelouse en 3D, le relief (sur toutes les parcelles quand le plan a un voisinage), le PLU.
//
// Restent : le nom, le masquage et le verrouillage des objets importes (des choix d'organisation du
// plan, pas d'apparence), les reponses aux questions sur les toits a cheval, la cloture de la parcelle
// et ses portails (un projet, pas un import), le plafond de points du relief. Une seule etape
// d'annulation : Ctrl+Z rend le projet d'avant.

import { dialogues } from '../shell/dialogues.js';
import { showToast } from '../shell/dialogs.js';
import { droitsCourants } from './acces.js';
import { CAPACITES } from '../plateforme/capacites.js';
import { actualiserDepuisIgn, type ContexteActualisation } from './actualisationIgn.js';
import type { ObjetPlan } from '../model/types.js';

/** Le plan a un voisinage cadastral : le relief se relit alors sur toutes ses parcelles. */
const aDesVoisines = (objets: readonly ObjetPlan[]) => objets.some(o => o.key !== 'parcelle' && !!o.cadastre?.idu);

/** Ce que le dialogue dit de l'actualisation, avant de la lancer. */
export const POINTS_ACTUALISATION = [
  'Relu à l’IGN et recalculé : la parcelle, les bâtiments de la parcelle et du voisinage, la végétation, les toits (LiDAR), la couleur des toits et des murs, le relief, le PLU.',
  'Remis aux valeurs par défaut : les couleurs et les textures de ces objets, le gazon en 3D, l’affichage du relief.',
  'Conservés : ce que vous avez dessiné, les noms, le masquage, la clôture et ses portails.',
  'Ctrl+Z rend le projet d’avant.'
];

/**
 * Ouvre la question, puis lance l'actualisation — ou dit pourquoi on ne peut pas : sans origine
 * cadastrale ni point de calage, il n'y a rien a relire.
 */
export function ouvrirActualisationProjet(ctx: ContexteActualisation): void {
  const parcelle = ctx.trouverParcelleCloture();
  const cad = parcelle?.cadastre;
  if (!parcelle || !cad?.section || !cad.numero || !cad.codeInsee || cad.origineLat === undefined || cad.origineLat === null || cad.origineLon === undefined || cad.origineLon === null) {
    showToast('Ce plan n’a pas d’origine cadastrale : créez-le avec « Fichier › Nouveau plan depuis une adresse » pour pouvoir l’actualiser.');
    return;
  }
  dialogues.ouvrir({
    type: 'choix', titre: 'Actualiser le projet',
    texte: 'Tout ce qui vient de l’IGN est relu et recalculé avec la version actuelle de Plan, comme à un import d’aujourd’hui.',
    points: POINTS_ACTUALISATION,
    principal: { libelle: 'Actualiser le projet', executer: () => { void lancerActualisationProjet(ctx); } },
    secondaire: { libelle: 'Annuler', executer: () => {} }
  });
}

/** L'actualisation elle-meme : toutes les etapes de l'actualisation IGN, objets importes ramenes aux valeurs par defaut. */
export function lancerActualisationProjet(ctx: ContexteActualisation): Promise<void> {
  const relief = droitsCourants().aCapacite(CAPACITES.relief.code);
  const toutes = aDesVoisines(ctx.etat.objects) || !!ctx.trouverParcelleCloture()?.relief?.paysage;
  return actualiserDepuisIgn({ portee: 'tout', voisinage: { actif: false }, relief: { actif: relief, toutesParcelles: toutes }, parDefaut: true }, ctx);
}
