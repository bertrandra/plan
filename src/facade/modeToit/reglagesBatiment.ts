// Les reglages du batiment que l'atelier du toit tient en plus de sa forme (decision du proprietaire, 28 novembre 2026 : « Go déplace » ;
// jusque-la dans l'inspecteur) : ce que la 3D montre du toit (sa source), la hauteur a l'egout, la couverture (couleur, materiau, pose).
//
// Purs : ils lisent un batiment pour l'atelier, et ecrivent un brouillon pour le controleur (controleurToit.ts), qui en fait des
// transactions. Aucun ne fige le toit : ce ne sont pas des formes, et la lecture automatique continue de lire le reste (une couleur
// choisie ne doit pas empecher le LiDAR de relire un toit). Chacun garde la marque qu'il posait dans l'inspecteur : la hauteur saisie
// porte `egoutChoisi: 'saisie'`, la couleur choisie perd `origineCouleur` (model/protections.ts).

import { enPoints } from '../../model/formes.js';
import { modeToitActif } from '../../model/toitMesure.js';
import { penteDuToit } from '../../model/volumesToit.js';
import { materiauCouverture, type MateriauCouverture } from '../../model/couleurToit.js';
import { COUVERTURES_CHOISIES, POSES_COUVERTURE, poseAdmise } from '../../model/couvertureLue.js';
import { egoutRendable, origineActuelle, type Origine } from '../../model/protections.js';
import { elevationParDefaut } from '../../model/defaults.js';
import { champsBatiment } from '../../model/champsFonction.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import { COULEUR_TOIT_DEFAUT } from '../toits/toit.js';
import { penteDominante } from '../toits/toitCorps.js';
import { toitOuDefaut } from './gestes.js';
import type { CouvertureChoisie, ObjetPlan, PoseCouverture, Toit } from '../../model/types.js';

/** Ce que l'on sait du lieu du batiment, que le batiment seul ne porte pas : la latitude de la parcelle du projet (la tuile canal du Sud). */
export interface LieuDuBatiment { latitude?: number | null }

/** Le lieu des batiments d'un projet : la latitude de sa parcelle (`cadastre.origineLat`). */
export function lieuDuProjet(objets: readonly ObjetPlan[]): LieuDuBatiment {
  const lat = (parcelleDuProjet(objets)?.cadastre as { origineLat?: unknown } | null | undefined)?.origineLat;
  return { latitude: typeof lat === 'number' ? lat : null };
}

/** Un choix offert, sa valeur et ses mots. */
export interface OptionReglage { valeur: string; libelle: string }

// ---------------------------------------------------------------------------------------------------------------------------------------
// La source du toit : ce que la 3D en montre

export type SourceToit = 'corps' | 'mesure' | 'volumes' | 'simple';
const SOURCES: readonly SourceToit[] = ['corps', 'mesure', 'volumes', 'simple'];

export const MOTS_SOURCE: Readonly<Record<SourceToit, string>> = {
  corps: 'Corps et pignons (LiDAR)', mesure: 'Tel que mesuré (LiDAR)', volumes: 'Un toit par corps', simple: 'Un seul toit'
};

export const AIDE_SOURCE = 'Corps et pignons : les corps du bâtiment lus sur le LiDAR HD de l’IGN, chacun son faîtage et ses égouts. '
  + 'Tel que mesuré : la surface relevée à 50 cm, nettoyée des arbres. Un toit par corps : le contour découpé en rectangles, chacun son '
  + 'toit simple. Un seul toit : une forme simple sur tout le contour.';

const aDesVolumes = (o: ObjetPlan): boolean => (o.batiment?.volumesToit?.length ?? 0) >= 2;

/**
 * Les lectures du toit entre lesquelles choisir, et celle que la 3D montre ; null quand il n'y a rien a choisir (ni surface mesuree, ni
 * toit par corps : la 3D n'a qu'une lecture). Les corps se proposent s'ils existent, la surface si elle a ete mesuree.
 */
export function sourcesDuToit(o: ObjetPlan): { enPlace: SourceToit; options: OptionReglage[] } | null {
  const b = o.batiment;
  if (!b?.toitMesure && !aDesVolumes(o)) return null;
  const offertes = SOURCES.filter((s) => s === 'simple' || (s === 'corps' && !!b?.corpsToit?.length) || (s === 'mesure' && !!b?.toitMesure) || (s === 'volumes' && aDesVolumes(o)));
  return { enPlace: modeToitActif(b), options: offertes.map((s) => ({ valeur: s, libelle: MOTS_SOURCE[s] })) };
}

