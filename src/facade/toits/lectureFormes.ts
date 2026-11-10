// La lecture des formes du catalogue sur la surface LiDAR (MD/spec-regles-toits.md §3.2) : brise (Mansart, gambrel), coyau, courbe
// (berceau, carene), papillon, demi-croupe, toits de revolution (conique, fleche, dome, imperiale).
//
// Le moteur des corps (toitCorps.ts) lit des toits a pentes droites. Ici, a partir du corps principal qu'il a lu, on cherche si la
// mesure dit mieux : un profil en travers qui se brise, s'adoucit ou se courbe, un milieu plus bas que les bords, un faitage qui
// baisse a un bout, un cone ou un dome sur un plan carre. Chaque forme est un corps candidat, dessine par le meme code que la 3D
// (hauteurCorpsEn : toitSpeciaux.ts, toitFormes.ts), et il n'est retenu que s'il colle a la mesure bien mieux que le corps de depart :
// la lecture et le dessin ne peuvent pas se contredire. Les seuils sont dans regles/toits/formes.json.
//
// Rien ici ne change une toiture deja lue : la lecture sert aux constats et aux propositions de l'audit (app/audit/parcelle).

import { hauteurCorpsEn, mesuresDans, repere, type Mesure } from './toitCorps.js';
import { plusGrand } from '../regles/toits/faits.js';
import { accoles, boutsDuCorps, formeDuCorpsNommee } from '../../model/formeToit.js';
import { pointInPolygon } from '../../geometry/basic.js';
import { SEUILS_FORMES, type SeuilsFormes } from '../../regles/toits/formes.js';
import type { BoutToit, CorpsToit, FormeToit, ProfilPan, PtBrut, ToitMesure } from '../../model/types.js';

export interface LectureForme {
  forme: FormeToit;
  /** Les corps du batiment, celui qui change remplace le principal. */
  corps: CorpsToit[];
  /** L'ecart quadratique moyen du corps candidat a la mesure, en metres. */
  ecart: number;
  /** Le seuil qui a tranche (`regles/toits/formes.json`). */
  regle: string;
  /** Ce que la lecture a vu, en une phrase. */
  dit: string;
}

export interface OptionsLecture {
  /** Une forme demandee (par Claude ou la personne) et pas vue : la meilleure lecture, pourvu que la mesure la porte sous ECART_FORME_DEMANDEE_M. */
  souple?: boolean;
  /** La forme demandee : entre deux variantes (gambrel ou Mansart, par exemple), celle qui porte ce nom. */
  forme?: FormeToit;
  seuils?: SeuilsFormes;
}

const cm = (v: number) => Math.round(v * 100) / 100;
const fr = (v: number): string => String(cm(v)).replace('.', ',');
const mediane = (v: number[]): number => { const a = [...v].sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? (a[(n - 1) / 2] as number) : ((a[n / 2 - 1] as number) + (a[n / 2] as number)) / 2) : NaN; };
const deg = (k: number) => (Math.atan(k) * 180) / Math.PI;

/** Une droite z = a + b d aux moindres carres, et son ecart quadratique moyen. */
function droite(p: readonly { d: number; z: number }[]): { a: number; b: number; rmse: number } {
  const n = p.length;
  const md = p.reduce((s, q) => s + q.d, 0) / n, mz = p.reduce((s, q) => s + q.z, 0) / n;
  const sxx = p.reduce((s, q) => s + (q.d - md) ** 2, 0), sxy = p.reduce((s, q) => s + (q.d - md) * (q.z - mz), 0);
  const b = sxx > 1e-9 ? sxy / sxx : 0, a = mz - b * md;
  return { a, b, rmse: Math.sqrt(p.reduce((s, q) => s + (q.z - (a + b * q.d)) ** 2, 0) / n) };
}

