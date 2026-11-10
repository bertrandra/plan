// Parametres de construction d une terrasse : valeurs par defaut et normalisation
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

// Le remplissage d'un ancien projet lit des valeurs figees, jamais les constantes du moteur d'aujourd'hui (AD-19).
import { REMPLISSAGE as F, constructionSansReglage, raideurFigee } from './remplissageFige.js';
import type { Construction } from '../model/types.js';

/** Ce qui porte des parametres de construction : une terrasse du plan, ou une candidate a l'etude. */
export interface PorteurDeConstruction { construction?: Construction }

/**
 * Ce qu'un projet enregistre sans construction recoit a la relecture : figee (engine/remplissageFige.ts), pour qu'il redonne
 * toujours les memes quantites. Une terrasse neuve part de `constructionTerrasseNeuve`, qui seul peut suivre les reglages d'aujourd'hui.
 */
export function defaultConstruction(): Construction {
  return constructionSansReglage();
}
/**
 * La construction d'une terrasse qu'on cree maintenant : posee sur plots, le cas le plus courant
 * d'une terrasse de jardin. `defaultConstruction` garde la vis de fondation : c'est ce qu'un projet
 * enregistre sans construction recoit a l'ouverture, et il doit redonner les memes quantites. C'est
 * ici, et seulement ici, qu'un reglage par defaut d'aujourd'hui change : on le pose par-dessus la
 * construction figee, qui elle ne bouge pas (engine/remplissageFige.ts).
 */
export function constructionTerrasseNeuve(): Construction {
  return { ...defaultConstruction(), typePose:'plots', plotsDansEmprise:true };
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
  if(k.chargeNormale===undefined) k.chargeNormale = F.chargeNormale;
  if(k.chargeSpa===undefined) k.chargeSpa = F.chargeSpa;
  if(k.kPortee===undefined) k.kPortee = F.kPortee;
  if(k.kEntraxeLame===undefined) k.kEntraxeLame = F.kEntraxeLame;
  if(k.coefRaideurLame===undefined) k.coefRaideurLame = raideurFigee(k.essenceBois);
  if(k.jeuLames===undefined) k.jeuLames = 6;
  if(k.epaisseurLameRive===undefined) k.epaisseurLameRive = F.epaisseurLameRive;
  if(k.longueursLames===undefined) k.longueursLames = F.longueursLames;
  if(k.chuteMinReutilisable===undefined) k.chuteMinReutilisable = 50;
  if(k.jointsSurAppui===undefined) k.jointsSurAppui = true;
  if(!k.prixLongueurs || typeof k.prixLongueurs !== 'object') k.prixLongueurs = {};
  if(k.longueursBois===undefined) k.longueursBois = F.longueursBois;
  if(!k.prixLongueursBois || typeof k.prixLongueursBois !== 'object') k.prixLongueursBois = {};
  if(k.jointsBoisSurAppui===undefined) k.jointsBoisSurAppui = true;
  // A project saved before lambourdes had a section of their own keeps the solives' one, which
  // is what it was implicitly built with.
  if(k.lambourdeSection===undefined) k.lambourdeSection = k.soliveSection || '45x70';
  if(k.longueursLambourde===undefined) k.longueursLambourde = k.longueursBois || F.longueursBois;
  if(!k.prixLongueursLambourde || typeof k.prixLongueursLambourde !== 'object') k.prixLongueursLambourde = {};
  // Mode plots. Un projet enregistre avant reste en vis de fondation et ne voit rien changer.
  if(k.typePose===undefined) k.typePose = 'vis-fondation';
  if(k.hauteurPlot===undefined) k.hauteurPlot = 10;
  if(k.plotModele===undefined) k.plotModele = 'auto';
  if(k.plotEntraxe===undefined) k.plotEntraxe = 65;
  if(k.plotEntraxeAuto===undefined) k.plotEntraxeAuto = true;
  if(k.plotAvecSolives===undefined) k.plotAvecSolives = false;
  if(k.plotSurfaceAssise===undefined) k.plotSurfaceAssise = F.plotSurfaceAssise;
  if(!k.prixPlots || typeof k.prixPlots !== 'object') k.prixPlots = {};
  if(k.supportType===undefined) k.supportType = 'concasse';
  if(k.supportDecaissement===undefined) k.supportDecaissement = 15;
  if(!k.cadences || typeof k.cadences !== 'object') k.cadences = {};
  if(k.equipe===undefined) k.equipe = 2;
  if(k.heuresJour===undefined) k.heuresJour = 7;
  if(k.echelleImplant===undefined) k.echelleImplant = 200;
  if(k.lames3dFilaire===undefined) k.lames3dFilaire = false;
  if(k.prixVisUnite===undefined) k.prixVisUnite = F.prixVisUnite;
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
