// « Fichier › Actualiser le projet » : tout ce qui vient de l'IGN, relu et recalcule avec la version
// en cours du programme, ramene aux valeurs par defaut ; ce qui a ete dessine a la main, intact.
//
// C'est l'actualisation IGN (app/actualisationIgn.ts) avec toutes ses etapes, et deux de plus :
// - les batiments de la parcelle du projet, importes ou dessines, sont supprimes puis recrees depuis la
//   BD TOPO, comme a un import d'aujourd'hui (nom, contour, hauteur, toit) ; si la BD TOPO ne repond
//   pas, ils restent tels quels plutot que de laisser la parcelle vide ;
// - avant d'etre relu, chaque autre objet importe (la parcelle, ses limites, les parcelles et le bati
//   du voisinage, la vegetation, les arbres estimes) perd ce qu'on avait regle sur lui — couleurs,
//   textures, gazon, couleur des murs, mode et forme du toit.
// Tous recoivent ce qu'un import d'aujourd'hui leur donnerait : les toits relus sur le LiDAR, leur
// couleur sur l'orthophoto, celle des murs sur les photos de rue, la pelouse en 3D, le relief (sur
// toutes les parcelles quand le plan a un voisinage), le PLU.
//
// Restent : le reste de ce qui a ete dessine, le nom, le masquage et le verrouillage des objets
// importes hors batiments de la parcelle (des choix d'organisation du plan, pas d'apparence), les
// reponses aux questions sur les toits a cheval, la cloture de la parcelle et ses portails (un projet,
// pas un import), le plafond de points du relief. Une seule etape d'annulation : Ctrl+Z rend le projet
// d'avant.
//
// Restent aussi, sauf demande expresse, les batiments verifies sur place par un audit de la parcelle
// (model/toitVerifie.ts, MD/spec-audit.md §14.5) : c'est le 100 % du projet, qu'un import
// d'aujourd'hui ne vaut pas. La case « Recalculer aussi… » du dialogue les remet dans le lot.

import { dialogues } from '../shell/dialogues.js';
import { showToast } from '../shell/dialogs.js';
import { droitsCourants } from './acces.js';
import { CAPACITES } from '../plateforme/capacites.js';
import { actualiserDepuisIgn, type ContexteActualisation, type OptionsActualisation } from './actualisationIgn.js';
import { estVerifieSurPlace } from '../model/toitVerifie.js';
import type { ObjetPlan } from '../model/types.js';

/** Le plan a un voisinage cadastral : le relief se relit alors sur toutes ses parcelles. */
const aDesVoisines = (objets: readonly ObjetPlan[]) => objets.some(o => o.key !== 'parcelle' && !!o.cadastre?.idu);

/** Ce que le dialogue dit de l'actualisation, avant de la lancer. */
export const POINTS_ACTUALISATION = [
  'Supprimés puis recréés depuis la BD TOPO : tous les bâtiments de la parcelle du projet, même ceux que vous avez dessinés (nom, contour, hauteur et toit d’un import d’aujourd’hui).',
  'Relu à l’IGN et recalculé : la parcelle, les bâtiments du voisinage, la végétation, les toits (LiDAR), la couleur des toits et des murs, le relief, le PLU.',
  'Remis aux valeurs par défaut : les couleurs et les textures de ces objets, le gazon en 3D, l’affichage du relief.',
  'Conservés : le reste de ce que vous avez dessiné, les noms et le masquage des autres objets, la clôture et ses portails.',
  'Ctrl+Z rend le projet d’avant.'
];
/** Le point de plus quand le plan a des batiments verifies sur place : ils sont conserves, sauf si la case le demande. */
export const POINT_VERIFIES = 'Conservés tels quels, sauf si vous cochez la case : les bâtiments vérifiés sur place lors d’un audit de la parcelle (toit, façades, cheminées).';

/** Les batiments du plan verifies sur place : ils ne sont recalcules que si la case le demande. */
export const batimentsVerifies = (objets: readonly ObjetPlan[]): ObjetPlan[] => objets.filter((o) => o.fonction === 'batiment' && estVerifieSurPlace(o));

/** Les points du dialogue pour ce plan : les points de toujours, et celui des batiments verifies s'il y en a. */
export const pointsActualisation = (nVerifies: number): string[] => nVerifies ? [...POINTS_ACTUALISATION.slice(0, -1), POINT_VERIFIES, ...POINTS_ACTUALISATION.slice(-1)] : POINTS_ACTUALISATION;

/** Le libelle de la case : un batiment nomme, ou leur nombre. */
export function libelleCaseVerifies(verifies: readonly ObjetPlan[]): string {
  const un = verifies.length === 1 ? verifies[0] : undefined;
  const date = (o: ObjetPlan) => { const [a, m, j] = (o.verifieSurPlace?.date ?? '').split('-'); return a && m && j ? ' le ' + j + '/' + m + '/' + a : ''; };
  return un ? 'Recalculer aussi « ' + (un.name || 'Bâtiment') + ' », vérifié sur place' + date(un)
    : 'Recalculer aussi les ' + verifies.length + ' bâtiments vérifiés sur place';
}

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
  // Les batiments verifies sur place restent, sauf si la case est cochee : decochee a chaque ouverture.
  const verifies = batimentsVerifies(ctx.etat.objects);
  let relire = false;
  dialogues.ouvrir({
    type: 'choix', titre: 'Actualiser le projet',
    texte: 'Tout ce qui vient de l’IGN est relu et recalculé avec la version actuelle de Plan, comme à un import d’aujourd’hui.',
    points: pointsActualisation(verifies.length),
    ...(verifies.length ? { case: { libelle: libelleCaseVerifies(verifies), cochee: false, changer: (c: boolean) => { relire = c; } } } : {}),
    principal: { libelle: 'Actualiser le projet', executer: () => { void lancerActualisationProjet(ctx, relire ? 'relire' : 'garder'); } },
    secondaire: { libelle: 'Annuler', executer: () => {} }
  });
}

/**
 * L'actualisation elle-meme : toutes les etapes de l'actualisation IGN, objets importes ramenes aux
 * valeurs par defaut. `verifies` : ce qu'on fait des batiments verifies sur place (gardes par defaut).
 */
export function lancerActualisationProjet(ctx: ContexteActualisation, verifies: OptionsActualisation['verifies'] = 'garder'): Promise<void> {
  const relief = droitsCourants().aCapacite(CAPACITES.relief.code);
  const toutes = aDesVoisines(ctx.etat.objects) || !!ctx.trouverParcelleCloture()?.relief?.paysage;
  return actualiserDepuisIgn({ portee: 'tout', voisinage: { actif: false }, relief: { actif: relief, toutesParcelles: toutes }, parDefaut: true, recreerBatiments: true, verifies }, ctx);
}
