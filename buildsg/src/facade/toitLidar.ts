// Le toit ajuste sur des hauteurs mesurees : le MNH LiDAR HD de l'IGN (MD/spec-toit-ign.md §10).
//
// Le modele numerique de hauteur donne, tous les 50 cm, la hauteur du sursol au-dessus du sol :
// sur un batiment, c'est la hauteur de sa couverture. On y ajuste les formes que Plan sait dessiner
// (toit plat, croupes sur le squelette, deux pans ou quatre pans dans l'axe du plus long mur, en
// travers, et dans l'axe que les mesures elles-memes dessinent ; un appentis dans chacun des quatre
// sens) par moindres carres : chaque forme a hauteur unite donne un profil `f(q)`, et les mesures
// `z = e + H f(q)` rendent l'egout `e` et la hauteur de faitage `H` d'un coup. La forme qui
// s'ecarte le moins des mesures l'emporte, a ecart egal la premiere essayee (la plus simple) ;
// au-dela d'un ecart que le LiDAR n'explique pas (un corps de batiment plus haut, une tourelle, un
// arbre), on renonce et le toit BD TOPO reste.
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
/** Un appentis se contente de moins : une rampe explique a peu pres n'importe quoi, un vrai appentis colle de pres. */
export const ECART_MAX_APPENTIS_M = 0.4;
/** Une mesure a plus de cela du toit ajuste est un arbre, une cheminee, une lucarne : ecartee, puis on refait l'ajustement. */
export const RESIDU_ABERRANT_M = 1.5;
/** L'axe des mesures : la tranche haute des cellules (sans les quelques plus hautes, cheminee ou arbre), et l'allongement qu'il lui faut pour dire une direction. */
const PART_HAUTE = 0.2;
const PART_ECARTEE = 0.04;
const ALLONGEMENT_MIN = 2.5;
/** Deux axes a moins de cela l'un de l'autre sont le meme : inutile d'essayer deux fois. */
const AXES_CONFONDUS_DEG = 8;
/** Deux paliers de hauteurs separes d'au moins cela, chacun avec au moins cette part des mesures : deux corps de batiment, pas un toit. */
export const SAUT_DEUX_CORPS_M = 1;
const PART_CORPS_MIN = 0.25;

interface Candidat {
  forme: FormeToit;
  angleFaitage: number;
  f: (q: PtBrut) => number;
}

const deg = (r: number) => (r * 180) / Math.PI;
const cm = (v: number) => Math.round(v * 100) / 100;

/**
 * La direction que dessinent les mesures les plus hautes (le faitage), en degres modulo 180, ou
 * null quand elles ne s'allongent pas : un toit plat, des croupes en pavillon, trop peu de mesures.
 * L'axe principal du nuage des `PART_HAUTE` cellules les plus hautes, par ses moments d'ordre deux.
 */
export function axeDesMesures(ech: readonly EchantillonHauteur[]): number | null {
  if (ech.length < ECHANTILLONS_MIN) return null;
  const triees = [...ech].sort((a, b) => b.z - a.z);
  const depart = Math.round(ech.length * PART_ECARTEE);
  const hautes = triees.slice(depart, depart + Math.max(6, Math.round(ech.length * PART_HAUTE)));
  const n = hautes.length;
  const mx = hautes.reduce((s, m) => s + m.x, 0) / n, my = hautes.reduce((s, m) => s + m.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const m of hautes) { sxx += (m.x - mx) ** 2; syy += (m.y - my) ** 2; sxy += (m.x - mx) * (m.y - my); }
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  if (l2 <= 1e-9 ? l1 <= 1e-9 : l1 / l2 < ALLONGEMENT_MIN * ALLONGEMENT_MIN) return null;
  // Le vecteur propre de l1 : (sxy, l1 - sxx), ou (l1 - syy, sxy) quand le premier degenere.
  const vx = Math.abs(sxy) > 1e-9 ? sxy : l1 - syy, vy = Math.abs(sxy) > 1e-9 ? l1 - sxx : sxy;
  return ((deg(Math.atan2(vy, vx)) % 180) + 180) % 180;
}

/**
 * Les mesures se separent-elles en deux paliers (un corps haut, un corps bas sous le meme contour) ?
 * Un toit, meme a deux pans raides, monte continument : ses hauteurs triees n'ont pas de saut. Un
 * saut d'au moins `SAUT_DEUX_CORPS_M` entre deux parts d'au moins un quart chacune n'est pas un toit
 * simple - et un appentis ou une rampe quelconque l'expliquerait a tort.
 */