/** Une parabole z = a + b d + c d^2 aux moindres carres (equations normales), et son ecart ; null si singuliere. */
function parabole(p: readonly { d: number; z: number }[]): { a: number; b: number; c: number; rmse: number } | null {
  const S = (k: number) => p.reduce((s, q) => s + q.d ** k, 0), T = (k: number) => p.reduce((s, q) => s + q.z * q.d ** k, 0);
  const M = [[p.length, S(1), S(2), T(0)], [S(1), S(2), S(3), T(1)], [S(2), S(3), S(4), T(2)]] as number[][];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs((M[r] as number[])[c] as number) > Math.abs((M[piv] as number[])[c] as number)) piv = r;
    if (Math.abs((M[piv] as number[])[c] as number) < 1e-9) return null;
    [M[c], M[piv]] = [M[piv] as number[], M[c] as number[]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = ((M[r] as number[])[c] as number) / ((M[c] as number[])[c] as number);
      for (let k = c; k < 4; k++) (M[r] as number[])[k] = ((M[r] as number[])[k] as number) - f * ((M[c] as number[])[k] as number);
    }
  }
  const [a, b, c] = [0, 1, 2].map((i) => ((M[i] as number[])[3] as number) / ((M[i] as number[])[i] as number)) as [number, number, number];
  return { a, b, c, rmse: Math.sqrt(p.reduce((s, q) => s + (q.z - (a + b * q.d + c * q.d * q.d)) ** 2, 0) / p.length) };
}

/** Le profil d'un axe : la mediane des mesures de chaque bande, `n` mesures au moins par bande. */
function profil(ms: readonly Mesure[], cle: (m: Mesure) => number, pas: number, garde: (m: Mesure) => boolean, minN = 3): { x: number; z: number }[] {
  const bandes = new Map<number, number[]>();
  for (const m of ms) if (garde(m)) { const k = Math.floor(cle(m) / pas); if (k >= 0) { const l = bandes.get(k) ?? []; l.push(m.z); bandes.set(k, l); } }
  return [...bandes.entries()].filter(([, z]) => z.length >= minN).sort((a, b) => a[0] - b[0]).map(([k, z]) => ({ x: (k + 0.5) * pas, z: mediane(z) }));
}

/** La hauteur d'un groupe de corps en un point du plan : le plus haut de ceux qui le couvrent ; null hors de tous. */
function hauteurDuGroupe(corps: readonly CorpsToit[], q: PtBrut): number | null {
  let z: number | null = null;
  for (const c of corps) {
    if (!pointInPolygon(q, c.pts)) continue;
    const r = repere(c.pts), dx = q.x - r.p0.x, dy = q.y - r.p0.y;
    const h = hauteurCorpsEn(c, r.L, r.W, dx * r.u.x + dy * r.u.y, dx * r.v.x + dy * r.v.y);
    z = z === null ? h : Math.max(z, h);
  }
  return z;
}

/** Une mesure dans le repere de la region, avec son point du plan. */
interface MesureRegion extends Mesure { q: PtBrut }

const rmsGroupe = (corps: readonly CorpsToit[], ms: readonly MesureRegion[]): number =>
  Math.sqrt(ms.reduce((s, m) => s + ((hauteurDuGroupe(corps, m.q) ?? 0) - m.z) ** 2, 0) / Math.max(ms.length, 1));

interface Pan { n: 0 | 1; points: { d: number; z: number }[]; largeur: number }

/** Les points du profil de chaque pan, par distance a son mur d'egout. */
function pansDe(c: CorpsToit, W: number, travers: readonly { x: number; z: number }[]): Pan[] {
  const p = c.posFaitage;
  const pans: Pan[] = [];
  if (p > 0.01) pans.push({ n: 0, largeur: p, points: travers.filter((q) => q.x <= p).map((q) => ({ d: q.x, z: q.z })) });
  if (p < W - 0.01) pans.push({ n: 1, largeur: W - p, points: travers.filter((q) => q.x >= p).map((q) => ({ d: W - q.x, z: q.z })).sort((a, b) => a.d - b.d) });
  return pans;
}

