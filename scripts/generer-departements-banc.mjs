// Refait banc/src/departements.ts : les contours simplifies des departements de la metropole, pour l'ecran d'equilibre du banc (demande
// du proprietaire, 15 novembre 2026 : savoir d'ou viennent les photos du jeu, sans service a interroger).
//
//   node scripts/generer-departements-banc.mjs departements-version-simplifiee.geojson
//
// La source : github.com/gregoiredavid/france-geojson (departements-version-simplifiee.geojson), tire des contours administratifs de
// l'IGN (Licence Ouverte 2.0). Chaque anneau est encore simplifie (Douglas-Peucker, 0,01 degre : un kilometre environ) et ses points
// ranges au millieme de degre : assez pour compter des photos par departement, pas pour trancher une limite a cent metres pres.

import { readFileSync, writeFileSync } from 'node:fs';

const TOLERANCE = 0.01;
const source = process.argv[2];
if (!source) { console.error('usage : node scripts/generer-departements-banc.mjs <departements.geojson>'); process.exit(1); }

function simplifier(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let iMax = 0, dMax = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    if (d > dMax) { dMax = d; iMax = i; }
  }
  if (dMax <= tol) return [a, b];
  return [...simplifier(pts.slice(0, iMax + 1), tol).slice(0, -1), ...simplifier(pts.slice(iMax), tol)];
}

/** Un anneau ferme : coupe en deux moities simplifiees chacune (Douglas-Peucker ne sait pas partir d'un point double). */
function anneau(coords) {
  const pts = coords.slice(0, -1), m = Math.floor(pts.length / 2);
  const s = [...simplifier(pts.slice(0, m + 1), TOLERANCE).slice(0, -1), ...simplifier([...pts.slice(m), pts[0]], TOLERANCE).slice(0, -1)];
  return s.length >= 3 ? s.flatMap(([x, y]) => [Math.round(x * 1000), Math.round(y * 1000)]) : null;
}

const geo = JSON.parse(readFileSync(source, 'utf8'));
const deps = geo.features.map((f) => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  // Le seul contour exterieur de chaque morceau : une enclave se range chez celui qui l'entoure, a ce grain cela ne compte pas.
  return { code: f.properties.code, nom: f.properties.nom, anneaux: polys.map((p) => anneau(p[0])).filter(Boolean) };
}).sort((a, b) => a.code.localeCompare(b.code));

const lignes = deps.map((d) => `  { code: ${JSON.stringify(d.code)}, nom: ${JSON.stringify(d.nom)}, anneaux: ${JSON.stringify(d.anneaux)} },`);
writeFileSync(new URL('../banc/src/departements.ts', import.meta.url), `// Fichier genere par scripts/generer-departements-banc.mjs : ne pas le changer a la main.
// Les contours simplifies des departements de la metropole (un kilometre de tolerance, points au millieme de degre : lon, lat, lon, lat…),
// tires des contours administratifs de l'IGN (Licence Ouverte 2.0) par github.com/gregoiredavid/france-geojson. Ils servent a compter les
// photos du banc par departement (equilibre.ts), sans interroger un service.

export interface ContourDepartement { code: string; nom: string; anneaux: number[][] }

export const DEPARTEMENTS: ContourDepartement[] = [
${lignes.join('\n')}
];
`);
console.log(`${deps.length} départements, ${deps.reduce((s, d) => s + d.anneaux.reduce((t, a) => t + a.length / 2, 0), 0)} points`);
