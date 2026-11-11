// Les elements poses sur une facade qui touchent au toit : bow-window, galerie, appentis (palette, groupe « Toit »,
// onglet « Facade »).
//
// Un element est un corps du toit (`CorpsToit`) qui porte sa `saillie` : sur quel mur de quel corps, ou, de quelle
// taille et de quelle forme. Le rectangle `pts` du corps en est toujours deduit ici : changer un reglage de la
// saillie, c'est la replacer (`placerSaillie`), jamais deplacer des points a la main. Le dessin 3D d'un bow-window
// (three/saillie3d.ts) lit l'emprise de ce module ; une galerie ou un appentis, eux, sont des appentis adosses
// que le dessin des corps sait deja faire (three/toitCorps3d.ts).
//
// Pur : pas de reseau, pas de DOM.

import { repere, point } from '../toits/toitCorps.js';
import { RECUL_TRAVEE_MAX_M } from '../../model/corpsToitEtendu.js';
import type { CorpsToit, FormeSaillie, GenreSaillie, PignonToit, PtBrut, SaillieFacade } from '../../model/types.js';

/** Un point du dessin, `z` etant la hauteur au-dessus du sol du batiment. */
export interface Pt3 { x: number; y: number; z: number }

/** La hauteur d'un rez-de-chaussee : ce que monte un bow-window « sous le premier etage ». */
export const HAUTEUR_RDC_M = 2.7;
/** Le debord du toit d'un bow-window au-dela de ses murs, sur les cotes et en facade (celui d'une maison est de 35 cm). */
export const DEBORD_BOW_M = 0.2;
/** Un etage de plus haut que ce que la personne choisit n'est pas plausible : la borne de la hauteur propre. */
export const HAUTEUR_BOW_MAX_M = 12;
/** Le recul des poteaux d'une galerie neuve : l'egout deborde de cela au-dessus d'eux. */
export const RETRAIT_GALERIE_M = 0.5;

const dixieme = (v: number) => Math.round(v * 10) / 10;
const centimetre = (v: number) => Math.round(v * 100) / 100;

/** Les mesures d'un genre, a la pose : largeur, saillie, forme, toit et hauteur d'egout cherchee. */
export const DEFAUTS_SAILLIE: Record<GenreSaillie, { largeurM: number; profondeurM: number; forme: FormeSaillie; niveau: 'rdc' | 'toit'; toit: 'pan' | 'pavillon' | 'plat' }> = {
  'bow-window': { largeurM: 2.4, profondeurM: 0.8, forme: 'rectangle', niveau: 'rdc', toit: 'pan' },
  galerie: { largeurM: 5, profondeurM: 1.5, forme: 'rectangle', niveau: 'rdc', toit: 'pan' },
  appentis: { largeurM: 4, profondeurM: 3, forme: 'rectangle', niveau: 'rdc', toit: 'pan' },
  // Une marquise au-dessus d'une porte (lot L1) : sa profondeur ne se lit pas sur une vue de face, c'est celle d'une marquise courante.
  auvent: { largeurM: 1.6, profondeurM: 0.9, forme: 'rectangle', niveau: 'rdc', toit: 'pan' }
};
/** La hauteur d'un auvent dont la photo ne dit pas le haut : au-dessus d'une porte courante. */
export const HAUTEUR_AUVENT_M = 2.5;

/** Le mur `i` d'un corps : ses deux bouts, sa longueur, son vecteur unitaire et la normale qui sort du corps. */
export function murDuCorps(h: CorpsToit, i: number): { a: PtBrut; b: PtBrut; L: number; u: PtBrut; n: PtBrut } {
  const n4 = h.pts.length;
  const a = h.pts[((i % n4) + n4) % n4] as PtBrut, b = h.pts[(((i + 1) % n4) + n4) % n4] as PtBrut;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const cx = h.pts.reduce((t, q) => t + q.x, 0) / n4, cy = h.pts.reduce((t, q) => t + q.y, 0) / n4;
  let n = { x: u.y, y: -u.x };
  // La normale sort du corps : elle s'eloigne du centre.
  if ((a.x - cx) * n.x + (a.y - cy) * n.y < 0) n = { x: -n.x, y: -n.y };
  return { a, b, L, u, n };
}

/** Le plus petit recul du rez-de-chaussee : en deca, la facade reste droite. */
export const RETRAIT_RDC_MIN_M = 0.1;
/** Ce qui reste au moins de la profondeur du corps hote sous un rez-de-chaussee en retrait : au-dela, il n'y a plus de piece. */
const RESTE_SOUS_RETRAIT_M = 1;

/** Le recul du rez-de-chaussee que porte un bow-window, en metres ; 0 : la facade droite (le dessin d'avant). */
export const retraitDuRdc = (s: SaillieFacade | undefined): number => (s?.genre === 'bow-window' && (s.rdcEnRetraitM ?? 0) > 0 ? (s.rdcEnRetraitM as number) : 0);

/** Les reglages bornes : la saillie tient sur son mur, sans depasser ses bouts ; un recul du rez-de-chaussee laisse une piece derriere lui. */
export function bornerSaillie(h: CorpsToit, s: SaillieFacade): SaillieFacade {
  const { L } = murDuCorps(h, s.mur);
  const largeurM = centimetre(Math.min(Math.max(s.largeurM, 0.6), Math.max(0.6, L - 0.2)));
  const centreM = centimetre(Math.min(Math.max(s.centreM, largeurM / 2), Math.max(largeurM / 2, L - largeurM / 2)));
  const borne: SaillieFacade = { ...s, largeurM, centreM, profondeurM: centimetre(Math.min(Math.max(s.profondeurM, 0.3), 6)) };
  const r = retraitDuRdc(s);
  if (r > 0) {
    // La profondeur du corps en travers du mur : celle de son mur voisin.
    const max = Math.min(RECUL_TRAVEE_MAX_M, murDuCorps(h, s.mur + 1).L - RESTE_SOUS_RETRAIT_M);
    if (max >= RETRAIT_RDC_MIN_M) borne.rdcEnRetraitM = centimetre(Math.min(Math.max(r, RETRAIT_RDC_MIN_M), max));
    else delete borne.rdcEnRetraitM;
  } else delete borne.rdcEnRetraitM;
  return borne;
}

