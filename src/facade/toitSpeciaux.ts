// Les toits a profil libre et les toits de revolution (MD/spec-regles-toits.md §3.1, §4) : papillon, coyau, berceau, carene,
// conique, polygonal, fleche, dome, imperiale.
//
// Deux familles, une facette par morceau plat :
// - les pans a profil : chaque pan est une ligne brisee (distance a l'egout, hauteur), et chaque segment une bande qui court le long
//   du faitage. Le papillon est le cas le plus simple (deux pans qui descendent vers la noue : un faitage plus bas que les egouts) ;
//   le coyau adoucit le bas du pan ; le berceau et la carene bombent le pan (`profil: courbe`). Les bouts sont des pignons :
//   un mur dont le sommet suit le profil.
// - les toits de revolution : un solide d'axe vertical au centre du rectangle, de rayon la moitie du plus petit cote, de l'egout au
//   faitage, en anneaux de facettes (une pyramide pour polygonal et fleche, un cone, un dome, un bulbe).
// Le dessin des toits a faitage, brise et demi-croupe reste dans toitFormes.ts, qui appelle ce module d'abord.

import type { CorpsToit } from '../model/types.js';

/** Un sommet dans le repere du corps : `s` le long du faitage, `t` en travers, `z` la hauteur au-dessus du sol. */
export interface Sommet { s: number; t: number; z: number }
/** Le debord que le dessin prolonge : l'egout (en t) et la rive (en s). */
export interface Debords { egout0: number; egout1: number; rive0: number; rive1: number }

type CorpsSpecial = Pick<CorpsToit, 'posFaitage' | 'faitage' | 'egouts'> & Partial<Pick<CorpsToit, 'croupes' | 'profil' | 'bouts' | 'speciale' | 'pignons'>>;

/** Un faitage plus bas que les deux egouts d'au moins cela : une noue, pas un faitage (la meme mesure que HAUTEUR_PLAT_M). */
const CREUX_PAPILLON_M = 0.3;
/** Les segments d'un pan courbe. */
const SEGMENTS_COURBE = 10;
/** Les facettes autour d'un cone, d'un dome, d'un bulbe. */
const FACES_ROND = 24;
/** Les anneaux d'un dome et d'un bulbe. */
const ANNEAUX_DOME = 6;
const ANNEAUX_BULBE = 12;

const pente = (deg: number) => Math.tan((deg * Math.PI) / 180);

/** Deux pans qui descendent vers une noue : le faitage est plus bas que les deux egouts. */
export function estPapillon(c: Pick<CorpsToit, 'posFaitage' | 'faitage' | 'egouts'>, W: number): boolean {
  return c.posFaitage > 0.01 && c.posFaitage < W - 0.01 && c.faitage <= Math.min(...c.egouts) - CREUX_PAPILLON_M;
}

/** Un corps a profil coyau ou courbe sur au moins un pan. */
const aProfilLibre = (c: CorpsSpecial): boolean => !!c.profil?.some((p) => p.type === 'coyau' || p.type === 'courbe');

/** Ce que ce module dessine : un toit de revolution, un papillon, un pan coyau ou courbe. */
export function estSpecial(c: CorpsSpecial, W: number): boolean {
  return !!c.speciale || estPapillon(c, W) || aProfilLibre(c);
}

/* ------------------------------------------------------------------------------------------------
 * Les pans a profil
 * --------------------------------------------------------------------------------------------- */

interface PointProfil { d: number; z: number }

/** Le profil d'un pan : de son mur d'egout (d = 0) a son faitage (d = largeur). */
function profilDuPan(c: CorpsSpecial, n: 0 | 1, W: number): PointProfil[] {
  const largeur = n === 0 ? c.posFaitage : W - c.posFaitage;
  const e = c.egouts[n], F = c.faitage;
  const pr = c.profil?.[n];
  if (pr?.type === 'coyau' && pr.penteDeg > 0 && pr.penteDeg < 90) {
    const lb = Math.min(pr.largeurM, 0.6 * largeur);
    const zb = e + lb * pente(pr.penteDeg);
    // Le coyau adoucit le bas : si la pente du coyau depasse celle du pan, il n'y a rien a adoucir.
    if (zb < e + ((F - e) * lb) / largeur) return [{ d: 0, z: e }, { d: lb, z: zb }, { d: largeur, z: F }];
  }
  if (pr?.type === 'courbe' && pr.flecheM > 0) {
    // Un arc : la droite de l'egout au faitage, bombee de la fleche au milieu ; a pente nulle au faitage quand la fleche l'y amene.
    const pts: PointProfil[] = [];
    for (let k = 0; k <= SEGMENTS_COURBE; k++) {
      const u = k / SEGMENTS_COURBE;
      pts.push({ d: u * largeur, z: e + (F - e) * u + pr.flecheM * Math.sin(Math.PI * u) });
    }
    return pts;
  }
  return [{ d: 0, z: e }, { d: largeur, z: F }];
}