/** Pose la source `v` sur le brouillon ; une valeur hors des choix offerts est refusee, celle deja montree n'ecrit rien. */
export function poserSource(o: ObjetPlan, v: string): boolean | string {
  const s = sourcesDuToit(o);
  if (!s) return 'Ce bâtiment n’a qu’une lecture de son toit : rien à choisir.';
  if (!s.options.some((x) => x.valeur === v)) return 'Cette lecture du toit n’existe pas pour ce bâtiment.';
  // Celle que la 3D montre deja : rien a ecrire (la liste de l'inspecteur d'avant ne la reecrivait pas non plus).
  if (v === s.enPlace) return false;
  champsBatiment(o).modeToit = v as SourceToit;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// La hauteur a l'egout

/** Le pas des boutons − et + de la hauteur a l'egout, celui du champ de l'inspecteur d'avant. */
export const PAS_EGOUT_M = 0.1;

/** D'ou vient la hauteur a l'egout d'aujourd'hui, en mots (la table « Qui l'emporte » de model/protections.ts). */
const MOTS_ORIGINE_EGOUT: Partial<Record<Origine, string>> = {
  egoutSaisi: 'saisie', fige: 'réglée avec le toit', toitSaisi: 'saisie avec le toit', egoutVu: 'validée par l’audit', verifie: 'vérifiée sur place',
  toitPhoto: 'lue sur la photo de la façade', lidar: 'lue sur le LiDAR HD de l’IGN', bdtopo: 'tirée de la BD TOPO', dessine: 'dessinée', defaut: 'par défaut'
};

export interface EgoutDuBatiment {
  hauteur: number;
  /** D'ou elle vient, en mots : « saisie », « validée par l’audit », « lue sur le LiDAR HD de l’IGN »… */
  origine: string;
  /** Saisie ou validee par l'audit (`egoutChoisi`) : aucune lecture ne la reecrit. */
  choisie: 'saisie' | 'audit' | null;
  /** « Rendre au calcul » changerait quelque chose : une lecture pourrait la reprendre (model/protections.ts::egoutRendable). */
  rendable: boolean;
  /** La 3D dessine des corps : chacun garde ses egouts, la hauteur saisie ne les deplace pas (leur poignee le fait). */
  corpsGardentLeurs: boolean;
}

export function egoutDuBatiment(o: ObjetPlan): EgoutDuBatiment {
  return {
    hauteur: o.elevation ?? elevationParDefaut(o.fonction ?? ''),
    origine: MOTS_ORIGINE_EGOUT[origineActuelle(o, 'hauteur')] ?? '',
    choisie: o.batiment?.egoutChoisi ?? null,
    rendable: egoutRendable(o),
    corpsGardentLeurs: modeToitActif(o.batiment) === 'corps'
  };
}

/** Saisit la hauteur a l'egout : choisie, aucune lecture ne la reecrit (le champ « Élévation » d'avant, pour un batiment). */
export function poserEgout(o: ObjetPlan, v: number): boolean | string {
  if (!Number.isFinite(v)) return 'Saisissez une hauteur en mètres, par exemple 5,40.';
  o.elevation = Math.max(0, v) || 0;
  champsBatiment(o).egoutChoisi = 'saisie';
  return true;
}

/** La hauteur choisie rendue a la lecture : la marque tombe et le toit redevient a lire ; la hauteur reste jusqu'a la lecture. */
export function rendreEgoutAuCalcul(o: ObjetPlan): boolean | string {
  if (!egoutRendable(o)) return 'La hauteur à l’égout n’est pas choisie, ou aucune lecture ne pourrait la reprendre.';
  const b = champsBatiment(o);
  delete b.egoutChoisi;
  b.toitLidarLu = null;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// La couverture

export const LIBELLES_COUVERTURE: Readonly<Record<MateriauCouverture, string>> = {
  tuile: 'Tuile romane', 'tuile-plate': 'Tuile plate', 'tuile-canal': 'Tuile canal', ardoise: 'Ardoise', zinc: 'Zinc', 'bac-acier': 'Bac acier', membrane: 'Membrane d’étanchéité', vegetale: 'Toiture végétalisée', terrasse: 'Toit-terrasse'
};
/** Les motifs de pose (lot L2) : la grande ardoise en losange d'avant le schema 11 est une ardoise posee en losange. */
export const LIBELLES_POSE: Readonly<Record<PoseCouverture, string>> = { droite: 'En rangs droits', losange: 'En losange', ecaille: 'En écaille' };

/**
 * Le materiau que Plan deduit, sans choix : les memes indices que la 3D (three/scene.ts, toitCorps3d.ts) — fichiers fonciers, couleur,
 * pente du toit dessine, latitude.
 */
export function couvertureDeduite(o: ObjetPlan, lieu: LieuDuBatiment = {}): MateriauCouverture {
  const toit = o.batiment?.toit;
  const corps = modeToitActif(o.batiment) === 'corps' && o.batiment?.corpsToit?.length ? o.batiment.corpsToit : null;
  const pente = corps ? penteDominante(corps) : toit ? penteDuToit(enPoints(o).pts, toit) : null;
  const ff = (o.bdtopo as { materiauxToiture?: unknown } | null | undefined)?.materiauxToiture;
  return materiauCouverture(toit, { materiauxToiture: ff, pente, latitude: typeof lieu.latitude === 'number' ? lieu.latitude : null });
}

/** D'ou vient la couleur d'une couverture que Plan a posee (MD/spec-toit-ign.md §6.1) ; rien quand elle a ete choisie. */
export function origineCouleur(toit: Toit | null | undefined): string {
  switch (toit?.origineCouleur) {
    case 'orthophoto': return 'lue sur l’orthophoto';
    case 'rouge': return 'tuile rouge : orthophoto peu lisible';
    case 'brun': return 'tuile brune : orthophoto peu lisible';
    case 'gris': return 'couverture grise : orthophoto peu lisible';
    default: return '';
  }
}

const estChoisie = (v: string | undefined): v is CouvertureChoisie => !!v && (COUVERTURES_CHOISIES as readonly string[]).includes(v);
/** Le materiau que dessine la 3D : celui choisi, sinon celui que Plan deduit. */
const materiauDessine = (o: ObjetPlan, lieu: LieuDuBatiment, choix: string | undefined): MateriauCouverture => (estChoisie(choix) ? choix : couvertureDeduite(o, lieu));
const posesAdmises = (o: ObjetPlan, lieu: LieuDuBatiment): PoseCouverture[] => {
  const m = materiauDessine(o, lieu, o.batiment?.toit?.couverture);
  return POSES_COUVERTURE.filter((p) => p === 'droite' || !!poseAdmise(m, p));
};

/** Ce que l'atelier montre de la couverture ; chaque partie est null quand elle n'a pas lieu d'etre (les memes conditions qu'avant). */
export interface CouvertureDuBatiment {
  /** La couleur, sur le toit unique seulement (en corps ou en surface mesuree, la 3D lit autre chose). */
  couleur: { valeur: string; note: string } | null;
  /** Le materiau : « Automatique (…) » puis le catalogue ; un mot inconnu (fichier plus recent) reste montre tel quel. */
  materiau: { enPlace: string; options: OptionReglage[] } | null;
  /** Le motif de pose, quand le materiau en admet plus d'un. */
  pose: { enPlace: string; options: OptionReglage[] } | null;
}

export function couvertureDuBatiment(o: ObjetPlan, lieu: LieuDuBatiment = {}): CouvertureDuBatiment | null {
  const toit = o.batiment?.toit;
  if (!toit) return null;
  const unSeul = modeToitActif(o.batiment) === 'simple';
  // Un toit plat simple est un toit-terrasse : ni materiau ni pose a choisir.
  const terrasse = unSeul && toit.forme === 'plat';
  const lu = toit.couverture as string | undefined;
  const inconnu = lu && !estChoisie(lu) ? [{ valeur: lu, libelle: 'Couverture inconnue (« ' + lu + ' »), dessinée en tuile' }] : [];
  const poses = posesAdmises(o, lieu);
  return {
    couleur: unSeul ? { valeur: toit.couleur || COULEUR_TOIT_DEFAUT, note: origineCouleur(toit) } : null,
    materiau: terrasse ? null : {
      enPlace: lu ?? '',
      options: [{ valeur: '', libelle: 'Automatique (' + LIBELLES_COUVERTURE[couvertureDeduite(o, lieu)].toLowerCase() + ')' },
        ...COUVERTURES_CHOISIES.map((m) => ({ valeur: m, libelle: LIBELLES_COUVERTURE[m] })), ...inconnu]
    },
    pose: terrasse || poses.length < 2 ? null : { enPlace: toit.pose ?? 'droite', options: poses.map((p) => ({ valeur: p, libelle: LIBELLES_POSE[p] })) }
  };
}

/** Une couleur choisie : plus rien ne la recalcule, ni l'orthophoto ni l'actualisation. */
export function poserCouleur(o: ObjetPlan, v: string): boolean | string {
  if (!/^#[0-9a-f]{6}$/i.test(v)) return 'Choisissez une couleur dans la palette.';
  const toit = toitOuDefaut(o);
  toit.couleur = v;
  delete toit.origineCouleur;
  return true;
}

/** Le materiau choisi (vide : automatique) ; une pose qui ne se dessine pas sur le nouveau materiau tombe. */
export function poserMateriau(o: ObjetPlan, v: string, lieu: LieuDuBatiment = {}): boolean | string {
  const toit = toitOuDefaut(o);
  if (estChoisie(v)) toit.couverture = v;
  // Le mot inconnu repris tel quel reste dans le fichier ; tout autre choix le remplace.
  else if (v !== toit.couverture) delete toit.couverture;
  if (toit.pose && !poseAdmise(materiauDessine(o, lieu, toit.couverture), toit.pose)) delete toit.pose;
  return true;
}

/** Le motif de pose : en rangs droits par defaut (rien d'ecrit), une autre pose seulement si le materiau l'admet. */
export function poserPose(o: ObjetPlan, v: string, lieu: LieuDuBatiment = {}): boolean | string {
  const toit = toitOuDefaut(o);
  const p = POSES_COUVERTURE.find((x) => x === v);
  if (!p) return 'Ce motif de pose n’existe pas.';
  if (p !== 'droite' && !poseAdmise(materiauDessine(o, lieu, toit.couverture), p)) return 'Ce motif ne se pose pas sur ce matériau.';
  if (p === 'droite') delete toit.pose; else toit.pose = p;
  return true;
}
