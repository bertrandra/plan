// L actualisation IGN : un objet de la BD TOPO sur son contour du jour (ce que model/protections.ts lui permet d'ecrire, ce qui
// suit le contour), la couverture, les volumes, les toits lus au LiDAR et la couleur des murs des batiments relus ; et ce qu'elle
// garde tel quel (batiments verifies sur place, batiments au toit regle a la main, objets retouches a la main).
// Un morceau de app/cadastre/actualisationIgn.ts, qui le reexporte : le reste du programme importe depuis lui.

import { estOuvrage, BATIMENT } from '../../../model/ouvrages/index.js';
import { etape, type ContexteActualisation } from './progression.js';
import { volumesParDefaut } from '../../../model/volumesToit.js';
import { couleursToitsDepuisOrtho } from '../../../render/couleurToitOrtho.js';
import { toitsDepuisLidar, texteBilanToitsLidar } from '../../toits/toitsLidar.js';
import { couleursMursDepuisPhotos, texteBilanCouleursMurs } from '../../../render/couleurMurPhoto.js';
import { materiauMurs } from '../../../model/couleurMur.js';
import { NIVEAU, NIVEAU_ORIGINE, ecrivainPeut, origineActuelle, type ContexteEcriture, type Origine } from '../../../model/protections.js';
import { estBatiment } from '../../../model/fonctions.js';
import { nombreFr } from '../../../util/format.js';
import { centroid, pointInPolygon } from '../../../geometry/basic.js';
import { materiauxBdTopo, hauteurBatiment, hauteurVegetation } from '../../../geo/bdtopo.js';
import { toitActualise, attributsToitBdTopo } from '../../../model/toitBdTopo.js';
import { COUCHE_BATIMENT } from '../../../geo/apiIgn.js';
import { memeFormeDeplacee, mesuresSuivent, suivreDeformation } from '../../../model/contourDeforme.js';
import { estRetoucheMain, libelleReprendre } from '../../../model/retouche.js';
import type { ProjecteurLocal } from '../../../geo/projection.js';
import type { Mesure, ObjetBrut, ObjetPlan, ObjetPolygone, PtBrut, Toit, VolumeToit } from '../../../model/types.js';
import type { OptionsActualisation } from '../optionsActualisation.js';

/**
 * La couverture des toits, lue sur l'orthophoto (MD/spec-toit-ign.md §6.1) : une couleur choisie par
 * l'utilisateur n'est pas touchee, ni celle d'un batiment verifie sur place sans « Recalculer aussi »
 * (model/protections.ts) ; un WMTS injoignable laisse les toits tels quels.
 */
async function couleursDesToits(objets: ObjetBrut[], proj: ProjecteurLocal, bilan: string[], options: OptionsActualisation): Promise<void> {
  etape('la couleur des toits sur l’orthophoto…');
  const c = await couleursToitsDepuisOrtho(objets, proj, undefined, 1, { relireVerifies: options.verifies === 'relire' }).catch(() => null);
  if(!c || !(c.lus + c.replis)) return;
  bilan.push(c.lus + ' couleur(s) de toit lue(s) sur l\'orthophoto' +
    (c.replis ? ', ' + c.replis + ' couverture(s) rouge, brune ou grise faute de photo lisible' : ''));
}

/**
 * Un toit recalcule sur la parcelle du projet retrouve ses volumes par defaut, et perd son toit
 * mesure, qui suivait l'ancien contour (le LiDAR relit les deux ensuite) ; sinon rien a ecrire.
 */
export function volumesRecalcules(o: { batiment?: { toit?: Toit | null } | null; bdtopo?: unknown }, pts: PtBrut[], toit: Toit | undefined): VolumeToit[] | null | undefined {
  if (!toit || toit === o.batiment?.toit || (o.bdtopo as { surParcellePrincipale?: unknown } | undefined)?.surParcellePrincipale !== true) return undefined;
  return volumesParDefaut(pts, toit);
}

/**
 * Les objets que cette actualisation garde tels quels : les batiments verifies sur place, sauf si
 * l'utilisateur a demande de les recalculer, et les objets retouches a la main (parcelle comprise,
 * model/retouche.ts), sauf ceux dont il reprend la version de l'IGN. Avec eux, les identifiants BD TOPO
 * qu'ils portent : un batiment frais de la parcelle qui les porte n'est pas recree a cote d'eux.
 */
