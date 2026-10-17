// Le corpus de facades REELLES (photos prises sur place, ouvertures annotees a la main) : la seule base honnete pour
// juger la detection, puisque le banc de synthese (tests/fixtures/facades) est ecrit et regle par la meme equipe que le
// code qu'il mesure. Ici : le format d'un cas, la mesure (precision, rappel, cotes) et la FIABILITE de la confiance
// (une confiance de 0,8 doit valoir 80 % de baies justes), avec et sans le vote entre vues.
//
// Un cas = un mur photographie : une ou plusieurs photos, leurs quatre coins (poses ou corriges a la main), la largeur
// reelle, et les ouvertures de la verite. `statut: 'brouillon'` : issu d'un fichier d'audit, pas encore relu ; seul un cas
// `valide` (verifie sur la photo, par une personne) compte dans la mesure.

import { analyserReleve } from '../../../src/facade/analyse.js';
import { analyserVues } from '../../../src/facade/fusion.js';
import { recouvrement } from '../../../src/facade/voteVues.js';
import type { OuvertureDetectee } from '../../../src/facade/detection.js';
import type { Image, P2 } from '../../../src/facade/homographie.js';
import type { TypeOuverture } from '../../../src/model/types.js';

export const FORMAT_CAS_REEL = 'plan-facade-reelle';

export interface OuvertureVraie { type: TypeOuverture; x: number; y: number; l: number; h: number }
export interface PhotoReelle {
  /** Le fichier image, a cote du JSON. */
  fichier: string;
  /** Haut gauche, haut droit, bas droit, bas gauche, en pixels de la photo. */
  coins: P2[];
  focalePx?: number | null;
}
export interface CasReel {
  format: typeof FORMAT_CAS_REEL;
  version: 1;
  nom: string;
  statut: 'brouillon' | 'valide';
  /** D'ou vient le cas (fichier d'audit, batiment, cote) ; libre. */
  source?: string;
  largeurM: number;
  hauteurM: number;
  photos: PhotoReelle[];
  /** Les ouvertures de la verite, en metres (x depuis la gauche, y depuis le sol). */
  ouvertures: OuvertureVraie[];
  /** Ce que la facade a de difficile : haie, voiture, ton sur ton, reflets… (pour lire les resultats par cause). */
  difficultes?: string[];
}

export function lireCasReel(donnees: unknown): CasReel {
  const c = donnees as Partial<CasReel> | null;
  if (!c || c.format !== FORMAT_CAS_REEL || c.version !== 1) throw new Error('Ce n’est pas un cas de facade reelle.');
  if (typeof c.nom !== 'string' || !(c.largeurM && c.largeurM > 0) || !(c.hauteurM && c.hauteurM > 0)) throw new Error('Cas reel incomplet : nom, largeur, hauteur.');
  if (!Array.isArray(c.photos) || !c.photos.length || c.photos.some((p) => !p.fichier || !Array.isArray(p.coins) || p.coins.length !== 4)) throw new Error('Cas reel incomplet : chaque photo veut un fichier et quatre coins.');
  if (!Array.isArray(c.ouvertures)) throw new Error('Cas reel incomplet : ouvertures.');
  return { ...(c as CasReel), statut: c.statut === 'valide' ? 'valide' : 'brouillon' };
}

/** Une ouverture detectee, jugee : juste si elle recouvre une vraie ouverture (une seule vraie par detectee). */
export interface Jugee { confiance: number; juste: boolean; devinee: boolean }

export interface ResultatCas {
  nom: string;
  vraies: number;
  trouvees: number;
  vp: number;
  fp: number;
  fn: number;
  /** Ecart absolu median des cotes des baies retrouvees, en cm ; null sans baie retrouvee. */
  coteMedianeCm: number | null;
  jugees: Jugee[];
}

const SEUIL_JUSTE = 0.4;

