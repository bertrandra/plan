// Les rues dessinees sur le plan : l'option « Rues » du menu Affichage (MD/spec-rues.md §7 et §8, render/).
//
// Chaque troncon lu a la BD TOPO (geo/rues.ts) a ete mesure en travers (model/trottoirs.ts) : une chaussee entre deux bords, et la
// ou les limites des parcelles le permettent, un trottoir de chaque cote, de la chaussee a la limite. On les pose ici en pixels :
// tous les bords des chaussees d'abord, puis toutes les chaussees (un disque ferme chaque bout de troncon : a un carrefour, les
// rubans se fondent au lieu de se couper par leurs bords), puis les trottoirs, et un trait fin de bordure entre trottoir et chaussee.
// Les couleurs sont celles choisies sous « Rues » : « Plan » (jetons `--chaussee`, `--trottoir`, `--chaussee-bord`, l'ambre d'une
// carte routiere) ou « Reelles » (`--chaussee-reelle`, `--trottoir-reel`, `--bordure-reelle`). Le calque est sous les objets et sous
// le nom des rues, au-dessus du fond : il situe, il ne cache rien du projet, et les clics le traversent.
//
// Dessine a l'ecran comme le nom des rues (le calque suit l'ecran) : seuls les troncons qui touchent la vue sont ecrits, chaque
// famille en un chemin SVG.

import { creerSvg } from './svg.js';
import { encresDesRues } from './theme.js';
import { versEcran, versMonde, type EtatScene } from '../geometry/vue.js';
import { couleursRues, type ProfilRue, type StationRue } from '../model/trottoirs.js';
import { profilsDuPlan } from '../core/profilsRues.js';
import { parcelleDuProjet } from '../model/fonctions.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';

/** La plus petite largeur d'une chaussee a l'ecran : vue de loin, une rue reste un trait qui se voit. */
export const LARGEUR_CHAUSSEE_MIN_PX = 2.5;
/** L'epaisseur du bord, de chaque cote, en pixels ; et celle du trait de bordure entre trottoir et chaussee. */
export const BORD_CHAUSSEE_PX = 1.2;
/** Le nombre de cotes du disque qui ferme un bout de troncon. */
const COTES_BOUT = 16;

/** La largeur d'une chaussee a l'ecran, a l'echelle de la vue, au demi-pixel. */
export function largeurChausseePx(largeurM: number, echelle: number): number {
  return Math.round(Math.max(LARGEUR_CHAUSSEE_MIN_PX, largeurM * echelle) * 2) / 2;
}

/** Le point a `decalage` de l'axe, le long de la normale (allongee aux coudes) de la mesure. */
export const aDecalage = (s: StationRue, decalage: number): PtBrut => ({ x: s.x + s.nx * decalage, y: s.y + s.ny * decalage });

/** Les bords de la chaussee d'une mesure, elargie autour de son milieu jusqu'a `minM` metres si elle est plus etroite. */
export function bordsChaussee(s: StationRue, minM = 0): { g: number; d: number } {
  const l = s.chausseeG - s.chausseeD;
  if (l >= minM) return { g: s.chausseeG, d: s.chausseeD };
  const m = (s.chausseeG + s.chausseeD) / 2;
  return { g: m + minM / 2, d: m - minM / 2 };
}

/** Les suites de mesures consecutives qui ont un trottoir de ce cote : chacune un ruban. */
export function suitesAvecTrottoir(stations: readonly StationRue[], cote: 'G' | 'D'): StationRue[][] {
  const suites: StationRue[][] = [];
  let courante: StationRue[] = [];
  for (const s of stations) {
    if ((cote === 'G' ? s.trottoirG : s.trottoirD) !== null) courante.push(s);
    else { if (courante.length >= 2) suites.push(courante); courante = []; }
  }
  if (courante.length >= 2) suites.push(courante);
  return suites;
}

/** Les disques qui ferment les deux bouts d'un profil : centre au milieu de la chaussee, rayon sa demi-largeur. */
export function boutsDuProfil(p: ProfilRue, minM = 0): { centre: PtBrut; rayon: number }[] {
  const res: { centre: PtBrut; rayon: number }[] = [];
  for (const s of [p.stations[0], p.stations[p.stations.length - 1]]) {
    if (!s) continue;
    const b = bordsChaussee(s, minM);
    res.push({ centre: aDecalage(s, (b.g + b.d) / 2), rayon: (b.g - b.d) / 2 });
  }
  return res;
}

/** Un polygone en chemin SVG, toujours dans le meme sens : deux rubans qui se chevauchent se remplissent, ils ne se trouent pas. */
function polygone(pts: readonly PtBrut[], scene: EtatScene): string {
  if (pts.length < 3) return '';
  let aire = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as PtBrut, b = pts[(i + 1) % pts.length] as PtBrut;
    aire += a.x * b.y - b.x * a.y;
  }
  const ordre = aire < 0 ? [...pts].reverse() : pts;
  return ordre.map((p, i) => { const e = versEcran(scene, p); return (i ? 'L' : 'M') + e.x.toFixed(1) + ' ' + e.y.toFixed(1); }).join('') + 'Z';
}

