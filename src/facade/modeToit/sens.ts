// Le sens du faitage au Mode Toit (MD/spec-mode-toit-3d.md, « Modifier ce qui existe ») : sur un corps, sur tout le toit d'un batiment a
// plusieurs corps, et le mur haut d'un appentis.
//
// Un seul mecanisme, sans champ de fichier : l'ordre des sommets du rectangle d'un corps (`pts[0] -> pts[1]` suit le faitage) et la place
// du faitage en travers (`posFaitage`). Tourner un corps fait tourner ses sommets d'un cran ; tourner tout le toit fait tourner chaque
// corps, ou la composition entiere quand les corps pavent un rectangle (toit en M, deux pans decales, shed) ; changer le mur haut d'un
// appentis porte son faitage sur le mur oppose. Chaque geste a son inverse exact : un aller-retour rend les corps tels quels.
//
// Pur : pas de DOM, pas de scene. Toutes les operations rendent une NOUVELLE liste de corps.

import { point, repere, type Repere } from '../toits/toitCorps.js';
import { murDuCorps, NOM_SAILLIE } from './saillies.js';
import { rangPrincipal, rangsDeCorps } from './corpsNeufs.js';
import { formeDuCorpsToit } from '../../model/formeToit.js';
import { formeDuCorps } from '../regles/toits/faits.js';
import { nomOrientation } from '../../geometry/cotesVusDeDehors.js';
import type { BoutToit, CorpsToit, FormeToit, ProfilPan, PtBrut } from '../../model/types.js';

export type Sens = 'long' | 'court';

const centi = (v: number) => Math.round(v * 100) / 100;

/**
 * Les formes sans sens de faitage : le toit plat (pas de faitage) et les toits de revolution (un axe vertical, rien a tourner). Toutes les
 * autres ont un faitage, ou une noue (papillon), ou un mur haut (appentis) dont le sens se choisit (demande du proprietaire, 8 novembre
 * 2026 : « Sur toit 2 pans je peux choisir l'axe. Meme chose sur les autres types de toit concernes. »).
 */
const FORMES_SANS_SENS: ReadonlySet<FormeToit> = new Set<FormeToit>(['plat', 'conique', 'polygonal', 'fleche', 'dome', 'imperiale']);

/** Le corps a-t-il un faitage (ou une noue, ou un mur haut) a tourner ? */
const aUnSens = (c: CorpsToit): boolean => !c.saillie && !c.speciale && !FORMES_SANS_SENS.has(formeDuCorpsToit(c));

/**
 * Ce qui, pose le long du faitage du corps, l'empeche de tourner, dit en mots : tourne, cela serait a une place qui n'a plus de sens.
 * Null : rien. Ce qui tient a un mur (travees, elements de facade) n'en fait pas partie : il suit son mur.
 */
function obstacleAuSens(c: CorpsToit): string | null {
  if (c.pignons.length) return 'un pignon';
  if (c.lucarnes?.length) return 'une lucarne';
  const e = c.elementsToit?.[0];
  if (e) return e.type === 'solaire' ? 'un panneau solaire' : 'une fenêtre de toit';
  return null;
}

/**
 * Le sens du faitage se change sur tout corps qui en a un (deux pans, asymetrique, croupes, pavillon, un pan, cul de geai, Mansart,
 * gambrel, coyau, berceau, carene, papillon), sans rien de pose qui se compte le long du faitage (pignon, lucarne, fenetre de toit,
 * panneau).
 */
export function sensReglable(corps: readonly CorpsToit[], rang: number): boolean {
  const c = corps[rang];
  return !!c && aUnSens(c) && !obstacleAuSens(c);
}

/** Le sens d'un corps : son faitage dans la longueur de son rectangle, ou dans sa largeur. */
export function sensDuCorps(c: CorpsToit): Sens {
  const r = repere(c.pts);
  return r.L >= r.W ? 'long' : 'court';
}