/** Ce que dit le profil d'un pan : sa forme, et l'egout et le faitage que la mesure lui donne (le corps de depart les avait lus sur des pentes droites). */
interface ProfilLu { profil: ProfilPan; rmse: number; regle: string; dit: string; egout: number; faitage: number }

/** Le profil que dit un pan, s'il en dit un : brise, coyau ou courbe, avec ce qu'il faut pour le dessiner. */
function profilDuPan(pan: Pan, S: SeuilsFormes, souple: boolean): ProfilLu | null {
  const pts = pan.points;
  if (pts.length < S.BANDES_MIN) return null;
  const un = droite(pts);
  if (un.rmse < (souple ? 0.02 : S.ECART_MESURE_MIN_M)) return null;
  const gain = souple ? 1 : S.GAIN_PROFIL;
  const trouves: ProfilLu[] = [];
  // Deux droites : on essaie chaque rupture entre PART_BRIS_MIN et PART_BRIS_MAX de la largeur.
  for (let m = 2; m < pts.length - 2; m++) {
    const lb = ((pts[m] as { d: number }).d + (pts[m - 1] as { d: number }).d) / 2;
    if (lb < S.PART_BRIS_MIN * pan.largeur || lb > S.PART_BRIS_MAX * pan.largeur) continue;
    const bas = droite(pts.slice(0, m)), haut = droite(pts.slice(m));
    const rmse = Math.sqrt((bas.rmse ** 2 * m + haut.rmse ** 2 * (pts.length - m)) / pts.length);
    if (rmse > gain * un.rmse) continue;
    if (Math.abs(deg(bas.b) - deg(haut.b)) < (souple ? 3 : S.ECART_PENTE_MIN_DEG)) continue;
    // Le pied du pan et son faitage, lus sur les deux droites ; la ligne de bris est a leur croisement.
    const egout = bas.a, faitage = haut.a + haut.b * pan.largeur, hb = bas.a + bas.b * lb;
    if (bas.b > haut.b) {
      if (lb >= 0.2 && lb <= pan.largeur - 0.2 && hb > egout + 0.05 && hb < faitage - 0.05) trouves.push({ profil: { type: 'brise', largeurBrisisM: cm(lb), hauteurBrisM: cm(hb) }, rmse, regle: 'ECART_PENTE_MIN_DEG', dit: 'un bris à ' + fr(lb) + ' m de l’égout, pentes de ' + Math.round(deg(bas.b)) + '° puis ' + Math.round(deg(haut.b)) + '°', egout, faitage });
    } else if (bas.b > 0.01 && deg(bas.b) < 89) {
      trouves.push({ profil: { type: 'coyau', largeurM: cm(lb), penteDeg: Math.round(deg(bas.b) * 10) / 10 }, rmse, regle: 'ECART_PENTE_MIN_DEG', dit: 'un bas de pan adouci sur ' + fr(lb) + ' m, à ' + Math.round(deg(bas.b)) + '°', egout, faitage });
    }
  }
  const q = parabole(pts);
  if (q && q.c < 0 && q.rmse <= gain * un.rmse) {
    // La fleche : l'ecart maximal a la corde de l'egout au faitage de l'arc.
    const egout = q.a, faitage = q.a + q.b * pan.largeur + q.c * pan.largeur * pan.largeur;
    let fleche = 0;
    for (const t of pts) fleche = Math.max(fleche, q.a + q.b * t.d + q.c * t.d * t.d - (egout + ((faitage - egout) * t.d) / pan.largeur));
    if (fleche >= (souple ? 0.1 : S.FLECHE_MIN_M)) trouves.push({ profil: { type: 'courbe', flecheM: cm(fleche) }, rmse: q.rmse, regle: 'FLECHE_MIN_M', dit: 'un pan bombé, flèche de ' + fr(fleche) + ' m', egout, faitage });
  }
  return trouves.sort((a, b) => a.rmse - b.rmse)[0] ?? null;
}