/** Le profil prolonge au-dela du mur d'egout, a la pente de son premier segment : le debord. */
function avecDebord(p: PointProfil[], debord: number): PointProfil[] {
  if (debord <= 0 || p.length < 2) return p;
  const [a, b] = [p[0] as PointProfil, p[1] as PointProfil];
  const k = (b.z - a.z) / (b.d - a.d);
  return [{ d: -debord, z: a.z - k * debord }, ...p];
}

const hauteurProfil = (p: readonly PointProfil[], d: number): number => {
  for (let i = 1; i < p.length; i++) {
    const [a, b] = [p[i - 1] as PointProfil, p[i] as PointProfil];
    if (d <= b.d || i === p.length - 1) return a.z + ((b.z - a.z) * (Math.max(d, a.d) - a.d)) / (b.d - a.d);
  }
  return (p[0] as PointProfil).z;
};

function facettesProfilees(c: CorpsSpecial, L: number, W: number, d: Debords, bas: number): { pans: Sommet[][]; murs: Sommet[][] } {
  const p = c.posFaitage;
  const pans: Sommet[][] = [], murs: Sommet[][] = [];
  const profils = ([0, 1] as const).map((n) => ((n === 0 ? p : W - p) > 0.01 ? profilDuPan(c, n, W) : null));
  const t = (n: 0 | 1, dist: number) => (n === 0 ? dist : W - dist);
  ([0, 1] as const).forEach((n) => {
    const pr = profils[n];
    if (!pr) return;
    const etendu = avecDebord(pr, n === 0 ? d.egout0 : d.egout1);
    for (let i = 1; i < etendu.length; i++) {
      const [a, b] = [etendu[i - 1] as PointProfil, etendu[i] as PointProfil];
      pans.push([{ s: -d.rive0, t: t(n, a.d), z: a.z }, { s: L + d.rive1, t: t(n, a.d), z: a.z }, { s: L + d.rive1, t: t(n, b.d), z: b.z }, { s: -d.rive0, t: t(n, b.d), z: b.z }]);
    }
  });
  // Les murs de bout : du prisme au toit, par le profil des deux pans.
  for (const s of [0, L]) {
    const haut: Sommet[] = [];
    if (profils[0]) for (const q of profils[0]) haut.push({ s, t: t(0, q.d), z: q.z });
    // Le faitage de chaque pan est le meme point : le deuxieme profil, a l'envers, ne le redit pas.
    if (profils[1]) [...profils[1]].reverse().forEach((q, i) => { if (!(i === 0 && profils[0])) haut.push({ s, t: t(1, q.d), z: q.z }); });
    // Le sommet est compte une fois : le faitage de chaque pan est le meme point.
    const nets = haut.filter((q, i) => i === 0 || Math.hypot(q.t - (haut[i - 1] as Sommet).t, q.z - (haut[i - 1] as Sommet).z) > 1e-6);
    murs.push([{ s, t: 0, z: bas }, ...nets, { s, t: W, z: bas }]);
  }
  return { pans, murs };
}

function hauteurProfilee(c: CorpsSpecial, W: number, t: number): number {
  const p = c.posFaitage;
  if (t <= p && p > 0.01) return hauteurProfil(profilDuPan(c, 0, W), t);
  return hauteurProfil(profilDuPan(c, 1, W), W - t);
}

/* ------------------------------------------------------------------------------------------------
 * Les toits de revolution
 * --------------------------------------------------------------------------------------------- */

/** Le profil d'un solide de revolution, de la base (rayon 1, hauteur 0) au sommet (rayon 0, hauteur 1). */
function profilRevolution(type: NonNullable<CorpsToit['speciale']>['type']): { r: number; z: number }[] {
  if (type === 'dome') {
    const out: { r: number; z: number }[] = [];
    for (let k = 0; k <= ANNEAUX_DOME; k++) { const a = (k / ANNEAUX_DOME) * (Math.PI / 2); out.push({ r: Math.cos(a), z: Math.sin(a) }); }
    out[out.length - 1] = { r: 0, z: 1 };
    return out;
  }
  if (type === 'imperiale') {
    // Un bulbe : un col, un ventre a un tiers de la hauteur, puis une fleche effilee. Le rayon est ramene a 1 au ventre.
    const brut = (u: number) => Math.pow(1 - u, 1.1) * (0.5 + 1.15 * Math.sin(Math.PI * Math.pow(u, 0.8)));
    let max = 0;
    for (let k = 0; k <= 200; k++) max = Math.max(max, brut(k / 200));
    const out: { r: number; z: number }[] = [];
    for (let k = 0; k <= ANNEAUX_BULBE; k++) { const u = k / ANNEAUX_BULBE; out.push({ r: brut(u) / max, z: u }); }
    out[out.length - 1] = { r: 0, z: 1 };
    return out;
  }
  return [{ r: 1, z: 0 }, { r: 0, z: 1 }];
}

