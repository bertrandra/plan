// La carte des hauteurs mesurees d'un batiment et de son decoupage (MD/spec-toit-ign.md §13.4) :
// ce que le LiDAR a vu, en couleurs, et ce que Plan en a lu par-dessus - les corps, leurs faitages,
// les pignons qui partent du faitage. Calculee ici, dessinee par zones/composants/CarteToit.tsx.
//
// La carte est tournee dans l'axe du batiment (son plus long cote a l'horizontale), comme on lit un
// plan de toiture ; une fleche dit ou est le nord.

import { pointInPolygon } from '../../geometry/basic.js';
import { angleDuPlusLongCote } from '../../geometry/faitage.js';
import { repere, point, empreintePignon } from '../../facade/toitCorps.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';

/** Un point de la carte, en metres, y vers le bas (repere SVG). */
export interface PointCarte { x: number; y: number }
export interface TraitCarte { de: PointCarte; a: PointCarte }

export interface CarteToit {
  largeur: number;
  hauteur: number;
  cellules: { coins: PointCarte[]; couleur: string; z: number }[];
  contour: PointCarte[];
  corps: { coins: PointCarte[]; faitage: TraitCarte | null; aretiers: TraitCarte[]; libelle: { a: PointCarte; texte: string } }[];
  pignons: { coins: PointCarte[]; faitage: TraitCarte }[];
  /** La direction du nord, en degres dans la carte (0 = vers le haut, sens horaire). */
  nord: number;
  zMin: number;
  zMax: number;
}

/** La marge autour du batiment, en metres. */
const MARGE_M = 1;
const fr = (v: number) => v.toFixed(1).replace('.', ',');

/** La couleur d'une hauteur : bleu en bas, rouge en haut. */
export function couleurHauteur(z: number, zMin: number, zMax: number): string {
  const t = zMax > zMin ? Math.max(0, Math.min(1, (z - zMin) / (zMax - zMin))) : 0.5;
  return `hsl(${Math.round(240 - 240 * t)}, 80%, ${Math.round(48 + 6 * (1 - t))}%)`;
}

/** La carte d'un batiment qui porte une surface mesuree ; null sinon. */
export function carteDuToit(o: ObjetPlan): CarteToit | null {
  const m = o.toitMesure, contour = 'pts' in o ? (o.pts as PtBrut[]) : undefined;
  if (!m || !contour || contour.length < 3) return null;
  // Le repere de la carte : le plus long cote a l'horizontale.
  const angle = (angleDuPlusLongCote(contour) * Math.PI) / 180;
  const c = Math.cos(-angle), s = Math.sin(-angle);
  const tourne = (p: PtBrut) => ({ a: p.x * c - p.y * s, b: p.x * s + p.y * c });
  const loc = contour.map(tourne);
  const aMin = Math.min(...loc.map((q) => q.a)) - MARGE_M, aMax = Math.max(...loc.map((q) => q.a)) + MARGE_M;
  const bMin = Math.min(...loc.map((q) => q.b)) - MARGE_M, bMax = Math.max(...loc.map((q) => q.b)) + MARGE_M;
  const versCarte = (p: PtBrut): PointCarte => { const q = tourne(p); return { x: q.a - aMin, y: bMax - q.b }; };
  // Les cellules sous le contour.
  const brutes: { p: PtBrut; z: number }[] = [];
  for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) {
    const z = m.z[j * m.nx + i];
    const p = { x: m.x0 + i * m.pas, y: m.y0 - j * m.pas };
    if (z !== null && z !== undefined && pointInPolygon(p, contour)) brutes.push({ p, z });
  }
  if (!brutes.length) return null;
  const zs = brutes.map((b) => b.z);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  const d = m.pas / 2;
  const cellules = brutes.map(({ p, z }) => ({
    coins: [{ x: p.x - d, y: p.y - d }, { x: p.x + d, y: p.y - d }, { x: p.x + d, y: p.y + d }, { x: p.x - d, y: p.y + d }].map(versCarte),
    couleur: couleurHauteur(z, zMin, zMax),
    z,
  }));
  const corps = (o.corpsToit ?? []).map((k) => {
    const r = repere(k.pts);
    const plat = k.faitage - Math.min(...k.egouts) < 0.05;
    // Sous des croupes, le faitage s'arrete avant les bouts, et des aretiers le relient aux coins.
    const [h0, h1] = plat ? [0, 0] : k.croupes ?? [0, 0];
    const de = point(r, h0, k.posFaitage), a = point(r, r.L - h1, k.posFaitage);
    const faitage = plat ? null : { de: versCarte(de), a: versCarte(a) };
    const aretiers = [
      ...(h0 > 0 ? [point(r, 0, 0), point(r, 0, r.W)].map((q) => ({ de: versCarte(de), a: versCarte(q) })) : []),
      ...(h1 > 0 ? [point(r, r.L, 0), point(r, r.L, r.W)].map((q) => ({ de: versCarte(a), a: versCarte(q) })) : []),
    ];
    const milieu = versCarte(point(r, r.L / 2, plat ? r.W / 2 : k.posFaitage));
    return { coins: k.pts.map(versCarte), faitage, aretiers, libelle: { a: milieu, texte: plat ? 'plat ' + fr(k.faitage) + ' m' : fr(k.faitage) + ' m' } };
  });
  const pignons = (o.corpsToit ?? []).flatMap((k) => k.pignons.map((pg) => {
    const r = repere(k.pts);
    const sc = (pg.debut + pg.fin) / 2;
    const tMur = pg.pan === 0 ? 0 : r.W, tFond = pg.pan === 0 ? pg.profondeur : r.W - pg.profondeur;
    return { coins: empreintePignon(k, pg).map(versCarte), faitage: { de: versCarte(point(r, sc, tMur)), a: versCarte(point(r, sc, tFond)) } };
  }));
  // Le nord du plan (y vers le haut) dans la carte : tourne de -angle.
  const nord = (angle * 180) / Math.PI;
  return { largeur: aMax - aMin, hauteur: bMax - bMin, cellules, contour: contour.map(versCarte), corps, pignons, nord, zMin, zMax };
}
