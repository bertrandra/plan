// Les poignees du mode Toit (MD/spec-mode-toit-3d.md, etape 4) : ce qu'on attrape sur la facade pour deplacer, etirer ou monter un element.
//
// Une poignee est un point de la scene (plan + hauteur) et les axes sur lesquels elle glisse. Les axes sont ceux de la facade de l'element :
// `long` le long du mur, `prof` vers l'exterieur, `vert` vers le haut. L'ecran sait ce que vaut un metre sur chaque axe a l'endroit de la
// poignee ; il rend a `glisser` un deplacement en metres, et `glisser` ecrit le corps. Toujours a partir du corps de DEPART du geste : le meme
// glisser rejoue donne le meme resultat, et Echap n'a rien a defaire.
//
// Pur : pas de DOM, pas de scene.

import { point, repere } from '../../toitCorps.js';
import { bornerSaillie, murDuCorps, replacerSaillie } from './saillies.js';
import type { CibleElement } from './elements.js';
import type { CorpsToit, PtBrut } from '../../../model/types.js';

export type Axe = 'long' | 'vert' | 'prof';

/** Un point de la scene : le plan, et la hauteur au-dessus du sol du batiment. */
export interface Point3 { x: number; y: number; z: number }

/** Le repere d'une facade : son origine (le debut du mur), le sens du mur (unitaire) et la normale qui sort du batiment (unitaire). */
export interface CadreFacade { o: PtBrut; u: PtBrut; n: PtBrut; L: number }

/** Ce qu'on attrape : une cible (un element ou, pour un corps entier, `corps` seul) et la poignee. */
export interface Poignee { id: string; point: Point3; axes: Axe[]; libelle: string }

/** Les distances parcourues sur chaque axe, en metres (positives vers la droite du mur, l'exterieur et le haut). */
export type Deplacement = Partial<Record<Axe, number>>;

/** Une cote que l'ecran affiche pres de l'element : sa cle (largeur, hauteur…) et son texte. */
export interface Cote { cle: string; texte: string }

/** Un mur ou un element de corps : ce qui est choisi dans la facade. `corps` : le corps de la facade courante (pas d'element). */
export type CibleGlisser = CibleElement | { type: 'corps'; rang: number; i: number; mur: number };

const centi = (v: number) => Math.round(v * 100) / 100;
const vingt = (v: number) => Math.round(v * 20) / 20;
const borne = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',') + ' m';

/** Le seuil d'aimantation : un bord a moins de 25 cm d'un autre s'y colle. */
export const SEUIL_AIMANT_M = 0.25;

/** Colle `v` au premier candidat a moins du seuil ; sinon l'arrondit a 5 cm. Rend aussi le candidat colle (pour dessiner un guide). */
export function aimanter(v: number, candidats: readonly number[]): { v: number; colle: number | null } {
  for (const c of candidats) if (Math.abs(v - c) < SEUIL_AIMANT_M) return { v: c, colle: c };
  return { v: vingt(v), colle: null };
}

/** Le repere de la facade qui porte l'element : le mur d'une saillie, ou le cote du pan d'un pignon, d'une lucarne, d'un element de toit. */
export function cadreDe(corps: readonly CorpsToit[], t: CibleGlisser): CadreFacade | null {
  const c = corps[t.rang];
  if (!c) return null;
  if (t.type === 'corps') { const m = murDuCorps(c, t.mur); return { o: m.a, u: m.u, n: m.n, L: m.L }; }
  if (t.type === 'saillie' && c.saillie) {
    const h = corps[c.saillie.hote];
    if (!h) return null;
    const m = murDuCorps(h, c.saillie.mur);
    return { o: m.a, u: m.u, n: m.n, L: m.L };
  }
  const r = repere(c.pts);
  let pan: 0 | 1 = 0;
  if (t.type === 'pignon') pan = c.pignons[t.i]?.pan ?? 0;
  else if (t.type === 'lucarne') pan = c.lucarnes?.[t.i]?.pan ?? 0;
  else if (t.type === 'fenetre-toit' || t.type === 'solaire') pan = c.elementsToit?.[t.i]?.pan ?? 0;
  // Le pan 0 est au cote t = 0 (la normale sort vers -v), le pan 1 au cote t = W (vers +v).
  return pan === 0 ? { o: point(r, 0, 0), u: r.u, n: { x: -r.v.x, y: -r.v.y }, L: r.L } : { o: point(r, 0, r.W), u: r.u, n: r.v, L: r.L };
}

