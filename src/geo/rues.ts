// Lire les rues autour de la parcelle a la BD TOPO (MD/spec-rues.md).
//
// La couche `troncon_de_route` de la BD TOPO donne chaque troncon de voie avec, quand il en a un,
// le nom de sa voie tel que la Base Adresse Nationale l'ecrit (`nom_voie_ban_gauche`, `..._droite`),
// sinon le nom de la BD TOPO (`nom_1_gauche`, `..._droite`). On garde les troncons nommes, regroupes
// par nom, ramenes dans le repere du plan depuis son origine (le calage du cadastre).

import { projecteurLocal, type ProjecteurLocal } from './projection.js';
import { interrogerWfsEtendu, type FeatureGeoJSON } from './apiIgn.js';
import type { PtBrut, RuesVoisinage, RueVoisine } from '../model/types.js';

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

/** Les rues d'une reponse WFS, par nom, chaque troncon dans le repere du plan. */
export function ruesDepuisTroncons(features: readonly FeatureGeoJSON[], proj: ProjecteurLocal): RueVoisine[] {
  const parNom = new Map<string, PtBrut[][]>();
  for (const f of features) {
    const nom = nomDuTroncon(f.properties as Record<string, unknown> | null | undefined);
    const g = f.geometry as { type?: string; coordinates?: unknown } | null | undefined;
    if (!nom || !g) continue;
    const lignes = (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? (g.coordinates as unknown[]) : []) as number[][][];
    for (const l of lignes) {
      const pts = (l ?? []).filter((c) => typeof c?.[0] === 'number' && typeof c?.[1] === 'number').map((c) => {
        const p = proj.versMetres(c[0] as number, c[1] as number);
        return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
      });
      if (pts.length < 2) continue;
      const liste = parNom.get(nom) ?? [];
      liste.push(pts);
      parNom.set(nom, liste);
    }
  }
  return [...parNom.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([nom, troncons]) => ({ nom, troncons }));
}

/**
 * Les rues a moins de `rayonM` de `centre` (repere du plan), le plan etant cale sur `origine`.
 * `lire` est remplacable dans les tests, qui ne touchent pas le reseau.
 */
export async function lireRues(origine: { lat: number; lon: number }, centre: PtBrut, rayonM = RAYON_RUES_M, lire: typeof interrogerWfsEtendu = interrogerWfsEtendu): Promise<RuesVoisinage> {
  const proj = projecteurLocal(origine.lat, origine.lon);
  const a = proj.versDegres(centre.x - rayonM, centre.y - rayonM), b = proj.versDegres(centre.x + rayonM, centre.y + rayonM);
  const features = await lire(COUCHE_TRONCON_ROUTE, { latMin: a.lat, lonMin: a.lon, latMax: b.lat, lonMax: b.lon }, MAX_TRONCONS);
  return { recupereLe: new Date().toISOString().slice(0, 19) + 'Z', rayonM, rues: ruesDepuisTroncons(features, proj) };
}