export function batimentsGardes(objets: readonly ObjetBrut[], options: OptionsActualisation): { garde: (o: ObjetBrut) => boolean; ids: ReadonlySet<string> } {
  // Garde entier : un contour de la personne ou vu sur place (model/protections.ts, niveaux 1 et 2). Un batiment dessine ne l'est
  // pas : « Actualiser le projet » le recree parce que la personne l'a demande, c'est son dernier geste.
  const garde = (o: ObjetBrut) => { const n = origineActuelle(o, 'contour', contexteActualisation(o, options)); return n !== 'dessine' && NIVEAU_ORIGINE[n] <= NIVEAU.surPlace; };
  const ids = new Set(objets.filter(garde).map(o => (o.bdtopo as { id?: string } | null | undefined)?.id).filter((id): id is string => !!id));
  return { garde, ids };
}

/**
 * Pourquoi un objet garde l'est (model/protections.ts, origine du contour) : `retouche` (a la main), `fige` (son toit regle a la
 * main, « Règles » coupees) ou `verifie` (sur place). Le bilan les dit chacun par son nom.
 */
export const raisonDeGarder = (o: ObjetBrut, options: OptionsActualisation): Origine => origineActuelle(o, 'contour', contexteActualisation(o, options));

/** Les batiments au toit regle a la main (« Règles » coupees), ni retouches ni verifies : l'actualisation les garde tels quels. */
export const batimentsFiges = (objets: readonly ObjetPlan[]): ObjetPlan[] => objets.filter((o) => estBatiment(o) && origineActuelle(o, 'contour') === 'fige');

/** Un batiment pose sur la parcelle du projet : importe pour elle, ou dont le centre tombe dessus (dessine compris). */
export function batimentSurLaParcelle(o: ObjetBrut, parcelle: PtBrut[]): boolean {
  if(!estOuvrage(o, BATIMENT)) return false;
  if((o.bdtopo as { surParcellePrincipale?: unknown } | null | undefined)?.surParcellePrincipale === true) return true;
  const pts = o.type === 'polygon' ? (o as Partial<ObjetPolygone>).pts : undefined;
  return !!pts && pts.length >= 3 && pointInPolygon(centroid(pts), parcelle);
}

/** Un batiment que la BD TOPO rattache desormais a la parcelle : il porte l'identifiant d'un batiment frais de la parcelle. */
export function batimentRattache(o: ObjetBrut, ids: ReadonlySet<string | undefined>): boolean {
  return estOuvrage(o, BATIMENT) && ids.has((o.bdtopo as { id?: string } | null | undefined)?.id);
}

/** Ce que la personne a demande a cette actualisation pour cet objet : « Recalculer aussi » les verifies, reprendre la version de l'IGN. */
export function contexteActualisation(o: ObjetBrut, options: OptionsActualisation): ContexteEcriture {
  return { relireVerifies: options.verifies === 'relire', reprendreIgn: (options.reprendre ?? []).includes(o.key as string) };
}

/**
 * Les objets venus du cadastre ou de l'IGN que la personne a retouches a la main (model/retouche.ts) : l'actualisation les garde
 * tels quels, sauf ceux dont elle coche « Reprendre la version de l'IGN ». La parcelle du projet d'abord, puis l'ordre du plan.
 */
export function objetsRetouches(objets: readonly ObjetPlan[]): { cle: string; libelle: string }[] {
  return objets.filter(estRetoucheMain).sort((a, b) => Number(b.key === 'parcelle') - Number(a.key === 'parcelle'))
    .map(o => ({ cle: o.key, libelle: libelleReprendre(o) }));
}

/** Un objet repris a sa source perd le marque de sa retouche (un objet frais n'en a pas). */
export function sansRetouche<T extends ObjetBrut>(o: T): T {
  if (!estRetoucheMain(o)) return o;
  const copie = { ...o };
  delete copie.retoucheMain;
  return copie;
}

/**
 * Ce que les lectures qui suivent poseraient sur un batiment garde (couleur du toit, forme lue au LiDAR, couleur des murs), remis
 * apres elles : rend la remise. L'actualisation n'a le droit de rien ecrire sur lui (model/protections.ts) : il ressort tel que la
 * personne l'a laisse, son toit et sa hauteur compris.
 */
function figer(o: ObjetBrut): () => void {
  const batiment = structuredClone(o.batiment), elevation = o.elevation;
  return () => { if (batiment === undefined) delete o.batiment; else o.batiment = batiment; if (elevation === undefined) delete o.elevation; else o.elevation = elevation; };
}

