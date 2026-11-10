// Le cul de geai (demi-croupe ; aussi nez de veau, bout rabattu, croupette) : le poser au bout d'un corps ou a la pointe d'un pignon,
// et le lire sur la surface mesuree du LiDAR (MD/spec-mode-toit-3d.md, « Le cul de geai et la queue de vache » ; demande du proprietaire
// du 5 novembre 2026). Une seule source pour le Mode Toit (la personne le pose) et le moteur des toits (une proposition de l'audit qu'il
// relit, facade/regles/toits/pignons.ts) : ni l'un ni l'autre n'ecrit une demi-croupe autrement.
//
// La lecture est celle de la lecture des formes (lectureFormes.ts, §3 : « le faitage baisse vers un bout sans atteindre l'egout »),
// appliquee a un bout de n'importe quel corps, et au faitage d'un pignon traversant, qui court du mur vers l'interieur. Elle ne decide
// rien : elle dit la coupe que la mesure porte, ou null. Pur.

import { mesuresDans, repere, type Mesure } from './toitCorps/ajustement.js';
import { SEUILS_FORMES } from '../../regles/toits/formes.js';
import { boutsDuCorps } from '../../model/formeToit.js';
import type { BoutToit, CorpsToit, DemiCroupe, PignonToit, PtBrut, ToitMesure } from '../../model/types.js';

const centi = (v: number) => Math.round(v * 100) / 100;
const mediane = (l: readonly number[]): number => { const t = [...l].sort((a, b) => a - b), n = t.length; return n ? (n % 2 ? (t[(n - 1) / 2] as number) : ((t[n / 2 - 1] as number) + (t[n / 2] as number)) / 2) : NaN; };

/**
 * Un cul de geai neuf sur un pignon d'egout `e`, de faitage `F`, dont les pans s'elevent de `F - e` sur `largeur` a plat : la pointe
 * coupee de `part` (le tiers par defaut), la petite croupe a la pente des pans.
 */
export function demiCroupeNeuve(e: number, F: number, largeur: number, part = 0.33, debordFaitageM = 0): DemiCroupe {
  const coupe = (F - e) * part, k = (F - e) / Math.max(largeur, 0.5);
  const b: DemiCroupe = { type: 'demi-croupe', profondeurM: centi(Math.max(0.3, coupe / Math.max(k, 0.2))), hauteurPignonM: centi(Math.max(0.1, F - e - coupe)) };
  return debordFaitageM > 0 ? { ...b, debordFaitageM } : b;
}

/**
 * Le corps avec ce bout (`i` : 0 au bout `s = 0`, 1 au bout `s = L`) ; ses croupes suivent (une croupe s'y ecrit, un cul de geai y vaut 0,
 * pour qui ne lit que `croupes`), et des bouts tous en pignon ou en croupe ne s'ecrivent pas (le dessin d'avant).
 */
export function corpsAvecBout(c: CorpsToit, i: 0 | 1, bout: BoutToit): CorpsToit {
  const bouts = [...boutsDuCorps(c)] as [BoutToit, BoutToit];
  bouts[i] = bout;
  const neuf: CorpsToit = { ...c };
  const croupes = bouts.map((b) => (b.type === 'croupe' ? b.profondeurM : 0)) as [number, number];
  if (croupes.some((h) => h > 0)) neuf.croupes = croupes; else delete neuf.croupes;
  if (bouts.every((b) => b.type === 'pignon' || b.type === 'croupe')) delete neuf.bouts; else neuf.bouts = bouts;
  return neuf;
}

/** Les mesures en bandes de `pas` le long de `cle`, chaque bande sa mediane (lectureFormes.ts, `profil`). */
function bandes(ms: readonly Mesure[], cle: (m: Mesure) => number, pas: number, garde: (m: Mesure) => boolean): { x: number; z: number }[] {
  const par = new Map<number, number[]>();
  for (const m of ms) if (garde(m)) { const k = Math.floor(cle(m) / pas); if (k >= 0) { const l = par.get(k) ?? []; l.push(m.z); par.set(k, l); } }
  return [...par.entries()].filter(([, z]) => z.length >= 2).sort((a, b) => a[0] - b[0]).map(([k, z]) => ({ x: (k + 0.5) * pas, z: mediane(z) }));
}