/** Le rectangle d'une saillie sur son mur : `pts[0]-pts[1]` le long du mur, `pts[0]-pts[3]` vers l'exterieur. */
export function rectangleDeSaillie(h: CorpsToit, s: SaillieFacade): PtBrut[] {
  const { a, u, n } = murDuCorps(h, s.mur);
  // Sous un etage qui avance, le bow-window part du mur recule du rez-de-chaussee.
  const r = retraitDuRdc(s);
  const p0 = { x: a.x + u.x * (s.centreM - s.largeurM / 2) - n.x * r, y: a.y + u.y * (s.centreM - s.largeurM / 2) - n.y * r };
  const p1 = { x: p0.x + u.x * s.largeurM, y: p0.y + u.y * s.largeurM };
  const d = s.profondeurM;
  return [p0, p1, { x: p1.x + n.x * d, y: p1.y + n.y * d }, { x: p0.x + n.x * d, y: p0.y + n.y * d }].map((q) => ({ x: centimetre(q.x), y: centimetre(q.y) }));
}

/** L'egout le plus bas du corps qui porte la saillie : la hauteur ou monte un bow-window « jusqu'au toit ». */
const egoutBas = (h: CorpsToit) => Math.min(...h.egouts);

/**
 * Le corps d'une saillie pour son hote : le rectangle, le toit propre et les hauteurs. Une galerie est ouverte
 * (des poteaux, sans mur), un appentis ferme ; un bow-window n'a ni l'un ni l'autre, son dessin est a part.
 */
export function corpsDeSaillie(h: CorpsToit, brute: SaillieFacade): CorpsToit {
  const s = bornerSaillie(h, brute);
  const pts = rectangleDeSaillie(h, s);
  const d = s.profondeurM, L = s.largeurM;
  const haut = egoutBas(h);
  const sousEtage = retraitDuRdc(s) > 0;
  // La hauteur propre l'emporte ; sinon un etage (sans depasser l'egout de la maison) ou l'egout de la maison. Sous un etage qui avance,
  // le bow-window monte au dessous de l'etage : sa hauteur propre, sinon celle d'un rez-de-chaussee, jamais au-dessus de l'egout.
  const egout = sousEtage ? Math.min(s.hauteurM ?? HAUTEUR_RDC_M, haut)
    : s.hauteurM ?? (s.genre === 'galerie' ? Math.min(2.4, haut) : s.genre === 'auvent' ? Math.min(HAUTEUR_AUVENT_M, haut) : s.niveau === 'toit' ? haut : Math.min(HAUTEUR_RDC_M, haut));
  let faitage = egout, posFaitage = 0, croupes: [number, number] | undefined;
  // Sous l'etage, pas de toit propre : l'etage le couvre (le choix du toit reste ecrit, il revient quand le retrait est retire).
  if (!sousEtage && s.toit === 'pan') {
    // Le pan monte contre le mur ; sous la pente d'une galerie ou d'un appentis (une vingtaine de degres), pas sous celle d'un bow-window.
    // Une marquise (auvent) est presque plate : une dalle mince qui penche a peine vers la rue.
    const montee = s.genre === 'bow-window' ? Math.min(1.2, d * 0.6) : s.genre === 'auvent' ? Math.min(0.15, d * 0.2) : Math.min(Math.max(haut - egout, 0.4), d * 0.4);
    faitage = dixieme(egout + montee);
  } else if (!sousEtage && s.toit === 'pavillon') {
    faitage = dixieme(egout + Math.min(1.5, Math.min(L, d) * 0.5));
    posFaitage = centimetre(d / 2);
    const c = centimetre(Math.min(d / 2, L / 2 - 0.05));
    croupes = [c, c];
  }
  const corps: CorpsToit = { pts, posFaitage, faitage, egouts: [centimetre(egout), centimetre(egout)], pignons: [], ecart: 0, saillie: s };
  if (croupes) corps.croupes = croupes;
  if (s.genre === 'galerie') { corps.ouvert = true; corps.retraitM = RETRAIT_GALERIE_M; }
  if (s.genre === 'appentis') corps.ouvert = false;
  // Un auvent n'a ni mur ni poteau : il tient sur ses consoles (three/toitCorps3d.ts les dessine a la place des poteaux).
  if (s.genre === 'auvent') corps.ouvert = true;
  return corps;
}

/** Les corps du batiment dont la saillie est celle d'un bow-window : ceux que dessine three/saillie3d.ts. */
export const estBowWindow = (c: CorpsToit): boolean => c.saillie?.genre === 'bow-window';

/**
 * La saillie `rang` replacee sur son hote, ce qui la reecrit en entier ; les autres corps sont intacts, sauf les bow-windows du meme mur
 * quand un rez-de-chaussee y recule (`accorderLesRetraits`) : celui-ci mene si le changement regle son retrait, ou sa hauteur sous l'etage.
 */
export function replacerSaillie(corps: readonly CorpsToit[], rang: number, changement: Partial<SaillieFacade>): CorpsToit[] {
  const l = placerSaillie(corps, rang, changement);
  const s = l[rang]?.saillie;
  const mene = 'rdcEnRetraitM' in changement || ('hauteurM' in changement && retraitDuRdc(s) > 0);
  return accorderLesRetraits(l, mene ? rang : null);
}

/** La saillie `rang` replacee sur son hote, seule. */
function placerSaillie(corps: readonly CorpsToit[], rang: number, changement: Partial<SaillieFacade>): CorpsToit[] {
  const c = corps[rang];
  if (!c?.saillie) return [...corps];
  const s: SaillieFacade = { ...c.saillie, ...changement };
  // Un reglage mis a `undefined` est retire : la hauteur propre qui redevient celle du niveau, le rez-de-chaussee qui revient au nu du mur.
  if (s.hauteurM === undefined) delete s.hauteurM;
  if (!(retraitDuRdc(s) > 0)) delete s.rdcEnRetraitM;
  const hote = corps[s.hote];
  if (!hote || s.hote === rang) return [...corps];
  const neuf = corpsDeSaillie(hote, s);
  // Ce que la personne a regle sur le corps et que le placement ne dit pas (lucarnes, cheminees) reste.
  const reste: CorpsToit = { ...neuf };
  if (c.lucarnes) reste.lucarnes = c.lucarnes;
  if (c.cheminees) reste.cheminees = c.cheminees;
  if (c.retraitM !== undefined) reste.retraitM = c.retraitM;
  return corps.map((k, i) => (i === rang ? reste : k));
}

/**
 * Un seul rez-de-chaussee par mur (decision du proprietaire du 9 novembre 2026) : les bow-windows poses sur le meme mur du meme corps
 * portent le meme recul et passent sous le meme etage. Le recul est celui du bow-window `meneur` (celui que la personne vient de regler) ;
 * sans meneur, le plus grand recul du mur, et la hauteur du bow-window qui le porte. Sans recul sur un mur, rien ne change : un fichier
 * sans rez-de-chaussee en retrait garde ses corps, octet pour octet.
 */