/**
 * La couverture des toits, leur forme, puis la couleur des murs, qui lit la hauteur a l'egout corrigee
 * par le LiDAR. Un batiment garde (verifie sur place) ressort tel qu'il est entre.
 */
export async function toitsEtMurs(objets: ObjetBrut[], proj: ProjecteurLocal, bilan: string[], ctx: ContexteActualisation, options: OptionsActualisation): Promise<void> {
  const remises = objets.filter(batimentsGardes(objets, options).garde).map(figer);
  await couleursDesToits(objets, proj, bilan, options);
  await formesDesToits(objets, proj, bilan, ctx, options.verifies);
  await couleursDesMurs(objets, proj, bilan, ctx);
  remises.forEach(remettre => remettre());
}

/**
 * La couleur des murs (render/couleurMurPhoto.ts) : lue sur les photos de rue, sinon le materiau des
 * fichiers fonciers, lu avec le batiment ; un service muet laisse les couleurs en place.
 */
async function couleursDesMurs(objets: ObjetBrut[], proj: ProjecteurLocal, bilan: string[], ctx: ContexteActualisation): Promise<void> {
  etape('la couleur des murs sur les photos de rue…');
  const b = await (ctx.couleursMurs ?? couleursMursDepuisPhotos)(objets, proj).catch(() => null);
  const materiaux = objets.filter((o) => estOuvrage(o, BATIMENT) && materiauMurs((o.bdtopo as { materiauxMurs?: unknown } | null | undefined)?.materiauxMurs)).length;
  const texte = texteBilanCouleursMurs(b, materiaux);
  if (texte) bilan.push(texte);
}

/** La forme des toits, ajustee sur le LiDAR HD (app/toits/toitsLidar.ts) : un service muet laisse les toits BD TOPO. */
async function formesDesToits(objets: ObjetBrut[], proj: ProjecteurLocal, bilan: string[], ctx: ContexteActualisation, verifies: OptionsActualisation['verifies']): Promise<void> {
  etape('la forme des toits sur le LiDAR HD…');
  const b = await (ctx.toitsLidar ?? toitsDepuisLidar)(objets, proj, { verifies: verifies ?? 'garder' }).catch(() => null);
  const texte = b && texteBilanToitsLidar(b);
  if(texte) bilan.push(texte);
}

/** Les attributs BD TOPO d'un objet importe, tels que l'actualisation les lit et les reecrit. */
export type BdTopoObjet = { couche?: string; id?: string; hauteurRetenueM?: number; nature?: string; usage1?: string };

/**
 * Un objet IGN sur son contour et ses attributs du jour. Nom, couleurs, verrouillage et textures sont des choix de l'utilisateur :
 * l'actualisation ne touche qu'a la geometrie et aux attributs IGN, et d'un batiment, qu'a ce que model/protections.ts permet a la
 * source officielle (niveau 5) : ni un choix de la personne, ni ce qui a ete vu sur place, ni la mesure du LiDAR (decision du
 * 28 octobre 2026, « le LiDAR bat l'IGN »). Un contour que le LiDAR a lu (et peut-etre recale) reste donc, tant que la BD TOPO du
 * jour a la meme forme ; une forme changee a l'IGN rend la mesure perimee : le contour du jour est pris, le toit recalcule et relu
 * au LiDAR, mais la hauteur a l'egout mesuree reste. `toitDeduit` : un toit en pente deduit de la BD TOPO, pour le bilan ;
 * `contourEcrit` : le contour du jour a ete pris.
 */