/** Apparie detectees et vraies (glouton, meilleur recouvrement d'abord). */
export function juger(vraies: readonly OuvertureVraie[], trouvees: readonly OuvertureDetectee[]): { jugees: Jugee[]; cotes: number[]; vp: number } {
  const paires: { i: number; j: number; r: number }[] = [];
  trouvees.forEach((t, j) => vraies.forEach((v, i) => { const r = recouvrement({ ...t }, { ...t, ...v, confiance: 0 }); if (r >= SEUIL_JUSTE) paires.push({ i, j, r }); }));
  paires.sort((a, b) => b.r - a.r);
  const pi = new Set<number>(), pj = new Set<number>(), cotes: number[] = [];
  for (const { i, j } of paires) {
    if (pi.has(i) || pj.has(j)) continue;
    pi.add(i); pj.add(j);
    const v = vraies[i] as OuvertureVraie, t = trouvees[j] as OuvertureDetectee;
    cotes.push(...[t.x - v.x, t.y - v.y, t.l - v.l, t.h - v.h].map((d) => Math.abs(d) * 100));
  }
  return { jugees: trouvees.map((t, j) => ({ confiance: t.confiance, juste: pj.has(j), devinee: t.source === 'devinee' })), cotes, vp: pi.size };
}

const mediane = (l: number[]): number | null => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] as number; };

/** Mesure un cas : `images` sont les photos decodees, dans l'ordre de `cas.photos`. `multiVues: false` ne lit que la premiere photo. */
export function mesurerCas(cas: CasReel, images: readonly Image[], multiVues = true): ResultatCas {
  const contour = [{ x: 0, y: 0 }, { x: cas.largeurM, y: 0 }, { x: cas.largeurM, y: 6 }, { x: 0, y: 6 }];
  const commun = { largeur: cas.largeurM, hauteur: cas.hauteurM, contour, cote: 0, distance: null };
  const photos = cas.photos.map((p, k) => ({ photo: images[k] as Image, coins: p.coins, focalePx: p.focalePx ?? null }));
  let ouvertures: OuvertureDetectee[] = [];
  if (multiVues && photos.length > 1) ouvertures = analyserVues({ ...commun, vues: photos })?.ouvertures ?? [];
  else {
    const p = photos[0] as (typeof photos)[number];
    ouvertures = analyserReleve({ ...commun, photo: p.photo, coins: p.coins, focalePx: p.focalePx })?.ouvertures ?? [];
  }
  const { jugees, cotes, vp } = juger(cas.ouvertures, ouvertures);
  return { nom: cas.nom, vraies: cas.ouvertures.length, trouvees: ouvertures.length, vp, fp: ouvertures.length - vp, fn: cas.ouvertures.length - vp, coteMedianeCm: mediane(cotes), jugees };
}

export interface Case { de: number; a: number; n: number; justes: number; taux: number | null; confianceMoyenne: number | null }
export interface Fiabilite {
  cases: Case[];
  /** Ecart de calibration : moyenne ponderee de |taux de justes - confiance moyenne| par case, de 0 (parfait) a 1. */
  ece: number | null;
  /** Erreur quadratique moyenne entre la confiance et le jugement (0 ou 1) : plus bas, mieux. */
  brier: number | null;
  n: number;
}

/** La courbe de fiabilite : de 0 a 1 par `nCases` cases egales. Une confiance calibree fait un taux de justes egal a la confiance. */
export function fiabilite(jugees: readonly Jugee[], nCases = 5): Fiabilite {
  const cases: Case[] = Array.from({ length: nCases }, (_, k) => ({ de: k / nCases, a: (k + 1) / nCases, n: 0, justes: 0, taux: null, confianceMoyenne: null }));
  const sommes = new Array<number>(nCases).fill(0);
  for (const j of jugees) {
    const k = Math.min(nCases - 1, Math.floor(j.confiance * nCases));
    const c = cases[k] as Case;
    c.n++; c.justes += j.juste ? 1 : 0; sommes[k] = (sommes[k] ?? 0) + j.confiance;
  }
  let ece = 0;
  cases.forEach((c, k) => {
    if (!c.n) return;
    c.taux = c.justes / c.n; c.confianceMoyenne = (sommes[k] as number) / c.n;
    ece += (c.n / jugees.length) * Math.abs(c.taux - c.confianceMoyenne);
  });
  const brier = jugees.length ? jugees.reduce((s, j) => s + (j.confiance - (j.juste ? 1 : 0)) ** 2, 0) / jugees.length : null;
  return { cases, ece: jugees.length ? ece : null, brier, n: jugees.length };
}