function polyligne(pts: readonly PtBrut[], scene: EtatScene): string {
  return pts.map((p, i) => { const e = versEcran(scene, p); return (i ? 'L' : 'M') + e.x.toFixed(1) + ' ' + e.y.toFixed(1); }).join('');
}

/** Le profil touche-t-il le rectangle (repere du plan), elargi de sa plus grande distance a l'axe ? */
function visible(p: ProfilRue, e: { xMin: number; xMax: number; yMin: number; yMax: number }): boolean {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, marge = 0;
  for (const s of p.stations) {
    xMin = Math.min(xMin, s.x); xMax = Math.max(xMax, s.x); yMin = Math.min(yMin, s.y); yMax = Math.max(yMax, s.y);
    marge = Math.max(marge, Math.abs(s.chausseeG), Math.abs(s.chausseeD), Math.abs(s.trottoirG ?? 0), Math.abs(s.trottoirD ?? 0));
  }
  return xMax >= e.xMin - marge && xMin <= e.xMax + marge && yMax >= e.yMin - marge && yMin <= e.yMax + marge;
}

/**
 * Dessine les rues dans `groupe`, si l'option « Rues » est cochee et que les chaussees ont ete lues ; le vide sinon. La parcelle
 * masquee emporte ses rues, comme le nom des rues.
 */
export function dessinerChaussees(groupe: SVGElement, objets: ObjetPlan[], scene: EtatScene, masque: (o: ObjetPlan) => boolean = () => false): void {
  groupe.innerHTML = '';
  const parcelle = parcelleDuProjet(objets);
  const profils = parcelle && !masque(parcelle) ? profilsDuPlan(objets) : [];
  if (!profils.length) return;
  const hautGauche = versMonde(scene, { x: 0, y: 0 }), basDroit = versMonde(scene, { x: scene.W, y: scene.H });
  const ecran = { xMin: hautGauche.x, xMax: basDroit.x, yMin: basDroit.y, yMax: hautGauche.y };
  const minM = LARGEUR_CHAUSSEE_MIN_PX / scene.scale;
  const chaussees: string[] = [], trottoirs: string[] = [], bordures: string[] = [];
  for (const p of profils) {
    if (p.stations.length < 2 || !visible(p, ecran)) continue;
    const g = p.stations.map((s) => aDecalage(s, bordsChaussee(s, minM).g)), d = p.stations.map((s) => aDecalage(s, bordsChaussee(s, minM).d));
    chaussees.push(polygone([...g, ...d.reverse()], scene));
    for (const b of boutsDuProfil(p, minM)) {
      const cercle = Array.from({ length: COTES_BOUT }, (_, k) => ({ x: b.centre.x + b.rayon * Math.cos((2 * Math.PI * k) / COTES_BOUT), y: b.centre.y + b.rayon * Math.sin((2 * Math.PI * k) / COTES_BOUT) }));
      chaussees.push(polygone(cercle, scene));
    }
    for (const cote of ['G', 'D'] as const) {
      for (const suite of suitesAvecTrottoir(p.stations, cote)) {
        const bord = suite.map((s) => aDecalage(s, cote === 'G' ? s.chausseeG : s.chausseeD));
        const limite = suite.map((s) => aDecalage(s, (cote === 'G' ? s.trottoirG : s.trottoirD) as number));
        trottoirs.push(polygone([...bord, ...[...limite].reverse()], scene));
        bordures.push(polyligne(bord, scene));
      }
    }
  }
  if (!chaussees.length) return;
  const encres = encresDesRues(couleursRues(parcelle));
  const bords = creerSvg('g', { class: 'chausseesBords' }), pleins = creerSvg('g', { class: 'chausseesPleins' });
  bords.appendChild(creerSvg('path', { d: chaussees.join(''), fill: encres.bordure, stroke: encres.bordure, 'stroke-width': 2 * BORD_CHAUSSEE_PX, 'stroke-linejoin': 'round' }));
  pleins.appendChild(creerSvg('path', { d: chaussees.join(''), fill: encres.chaussee }));
  groupe.append(bords, pleins);
  // Les trottoirs par-dessus la chaussee, comme en Vue 3D ou ils sont plus hauts ; leur bordure en dernier, d'un trait fin.
  if (trottoirs.length) {
    const t = creerSvg('g', { class: 'trottoirs' }), b = creerSvg('g', { class: 'trottoirsBordures' });
    t.appendChild(creerSvg('path', { d: trottoirs.join(''), fill: encres.trottoir }));
    b.appendChild(creerSvg('path', { d: bordures.join(''), fill: 'none', stroke: encres.bordure, 'stroke-width': BORD_CHAUSSEE_PX, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    groupe.append(t, b);
  }
}
