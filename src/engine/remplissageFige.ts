// FIGE : ce qu'un projet enregistre recoit a la relecture quand un reglage de construction lui manque (MD/roadmap-architecture.md,
// etape 1.1 ; AD-19). Chaque valeur est celle que le moteur lisait quand le champ n'existait pas encore : elle redonne exactement
// les nombres que le projet avait. Elles ne changent JAMAIS, sinon un ancien projet change de quantites sans numero de schema.
//
// Ce module n'importe rien, a dessein : une constante partagee (une charge, un catalogue de longueurs, la raideur d'une essence)
// ferait suivre au remplissage le moteur d'aujourd'hui. Un nouveau defaut pour une terrasse qu'on cree maintenant s'ecrit dans
// `constructionTerrasseNeuve` (engine/construction.ts), jamais ici. Un champ nouveau de `Construction` s'ajoute ici, avec la valeur
// qui redonne les anciens nombres. tests/unit/engine/remplissageFige.test.ts tient ces deux regles.

import type { Construction } from '../model/types.js';

/** La valeur posee quand le champ manque, champ par champ (dans l'ordre ou `ensureConstruction` les pose). */
export const REMPLISSAGE = Object.freeze({
  hauteurVis: 40, depassementVis: 0, avecLameRive: false, hauteurLameRive: 200, avecLamePlat: false, visModeAuto: true,
  chargeNormale: 250, chargeSpa: 500, kPortee: 25.8, kEntraxeLame: 18.5,
  jeuLames: 6, epaisseurLameRive: 22, longueursLames: '3, 2.5, 2, 1.7, 1.5', chuteMinReutilisable: 50, jointsSurAppui: true,
  longueursBois: '5, 4, 3, 2.5, 2', jointsBoisSurAppui: true, lambourdeSection: '45x70',
  typePose: 'vis-fondation', hauteurPlot: 10, plotModele: 'auto', plotEntraxe: 65, plotEntraxeAuto: true, plotAvecSolives: false,
  plotSurfaceAssise: 300, supportType: 'concasse', supportDecaissement: 15, equipe: 2, heuresJour: 7, echelleImplant: 200,
  lames3dFilaire: false, prixVisUnite: 35, visParBoite: 1,
  visEntraxe: 100, visEntraxeZoneSpa: 60, visMargeZoneSpa: 30, soliveEntraxe: 40, soliveSection: '45x70', avecLambourde: false,
  lambourdeEntraxe: 40, sensPose: 0, segmentReference: 0, essenceBois: 'autre', largeurLame: 140, epaisseurLame: 25
} as const);

/** La raideur d'une lame par essence, telle qu'elle etait lue quand `coefRaideurLame` n'existait pas. */
export const RAIDEUR_LAME_FIGEE: Readonly<Record<string, number>> = Object.freeze({
  'pin-classe4': 1.00, 'douglas': 1.00, 'exotique': 1.05, 'composite': 0.80, 'autre': 1.00
});

/** La raideur figee d'une essence ; une essence inconnue, ou aucune, vaut 1. */
export function raideurFigee(essence: string | undefined): number { return RAIDEUR_LAME_FIGEE[essence ?? ''] ?? 1; }

/** La construction entiere d'un projet enregistre sans construction (l'ancien `defaultConstruction`), neuve a chaque appel. */
export function constructionSansReglage(): Construction {
  return {
    typePose:'vis-fondation',
    hauteurVis:40, depassementVis:0,
    visModeAuto:true,
    chargeNormale:250, chargeSpa:500,
    kPortee:25.8, kEntraxeLame:18.5, coefRaideurLame:1.00,
    jeuLames:6, epaisseurLameRive:22,
    longueursLames:'3, 2.5, 2, 1.7, 1.5', chuteMinReutilisable:50, jointsSurAppui:true,
    prixLongueurs:{},
    longueursBois:'5, 4, 3, 2.5, 2', prixLongueursBois:{}, jointsBoisSurAppui:true,
    lambourdeSection:'45x70', longueursLambourde:'5, 4, 3, 2.5, 2', prixLongueursLambourde:{},
    prixVisUnite:35, visParBoite:1,
    hauteurPlot:10, plotModele:'auto', plotEntraxe:65, plotEntraxeAuto:true,
    plotAvecSolives:false, plotSurfaceAssise:300, prixPlots:{},
    supportType:'concasse', supportDecaissement:15,
    cadences:{}, equipe:2, heuresJour:7, echelleImplant:200, lames3dFilaire:false,
    visEntraxe:100, visEntraxeZoneSpa:60, visMargeZoneSpa:30,
    soliveEntraxe:40, soliveSection:'45x70',
    avecLambourde:false, lambourdeEntraxe:40,
    sensPose:0, segmentReference:0,
    essenceBois:'pin-classe4', largeurLame:140, epaisseurLame:25,
    avecLameRive:false, hauteurLameRive:200,
    avecLamePlat:false,
    bom:[]
  };
}