const sur = (f: CadreFacade, s: number, prof: number, z: number): Point3 => ({ x: f.o.x + f.u.x * s + f.n.x * prof, y: f.o.y + f.u.y * s + f.n.y * prof, z });

/** Les poignees de la cible, dans le repere de sa facade. Vide : rien a attraper. */
export function poigneesDe(corps: readonly CorpsToit[], t: CibleGlisser): Poignee[] {
  const c = corps[t.rang], f = cadreDe(corps, t);
  if (!c || !f) return [];
  const P = (s: number, prof: number, z: number) => sur(f, s, prof, z);
  if (t.type === 'corps') {
    return [
      { id: 'haut', point: P(f.L / 2, 0, c.faitage), axes: ['vert'], libelle: 'Hauteur du faîtage' },
      { id: 'long', point: P(f.L, 0, Math.min(...c.egouts)), axes: ['long'], libelle: 'Longueur de la façade' }
    ];
  }
  if (t.type === 'saillie' && c.saillie) {
    const s = c.saillie, top = Math.min(...c.egouts);
    const l: Poignee[] = [
      { id: 'pos', point: P(s.centreM, s.profondeurM, c.faitage), axes: ['long'], libelle: 'Position' },
      { id: 'larg', point: P(s.centreM + s.largeurM / 2, 0, top), axes: ['long'], libelle: 'Largeur' },
      { id: 'prof', point: P(s.centreM, s.profondeurM, top / 2), axes: ['prof'], libelle: 'Saillie' },
      { id: 'haut', point: P(s.centreM - s.largeurM / 2, s.profondeurM, top), axes: ['vert'], libelle: 'Hauteur à l’égout' }
    ];
    return l;
  }
  if (t.type === 'pignon') {
    const g = c.pignons[t.i];
    if (!g) return [];
    const e = c.egouts[g.pan];
    return [
      { id: 'pos', point: P((g.debut + g.fin) / 2, 0, e), axes: ['long'], libelle: 'Position' },
      { id: 'larg', point: P(g.fin, 0, e), axes: ['long'], libelle: 'Largeur' },
      { id: 'haut', point: P((g.debut + g.fin) / 2, 0, g.faitage), axes: ['vert'], libelle: 'Hauteur du faîte' }
    ];
  }
  if (t.type === 'lucarne') {
    const l = c.lucarnes?.[t.i];
    if (!l) return [];
    return [
      { id: 'pos', point: P((l.debutM + l.finM) / 2, 0, l.faitageM), axes: ['long'], libelle: 'Position' },
      { id: 'larg', point: P(l.finM, 0, l.faitageM - 0.4), axes: ['long'], libelle: 'Largeur' },
      { id: 'haut', point: P((l.debutM + l.finM) / 2, 0, l.faitageM + 0.0), axes: ['vert'], libelle: 'Hauteur' }
    ];
  }
  if (t.type === 'cheminee') {
    const h = c.cheminees?.[t.i];
    return h ? [{ id: 'pos', point: { x: h.x, y: h.y, z: h.sommetM }, axes: ['long', 'prof'], libelle: 'Position' }] : [];
  }
  const e = c.elementsToit?.[t.i];
  if (!e) return [];
  const largeur = e.pan === 0 ? c.posFaitage : repere(c.pts).W - c.posFaitage;
  const z = Math.min(...c.egouts) + ((c.faitage - Math.min(...c.egouts)) * e.dM) / Math.max(largeur, 0.5);
  const w = (e.type === 'solaire' ? 2.55 : 0.8) * (e.echelle ?? 1);
  return [
    { id: 'pos', point: P(e.sM, e.dM, z), axes: ['long', 'vert'], libelle: 'Position' },
    { id: 'taille', point: P(e.sM + w / 2, e.dM, z), axes: ['long'], libelle: 'Taille' }
  ];
}

