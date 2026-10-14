// La verification d'un releve et ce qu'elle apprend (MD/spec-facades-calage-detection.md §12 et §13,
// lot L15) : ce que la detection propose devient des ouvertures du releve (confiance, source, rangee,
// travee, details), la grille est recalculee sur les ouvertures retenues, et chaque correction de
// l'utilisateur est tracee : ajout, retrait, deplacement (avec l'ecart), changement de type. Ce sont
// ces corrections qui mesurent le detecteur sur les audits (§14).
//
// Tout est pur : le dialogue du releve et l'audit l'appellent de la meme facon.

import { au } from '../util/tableaux.js';
import { ecartBords, structurer } from './structure.js';
import type { OuvertureDetectee } from './detection.js';
import type { CorrectionOuverture, GrilleFacade, OuvertureFacade } from '../model/types.js';

/** En dessous (en metres), un bord n'a pas bouge : les cotes sont au centimetre. */
const IMMOBILE = 0.005;
/** Recouvrement (intersection sur union) a partir duquel une ouverture retenue est celle qui etait proposee. */
const MEME_BAIE = 0.2;
/** Pleine a partir de cette confiance ; en dessous, ou devinee, en pointille (spec §12). */
export const CONFIANCE_PLEINE = 0.7;

const cm = (v: number) => Math.round(v * 100) / 100;

/** Ce que le releve garde d'une ouverture detectee : la boite, et ce que la detection en sait. */
export function versOuvertureFacade(o: OuvertureDetectee): OuvertureFacade {
  const res: OuvertureFacade = { type: o.type, x: o.x, y: o.y, l: o.l, h: o.h, confiance: o.confiance };
  if (o.source) res.source = o.source;
  if (o.niveau !== undefined) res.niveau = o.niveau;
  if (o.travee !== undefined) res.travee = o.travee;
  if (o.details && Object.keys(o.details).length) res.details = { ...o.details };
  return res;
}

/** Une ouverture se dessine-t-elle en pointille (devinee, ou de faible confiance) ? */
export function estIncertaine(o: Pick<OuvertureFacade, 'source' | 'confiance'>): boolean {
  return o.source === 'devinee' || (o.confiance !== undefined && o.confiance < CONFIANCE_PLEINE);
}

/** Une ouverture que le doigt vient de retoucher : elle est verifiee, donc pleine. */
export function retouchee(o: OuvertureFacade): OuvertureFacade {
  const res: OuvertureFacade = { ...o, source: o.source === 'ajoutee' ? 'ajoutee' : 'corrigee' };
  delete res.confiance;
  return res;
}

/** La grille des ouvertures retenues, et la rangee et la travee de chacune (spec §10, §13). */
export function avecGrille(ouvertures: readonly OuvertureFacade[], largeur: number): { ouvertures: OuvertureFacade[]; grille: GrilleFacade | null } {
  if (!ouvertures.length) return { ouvertures: [], grille: null };
  const s = structurer(ouvertures, largeur);
  return { ouvertures: ouvertures.map((o, i) => ({ ...o, niveau: au(s.niveauDe, i), travee: au(s.traveeDe, i) })), grille: s.grille };
}

function recouvrement(a: OuvertureFacade, b: OuvertureFacade): number {
  const ix = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x),
    iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ix <= 0 || iy <= 0) return 0;
  const inter = ix * iy;
  return inter / (a.l * a.h + b.l * b.h - inter);
}

const boite = (o: OuvertureFacade) => ({ type: o.type, x: o.x, y: o.y, l: o.l, h: o.h });

/**
 * Les corrections entre ce que l'analyse proposait et ce que l'utilisateur retient (spec §12) :
 * `proposees` sont les ouvertures proposees cochees, `decochees` les devinees laissees en pointille.
 * Chaque retenue est rapprochee de la proposition qui la recouvre le plus (un a un) :
 * - retenue sans proposition : un ajout (source `ajoutee`) ;
 * - proposee sans retenue : un retrait ; devinee decochee gardee : un ajout (source `devinee`) ;
 * - retenue dont un bord a bouge : un deplacement, avec l'ecart par cote ; dont le type a change : un
 *   changement de type. Elle devient `corrigee`.
 * Rend les ouvertures retenues, leur source a jour, et les corrections.
 */
export function tracerCorrections(proposees: readonly OuvertureFacade[], decochees: readonly OuvertureFacade[], retenues: readonly OuvertureFacade[]): { ouvertures: OuvertureFacade[]; corrections: CorrectionOuverture[] } {
  const candidates = [...proposees.map((o) => ({ o, cochee: true })), ...decochees.map((o) => ({ o, cochee: false }))];
  // Paires du meilleur recouvrement au moins bon, chaque ouverture une seule fois.
  const paires: { r: number; p: number; iou: number }[] = [];
  retenues.forEach((r, i) => candidates.forEach((c, j) => {
    const iou = recouvrement(r, c.o);
    if (iou >= MEME_BAIE) paires.push({ r: i, p: j, iou });
  }));
  paires.sort((a, b) => b.iou - a.iou);
  const deR = new Map<number, number>(),
    prises = new Set<number>();
  for (const { r, p } of paires) {
    if (deR.has(r) || prises.has(p)) continue;
    deR.set(r, p);
    prises.add(p);
  }
  const corrections: CorrectionOuverture[] = [];
  const ouvertures = retenues.map((r, i): OuvertureFacade => {
    const j = deR.get(i);
    if (j === undefined) {
      corrections.push({ geste: 'ajout', ...boite(r) });
      return { ...r, source: 'ajoutee' };
    }
    const c = au(candidates, j);
    let corrigee = false;
    if (!c.cochee) corrections.push({ geste: 'ajout', ...boite(r), source: 'devinee' });
    if (ecartBords(r, c.o) > IMMOBILE) {
      corrigee = true;
      corrections.push({ geste: 'deplacement', ...boite(r), ecart: { x: cm(r.x - c.o.x), y: cm(r.y - c.o.y), l: cm(r.l - c.o.l), h: cm(r.h - c.o.h) } });
    }
    if (r.type !== c.o.type) {
      corrigee = true;
      corrections.push({ geste: 'type', ...boite(r), avant: c.o.type });
    }
    if (corrigee) return { ...r, source: 'corrigee' };
    // Rien n'a bouge : l'ouverture garde la source de sa proposition (detectee, devinee gardee).
    return c.o.source ? { ...r, source: c.o.source } : r;
  });
  candidates.forEach((c, j) => {
    if (c.cochee && !prises.has(j)) corrections.push({ geste: 'retrait', ...boite(c.o), ...(c.o.source === 'devinee' ? { source: 'devinee' as const } : {}) });
  });
  return { ouvertures, corrections };
}