export function accorderLesRetraits(corps: readonly CorpsToit[], meneur: number | null = null): CorpsToit[] {
  const groupes = new Map<string, number[]>();
  corps.forEach((c, i) => { if (c.saillie && estBowWindow(c)) { const k = c.saillie.hote + ':' + c.saillie.mur; groupes.set(k, [...(groupes.get(k) ?? []), i]); } });
  let l = corps.slice();
  for (const rangs of groupes.values()) {
    if (rangs.length < 2) continue;
    const recul = (i: number) => retraitDuRdc(l[i]?.saillie);
    const ref = meneur !== null && rangs.includes(meneur) ? meneur : rangs.reduce((m, i) => (recul(i) > recul(m) ? i : m), rangs[0] as number);
    const sRef = l[ref]?.saillie, r = recul(ref);
    if (!sRef || (r === 0 && ref !== meneur)) continue;
    for (const i of rangs) {
      const s = l[i]?.saillie;
      if (i === ref || !s) continue;
      if (r === 0) { if (recul(i) > 0) l = placerSaillie(l, i, { rdcEnRetraitM: undefined }); continue; }
      if (recul(i) === r && s.hauteurM === sRef.hauteurM) continue;
      l = placerSaillie(l, i, { rdcEnRetraitM: r, hauteurM: sRef.hauteurM, niveau: 'rdc' });
    }
  }
  return l;
}

/** Un rez-de-chaussee en retrait sous l'etage, sur le mur `mur` d'un corps hote : de combien il recule, et a quelle hauteur l'etage commence. */
export interface RetraitRdc {
  mur: number;
  reculM: number;
  hauteurM: number;
  /** Les bow-windows glisses dessous : leur cote contre le mur recule (de `pts[0]` a `pts[1]`), ou ce mur n'a ni porte ni fenetre. */
  devant: [PtBrut, PtBrut][];
  /** Ces bow-windows eux-memes (le dessin pose sur leur face avant la photo d'un releve du mur) ; rempli par `retraitsDuRdc`. */
  bows?: CorpsToit[];
}

/**
 * Les rez-de-chaussee en retrait de chaque corps hote, lus sur ses bow-windows : un par mur, le plus grand recul, sous le dessous de
 * l'etage (l'egout du bow-window qui le porte). La cle est le corps hote lui-meme : le dessin isole parfois un corps, et les rangs changent.
 */
export function retraitsDuRdc(corps: readonly CorpsToit[] | null | undefined): Map<CorpsToit, RetraitRdc[]> {
  const parHote = new Map<CorpsToit, RetraitRdc[]>();
  (corps ?? []).forEach((c) => {
    const r = retraitDuRdc(c.saillie), s = c.saillie, h = s ? corps?.[s.hote] : undefined;
    if (!(r > 0) || !s || !h || h.saillie) return;
    const l = parHote.get(h) ?? [], deja = l.find((x) => x.mur === s.mur), hauteurM = Math.min(...c.egouts);
    const cote: [PtBrut, PtBrut] = [c.pts[0] as PtBrut, c.pts[1] as PtBrut];
    if (deja) { deja.devant.push(cote); (deja.bows ??= []).push(c); if (r > deja.reculM) { deja.reculM = r; deja.hauteurM = hauteurM; } } else l.push({ mur: s.mur, reculM: r, hauteurM, devant: [cote], bows: [c] });
    parHote.set(h, l);
  });
  return parHote;
}

/** Le corps hote avec ses murs du rez-de-chaussee recules : son pied (le prisme, ses fenetres du bas, son soubassement). */
export function corpsAuPied(h: CorpsToit, retraits: readonly RetraitRdc[] | undefined): CorpsToit {
  if (!retraits?.length) return h;
  const pts = h.pts.map((p) => ({ ...p }));
  for (const r of retraits) {
    const { n } = murDuCorps(h, r.mur), k = h.pts.length;
    for (const j of [r.mur % k, (r.mur + 1) % k]) { const p = pts[j] as PtBrut; pts[j] = { x: centimetre(p.x - n.x * r.reculM), y: centimetre(p.y - n.y * r.reculM) }; }
  }
  return { ...h, pts };
}

/**
 * Ce que l'etage qui avance ajoute au corps hote, au-dessus de son pied recule. Le prisme du corps monte jusqu'a son egout le plus bas, et
 * au-dessus, les murs hauts et les pignons restent au nu du rectangle (three/toitCorps3d.ts) : il reste, de la hauteur de l'etage a cet
 * egout, le mur au nu de la facade, son dessous a plat (de la couleur du mur, decision du proprietaire du 9 novembre 2026), ses deux
 * retours aux bouts et, a l'egout, le dessus de cette bande, sous le toit.
 */
export function facettesEncorbellement(h: CorpsToit, retraits: readonly RetraitRdc[] | undefined): Pt3[][] {
  const faces: Pt3[][] = [];
  const bas = Math.min(...h.egouts);
  for (const r of retraits ?? []) {
    const { a, b, n } = murDuCorps(h, r.mur);
    const a2 = { x: a.x - n.x * r.reculM, y: a.y - n.y * r.reculM }, b2 = { x: b.x - n.x * r.reculM, y: b.y - n.y * r.reculM };
    // Un etage qui commencerait au-dessus de l'egout : le mur entier recule, et le dessous se ferme a l'egout.
    const H = Math.min(r.hauteurM, bas);
    const Z = (q: PtBrut, z: number): Pt3 => ({ x: q.x, y: q.y, z });
    faces.push([Z(a, H), Z(a2, H), Z(b2, H), Z(b, H)]);
    if (bas - H > 0.01) {
      faces.push([Z(a, H), Z(b, H), Z(b, bas), Z(a, bas)]);
      faces.push([Z(a2, H), Z(a, H), Z(a, bas), Z(a2, bas)]);
      faces.push([Z(b, H), Z(b2, H), Z(b2, bas), Z(b, bas)]);
      faces.push([Z(a, bas), Z(b, bas), Z(b2, bas), Z(a2, bas)]);
    }
  }
  return faces;
}

/** Un mur de corps se lit sur une facade du contour comme cotesSurLesCotes (geometry/facadeExterieure.ts) : a 10° et 60 cm pres. */
const ANGLE_SUR_FACADE_RAD = (10 * Math.PI) / 180;
const ECART_SUR_FACADE_M = 0.6;