/** Les cotes de la cible : ce que la bulle montre pres d'elle. */
export function cotesDe(corps: readonly CorpsToit[], t: CibleGlisser): Cote[] {
  const c = corps[t.rang];
  if (!c) return [];
  if (t.type === 'corps') { const m = murDuCorps(c, t.mur); return [{ cle: 'w', texte: fr(m.L) }, { cle: 'h', texte: fr(c.faitage) }]; }
  if (t.type === 'saillie' && c.saillie) return [{ cle: 'w', texte: fr(c.saillie.largeurM) }, { cle: 'prof', texte: fr(c.saillie.profondeurM) }, { cle: 'h', texte: fr(Math.min(...c.egouts)) }];
  if (t.type === 'pignon') {
    const g = c.pignons[t.i];
    if (!g) return [];
    const demi = (g.fin - g.debut) / 2, e = c.egouts[g.pan];
    return [{ cle: 'w', texte: fr(g.fin - g.debut) }, { cle: 'ang', texte: Math.round((Math.atan2(g.faitage - e, demi) * 180) / Math.PI) + '°' }, { cle: 'h', texte: fr(g.faitage) }];
  }
  if (t.type === 'lucarne') { const l = c.lucarnes?.[t.i]; return l ? [{ cle: 'w', texte: fr(l.finM - l.debutM) }, { cle: 'h', texte: fr(l.faitageM) }] : []; }
  if (t.type === 'cheminee') { const h = c.cheminees?.[t.i]; return h ? [{ cle: 'w', texte: fr(h.largeurM) }, { cle: 'h', texte: fr(h.sommetM) }] : []; }
  const e = c.elementsToit?.[t.i];
  return e ? [{ cle: 'w', texte: fr((e.type === 'solaire' ? 2.55 : 0.8) * (e.echelle ?? 1)) }] : [];
}

const avec = (corps: readonly CorpsToit[], rang: number, c: CorpsToit): CorpsToit[] => corps.map((k, i) => (i === rang ? c : k));
const remplace = <T>(l: readonly T[] | undefined, i: number, v: T): T[] => (l ?? []).map((x, j) => (j === i ? v : x));

/** Les bords des autres elements sur la meme facade, pour y coller les bords de celui qu'on deplace. */
function bordsVoisins(corps: readonly CorpsToit[], t: CibleGlisser, L: number): number[] {
  const bords = [0, L];
  const c = corps[t.rang];
  if (!c) return bords;
  if (t.type === 'saillie' && c.saillie) {
    corps.forEach((k, i) => { if (i !== t.rang && k.saillie && k.saillie.hote === c.saillie?.hote && k.saillie.mur === c.saillie?.mur) bords.push(k.saillie.centreM - k.saillie.largeurM / 2, k.saillie.centreM + k.saillie.largeurM / 2); });
  } else if (t.type === 'pignon') c.pignons.forEach((g, i) => { if (i !== t.i) bords.push(g.debut, g.fin); });
  else if (t.type === 'lucarne') (c.lucarnes ?? []).forEach((l, i) => { if (i !== t.i) bords.push(l.debutM, l.finM); });
  return bords;
}

/** Les vertices d'un corps qui suivent le bout d'un mur quand on etire sa facade : ceux du bout `mur + 1` et `mur + 2`. */
function etirer(c: CorpsToit, mur: number, delta: number): CorpsToit {
  const m = murDuCorps(c, mur);
  const pts = c.pts.map((p, i) => (i === (mur + 1) % 4 || i === (mur + 2) % 4 ? { x: centi(p.x + m.u.x * delta), y: centi(p.y + m.u.y * delta) } : p));
  return { ...c, pts };
}

