// Le toit ajuste sur des hauteurs mesurees : le MNH LiDAR HD de l'IGN (MD/spec-toit-ign.md §10).
//
// Le modele numerique de hauteur donne, tous les 50 cm, la hauteur du sursol au-dessus du sol :
// sur un batiment, c'est la hauteur de sa couverture. On y ajuste les formes que Plan sait dessiner
// (toit plat, croupes sur le squelette, deux pans ou quatre pans dans l'axe du plus long mur ou en
// travers) par moindres carres : chaque forme a hauteur unite donne un profil `f(q)`, et les
// mesures `z = e + H f(q)` rendent l'egout `e` et la hauteur de faitage `H` d'un coup. La forme
// qui s'ecarte le moins des mesures l'emporte, a cout egal la plus simple ; au-dela d'un ecart
// que le LiDAR n'explique pas (un corps de batiment plus haut, une tourelle, un arbre), on
// renonce et le toit BD TOPO reste.
//
// Ce module ne lit rien : il recoit des echantillons (geo/mnh.ts les lit) et rend un toit.

import { au } from '../util/tableaux.js';
import { angleDuPlusLongCote, plansDuToit, hauteurToitEn, facettesToit, hauteurSurPans, profondeurToit, repereFaitage } from './toit.js';
import { HAUTEUR_TOIT_MIN_M, PENTE_MIN_DEG, PENTE_MAX_DEG } from '../model/toitBdTopo.js';
import type { PtBrut, Toit, FormeToit } from '../model/types.js';

/** Une mesure : un point du plan et la hauteur du sursol au-dessus du sol, en metres. */
export interface EchantillonHauteur {
  x: number;
  y: number;
  z: number;
}

/** Ce que l'ajustement rend : le toit, l'egout mesure, la qualite. */
export interface ToitAjuste {
  toit: Toit;
  /** La hauteur de l'egout au-dessus du sol, en metres, d'apres les mesures. */
  egout: number;
  /** L'ecart quadratique moyen entre le toit retenu et les mesures, en metres. */
  ecart: number;
  /** Combien de mesures ont servi, une fois les aberrantes ecartees. */
  echantillons: number;
}

/** En dessous, on ne juge pas une forme : un abri de jardin fait une vingtaine de cellules. */
export const ECHANTILLONS_MIN = 20;
/** Au-dela de cet ecart, aucune forme simple n'explique les mesures : le toit BD TOPO reste. */
export const ECART_MAX_M = 0.8;
/** Une mesure a plus de cela du toit ajuste est un arbre, une cheminee, une lucarne : ecartee, puis on refait l'ajustement. */
export const RESIDU_ABERRANT_M = 1.5;
/** Ce que coute un quatre pans par rapport aux croupes et aux deux pans, en metres d'ecart : a mesures egales, le plus simple. */
const COUT_QUATRE_PANS_M = 0.05;

interface Candidat {
  forme: FormeToit;
  angleFaitage: number;
  f: (q: PtBrut) => number;
}

const deg = (r: number) => (r * 180) / Math.PI;
const cm = (v: number) => Math.round(v * 100) / 100;

/** Les formes que l'on essaie, chacune a hauteur unite, sur ce contour. */
function candidats(pts: readonly PtBrut[]): Candidat[] {
  const angle = angleDuPlusLongCote(pts);
  const travers = (angle + 90) % 180;
  const parPlans = (forme: FormeToit, angleFaitage: number): Candidat => {
    const plans = plansDuToit(pts, { forme, hauteur: 1, angleFaitage });
    return { forme, angleFaitage, f: (q) => hauteurToitEn(plans, q) };
  };
  const croupes = facettesToit(pts, { forme: 'croupes', hauteur: 1, angleFaitage: 0 }).pans;
  return [
    { forme: 'plat', angleFaitage: 0, f: () => 0 },
    { forme: 'croupes', angleFaitage: 0, f: (q) => hauteurSurPans(croupes, q) ?? 0 },
    parPlans('deux-pans', angle),
    parPlans('deux-pans', travers),
    parPlans('quatre-pans', angle),
    parPlans('quatre-pans', travers),
  ];
}