export function deuxCorps(ech: readonly EchantillonHauteur[]): boolean {
  const z = ech.map((m) => m.z).sort((a, b) => a - b);
  const n = z.length;
  const debut = Math.ceil(n * PART_CORPS_MIN), fin = Math.floor(n * (1 - PART_CORPS_MIN));
  for (let i = debut; i < fin; i++) if ((z[i] ?? 0) - (z[i - 1] ?? 0) >= SAUT_DEUX_CORPS_M) return true;
  return false;
}

const ecartAxes = (a: number, b: number) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

/** Les formes que l'on essaie, chacune a hauteur unite, sur ce contour, dans l'ordre du plus simple au plus riche. */
function candidats(pts: readonly PtBrut[], axeMesure: number | null): Candidat[] {
  const angle = angleDuPlusLongCote(pts);
  const travers = (angle + 90) % 180;
  const parPlans = (forme: FormeToit, angleFaitage: number): Candidat => {
    const plans = plansDuToit(pts, { forme, hauteur: 1, angleFaitage });
    return { forme, angleFaitage, f: (q) => hauteurToitEn(plans, q) };
  };
  const croupes = facettesToit(pts, { forme: 'croupes', hauteur: 1, angleFaitage: 0 }).pans;
  // L'axe que les mesures dessinent, s'il n'est pas deja l'un des deux : un faitage de biais sur un contour irregulier.
  const axes = [angle, travers];
  if (axeMesure !== null && axes.every((a) => ecartAxes(a, axeMesure) > AXES_CONFONDUS_DEG)) axes.push(axeMesure);
  return [
    { forme: 'plat', angleFaitage: 0, f: () => 0 },
    // Un appentis monte vers +v, le cote de `angleFaitage + 90` : les quatre sens.
    ...[angle, angle + 180, travers, travers + 180].map((a) => parPlans('appentis', a % 360)),
    { forme: 'croupes', angleFaitage: 0, f: (q) => hauteurSurPans(croupes, q) ?? 0 },
    ...axes.map((a) => parPlans('deux-pans', a)),
    ...axes.map((a) => parPlans('quatre-pans', a)),
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

/** Pour comprendre un ajustement : chaque forme essayee, son ecart, sa hauteur et son egout. */
export function diagnostiquerToit(pts: readonly PtBrut[], ech: readonly EchantillonHauteur[]): { forme: FormeToit; angleFaitage: number; ecart: number; H: number; e: number; gardes: number }[] {
  return candidats(pts, axeDesMesures(ech)).flatMap((c) => {
    const a = ajuster(ech, c);
    return a ? [{ forme: c.forme, angleFaitage: Math.round(c.angleFaitage), ecart: cm(a.ecart), H: cm(a.H), e: cm(a.e), gardes: a.gardes.length }] : [];
  });
}

/**
 * Le toit qui explique le mieux les mesures sur ce contour, ou `null` quand aucune forme simple ne
 * les explique (ecart au-dela de `ECART_MAX_M`, ou deux corps de hauteurs differentes), quand il y a
 * trop peu de mesures, ou quand la pente retenue n'est pas celle d'une couverture (au-dela de
 * `PENTE_MAX_DEG`). Un toit trop bas
 * ou trop peu pentu pour etre autre chose est rendu plat, comme pour la BD TOPO (§4).
 */
export function ajusterToit(pts: readonly PtBrut[], ech: readonly EchantillonHauteur[]): ToitAjuste | null {
  if (pts.length < 3 || ech.length < ECHANTILLONS_MIN) return null;
  // Deux corps sous un contour : aucune forme simple ne vaut, l'appelant les separe (model/volumesToit.ts).
  if (deuxCorps(ech)) return null;
  let meilleur: { c: Candidat; a: Ajustement } | null = null;
  for (const c of candidats(pts, axeDesMesures(ech))) {
    const a = ajuster(ech, c);
    if (!a) continue;
    // Un ecart strictement plus petit l'emporte : a egalite, la forme essayee en premier, la plus simple.
    if (!meilleur || a.ecart < meilleur.a.ecart - 1e-9) meilleur = { c, a };
  }
  if (!meilleur || meilleur.a.ecart > (meilleur.c.forme === 'appentis' ? ECART_MAX_APPENTIS_M : ECART_MAX_M)) return null;
  const { c, a } = meilleur;
  const base = { egout: cm(a.e), ecart: cm(a.ecart), echantillons: a.gardes.length };
  const plat: Toit = { forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'lidar' };
  if (c.forme === 'plat' || a.H < HAUTEUR_TOIT_MIN_M) return { toit: plat, ...base };
  const p = pente(pts, c, a.H);
  if (p < PENTE_MIN_DEG) return { toit: plat, ...base };
  if (p > PENTE_MAX_DEG) return null;
  return { toit: { forme: c.forme, hauteur: cm(a.H), angleFaitage: c.angleFaitage, source: 'lidar' }, ...base };
}