/** Le nombre de faces d'une pyramide que la lecture essaie (quatre faces : un pavillon, que le moteur des corps lit deja, sauf si elle est elancee : c'est une fleche). */
const FACES_POLYGONALES: readonly number[] = [4, 5, 6, 8];
/** La profondeur d'une croupe de carene, en part de la largeur du toit. */
const PARTS_CROUPE_CARENE: readonly number[] = [0.2, 0.3, 0.4, 0.5];

const sans = (c: CorpsToit): CorpsToit => { const { croupes: _c, ...reste } = c; void _c; return { ...reste, pignons: [] } as CorpsToit; };

/** Les corps qui se lisent ensemble : le principal et ceux qui lui sont accoles, de meme sens (un papillon se lit par le moteur comme deux appentis). */
function groupeDe(corps: readonly CorpsToit[], k: number): number[] {
  const dedans = new Set<number>([k]);
  for (let change = true; change;) {
    change = false;
    corps.forEach((c, i) => { if (!dedans.has(i) && [...dedans].some((j) => accoles(corps[j] as CorpsToit, c))) { dedans.add(i); change = true; } });
  }
  return [...dedans].sort((a, b) => a - b);
}

/** Le rectangle qui entoure ces corps, dans le repere du premier : ses quatre coins dans le plan. */
function rectangleDuGroupe(corps: readonly CorpsToit[], r: ReturnType<typeof repere>): PtBrut[] {
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const c of corps) for (const q of c.pts) {
    const dx = q.x - r.p0.x, dy = q.y - r.p0.y, s = dx * r.u.x + dy * r.u.y, t = dx * r.v.x + dy * r.v.y;
    s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t);
  }
  const P = (s: number, t: number): PtBrut => ({ x: r.p0.x + r.u.x * s + r.v.x * t, y: r.p0.y + r.u.y * s + r.v.y * t });
  return [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)];
}

/**
 * Les formes que la surface mesuree dit mieux que le corps principal lu par les formes simples, la meilleure d'abord. Vide sans
 * corps ou sans mesure. `contour` : le contour du batiment, comme pour `reconstruireCorps`. Les corps accoles au principal se lisent
 * avec lui, et le candidat les remplace tous.
 */