/**
 * Un rez-de-chaussee en retrait vu sur une facade du contour (le repere d'une photo de releve : x depuis la gauche vue de dehors, y en
 * hauteur) : de `de` a `a` le long du mur, la facade du bas recule de `profondeurM` derriere le plan de la facade (le recul, plus l'ecart
 * du mur du corps a ce plan) jusqu'a `hauteurM`, le dessous de l'etage ; `devant`, les bow-windows glisses dessous.
 */
export interface RetraitSurFacade {
  de: number; a: number; profondeurM: number; hauteurM: number; devant: [number, number][];
  /** Les bow-windows glisses sous ce retrait (absent sur le mur voisin, dont la bande sous l'etage est l'entree du retrait). */
  bows?: readonly CorpsToit[];
}

/** Ce qu'une facade du contour sait de son mur : ses bouts vus de dehors, sa largeur et sa normale sortante. */
interface MurDeFacade { gauche: PtBrut; droite: PtBrut; largeur: number; normale: PtBrut }

/**
 * Les rez-de-chaussee en retrait (`retraitsDuRdc`) qui tombent sur la facade `f` : le mur du corps hote parallele a elle, du meme cote,
 * a moins de 60 cm de son plan et qui la recouvre. `hotes` : les corps dessines (un corps isole au Mode Toit laisse les autres). Vide
 * sans retrait : la photo de la facade reste d'un seul plan, comme avant le schema 16.
 */
export function retraitsSurLaFacade(f: MurDeFacade, retraits: ReadonlyMap<CorpsToit, readonly RetraitRdc[]> | null | undefined, hotes?: readonly CorpsToit[] | null): RetraitSurFacade[] {
  const l: RetraitSurFacade[] = [];
  if (!retraits?.size || !(f.largeur > 0)) return l;
  const L = f.largeur, ux = (f.droite.x - f.gauche.x) / L, uy = (f.droite.y - f.gauche.y) / L;
  const x = (q: PtBrut) => (q.x - f.gauche.x) * ux + (q.y - f.gauche.y) * uy;
  // La profondeur d'un point derriere le plan de la facade (positive vers l'interieur).
  const derriere = (q: PtBrut) => -((q.x - f.gauche.x) * f.normale.x + (q.y - f.gauche.y) * f.normale.y);
  retraits.forEach((rs, h) => {
    if (hotes && !hotes.includes(h)) return;
    const bas = Math.min(...h.egouts);
    const surLaFacade = (p: PtBrut, q: PtBrut, n: PtBrut) => n.x * f.normale.x + n.y * f.normale.y >= Math.cos(ANGLE_SUR_FACADE_RAD)
      && Math.abs(derriere(p)) <= ECART_SUR_FACADE_M && Math.abs(derriere(q)) <= ECART_SUR_FACADE_M;
    const entre = (p: PtBrut, q: PtBrut): [number, number] => [Math.max(0, Math.min(x(p), x(q))), Math.min(L, Math.max(x(p), x(q)))];
    for (const r of rs) {
      // Le meme dessous que l'etage qui avance (facettesEncorbellement) : jamais au-dessus de l'egout du corps.
      const hauteurM = Math.min(r.hauteurM, bas);
      const m = murDuCorps(h, r.mur);
      if (m.L > 0 && surLaFacade(m.a, m.b, m.n)) {
        const [de, a] = entre(m.a, m.b);
        if (a - de < 0.05) continue;
        const devant = r.devant.map(([p, q]): [number, number] => [Math.max(de, Math.min(x(p), x(q))), Math.min(a, Math.max(x(p), x(q)))]).filter(([p, q]) => q - p > 0.01);
        const vu: RetraitSurFacade = { de, a, profondeurM: (derriere(m.a) + derriere(m.b)) / 2 + r.reculM, hauteurM, devant };
        if (r.bows?.length) vu.bows = r.bows;
        l.push(vu);
        continue;
      }
      // Un mur voisin (un pignon) : le pied du corps (corpsAuPied) l'a raccourci du recul, au bout qui touche le mur recule. Sous
      // l'etage, la bande de ce bout est l'entree du retrait, ouverte : la photo et les baies n'y sont pas ; au-dessus, l'etage reste au nu.
      for (const [k, auDebut] of [[r.mur + 1, true], [r.mur - 1, false]] as const) {
        const w = murDuCorps(h, k);
        if (!(w.L > r.reculM) || !surLaFacade(w.a, w.b, w.n)) continue;
        const coin = auDebut ? w.a : w.b, sens = auDebut ? 1 : -1;
        const [de, a] = entre(coin, { x: coin.x + w.u.x * sens * r.reculM, y: coin.y + w.u.y * sens * r.reculM });
        if (a - de > 0.01) l.push({ de, a, profondeurM: 0, hauteurM, devant: [[de, a]] });
      }
    }
  });
  return l.sort((p, q) => p.de - q.de);
}

/** Un point d'un mur, dans son plan : x le long du mur, y en hauteur. */
interface P2 { x: number; y: number }

/** Le polygone `l` coupe au demi-plan `garde` (Sutherland-Hodgman) ; `coupe` donne le point ou un cote franchit sa limite. */
function couper(l: readonly P2[], garde: (p: P2) => boolean, coupe: (p: P2, q: P2) => P2): P2[] {
  const sortie: P2[] = [];
  l.forEach((p, i) => {
    const q = l[(i + 1) % l.length] as P2;
    if (garde(p)) sortie.push(p);
    if (garde(p) !== garde(q)) sortie.push(coupe(p, q));
  });
  return sortie;
}
const entreX = (l: readonly P2[], a: number, b: number): P2[] => {
  const en = (xc: number) => (p: P2, q: P2): P2 => ({ x: xc, y: p.y + ((xc - p.x) * (q.y - p.y)) / (q.x - p.x) });
  return couper(couper(l, (p) => p.x >= a, en(a)), (p) => p.x <= b, en(b));
};
const coteY = (l: readonly P2[], H: number, dessous: boolean): P2[] =>
  couper(l, (p) => (dessous ? p.y <= H : p.y >= H), (p, q) => ({ x: p.x + ((H - p.y) * (q.x - p.x)) / (q.y - p.y), y: H }));

