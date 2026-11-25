// Lire les rues autour de la parcelle a la BD TOPO (MD/spec-rues.md).
//
// La couche `troncon_de_route` de la BD TOPO donne chaque troncon de voie avec, quand il en a un,
// le nom de sa voie tel que la Base Adresse Nationale l'ecrit (`nom_voie_ban_gauche`, `..._droite`),
// sinon le nom de la BD TOPO (`nom_1_gauche`, `..._droite`). On garde les troncons nommes, regroupes
// par nom, ramenes dans le repere du plan depuis son origine (le calage du cadastre).
//
// La meme reponse donne aussi de quoi dessiner les rues elles-memes (option « Rues », MD/spec-rues.md §7) :
// chaque troncon de voirie, nomme ou non, avec sa nature et la largeur de sa chaussee. Ils ne sont gardes
// que si on le demande : une lecture pour les seuls noms garde la forme d'avant.

import { projecteurLocal, type ProjecteurLocal } from './projection.js';
import { interrogerWfsEtendu, type FeatureGeoJSON } from './apiIgn.js';
import type { ChausseeRue, PtBrut, RuesVoisinage, RueVoisine } from '../model/types.js';

export const COUCHE_TRONCON_ROUTE = 'BDTOPO_V3:troncon_de_route';
/** Les rues a moins de cette distance du centre de la parcelle. */
export const RAYON_RUES_M = 250;
/** Au plus tant de troncons : un centre-ville en a des milliers dans un tel carre. */
export const MAX_TRONCONS = 800;

