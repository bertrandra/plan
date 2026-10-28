// Le bati dans la scene 3D : ses volumes (corps du toit, volumes, toit mesure, facades relevees) et ce qui l'habille par-dessus
// son prisme (releve, toits, cheminees, toits-terrasses, details). Tire de three/sceneObjets.ts sans retouche
// (MD/spec-ouvrages.md, etape 6.6 : un module 3D par ouvrage).
//
// Tout objet extrude passe par `volumesEnBati` : un objet qui n'est pas un batiment n'y trouve que son contour a sa hauteur.

import { couleurMursRetenue } from '../../model/couleurMur.js';
import { volumesActifs, toitDuVolume, rectanglesDuContour, penteDuToit } from '../../model/volumesToit.js';
import { modeToitActif, hauteurMurMesuree } from '../../model/toitMesure.js';
import { ajouterToitMesure3d } from '../toitMesure3d.js';
import { ajouterBowWindows3d, ajouterToitCorps3d, ajouterToitCorpsSurContour3d, estAppentisOuvert, facettesSurContour } from '../toitCorps3d.js';
import { separerBowWindows } from '../../facade/modeToit/saillies.js';
import { corpsVisibles } from '../../facade/modeToit/facadesDesCorps.js';
import { ajouterCheminees3d } from '../cheminees3d.js';
import { ajouterTerrasses3d } from '../terrasse3d.js';
import { hauteursMursCorps } from '../../facade/toits/toitCorps.js';
import { vue3d } from '../etat3d.js';
import { RELIEF_FENETRES_M, anneeDe } from '../fenetresRelief.js';
import { parametresQualite } from '../qualite.js';
import { dist } from '../../geometry/basic.js';
import { ajouterReleve3d } from '../releve3d.js';
import { ajouterDetailsBatiment } from '../detailsBatiment.js';
import { apparenceVoisin, fenetresDuVoisin } from '../../model/voisinage3d.js';
import { valeursFacadesDe } from '../../regles/facades/reglages.js';
import { fenetres3dDe } from '../../model/fenetres3d.js';
import { volumesDuBatiment } from '../../facade/profil.js';
import type { ObjetPlan, PtBrut, VolumeToit, Toit } from '../../model/types.js';
import { estBatiment, surParcelleDuProjet } from '../../model/fonctions.js';
import type { SolRelief } from '../relief3d.js';
import type { ContexteObjets } from '../typesScene.js';
import { groupeAuSol, texturesDe } from './pose.js';

/** La couleur d'un `MeshStandardMaterial` a qui l'on n'en donne pas. */
const BLANC_PAR_DEFAUT = 0xffffff;

/**
 * Les volumes d'un objet extrude, et ce qu'un batiment en sait de plus pour s'habiller ensuite. `diag` : un mode de diagnostic
 * peint le batiment (la couleur du voisinage ne s'applique pas).
 */