/** Les portions de [de, a] hors des intervalles `trous` (tries ou non). */
function sansLesTrous(de: number, a: number, trous: readonly (readonly [number, number])[]): [number, number][] {
  const l: [number, number][] = [];
  let x = de;
  for (const [p, q] of [...trous].sort((u, v) => u[0] - v[0])) { if (p > x + 0.01) l.push([x, Math.min(p, a)]); x = Math.max(x, q); }
  if (a > x + 0.01) l.push([x, a]);
  return l.filter(([p, q]) => q - p > 0.01);
}

/**
 * La photo d'une facade relevee, decoupee par ses rez-de-chaussee en retrait (decision du proprietaire, 9 novembre 2026) : sur la
 * longueur d'un retrait, ce qui est sous le dessous de l'etage recule avec le mur du bas (`profondeurM`), ce qui est au-dessus reste au
 * nu ; derriere un bow-window, rien (le bow-window la cache, et rien ne s'y pose). Ailleurs, la photo reste au nu. Chaque morceau garde
 * le contour du mur entier comme repere : x et y sont ceux de la photo, elle ne glisse pas. `fermees` : les portions du mur ou il y a un
 * mur (sous un appentis ouvert, il n'y en a pas).
 */
export function morceauxSousEtage(contour: readonly P2[], fermees: readonly (readonly [number, number])[], retraits: readonly RetraitSurFacade[]): { contour: P2[]; profondeurM: number }[] {
  const l: { contour: P2[]; profondeurM: number }[] = [];
  const garder = (c: P2[], profondeurM: number) => { if (c.length >= 3) l.push({ contour: c, profondeurM }); };
  for (const [p, q] of fermees) {
    // Hors des retraits : la photo au nu, comme avant.
    for (const [s, e] of sansLesTrous(p, q, retraits.map((r) => [r.de, r.a] as const))) garder(entreX(contour, s, e), 0);
    for (const r of retraits) {
      const s = Math.max(p, r.de), e = Math.min(q, r.a);
      if (e - s <= 0.01) continue;
      const bande = entreX(contour, s, e);
      garder(coteY(bande, r.hauteurM, false), 0);
      for (const [s2, e2] of sansLesTrous(s, e, r.devant)) garder(coteY(entreX(contour, s2, e2), r.hauteurM, true), r.profondeurM);
    }
  }
  return l;
}

/**
 * Ou se pose une ouverture d'une facade relevee sous un etage qui avance, comme celles de la disposition automatique
 * (three/detailsBatiment.ts) : sous le dessous de l'etage, sur le mur recule (`profondeurM`), sauf derriere un bow-window (null) ; au-dessus,
 * au nu (0) ; a cheval sur les deux, nulle part (null). Hors des retraits, au nu.
 */
export function profondeurDOuverture(o: { x: number; y: number; l: number; h: number }, retraits: readonly RetraitSurFacade[]): number | null {
  const r = retraits.find((k) => o.x < k.a - 0.01 && o.x + o.l > k.de + 0.01);
  if (!r) return 0;
  if (o.y + o.h <= r.hauteurM + 0.01) return r.devant.some(([p, q]) => o.x < q && o.x + o.l > p) ? null : r.profondeurM;
  return o.y < r.hauteurM - 0.01 ? null : 0;
}

/** Un pave de la modenature d'une facade (x le long du mur, y en hauteur) et le plan ou il se pose : `profondeurM` derriere le nu. */
export interface MorceauDePave { x0: number; x1: number; y0: number; y1: number; profondeurM: number }

/**
 * Un pave de la modenature lue d'un releve (bandeau, soubassement, chaine d'angle, encadrement, descente, store) sous un etage qui avance
 * (decision du proprietaire, 9 novembre 2026) : la meme regle que la photo (`morceauxSousEtage`). Sous le dessous de l'etage, le morceau
 * recule avec le mur du rez-de-chaussee ; au-dessus, il reste au nu ; derriere un bow-window (et a l'entree du retrait, sur le mur voisin),
 * rien. `entier` (un bandeau) : un pave a cheval sur le dessous de l'etage n'est pas coupe, il reste au nu en entier. Un bandeau a cette
 * hauteur marque le plancher de l'etage, qui est au nu ; le couper ferait deux lamelles de quelques centimetres sur deux plans, que rien
 * ne porte. Hors des retraits, le pave tel quel, au nu.
 */
export function morceauxDuPave(p: Omit<MorceauDePave, 'profondeurM'>, retraits: readonly RetraitSurFacade[], entier = false): MorceauDePave[] {
  const l: MorceauDePave[] = [];
  const garder = (x0: number, x1: number, y0: number, y1: number, profondeurM: number) => { if (x1 - x0 > 1e-6 && y1 - y0 > 1e-6) l.push({ x0, x1, y0, y1, profondeurM }); };
  const dans = retraits.filter((r) => r.a > p.x0 + 1e-6 && r.de < p.x1 - 1e-6);
  if (!dans.length) return [{ ...p, profondeurM: 0 }];
  for (const [s, e] of sansLesTrous(p.x0, p.x1, dans.map((r) => [r.de, r.a] as const))) garder(s, e, p.y0, p.y1, 0);
  for (const r of dans) {
    const s = Math.max(p.x0, r.de), e = Math.min(p.x1, r.a), H = r.hauteurM;
    if (entier && p.y0 < H - 1e-6 && p.y1 > H + 1e-6) { garder(s, e, p.y0, p.y1, 0); continue; }
    garder(s, e, Math.max(p.y0, H), p.y1, 0);
    if (p.y0 < H) for (const [s2, e2] of sansLesTrous(s, e, r.devant)) garder(s2, e2, p.y0, Math.min(p.y1, H), r.profondeurM);
  }
  return l.sort((u, v) => u.x0 - v.x0 || u.y0 - v.y0);
}

/** Un mur libre pour une saillie neuve : le plus long mur de l'hote qui n'en porte pas deja, sinon le plus long. */
export function murLibre(corps: readonly CorpsToit[], hote: number): number {
  const h = corps[hote] as CorpsToit;
  const pris = new Set(corps.filter((c) => c.saillie && c.saillie.hote === hote).map((c) => c.saillie?.mur));
  const murs = h.pts.map((_, i) => ({ i, L: murDuCorps(h, i).L })).sort((x, y) => y.L - x.L);
  return (murs.find((m) => !pris.has(m.i)) ?? murs[0] as { i: number }).i;
}