export function objetIgnRelu(o: ObjetBrut, bdtopo: BdTopoObjet, pts: PtBrut[], p: Record<string, unknown>, permis: ContexteEcriture): { objet: ObjetBrut; toitDeduit: boolean; corpsCaducs: boolean; contourEcrit: boolean } {
  const batiment = bdtopo.couche === COUCHE_BATIMENT;
  const haut = batiment ? hauteurBatiment(p) : (nombreFr(p.hauteur) || bdtopo.hauteurRetenueM || hauteurVegetation(p.nature as string | undefined));
  const avant = o.type !== 'circle' ? (o as Partial<ObjetPolygone>).pts : undefined;
  const ctx: ContexteEcriture = { ...permis, mesurePerimee: batiment && !!avant && !memeFormeDeplacee(avant, pts) };
  const contourEcrit = !batiment || !avant || ecrivainPeut(o, 'ign', 'contour', ctx);
  const contour = contourEcrit || !avant ? pts : avant;
  const recalcule = batiment && ecrivainPeut(o, 'ign', 'toit', ctx) ? toitActualise(o.batiment?.toit, contour, attributsToitBdTopo(p)) : undefined;
  // Une couverture choisie reste sur le toit recalcule (niveau 1, model/protections.ts).
  // Sa pose aussi (lot L2) : la grande ardoise en losange d'avant le schema 11 y est une ardoise posee en losange.
  const couverture = o.batiment?.toit?.couverture, pose = o.batiment?.toit?.pose;
  const toit = recalcule && recalcule !== o.batiment?.toit && (couverture || pose) && !ecrivainPeut(o, 'ign', 'couverture', ctx) ? { ...recalcule, ...(couverture ? { couverture } : {}), ...(pose ? { pose } : {}) } : recalcule;
  const toitDeduit = !!toit && toit !== o.batiment?.toit && toit.source === 'bdtopo' && toit.forme !== 'plat';
  const volumesToit = volumesRecalcules(o, contour, toit);
  const objet = Object.assign({}, sansRetouche(o), contourEcrit ? {
    pts,
    vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
    segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
    frozenVertices: pts.map(()=>false),
  } : {}, {
    elevation: ecrivainPeut(o, 'ign', 'hauteur', ctx) ? haut : o.elevation,
    // Un contour pris a l'IGN se relit sur le LiDAR : la tache de fond le reprend s'il n'est pas des plus proches ;
    // ses attributs relus (usage, etages), son profil de facades se rechoisit (app/toits/profilsFacadesFond.ts).
    ...(toit || volumesToit !== undefined || batiment ? { batiment: { ...o.batiment, ...(toit ? { toit } : {}),
      // Les corps restent le temps de la lecture LiDAR qui suit : elle y prend ce qui est pose dessus pour le reporter sur les
      // corps neufs (corpsCaducs les retire ensuite si elle n'a pas pu lire).
      ...(volumesToit !== undefined ? { volumesToit, toitMesure: null } : {}),
      ...(batiment ? { ...(contourEcrit ? { toitLidarLu: null } : {}), ...(o.batiment?.profilFacades ? { profilFacades: null } : {}) } : {}) } } : {}),
    bdtopo: Object.assign({}, bdtopo, {
      nature: p.nature || bdtopo.nature, usage1: p.usage_1 || bdtopo.usage1,
      hauteurM: nombreFr(p.hauteur), hauteurRetenueM: haut,
      nombreEtages: nombreFr(p.nombre_d_etages), nombreLogements: nombreFr(p.nombre_de_logements),
      altitudeSolM: nombreFr(p.altitude_minimale_sol), altitudeToitM: nombreFr(p.altitude_minimale_toit),
      altitudeToitMaxM: nombreFr(p.altitude_maximale_toit), constructionLegere: String(p.construction_legere) === 'True', ...materiauxBdTopo(p),
      etat: p.etat_de_l_objet || (bdtopo as { etat?: string }).etat,
      identifiantRnb: p.identifiants_rnb || (bdtopo as { identifiantRnb?: string }).identifiantRnb,
      recupereLe: new Date().toISOString()
    })
  });
  // Les releves et les fenetres reglees suivent leur mur sur le contour du jour, par la geometrie (model/contourDeforme.ts).
  if (batiment && contourEcrit && avant) suivreDeformation(objet as ObjetPlan, avant, 'geometrie');
  return { objet, toitDeduit, corpsCaducs: volumesToit !== undefined && !!o.batiment?.corpsToit?.length, contourEcrit };
}

/** Un objet relu sur son contour du jour : ce que son ouvrage range par cote (la cloture d'une parcelle) suit son mur, par la geometrie. */
export function contourSuivi(objet: ObjetBrut, avant: PtBrut[]): void {
  suivreDeformation(objet as ObjetPlan, avant, 'geometrie');
}

/** Les cotes du plan apres l'actualisation : chacune suit les cotes et les sommets relus des objets qu'elle vise. */
export function cotesSurLesContours(mesures: Mesure[], contours: readonly { cle: string; avant: PtBrut[]; apres: PtBrut[] }[]): Mesure[] {
  return contours.reduce((m, c) => mesuresSuivent(m, c.cle, c.avant, c.apres, 'geometrie'), mesures);
}
