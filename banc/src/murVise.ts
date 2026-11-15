// Le mur qu'une vue regarde, ecrit pour les metadonnees (demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 4). Le tri de
// l'import (facadesVues.ts) dit deja le batiment et le cote par lequel on le voit ; ici, le segment du contour le plus vu de ce cote,
// la direction vers laquelle il regarde, la distance et l'incidence, et ce que la BD TOPO dit du batiment : de quoi remplir
// `MetaImage.mur` (types.ts::MurDeVue). Et le rattrapage : retrouver le mur d'une image importee avant, a partir de sa position et de
// son cap. Sans DOM, testable seul.

import { cadrePlat, CADRE_VUE, noteDeVue, ranger, regarder, type Batiment, type Cadre } from './facadesVues.js';
import { CHAMP_VUE } from './panoramax.js';
import { enMetres, type Ll } from './parcelles.js';
import { empriseAutour, type Emprise } from './carte.js';
import type { MetaImage, MurDeVue } from './types.js';

const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
const norm = (a: number) => ((a % 360) + 360) % 360;
/** L'ecart signe de `b` a `a`, entre -180 et 180. */
const ecart = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

export interface Segment { rang: number; ax: number; ay: number; bx: number; by: number; azimut: number; cote: number }

/**
 * Les segments du contour vus de la prise de vue (a l'origine), chacun avec la direction vers laquelle il regarde (sa normale tournee
 * vers la prise de vue) et son cote. Le cote se compte comme dans le tri : par quarts de tour depuis l'axe du batiment, la direction de
 * son plus long mur ramenee entre 0 et 90 degres (facadesVues.ts::axeDuContour et coteDuMur ; un test tient les deux d'accord).
 */
export function segments(contour: readonly Ll[], pos: Ll): Segment[] {
  const c = enMetres(contour, pos);
  let long = 0, axe = 0;
  const bruts: Omit<Segment, 'cote'>[] = [];
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const p = c[j] as { x: number; y: number }, q = c[i] as { x: number; y: number }, l = Math.hypot(q.x - p.x, q.y - p.y);
    if (l === 0) continue;
    if (l > long) { long = l; axe = ((deg(Math.atan2(q.x - p.x, q.y - p.y)) % 90) + 90) % 90; }
    let nx = q.y - p.y, ny = -(q.x - p.x);
    if (nx * -p.x + ny * -p.y < 0) { nx = -nx; ny = -ny; }
    bruts.push({ rang: j, ax: p.x, ay: p.y, bx: q.x, by: q.y, azimut: norm(deg(Math.atan2(nx, ny))) });
  }
  return bruts.map((s) => ({ ...s, cote: ((Math.round((s.azimut - axe) / 90) % 4) + 4) % 4 }));
}

/** La part du champ (en degres) qu'un segment occupe, vu de l'origine vers `cap` ; 0 s'il est hors du champ. */
export function etendueDansLeChamp(s: Segment, cap: number, champ: number): number {
  const a = ecart(cap, deg(Math.atan2(s.ax, s.ay))), b = ecart(cap, deg(Math.atan2(s.bx, s.by)));
  // Un segment qui passe derriere la prise de vue (ses bouts de part et d'autre, a plus de 180 degres) n'est pas devant elle.
  if (Math.abs(a - b) > 180) return 0;
  return Math.max(0, Math.min(Math.max(a, b), champ / 2) - Math.max(Math.min(a, b), -champ / 2));
}

/** La distance de l'origine a un segment. */
export function distanceAuSegment(s: Segment): number {
  const ex = s.bx - s.ax, ey = s.by - s.ay, t = Math.max(0, Math.min(1, -(s.ax * ex + s.ay * ey) / (ex * ex + ey * ey)));
  return Math.hypot(s.ax + t * ex, s.ay + t * ey);
}

export interface VueDuMur { cap: number; cote: number; note?: number | undefined; distanceFacade?: number | undefined }

/**
 * Le mur d'une vue, pret pour les metadonnees : parmi les segments du contour qui sont du cote dit par le tri, celui qui occupe le plus
 * du champ de la vue (le plus proche a egalite, ou si aucun n'est dans le champ). Rien ne sait ce qui le cache : c'est le mur vise, pas
 * la preuve qu'il se voit.
 */