/** L'emprise au sol d'une saillie, dans le plan : le rectangle, un demi-ellipse (arc) ou un rectangle aux angles exterieurs arrondis (conge). */
export function empriseDeSaillie(c: CorpsToit): PtBrut[] {
  const r = repere(c.pts);
  const forme = c.saillie?.forme ?? 'rectangle';
  const L = r.L, d = r.W;
  const P = (s: number, t: number) => point(r, s, t);
  if (forme === 'pans') {
    // Des pans coupes : le fond plat est la moitie de la largeur, les cotes partent du mur en biais.
    return [P(0, 0), P(L * 0.25, d), P(L * 0.75, d), P(L, 0)];
  }
  if (forme === 'arc') {
    const N = 12;
    return Array.from({ length: N + 1 }, (_, k) => { const th = (Math.PI * k) / N; return P((L / 2) * (1 - Math.cos(th)), d * Math.sin(th)); });
  }
  if (forme === 'conge') {
    const rayon = Math.min(L, d) * 0.4, N = 4;
    // Chaque coin exterieur : un quart de cercle, du cote vers le fond (l'angle decroit).
    const arc = (cx: number, cy: number, a0: number) => Array.from({ length: N + 1 }, (_, k) => { const a = a0 - (Math.PI / 2) * (k / N); return P(cx + rayon * Math.cos(a), cy + rayon * Math.sin(a)); });
    return [P(0, 0), ...arc(rayon, d - rayon, Math.PI), ...arc(L - rayon, d - rayon, Math.PI / 2), P(L, 0)];
  }
  // Du mur, par un cote, le fond, l'autre cote : le dernier cote (celui du mur de la maison) reste a fermer.
  return [P(0, 0), P(0, d), P(L, d), P(L, 0)];
}

/**
 * Les facettes d'un bow-window : ses murs du sol a l'egout (sans celui qui est contre la maison) et son toit propre.
 * `emprise` va de `pts[0]` a `pts[1]` en passant par l'exterieur ; son dernier cote ferme le mur de la maison.
 */