interface Ajustement {
  e: number;
  H: number;
  ecart: number;
  gardes: EchantillonHauteur[];
}

/** `z = e + H f` par moindres carres, puis sans les mesures aberrantes ; `H` ne descend pas sous zero. */
function ajuster(ech: readonly EchantillonHauteur[], c: Candidat): Ajustement | null {
  const passe = (mesures: readonly EchantillonHauteur[]): Ajustement | null => {
    const n = mesures.length;
    if (n < ECHANTILLONS_MIN) return null;
    const fs = mesures.map((m) => c.f(m));
    const mf = fs.reduce((s, v) => s + v, 0) / n;
    const mz = mesures.reduce((s, m) => s + m.z, 0) / n;
    let sff = 0,
      sfz = 0;
    fs.forEach((f, i) => {
      sff += (f - mf) * (f - mf);
      sfz += (f - mf) * (au(mesures, i).z - mz);
    });
    const H = sff > 1e-9 ? Math.max(0, sfz / sff) : 0;
    const e = mz - H * mf;
    const residus = mesures.map((m, i) => m.z - (e + H * au(fs, i)));
    const ecart = Math.sqrt(residus.reduce((s, r) => s + r * r, 0) / n);
    const gardes = mesures.filter((_, i) => Math.abs(au(residus, i)) <= RESIDU_ABERRANT_M);
    return { e, H, ecart, gardes };
  };
  const premier = passe(ech);
  if (!premier) return null;
  if (premier.gardes.length === ech.length) return premier;
  return passe(premier.gardes) ?? premier;
}

/** La pente d'une forme ajustee, en degres : celle du squelette pour les croupes, du faitage sinon. */
function pente(pts: readonly PtBrut[], c: Candidat, H: number): number {
  if (c.forme === 'croupes') {
    const d = profondeurToit(pts);
    return d > 0 ? deg(Math.atan(H / d)) : 0;
  }
  const r = repereFaitage(pts, c.angleFaitage);
  return r.hw > 0 ? deg(Math.atan(H / r.hw)) : 0;
}

/**
 * Le toit qui explique le mieux les mesures sur ce contour, ou `null` quand aucune forme simple ne
 * les explique (ecart au-dela de `ECART_MAX_M`), quand il y a trop peu de mesures, ou quand la
 * pente retenue n'est pas celle d'une couverture (au-dela de `PENTE_MAX_DEG`). Un toit trop bas
 * ou trop peu pentu pour etre autre chose est rendu plat, comme pour la BD TOPO (§4).
 */
export function ajusterToit(pts: readonly PtBrut[], ech: readonly EchantillonHauteur[]): ToitAjuste | null {
  if (pts.length < 3 || ech.length < ECHANTILLONS_MIN) return null;
  let meilleur: { c: Candidat; a: Ajustement; cout: number } | null = null;
  for (const c of candidats(pts)) {
    const a = ajuster(ech, c);
    if (!a) continue;
    const cout = a.ecart + (c.forme === 'quatre-pans' ? COUT_QUATRE_PANS_M : 0);
    if (!meilleur || cout < meilleur.cout) meilleur = { c, a, cout };
  }
  if (!meilleur || meilleur.a.ecart > ECART_MAX_M) return null;
  const { c, a } = meilleur;
  const base = { egout: cm(a.e), ecart: cm(a.ecart), echantillons: a.gardes.length };
  const plat: Toit = { forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'lidar' };
  if (c.forme === 'plat' || a.H < HAUTEUR_TOIT_MIN_M) return { toit: plat, ...base };
  const p = pente(pts, c, a.H);
  if (p < PENTE_MIN_DEG) return { toit: plat, ...base };
  if (p > PENTE_MAX_DEG) return null;
  return { toit: { forme: c.forme, hauteur: cm(a.H), angleFaitage: c.angleFaitage, source: 'lidar' }, ...base };
}