/**
 * Le corps pose sur un autre rectangle `pts` (le faitage le long de `pts[0] -> pts[1]`), de largeur `W2` et de longueur `L2` : le faitage
 * garde sa place relative en travers (au milieu, sur un mur pour un appentis) ; une croupe ou un cul de geai la meme part du faitage ; un
 * pan courbe sa forme (sa fleche suit la largeur), un brisis ou un coyau sa largeur, bornee au pan. Les hauteurs restent.
 */
function reechelonner(c: CorpsToit, pts: PtBrut[], W2: number, L2: number): CorpsToit {
  const r = repere(c.pts), k = W2 / r.W, kL = L2 / r.L;
  const posFaitage = Math.abs(c.posFaitage - r.W / 2) <= 0.05 ? centi(W2 / 2) : c.posFaitage <= 0.01 ? 0 : c.posFaitage >= r.W - 0.01 ? W2 : centi(c.posFaitage * k);
  const neuf: CorpsToit = { ...c, pts, posFaitage };
  // Une croupe et un cul de geai prennent la meme part du faitage, comme le catalogue les met a l'echelle de la longueur : un pavillon
  // reste un pavillon, et un aller-retour rend les memes bouts. Un brisis garde sa largeur (celle des pans du Mansart), borne au faitage.
  if (c.croupes) neuf.croupes = [centi(c.croupes[0] * kL), centi(c.croupes[1] * kL)];
  if (c.bouts) {
    const bout = (b: BoutToit): BoutToit => (b.type === 'croupe' || b.type === 'demi-croupe' ? { ...b, profondeurM: centi(b.profondeurM * kL) }
      : b.type === 'brisis' ? { ...b, largeurM: Math.min(b.largeurM, centi(L2 / 2)) } : b);
    neuf.bouts = [bout(c.bouts[0]), bout(c.bouts[1])];
  }
  if (c.profil) {
    const pans = [posFaitage, W2 - posFaitage];
    const pan = (q: ProfilPan, n: 0 | 1): ProfilPan => {
      const borne = centi(Math.max((pans[n] as number) - 0.3, 0.3));
      if (q.type === 'courbe') return { ...q, flecheM: centi(q.flecheM * k) };
      if (q.type === 'brise') return { ...q, largeurBrisisM: Math.min(q.largeurBrisisM, borne) };
      if (q.type === 'coyau') return { ...q, largeurM: Math.min(q.largeurM, borne) };
      return q;
    };
    neuf.profil = [pan(c.profil[0], 0), pan(c.profil[1], 1)];
  }
  return neuf;
}

/**
 * Un quart de tour du faitage du corps `rang`, dans son rectangle : les sommets tournent d'un cran (en avant, ou en arriere pour l'inverse
 * exact), le meme rectangle, les memes hauteurs. Ce qui tient a un mur de ce corps (ses travees, un element de facade pose dessus) garde son
 * mur : seul le rang du mur change.
 */
function quartDeTour(corps: readonly CorpsToit[], rang: number, enAvant: boolean): CorpsToit[] {
  const c = corps[rang] as CorpsToit, r = repere(c.pts);
  const p = c.pts as PtBrut[];
  const pts = (enAvant ? [p[1], p[2], p[3], p[0]] : [p[3], p[0], p[1], p[2]]) as PtBrut[];
  // Le mur `m` (de pts[m] a pts[m + 1]) garde son point de depart : seul son rang change.
  const mur = (m: number): number => (m + (enAvant ? 3 : 1)) % 4;
  // La nouvelle largeur est l'ancienne longueur, et inversement.
  const neuf = reechelonner(c, pts, r.L, r.W);
  if (c.travees) neuf.travees = c.travees.map((t) => ({ ...t, mur: mur(t.mur) }));
  return corps.map((x, i) => (i === rang ? neuf : x.saillie?.hote === rang ? { ...x, saillie: { ...x.saillie, mur: mur(x.saillie.mur) } } : x));
}

