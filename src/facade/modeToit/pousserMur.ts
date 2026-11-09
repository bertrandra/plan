// Un cote d'un corps qui avance ou recule, le cote oppose en place (demande du proprietaire, 9 novembre 2026 : « Les redimensionnements
// d'un corps doivent pouvoir se faire de chaque cote pour eviter de changer la taille et recaler ensuite. »).
//
// Le mur `mur` du rectangle (de `pts[mur]` a `pts[mur + 1]`) glisse sur sa normale sortante : ses deux sommets bougent, les deux autres
// restent. Ce qui est pose sur le corps garde sa place dans le plan quand il le peut : le faitage sa place relative en travers (au milieu, sur
// un mur pour un appentis), les pignons, lucarnes, fenetres de toit et panneaux leur place le long du faitage, les travees et les elements de
// facade (bow-window, galerie, appentis poses) leur place sur leur mur, les cheminees la leur ; ce qui est pose sur le mur qui bouge le suit.
// Un corps colle contre ce mur (une aile posee au bout, la moitie d'un corps coupe) est pousse avec lui : le joint reste ferme. Rien de
// pose qui ne tient plus dans le corps ne disparait sans le dire : il est borne au corps, retire seulement s'il n'y tient plus du tout
// (une travee de moins de 30 cm, un pignon de moins de 1,4 m, comme pour les autres gestes).
//
// Pur : pas de DOM, pas de scene. Rend une NOUVELLE liste de corps.

import { repere } from '../toits/toitCorps.js';
import { murDuCorps, replacerSaillie } from './saillies.js';
import { LONGUEUR_CORPS_MAX_M, LONGUEUR_CORPS_MIN_M } from './corpsNeufs.js';
import { DECROCHE_MIN_M } from './travees.js';
import type { CorpsToit, PtBrut } from '../../model/types.js';

const centi = (v: number) => Math.round(v * 100) / 100;
const vingt = (v: number) => Math.round(v * 20) / 20;
const borne = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** A moins de cette distance, le mur d'un autre corps est sur la ligne du mur qui bouge : il le touche. En metres. */
export const CONTACT_M = 0.05;
/** Un mur se colle a la ligne d'un mur parallele d'un autre corps a moins de cette distance (l'aimantation des poignees). En metres. */
export const AIMANT_MUR_M = 0.25;

/** Ce que rend le geste : les corps, et la ligne d'un autre corps contre laquelle le mur s'est colle (null : aucune). */
export interface MurPousse { corps: CorpsToit[]; colle: boolean }

const pv = (a: PtBrut, b: PtBrut) => a.x * b.y - a.y * b.x;
const ps = (a: PtBrut, b: PtBrut) => a.x * b.x + a.y * b.y;
const moins = (a: PtBrut, b: PtBrut): PtBrut => ({ x: a.x - b.x, y: a.y - b.y });

/** Le faitage a sa place relative en travers : au milieu il reste au milieu, sur un mur (un appentis) sur ce mur. */
function posFaitageRelative(posFaitage: number, W: number, W2: number): number {
  if (Math.abs(posFaitage - W / 2) <= 0.05) return centi(W2 / 2);
  if (posFaitage <= 0.01) return 0;
  if (posFaitage >= W - 0.01) return centi(W2);
  return centi((posFaitage * W2) / W);
}

/**
 * Les corps colles contre le mur `mur` du corps `rang`, du cote ou il avance : un de leurs murs est sur sa ligne, tourne vers lui, et le
 * longe sur plus de 10 cm. De proche en proche : un corps colle a un corps pousse est pousse aussi (trois bandes d'un toit en M).
 */
export function corpsColles(corps: readonly CorpsToit[], rang: number, mur: number): number[] {
  const c = corps[rang];
  if (!c) return [];
  const fronts = [murDuCorps(c, mur)], pris = new Set<number>([rang]), res: number[] = [];
  for (let k = 0; k < fronts.length; k++) {
    const f = fronts[k] as ReturnType<typeof murDuCorps>;
    corps.forEach((o, j) => {
      if (pris.has(j) || o.saillie || o.pts.length !== 4) return;
      for (let m = 0; m < 4; m++) {
        const w = murDuCorps(o, m);
        if (ps(w.n, f.n) > -0.999 || Math.abs(ps(moins(w.a, f.a), f.n)) > CONTACT_M) continue;
        // Le recouvrement le long du mur : les bouts de l'autre mur, comptes depuis le debut de celui-ci.
        const s1 = ps(moins(w.a, f.a), f.u), s2 = ps(moins(w.b, f.a), f.u);
        if (Math.min(f.L, Math.max(s1, s2)) - Math.max(0, Math.min(s1, s2)) <= 0.1) continue;
        pris.add(j);
        res.push(j);
        // Son mur oppose devient a son tour un front.
        fronts.push(murDuCorps(o, (m + 2) % 4));
        return;
      }
    });
  }
  return res;
}