/** Le nombre de faces autour de l'axe : celui de la pyramide, sinon un rond. */
const facesDe = (c: CorpsSpecial): number => (c.speciale && 'cotes' in c.speciale ? c.speciale.cotes : FACES_ROND);

function facettesRevolution(c: CorpsSpecial & { speciale: NonNullable<CorpsToit['speciale']> }, L: number, W: number, bas: number): { pans: Sommet[][]; murs: Sommet[][] } {
  const e = Math.min(...c.egouts), F = c.faitage;
  const R = Math.min(L, W) / 2, cs = L / 2, ct = W / 2;
  const n = facesDe(c);
  const profil = profilRevolution(c.speciale.type);
  const sommet = (r: number, z: number, i: number): Sommet => {
    const a = (2 * Math.PI * i) / n + Math.PI / n;
    return { s: cs + R * r * Math.cos(a), t: ct + R * r * Math.sin(a), z: e + (F - e) * z };
  };
  const pans: Sommet[][] = [];
  for (let k = 1; k < profil.length; k++) {
    const [a, b] = [profil[k - 1] as { r: number; z: number }, profil[k] as { r: number; z: number }];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pans.push(b.r < 1e-9 ? [sommet(a.r, a.z, i), sommet(a.r, a.z, j), sommet(0, b.z, 0)] : [sommet(a.r, a.z, i), sommet(a.r, a.z, j), sommet(b.r, b.z, j), sommet(b.r, b.z, i)]);
    }
  }
  // Le toit de revolution est pose sur une dalle plate a l'egout, qui couvre le rectangle : un rond ne remplit jamais ses coins.
  pans.unshift([{ s: 0, t: 0, z: e }, { s: L, t: 0, z: e }, { s: L, t: W, z: e }, { s: 0, t: W, z: e }]);
  // Les murs de bout, du prisme a l'egout.
  const murs: Sommet[][] = [];
  if (e - bas > 0.02) for (const s of [0, L]) murs.push([{ s, t: 0, z: bas }, { s, t: W, z: bas }, { s, t: W, z: e }, { s, t: 0, z: e }]);
  return { pans, murs };
}

function hauteurRevolution(c: CorpsSpecial & { speciale: NonNullable<CorpsToit['speciale']> }, L: number, W: number, s: number, t: number): number {
  const e = Math.min(...c.egouts), F = c.faitage;
  const R = Math.min(L, W) / 2;
  const r = Math.hypot(s - L / 2, t - W / 2) / R;
  if (r >= 1) return e;
  const profil = profilRevolution(c.speciale.type);
  // Le rayon decroit de la base au sommet, sauf le col du bulbe : la hauteur du premier anneau qui passe sous r.
  for (let k = 1; k < profil.length; k++) {
    const [a, b] = [profil[k - 1] as { r: number; z: number }, profil[k] as { r: number; z: number }];
    if (r <= a.r && r >= b.r) return e + (F - e) * (a.z + ((b.z - a.z) * (a.r - r)) / Math.max(a.r - b.r, 1e-9));
  }
  return e + (F - e) * ((profil[profil.length - 1] as { z: number }).z);
}

/* ------------------------------------------------------------------------------------------------
 * Ce que les autres modules appellent
 * --------------------------------------------------------------------------------------------- */

/** Les facettes d'un toit special ; null pour les autres (toitFormes.ts les dessine). */
export function facettesSpeciales(c: CorpsSpecial, L: number, W: number, d: Debords, bas: number): { pans: Sommet[][]; murs: Sommet[][] } | null {
  if (c.speciale) return facettesRevolution({ ...c, speciale: c.speciale }, L, W, Math.min(bas, ...c.egouts));
  if (estPapillon(c, W) || aProfilLibre(c)) {
    // Un papillon, un coyau ou une courbe ferme ses bouts par des pignons : la croupe ou la demi-croupe n'a pas de sens sur un profil libre.
    return facettesProfilees(c, L, W, d, estPapillon(c, W) ? Math.min(bas, c.faitage) : bas);
  }
  return null;
}

/** La hauteur d'un toit special au point (s, t) ; null pour les autres. */
export function hauteurSpeciale(c: CorpsSpecial, L: number, W: number, s: number, t: number): number | null {
  if (c.speciale) return hauteurRevolution({ ...c, speciale: c.speciale }, L, W, s, t);
  if (estPapillon(c, W) || aProfilLibre(c)) return hauteurProfilee(c, W, t);
  return null;
}