/** Le deplacement `d` applique a la cible, a partir des corps de depart. Rend les nouveaux corps et les positions collees (pour les guides). */
export function glisser(depart: readonly CorpsToit[], t: CibleGlisser, id: string, d: Deplacement): { corps: CorpsToit[]; guides: number[] } {
  const c = depart[t.rang], f = cadreDe(depart, t);
  const rien = { corps: depart.slice(), guides: [] as number[] };
  if (!c || !f) return rien;
  const dl = d.long ?? 0, dv = d.vert ?? 0, dp = d.prof ?? 0, guides: number[] = [];
  const bords = bordsVoisins(depart, t, f.L);
  /** Un bord qui se colle : le candidat s'il est proche, et l'ecran dessine un guide la. */
  const coller = (v: number) => { const a = aimanter(v, bords); if (a.colle !== null) guides.push(a.colle); return a.v; };
  /** Un element de largeur `w` dont le bord gauche est en `debut` : colle son bord gauche, ou son bord droit, au premier bord voisin. */
  const collerElement = (debut: number, w: number) => {
    const g = aimanter(debut, bords);
    if (g.colle !== null) { guides.push(g.colle); return g.v; }
    const dr = aimanter(debut + w, bords);
    if (dr.colle !== null) { guides.push(dr.colle); return dr.v - w; }
    return g.v;
  };

  if (t.type === 'corps') {
    if (id === 'haut') return { corps: avec(depart, t.rang, { ...c, faitage: centi(Math.max(c.faitage + dv, Math.max(...c.egouts) + 0.4)) }), guides };
    if (id === 'long') {
      const m = murDuCorps(c, t.mur), nouvelle = borne(vingt(m.L + dl), 2.5, 30);
      let neuf = etirer(c, t.mur, nouvelle - m.L);
      // Une facade de bout (cote impair) change la largeur du corps : le faitage garde sa place relative. Une facade longue (cote pair)
      // change sa longueur : ce qui est pose le long du faitage reste dans le corps.
      if (t.mur % 2 === 1) neuf = { ...neuf, posFaitage: centi((c.posFaitage * nouvelle) / m.L) };
      else {
        const L2 = nouvelle;
        neuf = { ...neuf, pignons: c.pignons.map((g) => ({ ...g, debut: Math.min(g.debut, L2 - 1.4), fin: Math.min(g.fin, L2) })).filter((g) => g.fin - g.debut >= 1.4),
          ...(c.lucarnes ? { lucarnes: c.lucarnes.map((l) => ({ ...l, debutM: Math.min(l.debutM, L2 - 0.7), finM: Math.min(l.finM, L2 - 0.1) })) } : {}) };
      }
      const hotes = avec(depart, t.rang, neuf);
      // Ce qui est pose sur ce corps reste sur son mur, borne par la nouvelle longueur.
      return { corps: hotes.map((k, i) => (k.saillie && k.saillie.hote === t.rang ? replacerSaillie(hotes, i, {})[i] as CorpsToit : k)), guides };
    }
    return rien;
  }
  if (t.type === 'saillie' && c.saillie) {
    const s = c.saillie, h = depart[s.hote];
    if (!h) return rien;
    if (id === 'pos') { const demi = s.largeurM / 2, bas = collerElement(s.centreM + dl - demi, s.largeurM); return { corps: replacerSaillie(depart, t.rang, bornerSaillie(h, { ...s, centreM: bas + demi })), guides }; }
    if (id === 'larg') { const droite = coller(s.centreM + s.largeurM / 2 + dl), gauche = s.centreM - s.largeurM / 2, w = borne(droite - gauche, 1.2, 6); return { corps: replacerSaillie(depart, t.rang, bornerSaillie(h, { ...s, largeurM: w, centreM: gauche + w / 2 })), guides }; }
    if (id === 'prof') return { corps: replacerSaillie(depart, t.rang, bornerSaillie(h, { ...s, profondeurM: borne(s.profondeurM + dp, 0.2, s.niveau === 'rdc' ? 1.5 : 6) })), guides };
    if (id === 'haut') return { corps: replacerSaillie(depart, t.rang, bornerSaillie(h, { ...s, hauteurM: centi(borne(Math.min(...c.egouts) + dv, 1, 12)) })), guides };
    return rien;
  }
  if (t.type === 'pignon') {
    const g = c.pignons[t.i];
    if (!g) return rien;
    const w = g.fin - g.debut;
    if (id === 'pos') { const debut = borne(collerElement(g.debut + dl, w), 0, f.L - w); return { corps: avec(depart, t.rang, { ...c, pignons: remplace(c.pignons, t.i, { ...g, debut: centi(debut), fin: centi(debut + w) }) }), guides }; }
    if (id === 'larg') { const fin = borne(coller(g.fin + dl), g.debut + 1.4, Math.min(g.debut + 8, f.L)); return { corps: avec(depart, t.rang, { ...c, pignons: remplace(c.pignons, t.i, { ...g, fin: centi(fin) }) }), guides }; }
    if (id === 'haut') { const e = c.egouts[g.pan], f2 = borne(vingt(g.faitage + dv), e + 0.8, c.faitage); return { corps: avec(depart, t.rang, { ...c, pignons: remplace(c.pignons, t.i, { ...g, faitage: centi(f2) }) }), guides }; }
    return rien;
  }
  if (t.type === 'lucarne') {
    const l = c.lucarnes?.[t.i];
    if (!l) return rien;
    const w = l.finM - l.debutM;
    if (id === 'pos') { const debut = borne(collerElement(l.debutM + dl, w), 0.1, f.L - 0.1 - w); return { corps: avec(depart, t.rang, { ...c, lucarnes: remplace(c.lucarnes, t.i, { ...l, debutM: centi(debut), finM: centi(debut + w) }) }), guides }; }
    if (id === 'larg') { const fin = borne(coller(l.finM + dl), l.debutM + 0.6, Math.min(l.debutM + 3, f.L - 0.1)); return { corps: avec(depart, t.rang, { ...c, lucarnes: remplace(c.lucarnes, t.i, { ...l, finM: centi(fin) }) }), guides }; }
    if (id === 'haut') return { corps: avec(depart, t.rang, { ...c, lucarnes: remplace(c.lucarnes, t.i, { ...l, faitageM: centi(borne(l.faitageM + dv, c.egouts[l.pan] + 0.6, c.faitage - 0.1)) }) }), guides };
    return rien;
  }
  if (t.type === 'cheminee') {
    const h = c.cheminees?.[t.i];
    if (!h || id !== 'pos') return rien;
    return { corps: avec(depart, t.rang, { ...c, cheminees: remplace(c.cheminees, t.i, { ...h, x: centi(h.x + f.u.x * dl + f.n.x * dp), y: centi(h.y + f.u.y * dl + f.n.y * dp) }) }), guides };
  }
  const e = c.elementsToit?.[t.i];
  if (!e) return rien;
  const dim = (e.type === 'solaire' ? 2.55 : 0.8) * (e.echelle ?? 1);
  if (id === 'pos') {
    const largeur = e.pan === 0 ? c.posFaitage : repere(c.pts).W - c.posFaitage, pente = Math.max((c.faitage - Math.min(...c.egouts)) / Math.max(largeur, 0.5), 0.2);
    return { corps: avec(depart, t.rang, { ...c, elementsToit: remplace(c.elementsToit, t.i, { ...e, sM: centi(borne(vingt(e.sM + dl), 0.5, f.L - 0.5)), dM: centi(borne(e.dM + dv / pente, 0.3, Math.max(largeur - 0.3, 0.3))) }) }), guides };
  }
  if (id === 'taille') return { corps: avec(depart, t.rang, { ...c, elementsToit: remplace(c.elementsToit, t.i, { ...e, echelle: centi(borne(((dim + 2 * dl) / (e.type === 'solaire' ? 2.55 : 0.8)), 0.5, 2.2)) }) }), guides };
  return rien;
}