export function lireFormes(m: ToitMesure, corps: readonly CorpsToit[], contour: readonly PtBrut[], options: OptionsLecture = {}): LectureForme[] {
  if (!corps.length) return [];
  const S = options.seuils ?? SEUILS_FORMES, souple = !!options.souple;
  const k = plusGrand(corps);
  const groupe = groupeDe(corps, k), enGroupe = groupe.map((i) => corps[i] as CorpsToit);
  const principal = corps[k] as CorpsToit;
  const r0 = repere(principal.pts);
  // Le rectangle de lecture : celui du principal, ou celui de tout le groupe ; le repere reste celui du principal.
  const rect = enGroupe.length > 1 ? rectangleDuGroupe(enGroupe, r0) : principal.pts;
  const base: CorpsToit = { ...principal, pts: [...rect] };
  const r = repere(base.pts), { L, W } = r;
  const ms: MesureRegion[] = mesuresDans(m, r, base.pts, contour).map((x) => ({ ...x, q: { x: r.p0.x + r.u.x * x.s + r.v.x * x.t, y: r.p0.y + r.u.y * x.s + r.v.y * x.t } }));
  if (ms.length < 30) return [];
  const rmsBase = rmsGroupe(enGroupe, ms);
  // Une forme demandee (souple) n'a pas a battre le corps de depart : la personne ou Claude l'ont dite, il suffit que la mesure la porte
  // sous ECART_FORME_DEMANDEE_M.
  const accepte = (c: CorpsToit, g: number): number | null => {
    const e = rmsGroupe([c], ms);
    return souple ? (e <= S.ECART_FORME_DEMANDEE_M ? e : null) : e <= S.ECART_FORME_MAX_M && e <= g * rmsBase ? e : null;
  };
  const lectures: LectureForme[] = [];
  const poser = (candidat: CorpsToit, ecart: number, regle: string, dit: string): void => {
    const suite = [...corps.filter((_, i) => !groupe.includes(i)), candidat];
    lectures.push({ forme: formeDuCorpsNommee(candidat), corps: suite, ecart: cm(ecart), regle, dit });
  };
  const travers = profil(ms, (x) => x.t, S.PAS_BANDE_M, (x) => x.s >= 0.25 * L && x.s <= 0.75 * L);

  // 1. Le profil en travers de chaque pan : brise (Mansart, gambrel), coyau, courbe (berceau, carene). Le faitage se lit sur le profil
  // lui-meme : le corps de depart l'a place pour des pentes droites.
  const haut = travers.length ? Math.max(...travers.map((q) => q.z)) : 0;
  const hauts = travers.filter((q) => q.z >= haut - 0.15);
  const tf = hauts.length ? hauts.reduce((a, q) => a + q.x, 0) / hauts.length : base.posFaitage;
  if (enGroupe.length === 1 && tf > 0.5 && tf < W - 0.5 && base.faitage - Math.min(...base.egouts) > 0.3) {
    const lus = pansDe({ ...base, posFaitage: tf }, W, travers).map((p) => ({ n: p.n, lu: profilDuPan(p, S, souple) }));
    if (lus.some((x) => x.lu)) {
      const profils: [ProfilPan, ProfilPan] = [{ type: 'droit' }, { type: 'droit' }];
      const egouts: [number, number] = [base.egouts[0], base.egouts[1]];
      for (const x of lus) if (x.lu) { profils[x.n] = x.lu.profil; egouts[x.n] = cm(x.lu.egout); }
      const faitages = lus.flatMap((x) => (x.lu ? [x.lu.faitage] : []));
      const faitage = cm(faitages.reduce((a, b) => a + b, 0) / faitages.length);
      const gabarit: CorpsToit = { ...sans(base), posFaitage: cm(tf), profil: profils, egouts, faitage };
      // Les bouts : ceux du corps de depart, et, pour deux pans brises, la variante Mansart (un brisis a chaque bout, large comme le bris)
      // quand le moteur y a vu des croupes : on garde la variante qui colle le mieux a la mesure.
      const lb = profils.flatMap((p) => (p.type === 'brise' ? [p.largeurBrisisM] : []));
      const variantes: CorpsToit[] = [{ ...gabarit, bouts: boutsDuCorps(base) }];
      // Un pan courbe dont les bouts sont fermes par un pan est une carene : la profondeur des croupes se cherche au plus pres de la mesure.
      if (profils.some((p) => p.type === 'courbe')) for (const part of PARTS_CROUPE_CARENE) variantes.push({ ...gabarit, bouts: [{ type: 'croupe', profondeurM: cm(part * W) }, { type: 'croupe', profondeurM: cm(part * W) }] });
      if (lb.length === 2) variantes.push({ ...gabarit, bouts: [{ type: 'brisis', largeurM: cm(lb[0] as number) }, { type: 'brisis', largeurM: cm(lb[1] as number) }] });
      const acceptees = variantes.map((c) => ({ c, e: accepte(c, S.GAIN_PROFIL) })).filter((x): x is { c: CorpsToit; e: number } => x.e !== null).sort((a, b) => a.e - b.e);
      const retenue = (options.forme ? acceptees.find((x) => formeDuCorpsNommee(x.c) === options.forme) : undefined) ?? acceptees[0];
      if (retenue) {
        const meilleur = lus.filter((x) => x.lu).sort((a, b) => (a.lu?.rmse ?? 0) - (b.lu?.rmse ?? 0))[0]?.lu;
        poser(retenue.c, retenue.e, meilleur?.regle ?? 'ECART_PENTE_MIN_DEG', meilleur?.dit ?? 'un profil libre');
      }
    }
  }

  // 2. Le papillon : le milieu est plus bas que les deux bords (le moteur le lit comme deux appentis accoles).
  if (travers.length >= S.BANDES_MIN) {
    const bord0 = mediane(travers.filter((q) => q.x < 2 * S.PAS_BANDE_M).map((q) => q.z)), bord1 = mediane(travers.filter((q) => q.x > W - 2 * S.PAS_BANDE_M).map((q) => q.z));
    const dedans = travers.filter((q) => q.x >= S.PART_NOUE_MIN * W && q.x <= (1 - S.PART_NOUE_MIN) * W);
    const noue = dedans.reduce((a, b) => (b.z < a.z ? b : a), dedans[0] ?? { x: W / 2, z: Infinity });
    if (Number.isFinite(bord0) && Number.isFinite(bord1) && noue.z <= Math.min(bord0, bord1) - (souple ? 0.1 : S.CREUX_PAPILLON_M)) {
      // Les bords se lisent au pied du mur : la droite des premieres bandes, prolongee jusqu'a lui.
      const pied = (pts: { d: number; z: number }[]) => { const dr = droite(pts.slice(0, 4)); return dr.a; };
      const pans = pansDe({ ...base, posFaitage: noue.x }, W, travers);
      const e0 = pans[0] ? pied(pans[0].points) : bord0, e1 = pans[1] ? pied(pans[1].points) : bord1;
      const candidat: CorpsToit = { ...sans(base), posFaitage: cm(noue.x), faitage: cm(noue.z), egouts: [cm(e0), cm(e1)], bouts: [{ type: 'pignon' }, { type: 'pignon' }] };
      delete (candidat as { profil?: unknown }).profil;
      const e = accepte(candidat, S.GAIN_PROFIL);
      if (e !== null) poser(candidat, e, 'CREUX_PAPILLON_M', 'une noue à ' + fr(noue.z) + ' m entre deux bords à ' + fr(e0) + ' et ' + fr(e1) + ' m');
    }
  }

  // 3. La demi-croupe : le faitage baisse vers un bout sans atteindre l'egout.
  if (enGroupe.length === 1 && base.posFaitage > 0.01 && base.posFaitage < W - 0.01 && !base.profil) {
    const faite = profil(ms, (x) => x.s, S.PAS_BANDE_M, (x) => Math.abs(x.t - base.posFaitage) <= S.ZONE_FAITAGE_M, 2);
    const milieu = faite.filter((q) => q.x >= 0.3 * L && q.x <= 0.7 * L).map((q) => q.z);
    if (milieu.length >= 3) {
      const Zr = mediane(milieu), emax = Math.max(...base.egouts);
      const bouts = [...boutsDuCorps(base)] as [BoutToit, BoutToit];
      let change = false;
      for (const i of [0, 1] as const) {
        if (bouts[i].type !== 'pignon') continue;
        const versBout = i === 0 ? faite : [...faite].reverse().map((q) => ({ x: L - q.x, z: q.z }));
        // La hauteur du petit pignon, au mur : les deux premieres bandes du faitage, prolongees d'une demi-bande.
        const [b0, b1] = [versBout[0], versBout[1]];
        if (!b0 || !b1) continue;
        const zFin = b0.z - 0.5 * (b1.z - b0.z);
        if (zFin > Zr - (souple ? 0.3 : S.CHUTE_DEMI_CROUPE_M) || zFin < emax + (souple ? 0.3 : S.PIGNON_DEMI_CROUPE_MIN_M)) continue;
        const debut = versBout.find((q) => q.x > 0.4 && q.z >= Zr - 0.3);
        bouts[i] = { type: 'demi-croupe', profondeurM: cm(Math.max(0.4, debut?.x ?? 1.2)), hauteurPignonM: cm(zFin - emax) };
        change = true;
      }
      if (change) {
        // Les deux pans, droits : leur pied et leur faitage se lisent sur le profil en travers, plus juste que le corps de depart.
        const droits = pansDe({ ...base, posFaitage: tf }, W, travers).map((p) => ({ n: p.n, l: droite(p.points), largeur: p.largeur }));
        const egouts: [number, number] = [base.egouts[0], base.egouts[1]];
        for (const d of droits) egouts[d.n] = cm(d.l.a);
        const faitage = droits.length ? cm(droits.reduce((a, d) => a + d.l.a + d.l.b * d.largeur, 0) / droits.length) : cm(Zr);
        const candidat: CorpsToit = { ...sans(base), posFaitage: cm(tf), faitage, egouts, bouts };
        const e = accepte(candidat, S.GAIN_PROFIL);
        if (e !== null) poser(candidat, e, 'CHUTE_DEMI_CROUPE_M', 'le faîtage baisse vers un bout et laisse un petit pignon');
      }
    }
  }

  // 4. Un toit de revolution sur un plan presque carre : l'egout et le faitage se lisent aux moindres carres, pour chaque solide.
  if (Math.max(L, W) <= S.RAPPORT_CARRE_MAX * Math.min(L, W)) {
    const R = Math.min(L, W) / 2;
    const candidats: NonNullable<CorpsToit['speciale']>[] = [{ type: 'conique' }, { type: 'dome' }, { type: 'imperiale' }, ...FACES_POLYGONALES.map((cotes) => ({ type: 'polygonal' as const, cotes }))];
    let meilleur: { c: CorpsToit; e: number; F: number; e0: number } | null = null;
    for (const speciale of candidats) {
      // z = e + (F - e) g(r) : lineaire en (e, F) ; g est le profil du solide, de 0 (au bord) a 1 (a l'axe).
      const unite: CorpsToit = { ...sans(base), posFaitage: W / 2, faitage: 1, egouts: [0, 0], speciale };
      delete (unite as { profil?: unknown }).profil; delete (unite as { bouts?: unknown }).bouts;
      let saa = 0, sab = 0, sbb = 0, sza = 0, szb = 0;
      for (const x of ms) { const g = hauteurCorpsEn(unite, L, W, x.s, x.t), a = 1 - g; saa += a * a; sab += a * g; sbb += g * g; sza += x.z * a; szb += x.z * g; }
      const det = saa * sbb - sab * sab;
      if (Math.abs(det) < 1e-9) continue;
      const e0 = (sza * sbb - szb * sab) / det, F = (saa * szb - sab * sza) / det;
      if (!(F > e0 + 0.5)) continue;
      // Quatre faces sous un toit trapu, c'est un pavillon : le moteur des corps le lit deja.
      if (speciale.type === 'polygonal' && speciale.cotes === 4 && F - e0 < S.ELANCEMENT_FLECHE * R) continue;
      const finale: NonNullable<CorpsToit['speciale']> = speciale.type === 'conique' && F - e0 >= S.ELANCEMENT_FLECHE * R ? { type: 'fleche', cotes: 4 } : speciale.type === 'polygonal' && F - e0 >= S.ELANCEMENT_FLECHE * R ? { type: 'fleche', cotes: speciale.cotes } : speciale;
      const c: CorpsToit = { ...unite, faitage: cm(F), egouts: [cm(e0), cm(e0)], speciale: finale };
      const ecart = accepte(c, S.GAIN_REVOLUTION);
      if (ecart !== null && (!meilleur || ecart < meilleur.e)) meilleur = { c, e: ecart, F, e0 };
    }
    if (meilleur) poser(meilleur.c, meilleur.e, 'GAIN_REVOLUTION', (meilleur.c.speciale && 'cotes' in meilleur.c.speciale ? 'une pyramide à ' + meilleur.c.speciale.cotes + ' faces' : 'un toit de révolution') + ' autour du centre du plan, haut de ' + fr(meilleur.F - meilleur.e0) + ' m');
  }
  return lectures.sort((a, b) => a.ecart - b.ecart);
}

/** La lecture de cette forme-la, si la surface la porte (sous ECART_FORME_DEMANDEE_M quand `souple`) ; null sinon. */
export function lireForme(m: ToitMesure, corps: readonly CorpsToit[], contour: readonly PtBrut[], forme: FormeToit, options: OptionsLecture = {}): LectureForme | null {
  return lireFormes(m, corps, contour, { ...options, forme }).find((l) => l.forme === forme) ?? null;
}