export function murDeVue(b: Batiment, pos: Ll, v: VueDuMur, champ = CHAMP_VUE): MurDeVue {
  const mur: MurDeVue = { batiment: b.id, cote: v.cote };
  const duCote = segments(b.contour, pos).filter((s) => s.cote === v.cote);
  const choisi = duCote.map((s) => ({ s, vu: etendueDansLeChamp(s, v.cap, champ), d: distanceAuSegment(s) })).sort((x, y) => y.vu - x.vu || x.d - y.d)[0];
  if (choisi) {
    const s = choisi.s, ex = s.bx - s.ax, ey = s.by - s.ay;
    mur.segment = s.rang;
    mur.azimut = Math.round(s.azimut * 10) / 10;
    mur.incidence = Math.round(deg(Math.asin(Math.min(1, Math.abs(ex * Math.cos(rad(v.cap)) - ey * Math.sin(rad(v.cap))) / Math.hypot(ex, ey)))));
    mur.distance = Math.round((v.distanceFacade ?? choisi.d) * 10) / 10;
  } else if (typeof v.distanceFacade === 'number') mur.distance = v.distanceFacade;
  if (typeof v.note === 'number') mur.note = v.note;
  if (b.nature) mur.nature = b.nature;
  if (b.usage1) mur.usage = b.usage1;
  if (b.usage2) mur.usage2 = b.usage2;
  if (typeof b.hauteur === 'number') mur.hauteur = b.hauteur;
  if (typeof b.etages === 'number') mur.etages = b.etages;
  if (typeof b.logements === 'number') mur.logements = b.logements;
  return mur;
}

/** Le champ horizontal d'une photo plate d'apres sa focale equivalente 24 × 36 ; 65 degres sans focale (un telephone, a peu pres). */
export const champDeLaFocale = (focale35: number | null | undefined): number => (focale35 && focale35 > 0 ? deg(2 * Math.atan(18 / focale35)) : 65);

/** Jusqu'ou lire les batiments autour d'une image pour retrouver son mur : la portee du tri, et de quoi avoir le batiment en entier. */
export const PORTEE_RATTRAPAGE_M = 90;

/**
 * Le rattrapage : le mur d'une image deja dans le banc, retrouve par sa position et son cap parmi les batiments lus autour d'elle, avec
 * les regles du tri (une facade dans le champ, ni trop loin, ni en enfilade). Null quand elle n'en regarde aucun. Le cap d'une image est
 * celui de sa vue (une vue tiree d'un 360 : 75 degres ; une photo plate : le champ de sa focale).
 */
export function retrouverLeMur(m: Pick<MetaImage, 'lat' | 'lon' | 'azimut' | 'date' | 'focale35' | 'panoramax'>, batiments: readonly Batiment[], aujourdhui = new Date()): MurDeVue | null {
  if (typeof m.lat !== 'number' || typeof m.lon !== 'number' || typeof m.azimut !== 'number') return null;
  const pos = { lat: m.lat, lon: m.lon }, plate = !m.panoramax?.panoramique;
  const cadre: Cadre = plate ? cadrePlat(champDeLaFocale(m.focale35)) : CADRE_VUE;
  const scene = ranger(batiments), r = regarder(scene, pos, m.azimut, cadre);
  const b = r.batiment && r.facade ? scene.batiments.find((x) => x.id === r.batiment) : null;
  if (!b) return null;
  return { ...murDeVue(b, pos, { cap: m.azimut, cote: r.cote, note: noteDeVue(r, m.date ?? null, aujourdhui), distanceFacade: Math.round(r.distance * 10) / 10 }, cadre.champ), rattrapeLe: aujourdhui.toISOString() };
}

/** Le rattrapage se fait par petits lots lances a la main : au plus tant d'images a la fois, pour ne pas inonder le WFS de l'IGN. */
export const RATTRAPAGE_MAX = 40;
/** Le cote des cases qui regroupent les images voisines, en degres de latitude (220 m environ) : une lecture des batiments par case. */
const CASE_RATTRAPAGE = 0.002;

export interface LotDeRattrapage { emprise: Emprise; images: MetaImage[] }

/**
 * Les lectures a faire pour retrouver le mur d'images : celles d'un meme quartier se regroupent (une lecture de la BD TOPO pour toutes),
 * chaque emprise couvrant ses images et la portee du tri autour d'elles. Au plus `max` images en tout ; le reste attend le lot suivant.
 */
export function lotsDeRattrapage(images: readonly MetaImage[], max = RATTRAPAGE_MAX): LotDeRattrapage[] {
  const par = new Map<string, MetaImage[]>();
  for (const m of images.slice(0, max)) {
    if (typeof m.lat !== 'number' || typeof m.lon !== 'number') continue;
    const k = Math.floor(m.lat / CASE_RATTRAPAGE) + ':' + Math.floor((m.lon * Math.cos(rad(m.lat))) / CASE_RATTRAPAGE);
    par.set(k, [...(par.get(k) ?? []), m]);
  }
  return [...par.values()].map((l) => {
    let e: Emprise | null = null;
    for (const m of l) {
      const a = empriseAutour({ lat: m.lat as number, lon: m.lon as number }, PORTEE_RATTRAPAGE_M);
      e = e ? { sud: Math.min(e.sud, a.sud), ouest: Math.min(e.ouest, a.ouest), nord: Math.max(e.nord, a.nord), est: Math.max(e.est, a.est) } : a;
    }
    return { emprise: e as Emprise, images: l };
  });
}
