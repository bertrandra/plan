// AE 101 (2 allee des Limites, 78110 Le Vesinet), la parcelle de reference de l'utilisateur, telle
// que l'IGN la rend : le cadastre de la parcelle et de ses voisines, le point d'adresse de la BAN et
// les troncons de rue de la BD TOPO autour (vesinet-ae101-parcelle.json, lu le 15 octobre 2026).
//
// La rue du numero, l'allee des Limites, longe le cote court du sud-ouest ; le cote le plus long
// (39,5 m) est mitoyen d'AE 100. Un portail pose « sur le plus long cote » tombe chez le voisin.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { construireCandidats, classerCandidats, trierVoisines, type FeatureGeoJSON } from '../../../src/geo/apiIgn.js';
import { objetsDepuisCadastre, type AdresseRecherchee } from '../../../src/geo/cadastreObjets.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import { ruesDepuisTroncons } from '../../../src/geo/rues.js';
import { distancePointSegment } from '../../../src/geometry/segments.js';
import type { ObjetPlan, PtBrut, RuesVoisinage } from '../../../src/model/types.js';

interface FixtureAE101 {
  adresse: { label: string; score: number; genre: string; citycode: string; ville: string; lon: number; lat: number };
  parcelles: FeatureGeoJSON[];
  troncons: FeatureGeoJSON[];
}

export const AE101 = JSON.parse(readFileSync(resolve(__dirname, 'vesinet-ae101-parcelle.json'), 'utf8')) as FixtureAE101;
export const IDU_AE101 = '78650000AE0101';

/** Le milieu (en degres) du contour d'AE 101 : un point du jardin, la ou l'on se tient pour importer depuis sa position. */
export function jardinAE101(): { lon: number; lat: number } {
  const f = AE101.parcelles.find((p) => p.properties?.idu === IDU_AE101);
  const anneau = ((f?.geometry as { coordinates: number[][][][] }).coordinates[0]?.[0] ?? []).slice(0, -1);
  return { lon: anneau.reduce((s, c) => s + (c[0] ?? 0), 0) / anneau.length, lat: anneau.reduce((s, c) => s + (c[1] ?? 0), 0) / anneau.length };
}

/** La recherche, comme l'import la recoit : l'adresse tapee, la position de l'appareil (avec ou sans adresse la plus proche), ou rien. */
export function rechercheAE101(mode: 'adresse' | 'position' | 'positionSansAdresse'): AdresseRecherchee {
  const a = AE101.adresse;
  if (mode === 'adresse') return { label: a.label, score: a.score, genre: a.genre, citycode: a.citycode, ville: a.ville, lon: a.lon, lat: a.lat };
  const j = jardinAE101();
  return mode === 'position'
    ? { label: a.label, score: 1, genre: 'position', citycode: a.citycode, ville: a.ville, lon: j.lon, lat: j.lat, pointAdresse: { lon: a.lon, lat: a.lat } }
    : { label: 'Position ' + j.lat.toFixed(6) + ', ' + j.lon.toFixed(6), score: 1, genre: 'position', citycode: '', ville: '', lon: j.lon, lat: j.lat };
}

/**
 * Les objets du plan d'un import d'AE 101, comme app/importCadastre.ts les construit : la parcelle
 * sous le point de recherche, ses mitoyennes cochees (`retenir`) ou seulement connues (`connaitre`).
 */
export function importerAE101(o: { recherche: AdresseRecherchee | null; retenir?: boolean; connaitre?: boolean }): ObjetPlan[] {
  const point = o.recherche ?? jardinAE101();
  const proj = projecteurLocal(point.lat, point.lon);
  const candidats = classerCandidats(construireCandidats(AE101.parcelles, proj, { x: 0, y: 0 }, true));
  const principale = candidats[0];
  if (!principale || principale.idu !== IDU_AE101) throw new Error('AE 101 introuvable sous le point de recherche');
  const { adjacentes } = trierVoisines(principale, candidats);
  return objetsDepuisCadastre({
    principale, parcellesPropriete: () => [], proj, simplifier: true, geo: o.recherche,
    voisinesRetenues: () => (o.retenir ? adjacentes : []),
    ...(o.connaitre ? { voisinesConnues: () => adjacentes } : {}),
    importerBatiments: false, batiments: [], haies: [], vegetation: [], voisinageEtendu: null,
  });
}

/** Les rues autour d'AE 101, dans le repere du plan de la parcelle (ce que « Lire le nom des rues » range sur elle). */
export function ruesAE101(parcelle: ObjetPlan): RuesVoisinage {
  const cad = parcelle.cadastre as { origineLat: number; origineLon: number };
  return { recupereLe: '2026-10-15T08:21:00Z', rayonM: 250, rues: ruesDepuisTroncons(AE101.troncons, projecteurLocal(cad.origineLat, cad.origineLon)) };
}

/** Le cote dont le milieu est le plus pres de l'axe de l'allee des Limites : le cote sur rue, vu de la voie. */
export function coteAllee(parcelle: ObjetPlan): number {
  const pts = (parcelle as ObjetPlan & { pts: PtBrut[] }).pts;
  const allee = ruesAE101(parcelle).rues.find((r) => r.nom === 'Allee des Limites');
  if (!allee) throw new Error('allee des Limites absente de la fixture');
  let meilleur = -1, min = Infinity;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length] as PtBrut;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    for (const t of allee.troncons) for (let k = 1; k < t.length; k++) {
      const d = distancePointSegment(m, t[k - 1] as PtBrut, t[k] as PtBrut);
      if (d < min) { min = d; meilleur = i; }
    }
  });
  return meilleur;
}
