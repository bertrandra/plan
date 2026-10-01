// Parametres de construction d une terrasse : valeurs par defaut et normalisation
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { LONGUEURS_BOIS_DEFAUT, LONGUEURS_LAMES_DEFAUT } from './prix.js';
import { LAME_RIVE_EPAISSEUR_M, PLOT_ASSISE_MIN_CM2, VIS_PRICE } from './constantes.js';
import { CHARGE_NORMALE_DEFAUT, CHARGE_SPA_DEFAUT, ENTRAXE_LAME_K, raideurDe, PORTEE_VIS_K } from './portees.js';
import type { Construction } from '../model/types.js';

/** Ce qui porte des parametres de construction : une terrasse du plan, ou une candidate a l'etude. */
export interface PorteurDeConstruction { construction?: Construction }

export function defaultConstruction(): Construction {
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
/**
 * Comble les manques d'une construction enregistree, et la rend.
 *
 * Elle comble **52 des 53 champs** de `Construction` (depuis le 21 septembre 2026 ; avant, 40, et
 * les treize autres n'etaient poses que par `defaultConstruction()`). Le seul qu'elle ne pose pas est
 * `bom`, qui est un resultat : `computeBOM` le recalcule.
 *
 * Le parametre n'exige pas un `ObjetPlan` complet, seulement ce qui porte la construction. Ce n'est
 * pas de la complaisance : `evaluerStructure` evalue des configurations candidates sur un objet
 * fabrique pour l'occasion — un contour et des parametres, sans clef ni nom — et c'est exactement
 * ce que la signature autorise.
 */
export function ensureConstruction(obj: PorteurDeConstruction): Construction {
  if(!obj.construction) obj.construction = defaultConstruction();
  if(obj.construction.hauteurVis===undefined) obj.construction.hauteurVis = 40;
  // 0 par defaut : un projet enregistre avant ce reglage garde exactement la hauteur qu'il avait,
  // tete arasee au niveau du sol.
  if(obj.construction.depassementVis===undefined) obj.construction.depassementVis = 0;
  if(obj.construction.avecLameRive===undefined) obj.construction.avecLameRive = false;
  if(obj.construction.hauteurLameRive===undefined) obj.construction.hauteurLameRive = 200;
  if(obj.construction.avecLamePlat===undefined) obj.construction.avecLamePlat = false;
  if(obj.construction.visModeAuto===undefined) obj.construction.visModeAuto = true;
  // Calibration values that used to be baked into the code. Backfilled with the constants they
  // replace, so a project saved before they existed keeps behaving exactly as it did.
  const k = obj.construction;
  if(k.chargeNormale===undefined) k.chargeNormale = CHARGE_NORMALE_DEFAUT;
  if(k.chargeSpa===undefined) k.chargeSpa = CHARGE_SPA_DEFAUT;
  if(k.kPortee===undefined) k.kPortee = PORTEE_VIS_K;
  if(k.kEntraxeLame===undefined) k.kEntraxeLame = ENTRAXE_LAME_K;
  if(k.coefRaideurLame===undefined) k.coefRaideurLame = raideurDe(k.essenceBois);
  if(k.jeuLames===undefined) k.jeuLames = 6;
  if(k.epaisseurLameRive===undefined) k.epaisseurLameRive = Math.round(LAME_RIVE_EPAISSEUR_M*1000);
  if(k.longueursLames===undefined) k.longueursLames = LONGUEURS_LAMES_DEFAUT.join(', ');
  if(k.chuteMinReutilisable===undefined) k.chuteMinReutilisable = 50;
  if(k.jointsSurAppui===undefined) k.jointsSurAppui = true;
  if(!k.prixLongueurs || typeof k.prixLongueurs !== 'object') k.prixLongueurs = {};
  if(k.longueursBois===undefined) k.longueursBois = LONGUEURS_BOIS_DEFAUT.join(', ');
  if(!k.prixLongueursBois || typeof k.prixLongueursBois !== 'object') k.prixLongueursBois = {};
  if(k.jointsBoisSurAppui===undefined) k.jointsBoisSurAppui = true;
  // A project saved before lambourdes had a section of their own keeps the solives' one, which
  // is what it was implicitly built with.
  if(k.lambourdeSection===undefined) k.lambourdeSection = k.soliveSection || '45x70';
  if(k.longueursLambourde===undefined) k.longueursLambourde = k.longueursBois || LONGUEURS_BOIS_DEFAUT.join(', ');
  if(!k.prixLongueursLambourde || typeof k.prixLongueursLambourde !== 'object') k.prixLongueursLambourde = {};
  // Mode plots. Un projet enregistre avant reste en vis de fondation et ne voit rien changer.
  if(k.typePose===undefined) k.typePose = 'vis-fondation';
  if(k.hauteurPlot===undefined) k.hauteurPlot = 10;
  if(k.plotModele===undefined) k.plotModele = 'auto';
  if(k.plotEntraxe===undefined) k.plotEntraxe = 65;
  if(k.plotEntraxeAuto===undefined) k.plotEntraxeAuto = true;
  if(k.plotAvecSolives===undefined) k.plotAvecSolives = false;
  if(k.plotSurfaceAssise===undefined) k.plotSurfaceAssise = PLOT_ASSISE_MIN_CM2;
  if(!k.prixPlots || typeof k.prixPlots !== 'object') k.prixPlots = {};
  if(k.supportType===undefined) k.supportType = 'concasse';
  if(k.supportDecaissement===undefined) k.supportDecaissement = 15;
  if(!k.cadences || typeof k.cadences !== 'object') k.cadences = {};
  if(k.equipe===undefined) k.equipe = 2;
  if(k.heuresJour===undefined) k.heuresJour = 7;
  if(k.echelleImplant===undefined) k.echelleImplant = 200;
  if(k.lames3dFilaire===undefined) k.lames3dFilaire = false;
  if(k.prixVisUnite===undefined) k.prixVisUnite = (VIS_PRICE.bas+VIS_PRICE.haut)/2;
  if(k.visParBoite===undefined) k.visParBoite = 1;
  // Les douze reglages que seule `defaultConstruction()` posait (MD/DEFAUTS.md, D-1). Un projet
  // enregistre avant leur existence recoit ici ce que le moteur lisait deja en leur absence : chaque
  // `||` de lecture repete la meme valeur, donc aucun nombre ne bouge. Sauf l'essence, qui reste
  // « autre » : c'est le tarif que ces projets ont toujours eu (`ESSENCE_PRICES.autre`), et leur
  // donner le pin classe 4 deplacerait un chiffrage. Elle est posee apres `coefRaideurLame`, qui
  // lit l'essence : « autre » n'a pas de raideur propre, comme l'absence n'en avait pas.
  if(k.visEntraxe===undefined) k.visEntraxe = 100;
  if(k.visEntraxeZoneSpa===undefined) k.visEntraxeZoneSpa = 60;
  if(k.visMargeZoneSpa===undefined) k.visMargeZoneSpa = 30;
  if(k.soliveEntraxe===undefined) k.soliveEntraxe = 40;
  if(k.soliveSection===undefined) k.soliveSection = '45x70';
  if(k.avecLambourde===undefined) k.avecLambourde = false;
  if(k.lambourdeEntraxe===undefined) k.lambourdeEntraxe = 40;
  if(k.sensPose===undefined) k.sensPose = 0;
  if(k.segmentReference===undefined) k.segmentReference = 0;
  if(k.essenceBois===undefined) k.essenceBois = 'autre';
  if(k.largeurLame===undefined) k.largeurLame = 140;
  if(k.epaisseurLame===undefined) k.epaisseurLame = 25;
  return obj.construction;
}

// How far a board really runs along its own axis. Its centreline stops where the centreline
// crosses the outline, but on an oblique end the two SIDES of the board stop somewhere else -
// one of them reaches past the centreline crossing. Measuring the centreline therefore both
// truncates the drawn board (leaving a notch at the edge, and a gap to its neighbour) and