/** Le nom d'un troncon, ou null s'il n'en a pas (chemin, bretelle, voie sans nom). */
export function nomDuTroncon(props: Record<string, unknown> | null | undefined): string | null {
  for (const cle of ['nom_voie_ban_gauche', 'nom_voie_ban_droite', 'nom_1_gauche', 'nom_1_droite']) {
    const v = props?.[cle];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * La largeur de chaussee retenue par nature de troncon, quand la BD TOPO ne la donne pas : la voirie ou l'on roule, et les chemins.
 * Une nature absente d'ici ne se dessine pas : sentier, escalier, piste cyclable, bac - ce ne sont pas des rues.
 */
export const LARGEUR_PAR_NATURE: Readonly<Record<string, number>> = {
  'Type autoroutier': 7, 'Route à 2 chaussées': 6, 'Route à 1 chaussée': 5, 'Rond-point': 6, 'Bretelle': 4, 'Route empierrée': 3, 'Chemin': 2.5
};
/** La largeur d'une voie de circulation, quand la BD TOPO compte les voies sans donner la largeur. */
export const LARGEUR_VOIE_M = 3;
/** Les bornes d'une largeur lue : un zero dit « inconnue », un nombre aberrant ne doit pas couvrir le quartier. */
const LARGEUR_MIN_M = 1, LARGEUR_MAX_M = 30;

const nombre = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * La largeur de chaussee d'un troncon, en metres, ou null s'il ne se dessine pas : nature hors de la voirie, troncon fictif (il
 * traverse un carrefour ou une place pour la topologie, rien n'y est construit), souterrain, ou pas encore en service. Dans l'ordre :
 * la largeur lue (`largeur_de_chaussee`), sinon le nombre de voies, sinon la largeur de sa nature.
 */
export function largeurDuTroncon(props: Record<string, unknown> | null | undefined): number | null {
  const nature = typeof props?.nature === 'string' ? props.nature : '';
  const defaut = LARGEUR_PAR_NATURE[nature];
  if (defaut === undefined || props?.fictif === true) return null;
  const position = nombre(props?.position_par_rapport_au_sol);
  if (position !== null && position < 0) return null;
  const etat = props?.etat_de_l_objet;
  if (typeof etat === 'string' && etat && etat !== 'En service') return null;
  const lue = nombre(props?.largeur_de_chaussee);
  if (lue !== null && lue > 0) return Math.min(LARGEUR_MAX_M, Math.max(LARGEUR_MIN_M, lue));
  const voies = nombre(props?.nombre_de_voies);
  if (voies !== null && voies > 0) return Math.min(LARGEUR_MAX_M, voies * LARGEUR_VOIE_M);
  return defaut;
}

/** Les lignes d'une geometrie GeoJSON (LineString ou MultiLineString), chacune dans le repere du plan, au centimetre. */
function lignesDuPlan(g: { type?: string; coordinates?: unknown } | null | undefined, proj: ProjecteurLocal): PtBrut[][] {
  if (!g) return [];
  const lignes = (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? (g.coordinates as unknown[]) : []) as number[][][];
  return lignes.map((l) => (l ?? []).filter((c) => typeof c?.[0] === 'number' && typeof c?.[1] === 'number').map((c) => {
    const p = proj.versMetres(c[0] as number, c[1] as number);
    return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
  })).filter((pts) => pts.length >= 2);
}

/** Les chaussees d'une reponse WFS : chaque troncon de voirie, nomme ou non, dans le repere du plan, avec sa nature et sa largeur. */
export function chausseesDepuisTroncons(features: readonly FeatureGeoJSON[], proj: ProjecteurLocal): ChausseeRue[] {
  const res: ChausseeRue[] = [];
  for (const f of features) {
    const props = f.properties as Record<string, unknown> | null | undefined;
    const largeurM = largeurDuTroncon(props);
    if (largeurM === null) continue;
    const nom = nomDuTroncon(props);
    const importance = nombre(props?.importance);
    for (const pts of lignesDuPlan(f.geometry as { type?: string; coordinates?: unknown } | null | undefined, proj)) {
      res.push({ nature: props?.nature as string, largeurM, ...(importance !== null ? { importance } : {}), ...(nom ? { nom } : {}), pts });
    }
  }
  // Les plus importantes en dernier : dessinees par-dessus les petites a un carrefour.
  return res.sort((a, b) => (b.importance ?? 6) - (a.importance ?? 6));
}

/** Les rues d'une reponse WFS, par nom, chaque troncon dans le repere du plan. */
export function ruesDepuisTroncons(features: readonly FeatureGeoJSON[], proj: ProjecteurLocal): RueVoisine[] {
  const parNom = new Map<string, PtBrut[][]>();
  for (const f of features) {
    const nom = nomDuTroncon(f.properties as Record<string, unknown> | null | undefined);
    if (!nom) continue;
    for (const pts of lignesDuPlan(f.geometry as { type?: string; coordinates?: unknown } | null | undefined, proj)) {
      const liste = parNom.get(nom) ?? [];
      liste.push(pts);
      parNom.set(nom, liste);
    }
  }
  return [...parNom.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([nom, troncons]) => ({ nom, troncons }));
}

/** Ce que la lecture des rues rend en plus des noms. */
export interface OptionsLectureRues {
  /** Garder aussi les chaussees (option « Rues ») : la meme requete, rien de plus demande a l'IGN. */
  chaussees?: boolean;
}

/**
 * Les rues a moins de `rayonM` de `centre` (repere du plan), le plan etant cale sur `origine`.
 * `lire` est remplacable dans les tests, qui ne touchent pas le reseau.
 */
export async function lireRues(origine: { lat: number; lon: number }, centre: PtBrut, rayonM = RAYON_RUES_M, lire: typeof interrogerWfsEtendu = interrogerWfsEtendu,
  options: OptionsLectureRues = {}): Promise<RuesVoisinage> {
  const proj = projecteurLocal(origine.lat, origine.lon);
  const a = proj.versDegres(centre.x - rayonM, centre.y - rayonM), b = proj.versDegres(centre.x + rayonM, centre.y + rayonM);
  const features = await lire(COUCHE_TRONCON_ROUTE, { latMin: a.lat, lonMin: a.lon, latMax: b.lat, lonMax: b.lon }, MAX_TRONCONS);
  return {
    recupereLe: new Date().toISOString().slice(0, 19) + 'Z', rayonM, rues: ruesDepuisTroncons(features, proj),
    ...(options.chaussees ? { chaussees: chausseesDepuisTroncons(features, proj) } : {})
  };
}