/**
 * La coupe que dit un faitage lu depuis son bout (`versBout` : x depuis le mur, z la hauteur), au faitage `Zr` et a l'egout `emax` :
 * la hauteur du petit pignon au mur (les deux premieres bandes, prolongees d'une demi-bande) et la profondeur ou le faitage reprend.
 * Null quand la mesure ne baisse pas assez, ou descend trop pres de l'egout (une croupe). `souple` : les seuils d'une forme demandee.
 */
function coupeLue(versBout: readonly { x: number; z: number }[], Zr: number, emax: number, souple: boolean): DemiCroupe | null {
  const S = SEUILS_FORMES;
  const [b0, b1] = [versBout[0], versBout[1]];
  if (!b0 || !b1 || !Number.isFinite(Zr)) return null;
  const zFin = b0.z - 0.5 * (b1.z - b0.z);
  if (zFin > Zr - (souple ? 0.3 : S.CHUTE_DEMI_CROUPE_M) || zFin < emax + (souple ? 0.3 : S.PIGNON_DEMI_CROUPE_MIN_M)) return null;
  const debut = versBout.find((q) => q.x > 0.4 && q.z >= Zr - 0.3);
  return { type: 'demi-croupe', profondeurM: centi(Math.max(0.4, debut?.x ?? 1.2)), hauteurPignonM: centi(zFin - emax) };
}

/** Le bout `i` d'un corps a deux pans lu sur la mesure : un cul de geai, ou null. */
export function demiCroupeLueAuBout(c: CorpsToit, i: 0 | 1, m: ToitMesure, contour: readonly PtBrut[], souple = false): DemiCroupe | null {
  const r = repere(c.pts), S = SEUILS_FORMES;
  if (!(c.posFaitage > 0.3 && c.posFaitage < r.W - 0.3)) return null;
  const ms = mesuresDans(m, r, c.pts, contour);
  const faite = bandes(ms, (x) => x.s, S.PAS_BANDE_M, (x) => Math.abs(x.t - c.posFaitage) <= S.ZONE_FAITAGE_M);
  const milieu = faite.filter((q) => q.x >= 0.3 * r.L && q.x <= 0.7 * r.L).map((q) => q.z);
  if (milieu.length < 3) return null;
  const versBout = i === 0 ? faite : [...faite].reverse().map((q) => ({ x: r.L - q.x, z: q.z }));
  return coupeLue(versBout, mediane(milieu), Math.max(...c.egouts), souple);
}

/** La pointe d'un pignon traversant lue sur la mesure : son faitage, du mur vers l'interieur, qui baisse vers le mur ; ou null. */
export function demiCroupeLueALaPointe(c: CorpsToit, g: PignonToit, m: ToitMesure, contour: readonly PtBrut[], souple = false): DemiCroupe | null {
  const r = repere(c.pts), S = SEUILS_FORMES;
  const sc = (g.debut + g.fin) / 2, D = Math.min(g.profondeur, g.pan === 0 ? c.posFaitage : r.W - c.posFaitage);
  if (D < 1.5) return null;
  const ms = mesuresDans(m, r, c.pts, contour);
  const dist = (x: Mesure) => (g.pan === 0 ? x.t : r.W - x.t);
  const faite = bandes(ms, dist, S.PAS_BANDE_M, (x) => Math.abs(x.s - sc) <= S.ZONE_FAITAGE_M && dist(x) <= D);
  // Le faitage du pignon, la ou il reprend : la moitie interieure de sa profondeur.
  const dedans = faite.filter((q) => q.x >= 0.5 * D).map((q) => q.z);
  if (dedans.length < 2) return null;
  return coupeLue(faite, mediane(dedans), c.egouts[g.pan], souple);
}