/** Le faitage du corps dans ce sens (en avant vers la largeur, en arriere vers la longueur). Rien ne change si le sens est deja celui-la. */
export function avecSens(corps: readonly CorpsToit[], rang: number, sens: Sens): CorpsToit[] {
  const c = corps[rang] as CorpsToit;
  if (sensDuCorps(c) === sens) return corps.slice();
  return quartDeTour(corps, rang, sens === 'court');
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Tout le toit d'un batiment a plusieurs corps (demande du proprietaire, 8 novembre 2026 : tourner l'axe de tout le toit d'un coup).

/** Les ecarts de plan en deca desquels deux coordonnees n'en font qu'une (un corps accole a un autre), en metres. */
const TOLERANCE_M = 0.02;

/** Les corps pavent-ils un rectangle ? Le repere du corps principal et l'emprise de tous, dans ce repere. */
interface Composition { r: Repere; s0: number; t0: number; L: number; W: number }

/** Les valeurs distinctes, a la tolerance pres. */
function distinctes(v: readonly number[]): number[] {
  const l = [...v].sort((a, b) => a - b), d: number[] = [];
  for (const x of l) if (!d.length || x - (d[d.length - 1] as number) > TOLERANCE_M) d.push(x);
  return d;
}

/**
 * La composition des corps du toit, quand ils pavent exactement un rectangle, chacun a l'equerre du corps principal (un toit en M, deux
 * pans decales, un shed : des bandes accolees, sans vide). Null sinon (une maison en L, en T, des ailes qui se chevauchent en debordant) :
 * chaque corps tourne alors dans son propre rectangle, ce qui garde l'emprise du batiment.
 */
function composition(corps: readonly CorpsToit[]): Composition | null {
  const rangs = rangsDeCorps(corps);
  if (rangs.length < 2) return null;
  const r = repere((corps[rangPrincipal(corps)] as CorpsToit).pts);
  const coord = (q: PtBrut) => ({ s: (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y, t: (q.x - r.p0.x) * r.v.x + (q.y - r.p0.y) * r.v.y });
  const boites: { s: [number, number]; t: [number, number] }[] = [];
  for (const i of rangs) {
    const q = (corps[i] as CorpsToit).pts.map(coord);
    const s = distinctes(q.map((x) => x.s)), t = distinctes(q.map((x) => x.t));
    // A l'equerre du principal : deux abscisses et deux ordonnees seulement.
    if (q.length !== 4 || s.length !== 2 || t.length !== 2) return null;
    boites.push({ s: [s[0] as number, s[1] as number], t: [t[0] as number, t[1] as number] });
  }
  const S = distinctes(boites.flatMap((b) => b.s)), T = distinctes(boites.flatMap((b) => b.t));
  // Chaque case de la grille des bords est couverte par un corps : pas de vide, le rectangle entier.
  for (let a = 0; a + 1 < S.length; a++) for (let b = 0; b + 1 < T.length; b++) {
    const ms = ((S[a] as number) + (S[a + 1] as number)) / 2, mt = ((T[b] as number) + (T[b + 1] as number)) / 2;
    if (!boites.some((x) => ms > x.s[0] && ms < x.s[1] && mt > x.t[0] && mt < x.t[1])) return null;
  }
  const s0 = S[0] as number, t0 = T[0] as number;
  return { r, s0, t0, L: (S[S.length - 1] as number) - s0, W: (T[T.length - 1] as number) - t0 };
}

/**
 * Le quart de tour de la composition sur son emprise : un point du rectangle, lu en parts de sa longueur et de sa largeur (sigma, tau),
 * va en (1 - tau, sigma) en avant, en (tau, 1 - sigma) en arriere (l'inverse exact). Le rectangle reste le meme, les corps restent accoles :
 * deux bandes dans la longueur deviennent deux bandes dans la largeur.
 */
function tournerPoint(k: Composition, q: PtBrut, enAvant: boolean): PtBrut {
  const { r } = k;
  const s = (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y, t = (q.x - r.p0.x) * r.v.x + (q.y - r.p0.y) * r.v.y;
  const sg = (s - k.s0) / k.L, ta = (t - k.t0) / k.W;
  const [sg2, ta2] = enAvant ? [1 - ta, sg] : [ta, 1 - sg];
  return point(r, k.s0 + sg2 * k.L, k.t0 + ta2 * k.W);
}

/** Le mur d'un corps qui porte le troncon a -> b, de meme face (sa normale sort du meme cote) : son rang, et ou tombent a et b le long de lui. */
function murQuiPorte(corps: readonly CorpsToit[], a: PtBrut, b: PtBrut, n: PtBrut): { rang: number; mur: number; da: number; db: number } | null {
  for (const rang of rangsDeCorps(corps)) {
    const c = corps[rang] as CorpsToit;
    for (let mur = 0; mur < 4; mur++) {
      const m = murDuCorps(c, mur);
      if (m.n.x * n.x + m.n.y * n.y < 0.9) continue;
      const le = (q: PtBrut) => (q.x - m.a.x) * m.u.x + (q.y - m.a.y) * m.u.y, ecart = (q: PtBrut) => Math.abs((q.x - m.a.x) * m.u.y - (q.y - m.a.y) * m.u.x);
      const da = le(a), db = le(b);
      if (ecart(a) > TOLERANCE_M || ecart(b) > TOLERANCE_M) continue;
      if (Math.min(da, db) < -TOLERANCE_M || Math.max(da, db) > m.L + TOLERANCE_M) continue;
      return { rang, mur, da, db };
    }
  }
  return null;
}

/** Le nom d'un corps dans une phrase, comme sa pastille (« le corps principal », « le corps 2 »). */
function nomDuCorps(corps: readonly CorpsToit[], rang: number): string {
  return rang === rangPrincipal(corps) ? 'le corps principal' : 'le corps ' + (rangsDeCorps(corps).indexOf(rang) + 1);
}

/**
 * La composition tournee d'un quart de tour : chaque corps pose sur son rectangle tourne, ses hauteurs et sa forme gardees ; ce qui tient a
 * un mur (travee, element de facade) va sur le mur qui le porte apres le tour, a la meme place du plan. Une raison quand ce n'est pas
 * possible sans couper ou perdre quelque chose.
 */
function tournerComposition(corps: readonly CorpsToit[], k: Composition, enAvant: boolean): { corps: CorpsToit[] } | { raison: string } {
  const rangs = rangsDeCorps(corps);
  for (const i of rangs) {
    const c = corps[i] as CorpsToit, quoi = obstacleAuSens(c);
    if (quoi) return { raison: 'Tout le toit ne peut pas tourner : ' + nomDuCorps(corps, i) + ' porte ' + quoi + ', qui n’aurait plus sa place une fois le faîtage tourné. Retirez cet élément, ou tournez les autres corps un par un.' };
    if (c.speciale) return { raison: 'Tout le toit ne peut pas tourner : ' + nomDuCorps(corps, i) + ' est une tourelle, que la composition tournée déformerait. Tournez les autres corps un par un.' };
  }
  const neufs = corps.map((c) => {
    if (c.saillie) return c;
    const pts = c.pts.map((q) => tournerPoint(k, q, enAvant)), r2 = repere(pts);
    const n = reechelonner(c, pts, r2.W, r2.L);
    delete n.travees;
    return n;
  });
  // Les travees et les elements de facade gardent leur place sur le plan : ils vont au mur qui la porte apres le tour.
  for (const i of rangs) {
    const c = corps[i] as CorpsToit;
    for (const t of c.travees ?? []) {
      const m = murDuCorps(c, t.mur), a = { x: m.a.x + m.u.x * t.de, y: m.a.y + m.u.y * t.de }, b = { x: m.a.x + m.u.x * t.a, y: m.a.y + m.u.y * t.a };
      const ou = murQuiPorte(neufs, a, b, m.n);
      if (!ou) return { raison: 'Tout le toit ne peut pas tourner : une travée ' + nomDuCorps(corps, i).replace(/^le /, 'du ') + ' tomberait à cheval sur deux corps, ou sur un mur qui disparaît. Retirez-la, ou tournez les corps un par un.' };
      const hote = neufs[ou.rang] as CorpsToit;
      hote.travees = [...(hote.travees ?? []), { ...t, mur: ou.mur, de: Math.min(ou.da, ou.db), a: Math.max(ou.da, ou.db) }];
    }
  }
  for (let i = 0; i < corps.length; i++) {
    const x = corps[i] as CorpsToit, s = x.saillie, hote = s ? corps[s.hote] : undefined;
    if (!s || !hote) continue;
    const m = murDuCorps(hote, s.mur), d0 = s.centreM - s.largeurM / 2, d1 = s.centreM + s.largeurM / 2;
    const ou = murQuiPorte(neufs, { x: m.a.x + m.u.x * d0, y: m.a.y + m.u.y * d0 }, { x: m.a.x + m.u.x * d1, y: m.a.y + m.u.y * d1 }, m.n);
    if (!ou) return { raison: 'Tout le toit ne peut pas tourner : l’élément de façade (' + NOM_SAILLIE[s.genre].toLowerCase() + ') tomberait à cheval sur deux corps une fois la composition tournée. Déplacez-le, ou tournez les corps un par un.' };
    neufs[i] = { ...x, saillie: { ...s, hote: ou.rang, mur: ou.mur, centreM: (ou.da + ou.db) / 2 } };
  }
  return { corps: neufs };
}

/** Ce que le groupe « Sens du faîtage » de tout le toit montre : comment il tourne, son sens en place, et pourquoi il ne tourne pas. */
export interface SensDuToit {
  /** `composition` : les corps pavent un rectangle et la composition tourne entiere ; `corps` : chaque corps tourne dans son rectangle. */
  mode: 'composition' | 'corps';
  valeur: Sens;
  /** Null : le toit tourne ; sinon ce qui l'en empeche, dit a la personne. */
  raison: string | null;
}

/** Le corps qui dit le sens de tout le toit quand chaque corps tourne dans son rectangle : le principal, ou le premier dont le sens se lit. */
function corpsDeReference(corps: readonly CorpsToit[]): number | null {
  const lisible = (i: number) => { const c = corps[i] as CorpsToit, r = repere(c.pts); return aUnSens(c) && Math.abs(r.L - r.W) > TOLERANCE_M; };
  const p = rangPrincipal(corps);
  if (p >= 0 && lisible(p)) return p;
  return rangsDeCorps(corps).find(lisible) ?? null;
}

/**
 * Le sens de tout le toit d'un batiment a plusieurs corps, ou null quand il n'y a pas de groupe a montrer (un seul corps : son propre
 * groupe suffit ; aucun faitage a tourner).
 */
export function sensDuToit(corps: readonly CorpsToit[]): SensDuToit | null {
  const rangs = rangsDeCorps(corps);
  if (rangs.length < 2 || !rangs.some((i) => aUnSens(corps[i] as CorpsToit))) return null;
  const k = composition(corps);
  if (k) {
    // Le sens de la composition : le faitage du principal le long du grand cote de l'emprise, ou en travers.
    // Une emprise carree n'a pas de grand cote, et le quart de tour n'y change aucune dimension : le sens se lit alors sur le plan (le
    // faitage du principal plus pres de l'axe est-ouest, « dans la longueur »), pour que les deux boutons restent l'inverse l'un de l'autre.
    const valeur: Sens = Math.abs(k.L - k.W) > TOLERANCE_M ? (k.L >= k.W ? 'long' : 'court') : Math.abs(k.r.u.x) >= Math.abs(k.r.u.y) ? 'long' : 'court';
    const essai = tournerComposition(corps, k, valeur === 'long');
    return { mode: 'composition', valeur, raison: 'raison' in essai ? essai.raison : null };
  }
  const ref = corpsDeReference(corps);
  if (ref === null) return null;
  const bloque = rangs.find((i) => aUnSens(corps[i] as CorpsToit) && obstacleAuSens(corps[i] as CorpsToit));
  const raison = bloque === undefined ? null
    : 'Tout le toit ne peut pas tourner : ' + nomDuCorps(corps, bloque) + ' porte ' + obstacleAuSens(corps[bloque] as CorpsToit) + ', qui n’aurait plus sa place une fois le faîtage tourné. Retirez cet élément, ou tournez les autres corps un par un.';
  return { mode: 'corps', valeur: sensDuCorps(corps[ref] as CorpsToit), raison };
}

/**
 * Tout le toit dans ce sens, d'un coup : la composition entiere tourne d'un quart de tour sur son emprise quand les corps pavent un
 * rectangle (un toit en M reste un toit en M, un shed un shed) ; sinon chaque corps qui a un faitage le tourne dans son rectangle (l'emprise
 * du batiment reste ; un toit plat, une tourelle restent tels quels). Vers la largeur le tour va en avant, vers la longueur en arriere : un
 * aller-retour rend les corps tels quels. Rien ne change (une copie) si le sens est deja celui-la, ou si le toit ne peut pas tourner
 * entier : jamais une partie du toit en silence.
 */
export function tournerLeToit(corps: readonly CorpsToit[], sens: Sens): CorpsToit[] {
  const etat = sensDuToit(corps);
  if (!etat || etat.raison || etat.valeur === sens) return corps.slice();
  const enAvant = sens === 'court';
  if (etat.mode === 'composition') {
    const k = composition(corps), r = k ? tournerComposition(corps, k, enAvant) : null;
    return r && 'corps' in r ? r.corps : corps.slice();
  }
  return rangsDeCorps(corps).reduce<CorpsToit[]>((l, i) => (aUnSens(l[i] as CorpsToit) ? quartDeTour(l, i, enAvant) : l), corps.slice());
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Le mur haut d'un appentis (demande du proprietaire, 8 novembre 2026).

/** Le mur haut d'un appentis : le mur 0 (`pts[0] -> pts[1]`) quand le faitage est de son cote, sinon le mur 2. */
export function murHautDe(c: CorpsToit): 0 | 2 {
  return c.posFaitage <= repere(c.pts).W / 2 ? 0 : 2;
}

/** L'orientation d'un mur du corps, dite par sa normale qui sort (« sud », « nord-est »). */
export function orientationDuMur(c: CorpsToit, mur: number): string {
  const n = murDuCorps(c, mur).n;
  // Le plan a l'est vers +x et le nord vers +y : l'azimut se compte depuis le nord, dans le sens des aiguilles d'une montre.
  return nomOrientation((Math.atan2(n.x, n.y) * 180) / Math.PI).toLowerCase();
}

/** Le mur haut se choisit sur un corps a un pan (pas un element de facade, pas une tourelle). */
export const murHautReglable = (c: CorpsToit | undefined): c is CorpsToit => !!c && !c.saillie && !c.speciale && formeDuCorps(c) === 'appentis';

/**
 * Le faitage de l'appentis porte sur l'autre mur long : le meme rectangle, les memes sommets (les bouts, les travees et les elements de
 * facade gardent leurs murs), le faitage a la meme distance du mur oppose, les egouts et le profil de chaque pan echanges, ce qui est
 * pose sur le pan le suit (meme place le long du faitage et depuis l'egout). Son propre inverse : deux fois rendent le corps tel quel.
 */
export function avecMurHaut(c: CorpsToit, mur: 0 | 2): CorpsToit {
  if (murHautDe(c) === mur) return c;
  const W = repere(c.pts).W, p = W - c.posFaitage;
  const posFaitage = p <= 0.01 ? 0 : p >= W - 0.01 ? W : centi(p);
  const neuf: CorpsToit = { ...c, posFaitage, egouts: [c.egouts[1], c.egouts[0]] };
  if (c.profil) neuf.profil = [c.profil[1], c.profil[0]];
  if (c.lucarnes) neuf.lucarnes = c.lucarnes.map((l) => ({ ...l, pan: l.pan === 0 ? 1 : 0 }));
  if (c.elementsToit) neuf.elementsToit = c.elementsToit.map((e) => ({ ...e, pan: e.pan === 0 ? 1 : 0 }));
  return neuf;
}