/** Les lignes des murs paralleles au mur `f` des autres corps, en distance signee le long de sa normale : ou il peut se coller. */
function lignesParalleles(corps: readonly CorpsToit[], exclus: ReadonlySet<number>, f: ReturnType<typeof murDuCorps>): number[] {
  const l: number[] = [];
  corps.forEach((o, j) => {
    if (exclus.has(j) || o.saillie) return;
    for (let m = 0; m < o.pts.length; m++) {
      const w = murDuCorps(o, m);
      if (Math.abs(pv(w.u, f.u)) < 0.02) l.push(ps(moins(w.a, f.a), f.n));
    }
  });
  return l;
}

/** Ce qui est pose le long d'un mur, de `de` a `a` depuis son debut, borne a sa nouvelle longueur ; null s'il n'y tient plus. */
function surLeMur<T extends { de: number; a: number }>(t: T, decale: number, L: number, min: number): T | null {
  const de = centi(Math.max(0, t.de + decale)), a = centi(Math.min(L, t.a + decale));
  return a - de >= min - 1e-9 ? { ...t, de, a } : null;
}

/**
 * Le mur `mur` du corps `rang` avance de `delta` metres vers l'exterieur (negatif : il recule), le mur oppose en place. La dimension du
 * corps qui change (sa largeur pour les murs 0 et 2, sa longueur pour les murs 1 et 3) s'arrondit a 5 cm, et reste entre 2,5 et 30 m
 * (un corps deja plus petit ou plus grand ne s'y voit pas ramene d'un toucher) ; a moins de 25 cm de la ligne d'un mur parallele d'un
 * autre corps, le mur s'y colle. Un element de facade pose (bow-window, galerie, appentis) et un corps neuf ne se tirent pas ainsi.
 */