export function facettesBowWindow(c: CorpsToit): { pans: Pt3[][]; murs: Pt3[][] } {
  const pans: Pt3[][] = [], murs: Pt3[][] = [];
  const e = empriseDeSaillie(c);
  const r = repere(c.pts);
  const top = Math.min(...c.egouts), F = c.faitage, d = r.W, L = r.L;
  const ST = (q: PtBrut) => ({ s: (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y, t: Math.max(0, (q.x - r.p0.x) * r.v.x + (q.y - r.p0.y) * r.v.y) });
  const T = (q: PtBrut) => ST(q).t;
  const Z = (q: PtBrut, z: number): Pt3 => ({ x: q.x, y: q.y, z });
  for (let i = 0; i < e.length - 1; i++) { const a = e[i] as PtBrut, b = e[i + 1] as PtBrut; murs.push([Z(a, 0), Z(b, 0), Z(b, top), Z(a, top)]); }
  // Le toit deborde de ses murs : l'emprise est agrandie autour du milieu du mur de la maison, sans quitter ce mur.
  const deb = DEBORD_BOW_M;
  const large = (q: PtBrut): PtBrut => { const { s, t } = ST(q); return point(r, L / 2 + (s - L / 2) * ((L + 2 * deb) / L), t * ((d + deb) / d)); };
  const eT = e.map(large);
  // Sous un etage qui avance (schema 16), l'etage le couvre : comme sans toit propre.
  const toit = retraitDuRdc(c.saillie) > 0 ? 'aucun' : c.saillie?.toit ?? 'pan';
  // Sans toit propre (schema 14) : le toit d'un auvent le couvre ; ses murs se ferment a leur hauteur, sans debord ni couverture.
  if (toit === 'aucun') murs.push(e.map((q) => Z(q, top)));
  else if (toit === 'plat') pans.push(eT.map((q) => Z(q, top)));
  else if (toit === 'pan') pans.push(eT.map((q) => Z(q, top + (F - top) * (1 - T(q) / d))));
  else if (c.saillie?.forme && c.saillie.forme !== 'rectangle') {
    const apex = { x: eT.reduce((t, q) => t + q.x, 0) / eT.length, y: eT.reduce((t, q) => t + q.y, 0) / eT.length };
    const sommet = { x: apex.x, y: apex.y, z: F };
    for (let i = 0; i < eT.length - 1; i++) pans.push([Z(eT[i] as PtBrut, top), Z(eT[i + 1] as PtBrut, top), sommet]);
  } else {
    const m = Math.min(d / 2, L / 2);
    const R = (s: number, t: number, z: number): Pt3 => ({ ...point(r, L / 2 + (s - L / 2) * ((L + 2 * deb) / L), t * ((d + deb) / d)), z });
    pans.push([R(0, d, top), R(L, d, top), R(L - m, d / 2, F), R(m, d / 2, F)]);
    pans.push([R(0, 0, top), R(0, d, top), R(m, d / 2, F)]);
    pans.push([R(L, d, top), R(L, 0, top), R(L - m, d / 2, F)]);
  }
  return { pans, murs };
}

/** Les corps sans la saillie `rang` ; les saillies posees sur un corps place apres elle gardent leur hote (son rang descend d'un). */
export function retirerSaillie(corps: readonly CorpsToit[], rang: number): CorpsToit[] {
  return corps.flatMap((c, i) => {
    if (i === rang) return [];
    if (!c.saillie || c.saillie.hote < rang) return [c];
    return [{ ...c, saillie: { ...c.saillie, hote: c.saillie.hote - 1 } }];
  });
}

/** Le nom d'une saillie dans l'inspecteur. */
export const NOM_SAILLIE: Record<GenreSaillie, string> = { 'bow-window': 'Bow-window', galerie: 'Galerie', appentis: 'Appentis', auvent: 'Auvent' };

/** Les corps sans leurs bow-windows (null s'il n'en reste aucun), et les bow-windows : ce que le prisme du batiment et ses fenetres lisent, et ce qui se dessine a part. */
export function separerBowWindows(corps: readonly CorpsToit[] | null): { hotes: CorpsToit[] | null; bows: CorpsToit[] } {
  if (!corps) return { hotes: null, bows: [] };
  const bows = corps.filter(estBowWindow), hotes = corps.filter((c) => !estBowWindow(c));
  return { hotes: bows.length ? (hotes.length ? hotes : null) : corps.slice(), bows };
}

/** Un angle de plus de cela entre deux cotes de l'emprise les separe : un arc (15° par cote) reste une seule facade, un angle droit en fait deux. */
const ANGLE_FACADE_RAD = (20 * Math.PI) / 180;
/** Une fenetre : sa largeur propre, l'espace voulu entre deux et la hauteur de son appui. */
const FENETRE_LARGEUR_M = 1.1, FENETRE_ENTRAXE_M = 1.6, FENETRE_MIN_M = 0.5, APPUI_M = 0.9, LINTEAU_MIN_M = 0.3, FENETRE_HAUT_MAX_M = 1.4, RELIEF_VITRE_M = 0.012;

/**
 * Ce qu'une photo prise de face voit d'une facade de bow-window : une facade tournee de moins de 60° vers la rue (sa corde a moins de 60°
 * du mur de la maison). Le fond, et les pans coupes courants (une cinquantaine de degres), en sont ; un retour d'equerre non : la photo
 * le voit par la tranche. Au-dela, la photo s'y etirerait plus du double.
 */
const VU_DE_FACE_RAD = (60 * Math.PI) / 180;

/**
 * Les facades d'un bow-window, dans son emprise (`empriseDeSaillie`) : des suites de cotes dont la direction change peu (un arc entier en
 * est une). `avant` : une photo prise de face la voit (`VU_DE_FACE_RAD`) ; un retour d'equerre, non.
 */
function facadesDuBowWindow(c: CorpsToit): { pts: PtBrut[]; avant: boolean }[] {
  const e = empriseDeSaillie(c);
  const dir = (i: number) => Math.atan2((e[i + 1] as PtBrut).y - (e[i] as PtBrut).y, (e[i + 1] as PtBrut).x - (e[i] as PtBrut).x);
  const suites: number[][] = [];
  for (let i = 0; i < e.length - 1; i++) {
    const ecart = i > 0 ? Math.abs(Math.atan2(Math.sin(dir(i) - dir(i - 1)), Math.cos(dir(i) - dir(i - 1)))) : Infinity;
    if (ecart > ANGLE_FACADE_RAD) suites.push([i]); else (suites[suites.length - 1] as number[]).push(i);
  }
  const r = repere(c.pts);
  return suites.map((suite) => {
    const pts = [e[suite[0] as number] as PtBrut, ...suite.map((i) => e[i + 1] as PtBrut)];
    const A = pts[0] as PtBrut, B = pts[pts.length - 1] as PtBrut, l = Math.hypot(B.x - A.x, B.y - A.y);
    const avant = l > 1e-6 && Math.abs((B.x - A.x) * r.u.x + (B.y - A.y) * r.u.y) / l >= Math.cos(VU_DE_FACE_RAD) - 1e-9;
    return { pts, avant };
  });
}

/** Un corps est devant un mur quand sa face en est a plus que cela, et elle lui est parallele a ce cosinus pres. */
const DEVANT_LE_MUR_M = 0.3;
const FACE_PARALLELE = 0.94;
/** Une face plus courte que cela, une fois coupee aux bouts du mur, ne recoit rien. */
const FACE_MIN_M = 0.2;

/**
 * De combien le mur d'un corps qui porte une facade passe devant la ligne de ce cote du contour, le long d'elle (metres, jamais negatif) :
 * le trace du cadastre et le rectangle d'un corps lu au LiDAR ne sont pas tout a fait paralleles, et le mur dessine (celui du corps)
 * croise la ligne du cote. Une photo posee sur cette ligne passait derriere le mur sur une moitie de la facade (AE 101, 9 cm au bout
 * droit) : elle se pose sur le mur qui la porte (three/releve3d.ts).
 */
export function avanceeDuMurPorteur(f: { gauche: PtBrut; droite: PtBrut; largeur: number; normale: PtBrut }, corps: readonly CorpsToit[]): (x: number) => number {
  const L = f.largeur;
  if (!(L > 0)) return () => 0;
  const ux = (f.droite.x - f.gauche.x) / L, uy = (f.droite.y - f.gauche.y) / L;
  const le = (p: PtBrut) => (p.x - f.gauche.x) * ux + (p.y - f.gauche.y) * uy;
  const devant = (p: PtBrut) => (p.x - f.gauche.x) * f.normale.x + (p.y - f.gauche.y) * f.normale.y;
  const murs: { xa: number; xb: number; da: number; db: number }[] = [];
  for (const c of corps) c.pts.forEach((p, i) => {
    const q = c.pts[(i + 1) % c.pts.length] as PtBrut, l = Math.hypot(q.x - p.x, q.y - p.y);
    if (l < FACE_MIN_M || Math.abs(devant(p)) >= DEVANT_LE_MUR_M || Math.abs(devant(q)) >= DEVANT_LE_MUR_M) return;
    if (Math.abs(((q.x - p.x) * ux + (q.y - p.y) * uy) / l) < FACE_PARALLELE) return;
    const [g, d] = le(p) <= le(q) ? [p, q] : [q, p];
    murs.push({ xa: le(g), xb: le(d), da: devant(g), db: devant(d) });
  });
  return (x: number) => Math.max(0, ...murs.filter((m) => x >= m.xa - 1e-6 && x <= m.xb + 1e-6).map((m) => m.da + ((m.db - m.da) * (x - m.xa)) / Math.max(1e-9, m.xb - m.xa)));
}

/** La face d'un corps devant un mur : ses deux bouts (de gauche a droite, vus de dehors), leurs abscisses le long du mur, son haut. */
export interface FaceDevantLeMur { a: PtBrut; b: PtBrut; xa: number; xb: number; hauteurM: number }

/**
 * Les faces des corps qui passent devant un mur (un appentis, une veranda, un auvent ferme) et lui font face : ce qu'une photo prise de
 * face montre a la place du bas du mur. La photo d'un releve s'y pose (three/releve3d.ts, demande du proprietaire, 11 novembre 2026) :
 * le mur derriere eux garde le haut, eux recoivent le bas, aux memes abscisses le long du mur (chaque point de la face montre le pixel
 * du mur qu'il cache, vu de face). Coupees aux bouts du mur ; `hauteurM` : le bas de leur toit (leur egout le plus bas).
 */
export function facesDevantLeMur(f: { gauche: PtBrut; droite: PtBrut; largeur: number; normale: PtBrut }, corps: readonly CorpsToit[]): FaceDevantLeMur[] {
  const L = f.largeur;
  if (!(L > 0)) return [];
  const ux = (f.droite.x - f.gauche.x) / L, uy = (f.droite.y - f.gauche.y) / L;
  const le = (p: PtBrut) => (p.x - f.gauche.x) * ux + (p.y - f.gauche.y) * uy;
  const devant = (p: PtBrut) => (p.x - f.gauche.x) * f.normale.x + (p.y - f.gauche.y) * f.normale.y;
  const faces: FaceDevantLeMur[] = [];
  for (const c of corps) {
    if (c.ouvert === true) continue;
    c.pts.forEach((p, i) => {
      const q = c.pts[(i + 1) % c.pts.length] as PtBrut, l = Math.hypot(q.x - p.x, q.y - p.y);
      if (l < FACE_MIN_M || devant(p) < DEVANT_LE_MUR_M || devant(q) < DEVANT_LE_MUR_M) return;
      if (Math.abs(((q.x - p.x) * ux + (q.y - p.y) * uy) / l) < FACE_PARALLELE) return;
      // La face regarde dehors : le reste du corps est derriere elle.
      if (c.pts.some((r) => devant(r) > Math.max(devant(p), devant(q)) + 0.05)) return;
      const [g, d] = le(p) <= le(q) ? [p, q] : [q, p];
      const xg = le(g), xd = le(d), xa = Math.max(0, xg), xb = Math.min(L, xd);
      if (xb - xa < FACE_MIN_M) return;
      const en = (x: number): PtBrut => { const t = (x - xg) / (xd - xg); return { x: g.x + t * (d.x - g.x), y: g.y + t * (d.y - g.y) }; };
      faces.push({ a: en(xa), b: en(xb), xa, xb, hauteurM: Math.min(...c.egouts) });
    });
  }
  return faces.sort((p, q) => p.xa - q.xa);
}

/**
 * Les faces avant d'un bow-window (`facadesDuBowWindow`, `avant`) : ce qu'une photo prise de face voit de lui, le fond et les pans coupes.
 * Sous un etage qui avance, la photo d'un releve du mur s'y pose (three/releve3d.ts, decision du proprietaire du 9 novembre 2026), a la
 * place de leurs vitres dessinees ; les retours d'equerre gardent les leurs.
 */
export function facesAvantDuBowWindow(c: CorpsToit): PtBrut[][] {
  return facadesDuBowWindow(c).filter((s) => s.avant).map((s) => s.pts);
}

/**
 * Les vitres d'un bow-window : une ou plusieurs fenetres par facade (suite de cotes presque alignes, ou un arc entier),
 * posees contre le mur, a hauteur d'appui. Une facade trop courte n'en recoit pas ; l'arc en recoit plusieurs, qui suivent sa courbe.
 * `sansLesFacesAvant` : la photo d'un releve couvre les faces avant (sous un etage qui avance), seules les autres ont leurs vitres.
 */
export function vitresBowWindow(c: CorpsToit, sansLesFacesAvant = false): Pt3[][] {
  const top = Math.min(...c.egouts);
  const bas = APPUI_M, haut = Math.min(top - LINTEAU_MIN_M, bas + FENETRE_HAUT_MAX_M);
  if (haut - bas < 0.4) return [];
  const vitres: Pt3[][] = [];
  const r = repere(c.pts);
  for (const { pts, avant } of facadesDuBowWindow(c)) {
    if (sansLesFacesAvant && avant) continue;
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push((cum[k - 1] as number) + Math.hypot((pts[k] as PtBrut).x - (pts[k - 1] as PtBrut).x, (pts[k] as PtBrut).y - (pts[k - 1] as PtBrut).y));
    const total = cum[cum.length - 1] as number;
    if (total < FENETRE_MIN_M + 0.2) continue;
    const n = Math.max(1, Math.round(total / FENETRE_ENTRAXE_M));
    const largeur = Math.min(FENETRE_LARGEUR_M, (total / n) * 0.7);
    // Le point a l'abscisse `a` de la suite, et la normale sortante du cote qui le porte.
    const en = (a: number): { p: PtBrut; n: PtBrut; k: number } => {
      let k = 1; while (k < cum.length - 1 && (cum[k] as number) < a) k++;
      const A = pts[k - 1] as PtBrut, B = pts[k] as PtBrut, l = (cum[k] as number) - (cum[k - 1] as number) || 1, f = (a - (cum[k - 1] as number)) / l;
      const ux = (B.x - A.x) / l, uy = (B.y - A.y) / l;
      // La normale s'eloigne du milieu du mur de la maison.
      const mid = point(r, r.L / 2, 0);
      let nx = uy, ny = -ux;
      if ((A.x - mid.x) * nx + (A.y - mid.y) * ny < 0) { nx = -nx; ny = -ny; }
      return { p: { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f }, n: { x: nx, y: ny }, k };
    };
    for (let w = 0; w < n; w++) {
      const centre = ((w + 0.5) * total) / n, a0 = centre - largeur / 2, a1 = centre + largeur / 2;
      // Les sommets de la fenetre : ses deux bouts et les coins de la suite qui tombent entre les deux.
      const jalons = [a0, ...cum.filter((x) => x > a0 + 1e-6 && x < a1 - 1e-6), a1];
      const bord = jalons.map((a) => { const q = en(Math.min(Math.max(a, 0), total)); return { x: q.p.x + q.n.x * RELIEF_VITRE_M, y: q.p.y + q.n.y * RELIEF_VITRE_M }; });
      // Un quadrilatere par cote : une vitre qui suit un arc n'est pas plane, chaque morceau l'est.
      for (let k = 0; k < bord.length - 1; k++) {
        const [A, B] = [bord[k] as PtBrut, bord[k + 1] as PtBrut];
        vitres.push([{ ...A, z: bas }, { ...B, z: bas }, { ...B, z: haut }, { ...A, z: haut }]);
      }
    }
  }
  return vitres;
}

/** Le mur de l'hote le plus proche d'un point, et l'abscisse de ce point sur lui : ce que donne un toucher sur la facade. */
export function murLePlusProche(h: CorpsToit, p: PtBrut): { mur: number; centreM: number } {
  let meilleur = { mur: 0, centreM: murDuCorps(h, 0).L / 2 }, dmin = Infinity;
  for (let i = 0; i < h.pts.length; i++) {
    const { a, L, u } = murDuCorps(h, i);
    const s = Math.min(Math.max((p.x - a.x) * u.x + (p.y - a.y) * u.y, 0), L);
    const d = Math.hypot(a.x + u.x * s - p.x, a.y + u.y * s - p.y);
    if (d < dmin) { dmin = d; meilleur = { mur: i, centreM: s }; }
  }
  return meilleur;
}

/** Le pignon avec sa saillie ; nulle, le champ s'efface (un fichier sans saillie reste identique). */
export function saillieDe(g: PignonToit, m: number): PignonToit {
  const neuf: PignonToit = { ...g, saillieM: m };
  if (!(m > 0.01)) delete neuf.saillieM;
  return neuf;
}