const pc = (x: number | null) => (x === null ? '—' : Math.round(x * 100) + ' %');

/** Le tableau Markdown d'un passage sur le corpus. */
export function tableauReel(res: readonly ResultatCas[], titre: string): string[] {
  const l: string[] = [`### ${titre}`, '', '| Cas | Vraies | Trouvées | VP | FP | FN | Précision | Rappel | Cote méd. (cm) |', '|---|--:|--:|--:|--:|--:|--:|--:|--:|'];
  for (const r of res) l.push(`| ${r.nom} | ${r.vraies} | ${r.trouvees} | ${r.vp} | ${r.fp} | ${r.fn} | ${pc(r.trouvees ? r.vp / r.trouvees : null)} | ${pc(r.vraies ? r.vp / r.vraies : null)} | ${r.coteMedianeCm === null ? '—' : r.coteMedianeCm.toFixed(1).replace('.', ',')} |`);
  const t = res.reduce((s, r) => ({ v: s.v + r.vraies, t: s.t + r.trouvees, vp: s.vp + r.vp }), { v: 0, t: 0, vp: 0 });
  l.push(`| **Ensemble** (${res.length}) | ${t.v} | ${t.t} | ${t.vp} | ${t.t - t.vp} | ${t.v - t.vp} | **${pc(t.t ? t.vp / t.t : null)}** | **${pc(t.v ? t.vp / t.v : null)}** | |`, '');
  const f = fiabilite(res.flatMap((r) => r.jugees));
  l.push(`Fiabilité de la confiance (${f.n} baies) : écart de calibration **${f.ece === null ? '—' : f.ece.toFixed(2).replace('.', ',')}**, Brier **${f.brier === null ? '—' : f.brier.toFixed(3).replace('.', ',')}**.`, '', '| Confiance | Baies | Justes | Taux de justes | Confiance moyenne |', '|---|--:|--:|--:|--:|');
  for (const c of f.cases) l.push(`| ${c.de.toFixed(1).replace('.', ',')} – ${c.a.toFixed(1).replace('.', ',')} | ${c.n} | ${c.justes} | ${pc(c.taux)} | ${pc(c.confianceMoyenne)} |`);
  l.push('');
  return l;
}

/** Un brouillon tire d'un fichier d'audit de parcelle : le cas, et la photo (base64) a ecrire a cote. */
export interface Brouillon { cas: CasReel; base64: string }

interface AuditPourBrouillons {
  format?: string;
  batiments?: { cle: string; nom: string; facades: { cote: number; photos: { base64: string }[]; mesure: { rangReleve: number | null; releve: { largeur: number; hauteur: number; ouvertures: OuvertureVraie[]; calage?: { photos: { coins: P2[] }[] } } | null } | null }[] }[];
}

/**
 * Les brouillons d'un fichier d'audit de parcelle : pour chaque facade releveee, la photo du releve, ses coins (ceux du calage)
 * et les ouvertures du releve. Ce que Plan avait propose (peut-etre retouche) n'est pas une verite : `statut: 'brouillon'`.
 */
export function brouillonsDeLAudit(audit: unknown, base: string): Brouillon[] {
  const f = audit as AuditPourBrouillons;
  if (!f || !Array.isArray(f.batiments)) throw new Error('Ce n’est pas un fichier d’audit de parcelle (pas de bâtiments).');
  const out: Brouillon[] = [];
  for (const b of f.batiments) for (const fa of b.facades) {
    const r = fa.mesure?.releve, photo = fa.photos[fa.mesure?.rangReleve ?? 0], coins = r?.calage?.photos[0]?.coins;
    if (!r || !photo || !coins || coins.length !== 4) continue;
    const nom = `${base}-${b.cle.replace(/[^a-z0-9]+/gi, '').slice(-8)}-c${fa.cote}`;
    out.push({
      base64: photo.base64,
      cas: {
        format: FORMAT_CAS_REEL, version: 1, nom, statut: 'brouillon', source: `${base} › ${b.nom} › côté ${fa.cote}`,
        largeurM: r.largeur, hauteurM: r.hauteur, photos: [{ fichier: nom + '.jpg', coins: coins.map(({ x, y }) => ({ x, y })) }],
        ouvertures: r.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })),
      },
    });
  }
  return out;
}