export function volumesEnBati(o: ObjetPlan, diag: boolean, h: number, footprint: PtBrut[], co: ContexteObjets) {
  // `fill` est facultatif : sans couleur, l'objet prend le blanc que Three lui laisserait (D-8).
  // Une maison du voisinage prend la couleur que la section « Voisinage (3D) » lui tire.
  const apparence = !diag && o.voisinage && o.type === 'polygon' && estBatiment(o) ? apparenceVoisin(co.voisinage3d, o.key) : null;
  // Un batiment prend la couleur de ses murs lue sur une photo de rue, ou celle de son materiau
  // (model/couleurMur.ts), sauf choix de la couleur du plan ; un reglage du voisinage l'emporte.
  const reelle = o.type === 'polygon' && estBatiment(o) ? couleurMursRetenue(o)?.couleur : undefined;
  const couleurMur = apparence?.couleurMur ?? reelle ?? o.fill ?? BLANC_PAR_DEFAUT;
  // Un batiment en plusieurs corps : un prisme par corps a son egout le plus bas, ses murs hauts et son
  // toit (three/toitCorps3d.ts). Un mur releve en L ne coupe le batiment (facade/profil.ts) qu'en toit
  // simple : sur des corps, il effacait corps, cheminees et lucarnes ; sa photo se pose sur les corps.
  // Tout autre objet reste un seul prisme.
  const modeToit = o.type === 'polygon' && estBatiment(o) ? modeToitActif(o.batiment) : 'simple';
  // Une maison voisine ne montre ses corps et pignons que si la section « Voisinage (3D) » le veut (oui par defaut).
  const corpsPermis = surParcelleDuProjet(o) || co.voisinage3d.toits.corps;
  // Un bow-window n'a ni prisme ni fenetres comme un corps : il se dessine a part (ajouterBowWindows3d), a la forme de son plan.
  const { hotes: corpsToit, bows: bowWindows } = separerBowWindows(modeToit === 'corps' && corpsPermis ? corpsVisibles(o.batiment?.corpsToit, vue3d.corpsIsole?.cle === o.key ? vue3d.corpsIsole.rang : null) : null);
  const volumesToit = modeToit === 'volumes' ? volumesActifs(o) : null;
  // Le toit mesure au LiDAR (model/toitMesure.ts) : un seul prisme, le contour lui-meme, a l'egout
  // le plus bas ; les rehausses montent ses murs jusqu'a la surface. Des prismes par rectangle
  // laissaient la surface pendre dans le vide la ou un rectangle ne couvrait pas le contour.
  const toitMesure = modeToit === 'mesure' ? o.batiment?.toitMesure ?? null : null;
  const egoutDe = (v: VolumeToit): number => v.egout ?? h;
  // Des corps lus sur un contour remis a l'equerre (un cote de biais : il ne se decoupe pas tel
  // quel) ne le suivent plus : le batiment garde alors la forme du plan, ses toits decoupes dessus.
  const surContour = corpsToit && o.type === 'polygon' && !rectanglesDuContour(o.pts) ? facettesSurContour(corpsToit, o.pts) : null;
  const volumes = surContour
    ? [{ pts: footprint, hauteur: surContour.bas, hauteursMurs: surContour.hauteursMurs }]
    : corpsToit
    // Un appentis ouvert n'a pas de prisme : des poteaux le portent, et le mur est celui du corps qui le porte.
    ? corpsToit.filter((c) => !estAppentisOuvert(c)).map((c) => ({ pts: c.pts, hauteur: Math.min(...c.egouts), hauteursMurs: hauteursMursCorps(c) }))
    : toitMesure
    ? [{ pts: footprint, hauteur: toitMesure.egout, hauteursMurs: footprint.map((_, i) => Math.max(toitMesure.egout, hauteurMurMesuree(toitMesure, footprint, i) ?? toitMesure.egout)) }]
    : volumesToit
    ? volumesToit.map((v) => ({ pts: v.pts, hauteur: egoutDe(v) }))
    : o.type === 'polygon' && o.batiment?.facades?.some((r) => r.partieBasse) ? volumesDuBatiment(o.pts, h, o.batiment?.facades) : [{ pts: footprint, hauteur: h }];
  return { apparence, couleurMur, corpsToit, bowWindows, volumesToit, toitMesure, surContour, volumes, egoutDe };
}

/** Ce que `volumesEnBati` a lu d'un objet. */
export type BatiEnVolumes = ReturnType<typeof volumesEnBati>;

/**
 * Habille un batiment par-dessus son prisme : `centre` est le centre de l'objet, `ySol` le sol en ce centre, `yBase` le point le
 * plus bas du sol sous son emprise.
 */