export function pousserLeMur(corps: readonly CorpsToit[], rang: number, mur: number, delta: number): MurPousse {
  const c = corps[rang];
  const rien: MurPousse = { corps: corps.slice(), colle: false };
  if (!c || c.saillie || c.pts.length !== 4) return rien;
  const m = ((mur % 4) + 4) % 4, f = murDuCorps(c, m), r = repere(c.pts);
  const enLargeur = m % 2 === 0, actuelle = enLargeur ? r.W : r.L;
  const colles = corpsColles(corps, rang, m);
  // Le mur se colle a la ligne d'un autre corps, sinon la dimension tombe aux 5 cm ronds.
  const lignes = lignesParalleles(corps, new Set([rang, ...colles]), f);
  let colle = false, d = vingt(actuelle + delta) - actuelle;
  let proche = Infinity;
  for (const x of lignes) if (Math.abs(x - delta) <= AIMANT_MUR_M && Math.abs(x - delta) < proche) { proche = Math.abs(x - delta); d = x; colle = true; }
  const nouvelle = borne(actuelle + d, Math.min(LONGUEUR_CORPS_MIN_M, actuelle), Math.max(LONGUEUR_CORPS_MAX_M, actuelle));
  if (Math.abs(nouvelle - (actuelle + d)) > 1e-9) colle = false;
  d = nouvelle - actuelle;
  if (Math.abs(d) < 0.005) return rien;
  const dx = f.n.x * d, dy = f.n.y * d;
  const pts = c.pts.map((p, i) => (i === m || i === (m + 1) % 4 ? { x: centi(p.x + dx), y: centi(p.y + dy) } : p));
  const neuf: CorpsToit = { ...c, pts };
  // Le mur 3 (s = 0) qui bouge deplace l'origine des longueurs : ce qui se compte le long du faitage s'y decale, et garde sa place.
  const ds = m === 3 ? d : 0;
  const L2 = enLargeur ? r.L : nouvelle, W2 = enLargeur ? nouvelle : r.W;
  if (enLargeur) {
    neuf.posFaitage = posFaitageRelative(c.posFaitage, r.W, W2);
    // Un pignon ou une lucarne qui part du faitage y va encore ; sinon il garde sa profondeur, bornee au pan.
    const pans = [c.posFaitage, r.W - c.posFaitage], pans2 = [neuf.posFaitage, W2 - neuf.posFaitage];
    const prof = (p: number, pan: 0 | 1) => {
      const avant = pans[pan] as number, apres = pans2[pan] as number;
      if (avant < 0.05) return p;
      return centi(Math.abs(p - avant) <= 0.05 ? apres : Math.min(p, apres));
    };
    neuf.pignons = c.pignons.map((g) => ({ ...g, profondeur: prof(g.profondeur, g.pan) }));
    if (c.lucarnes) neuf.lucarnes = c.lucarnes.map((l) => ({ ...l, profondeurM: prof(l.profondeurM, l.pan) }));
    if (c.elementsToit) neuf.elementsToit = c.elementsToit.map((e) => ({ ...e, dM: centi(borne(e.dM, 0.3, Math.max((pans2[e.pan] as number) - 0.3, 0.3))) }));
    // Un brisis ou un coyau garde sa largeur, borne a son pan.
    if (c.profil) neuf.profil = c.profil.map((q, i) => {
      const max = centi(Math.max((pans2[i] as number) - 0.3, 0.3));
      return q.type === 'brise' ? { ...q, largeurBrisisM: Math.min(q.largeurBrisisM, max) } : q.type === 'coyau' ? { ...q, largeurM: Math.min(q.largeurM, max) } : q;
    }) as typeof c.profil;
  } else {
    neuf.pignons = c.pignons.flatMap((g) => {
      const debut = centi(Math.max(0, g.debut + ds)), fin = centi(Math.min(L2, g.fin + ds));
      return fin - debut >= 1.4 - 1e-9 ? [{ ...g, debut, fin }] : [];
    });
    if (c.lucarnes) neuf.lucarnes = c.lucarnes.map((l) => {
      const debutM = centi(borne(l.debutM + ds, 0.1, L2 - 0.7)), finM = centi(borne(l.finM + ds, debutM + 0.6, L2 - 0.1));
      return { ...l, debutM, finM };
    });
    if (c.elementsToit) neuf.elementsToit = c.elementsToit.map((e) => ({ ...e, sM: centi(borne(e.sM + ds, 0.5, Math.max(L2 - 0.5, 0.5))) }));
    // Une croupe garde sa longueur (sa pente), les deux tenant dans le faitage.
    if (c.croupes) {
      const t = c.croupes[0] + c.croupes[1], k = t > L2 ? L2 / t : 1;
      neuf.croupes = [centi(c.croupes[0] * k), centi(c.croupes[1] * k)];
    }
    if (c.bouts) neuf.bouts = c.bouts.map((b) => ('profondeurM' in b ? { ...b, profondeurM: Math.min(b.profondeurM, centi(L2 / 2)) } : 'largeurM' in b ? { ...b, largeurM: Math.min(b.largeurM, centi(L2 / 2)) } : b)) as typeof c.bouts;
  }
  // Les murs voisins du mur qui bouge changent de longueur : celui qui part de lui (m + 1) s'allonge par son debut, ce qui y est pose
  // se decale d'autant ; celui qui y arrive (m + 3) s'allonge par sa fin.
  const decalage = (w: number) => (w === (m + 1) % 4 ? d : 0);
  const longueur = (w: number) => (w % 2 === 0 ? L2 : W2);
  if (c.travees) {
    neuf.travees = c.travees.flatMap((t) => {
      const k = surLeMur(t, decalage(t.mur), longueur(t.mur), DECROCHE_MIN_M);
      return k ? [k] : [];
    });
  }
  let l = corps.map((k, i) => (i === rang ? neuf : k));
  // Les elements de facade de ce corps : a leur place sur leur mur, puis replaces (bornes au mur, leur rectangle refait).
  corps.forEach((k, i) => {
    if (k.saillie?.hote !== rang) return;
    const s = k.saillie, centreM = centi(s.centreM + decalage(s.mur));
    l = replacerSaillie(l, i, centreM === s.centreM ? {} : { centreM });
  });
  // Les corps colles suivent le mur, avec ce qui est pose sur eux.
  for (const j of colles) {
    const o = l[j] as CorpsToit;
    l[j] = { ...o, pts: o.pts.map((p) => ({ x: centi(p.x + dx), y: centi(p.y + dy) })), ...(o.cheminees ? { cheminees: o.cheminees.map((h) => ({ ...h, x: centi(h.x + dx), y: centi(h.y + dy) })) } : {}) };
    l.forEach((k, i) => { if (k.saillie?.hote === j) l = replacerSaillie(l, i, {}); });
  }
  return { corps: l, colle };
}