export function habillerLeBati(o: ObjetPlan, b: BatiEnVolumes, h: number, centre: PtBrut, ySol: number, yBase: number, co: ContexteObjets): void {
  const { apparence, couleurMur, corpsToit, bowWindows, volumesToit, toitMesure, surContour, volumes, egoutDe } = b;
  // Un batiment releve (photo de facade, ouvertures, toit) s'habille par-dessus son prisme, depuis
  // le sol en son centre : la photo couvre le mur de la jusqu'au toit, le prisme nu descend dessous.
  // Ce que l'on sait de la couverture en plus de sa couleur : le materiau des fichiers fonciers et la
  // pente, qui choisissent la texture (tuiles plates, canal, ardoise, zinc ; MD/spec-toit-ign.md §6.2).
  const couverture = o.type === 'polygon' ? { materiauxToiture: (o.bdtopo as { materiauxToiture?: unknown } | null | undefined)?.materiauxToiture, pente: o.batiment?.toit ? penteDuToit(o.pts, o.batiment?.toit) : null, latitude: co.latitude, choix: o.batiment?.toit?.couverture ?? null } : undefined;
  if (o.type === 'polygon' && (o.batiment?.facades?.length || o.batiment?.toit || volumesToit)) {
    ajouterReleve3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, sansOmbres: vue3d.facadesSansOmbres, couverture }, o, h, volumesToit, !!toitMesure || !!corpsToit, corpsToit ?? null);
  }
  if (o.type === 'polygon' && corpsToit && surContour) {
    ajouterToitCorpsSurContour3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, textureMur: texturesDe(o)?.vertical, couverture }, corpsToit, o.batiment?.toit, o.pts);
  } else if (o.type === 'polygon' && corpsToit) {
    ajouterToitCorps3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, textureMur: texturesDe(o)?.vertical, couverture }, corpsToit, o.batiment?.toit, o.pts);
  }
  if (o.type === 'polygon' && bowWindows.length) ajouterBowWindows3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, textureMur: texturesDe(o)?.vertical, couverture }, bowWindows, o.batiment?.toit);
  // Les cheminees et toits-terrasses observes (MD/spec-regles-toits.md §2.6, §2.7) : un corps qui n'en porte pas ne pose rien de plus.
  if (o.type === 'polygon' && corpsToit?.some((c) => c.cheminees?.length || c.terrasse)) {
    const sol = co.sol;
    const ctxObs = { scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, textureMur: texturesDe(o)?.vertical, couverture,
      // Une souche adossee part du sol sous elle, compte depuis le sol au centre (origine du groupe).
      ...(sol ? { sol: (p: PtBrut) => sol.hauteur(p) - ySol } : {}) };
    ajouterCheminees3d(ctxObs, corpsToit);
    ajouterTerrasses3d(ctxObs, corpsToit, o.batiment?.toit, o.pts);
  }
  // La surface mesuree au LiDAR remplace les formes simples (three/toitMesure3d.ts), posee a l'egout de chaque corps.
  if (o.type === 'polygon' && toitMesure) {
    ajouterToitMesure3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, couverture }, o.pts, toitMesure, o.batiment?.toit, [], toitMesure.egout);
  }
  // Un batiment recoit ses details (three/detailsBatiment.ts) : debord et gouttiere, aretes,
  // soubassement, fenetres par niveau, cheminee — moins de loin.
  if (o.type === 'polygon' && estBatiment(o)) {
    const etages = (o.bdtopo as { nombreEtages?: unknown } | null | undefined)?.nombreEtages;
    // Les fenetres : celles que le voisinage tire pour une maison voisine ; pour un batiment du
    // projet, la dimension commune ou la liste reglee une par une (model/fenetres3d.ts).
    const f3d = fenetres3dDe(o);
    const fenetres = apparence ? fenetresDuVoisin(apparence, co.voisinage3d) : { largeur: f3d.largeur, hauteur: f3d.hauteur, appui: f3d.appui, entraxe: f3d.entraxe, ...(f3d.couleur ? { couleur: f3d.couleur } : {}) };
    ajouterDetailsBatiment(
      { scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, couverture, distance: dist(centre, co.centre),
        // Les facades de pres (R2) : baies en creux et maconnerie sur la parcelle et ses abords, hors
        // qualite Econome ; l'epoque (BD TOPO) choisit petits bois et maconnerie.
        relief: vue3d.qualite !== 'econome' && dist(centre, co.centre) <= RELIEF_FENETRES_M,
        annee: anneeDe((o.bdtopo as { dateApparition?: unknown } | null | undefined)?.dateApparition),
        detailFin: parametresQualite(vue3d.qualite).detailFinM,
        // Le groupe est pose sur le sol au centre : le soubassement et les angles descendent jusqu'au sol sous chaque mur.
        ...(co.sol ? { sol: (p: PtBrut) => (co.sol as SolRelief).hauteur(p) - ySol, base: yBase - ySol } : {}) },
      // Le profil de facades retenu pour le batiment (facade/regles/facades/profils.ts) : ses dimensions et ses seuils.
      o, h, { etages: typeof etages === 'number' ? etages : null, cotesReleves: (o.batiment?.facades ?? []).map((r) => r.cote), fenetres, profil: valeursFacadesDe(o.batiment),
        ...(!apparence && f3d.mode === 'uneParUne' && f3d.liste ? { ouvertures: f3d.liste } : {}),
        // En surface mesuree, chaque mur a sa hauteur (la ou la couverture le rejoint) : les fenetres montent avec lui.
        ...(volumesToit ? { volumes: volumesToit.map((v) => ({ pts: v.pts, hauteur: egoutDe(v), toit: toitDuVolume(v, o.batiment?.toit) })) } : {}),
        // Corps ou surface mesuree : chaque mur a sa hauteur, les fenetres montent avec lui.
        ...((corpsToit || toitMesure) && o.batiment?.toit ? { volumes: volumes.map((v) => ({ ...v, toit: o.batiment?.toit as Toit })) } : {}),
        ...(toitMesure || corpsToit ? { sansToit: true } : {}),
        // Les fenetres sur les murs des corps, a leur hauteur, et dans leurs pignons (facade/ouvertures.ts).
        // Sur le contour, les fenetres suivent ses murs, comme en surface mesuree.
        // Un appentis ouvert n'a pas de mur : pas de fenetre non plus.
        ...(corpsToit && !surContour && (apparence || f3d.mode !== 'uneParUne') ? { corps: corpsToit.filter((c) => !estAppentisOuvert(c)) } : {}) }
    );
  }
}
