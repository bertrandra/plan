// Les corps d'un batiment et leurs pignons, reconstruits sur le toit mesure au LiDAR
// (MD/spec-toit-ign.md §13).
//
// La surface mesuree (model/toitMesure.ts) est fidele mais ne dit pas ce qu'elle montre. Ici, on
// la lit comme un couvreur : des corps de batiment, chacun un rectangle couvert d'un faitage et de
// deux pans qui ont chacun leur egout (un appentis quand le faitage est sur un mur, un toit plat
// quand il n'y a pas de pente), et, sur un long pan, les pignons qui partent du faitage pour
// venir dresser leur triangle sur la facade.
//
//   1. Les corps : les rectangles du contour (model/volumesToit.ts), coupes aux marches de la
//      couverture (model/toitMesure.ts::decouperParHauteurs), puis la ou deux toits simples
//      expliquent la mesure nettement mieux qu'un seul (`meilleureCoupe`).
//   2. Le toit d'un corps : pour chaque sens de faitage et chaque position du faitage dans la
//      largeur, l'egout de chaque pan et la hauteur du faitage par moindres carres ; le plus petit
//      ecart l'emporte (`ajusterCorps`).
//   3. Les pignons : le long du mur d'un pan, la ou la mesure depasse le pan de 80 cm et plus sur
//      1,5 a 6 m, et ou, vers l'interieur, elle reste a la meme hauteur (un faitage horizontal)
//      sur au moins 1,5 m (`detecterPignons`). Le corps est ensuite reajuste sans eux.

import { pointInPolygon, signedArea } from '../../geometry/basic.js';
import { decouperParHauteurs } from '../../model/toitMesure.js';
import { rectanglesDuContour } from '../../model/volumesToit.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../model/types.js';
import { REGLAGES_TOITS as R, SEUILS_TOITS as S } from '../../regles/toits/reglages.js';
import { cm, type Repere, repere, point, hauteurCorpsEn, type Grille, mesuresDans, corpsAvecPignons, meilleureCoupe } from './toitCorps/ajustement.js';
import { hauteurGrille, corpsDepuisFormes, corpsDeReprise } from './toitCorps/reprise.js';

export { PAS_FAITAGE_M, PENTE_MAX_DEG, ECART_ABERRANT_M, DEPASSEMENT_GARDE_M, HAUTEUR_PLAT_M, PENTE_PLAT_DEG, PAN_MIN_M, GAIN_PAN_SUR_PLAT, SURPLUS_PIGNON_M, LARGEUR_PIGNON_MIN_M, LARGEUR_PIGNON_MAX_M, PROFONDEUR_PIGNON_MIN_M, TOLERANCE_FAITAGE_M, GAIN_COUPE, ECART_COUPE_MIN_M, DIFFERENCE_COUPE_M, LARGEUR_CORPS_MIN_M, MESURES_MIN, repere, point, hauteurCorps, planCroupe, hauteurCorpsEn, mesuresDans, empreintePignon, ajusterCorps, rectangleTourne, corpsImpose, detecterPignons, corpsAvecPignons, meilleureCoupe, type Repere, type Grille, type Mesure } from './toitCorps/ajustement.js';
export { HAUTEUR_BATIE_M, contourEquerre, PART_VIDE_RECALAGE, DECALAGE_MAX_M, partVideSous, decalageSurMesure } from './toitCorps/recalage.js';
export { GAIN_APPENTIS_SECOURS, corpsDepuisFormes, boiteOrientee, completerSurContour, corpsEtendu } from './toitCorps/reprise.js';

/**
 * Les corps d'un batiment reconstruits sur sa surface mesuree : null quand le contour ne se decoupe
 * pas en rectangles, meme mis a l'equerre sur la mesure (un arrondi), ou que rien ne s'ajuste — la
 * surface mesuree reste alors le toit montre.
 */
export function reconstruireCorps(m: ToitMesure, contour: readonly PtBrut[], options: { coupes?: boolean; grille?: Grille | null } = {}): CorpsToit[] | null {
  const rects = rectanglesDuContour(contour);
  // Un contour qui se decoupe tel quel garde le modele des corps ; la reprise ne sert qu'aux autres,
  // et lit la grille brute quand on la lui donne (la surface mesuree est bouchee hors du contour).
  if (!rects) return corpsDeReprise(m, contour, options.grille ?? null);
  const blocs: PtBrut[][] = [];
  // La coupe par le modele essaie chaque position : de loin la part la plus lourde. Le voisinage
  // (des dizaines de maisons, dans le delai de l'import) s'en passe : ses corps viennent des marches.
  const coupes = options.coupes !== false;
  const couper = (rect: PtBrut[], profondeur: number): void => {
    const deux = coupes && profondeur < 2 ? meilleureCoupe(m, rect, contour) : null;
    if (!deux) { blocs.push(rect); return; }
    deux.forEach((q) => couper(q, profondeur + 1));
  };
  // Les blocs qu'une marche a separes a tort sont refondus quand un seul toit les explique mieux ;
  // ceux-la gardent leur toit lu par les formes, sans coupe par le modele.
  const refondus: CorpsToit[] = [];
  for (const b of refondre(m, rects, contour, options.grille ?? null)) {
    if (b.corps) refondus.push(b.corps);
    else couper(b.rect, 0);
  }
  const corps = [...refondus, ...blocs.map((r) => avecCroupesSiMieux(m, r, contour, options.grille ?? null, corpsAvecPignons(m, r, contour)))].filter((c): c is CorpsToit => c !== null);
  return corps.length ? sansBandesRecouvertes(corps, contour) : null;
}

/**
 * Au-dela de cette part de sa surface (dans le contour) sous les autres corps, une bande de moins de
 * LARGEUR_BANDE_M est de trop. Les rectangles du contour se chevauchent par construction (une aile
 * qui penetre un corps, chacun son toit entier) ; mais deux ailes presque confondues, recoupees aux
 * marches, laissaient des tranches de pente de 2 m sous d'autres toits : en 3D, des pignons en double
 * sur les pavillons d'une longere (Hucqueliers). Un corps plus large reste, meme recouvert : c'est
 * souvent lui le bon toit, et les bandes ses morceaux.
 */
export const PART_RECOUVERTE_MAX = R.PART_RECOUVERTE_MAX;
// Le pas des points qui mesurent le recouvrement : S.PAS_RECOUVREMENT_M.

/**
 * Les corps sans les bandes que les autres recouvrent : tant qu'une bande a plus de
 * PART_RECOUVERTE_MAX de sa surface sous les autres corps, la plus recouverte (la plus etroite a
 * egalite) est retiree, et les parts recomptees - deux bandes qui se couvrent l'une l'autre n'en
 * perdent qu'une.
 */
function sansBandesRecouvertes(corps: readonly CorpsToit[], contour: readonly PtBrut[]): CorpsToit[] {
  if (corps.length < 2) return [...corps];
  const largeur = corps.map((c) => { const r = repere(c.pts); return Math.min(r.L, r.W); });
  const echantillons = corps.map((c, k) => {
    const out: PtBrut[] = [];
    if ((largeur[k] as number) >= S.LARGEUR_BANDE_M) return out;
    const r = repere(c.pts);
    for (let s = S.PAS_RECOUVREMENT_M / 2; s < r.L; s += S.PAS_RECOUVREMENT_M) for (let t = S.PAS_RECOUVREMENT_M / 2; t < r.W; t += S.PAS_RECOUVREMENT_M) {
      const q = point(r, s, t);
      if (pointInPolygon(q, contour)) out.push(q);
    }
    return out;
  });
  const garde = corps.map(() => true);
  for (;;) {
    let pire = -1, part = S.PART_RECOUVERTE_MAX;
    corps.forEach((_, k) => {
      const ech = echantillons[k] as PtBrut[];
      if (!garde[k] || !ech.length) return;
      const sous = ech.filter((q) => corps.some((o, j) => j !== k && garde[j] && pointInPolygon(q, o.pts))).length / ech.length;
      const plusEtroite = pire >= 0 && (largeur[k] as number) < (largeur[pire] as number);
      if (sous > part + 1e-9 || (pire >= 0 && sous >= part - 1e-9 && plusEtroite)) { pire = k; part = sous; }
    });
    if (pire < 0) break;
    garde[pire] = false;
  }
  return corps.filter((_, k) => garde[k]);
}

/**
 * Deux blocs se refondent quand un seul toit les explique presque aussi bien que leurs deux corps : son
 * ecart ne depasse pas le leur de plus de cette part. Un toit plutot que deux morceaux qui collent a
 * peine mieux a la mesure, mais avec un egout a 8,4 m et un appentis de 2,3 m a pignon (AE 98).
 */
export const TOLERANCE_REFONTE = R.TOLERANCE_REFONTE;
/**
 * Et quand la coupe aux marches laisse une bande plus etroite que LARGEUR_BANDE_M : un corps de moins
 * de 3 m n'est pas une maison mais une tranche de pente (un pavillon coupe en trois bandes de 1,5 a
 * 2,6 m, la maison mitoyenne d'AE 98). Le toit unique est alors admis jusqu'a TOLERANCE_BANDE.
 */
export const LARGEUR_BANDE_M = R.LARGEUR_BANDE_M;
export const TOLERANCE_BANDE = R.TOLERANCE_BANDE;

/** La reunion de deux rectangles qui partagent un cote entier, dans le repere du premier ; null sinon. */
export function reunion(a: readonly PtBrut[], b: readonly PtBrut[]): PtBrut[] | null {
  return reunionEtCote(a, b)?.rect ?? null;
}

/** La reunion, et le cote du premier rectangle (dans son repere) que le second borde. */
function reunionEtCote(a: readonly PtBrut[], b: readonly PtBrut[]): { rect: PtBrut[]; cote: 's0' | 'sL' | 't0' | 'tW' } | null {
  const r = repere(a);
  const loc = b.map((q) => { const dx = q.x - r.p0.x, dy = q.y - r.p0.y; return { s: dx * r.u.x + dy * r.u.y, t: dx * r.v.x + dy * r.v.y }; });
  const ss = loc.map((q) => q.s), ts = loc.map((q) => q.t), e = 0.05;
  const s0 = Math.min(...ss), s1 = Math.max(...ss), t0 = Math.min(...ts), t1 = Math.max(...ts);
  // Paralleles : chaque sommet de b sur l'une des bornes de sa boite.
  if (!loc.every((q) => (Math.abs(q.s - s0) < e || Math.abs(q.s - s1) < e) && (Math.abs(q.t - t0) < e || Math.abs(q.t - t1) < e))) return null;
  const memeT = Math.abs(t0) < e && Math.abs(t1 - r.W) < e, memeS = Math.abs(s0) < e && Math.abs(s1 - r.L) < e;
  let bornes: [number, number, number, number] | null = null;
  let cote: 's0' | 'sL' | 't0' | 'tW' = 'sL';
  if (memeT && Math.abs(s0 - r.L) < e) { bornes = [0, s1, 0, r.W]; cote = 'sL'; }
  else if (memeT && Math.abs(s1) < e) { bornes = [s0, r.L, 0, r.W]; cote = 's0'; }
  else if (memeS && Math.abs(t0 - r.W) < e) { bornes = [0, r.L, 0, t1]; cote = 'tW'; }
  else if (memeS && Math.abs(t1) < e) { bornes = [0, r.L, t0, r.W]; cote = 't0'; }
  if (!bornes) return null;
  const [a0, a1, b0, b1] = bornes;
  return { rect: [point(r, a0, b0), point(r, a1, b0), point(r, a1, b1), point(r, a0, b1)].map((q) => ({ x: cm(q.x), y: cm(q.y) })), cote };
}


/**
 * Au-dela de ce saut median de la couverture au cote commun (une cellule de part et d'autre), deux
 * blocs sont separes par une marche ; en deca, c'est la pente d'un pan (40 degres : 0,42 m sur 50 cm).
 */
export const CONTINUITE_M = R.CONTINUITE_M;

/**
 * Le saut de la couverture au passage du cote commun de deux blocs, lu sur la grille (brute de
 * preference) a une cellule de part et d'autre : la mediane des ecarts. Un pan, meme raide, n'y
 * change que de sa pente sur un metre ; une marche saute d'un etage.
 */
function sautAuCote(g: Grille, a: readonly PtBrut[], cote: 's0' | 'sL' | 't0' | 'tW'): number | null {
  const r = repere(a), d = g.pas;
  const long = cote === 's0' || cote === 'sL' ? r.W : r.L;
  const ecarts: number[] = [];
  for (let x = 0.25; x < long; x += g.pas) {
    const [dedans, dehors] = cote === 's0' ? [point(r, d / 2, x), point(r, -d / 2, x)] : cote === 'sL' ? [point(r, r.L - d / 2, x), point(r, r.L + d / 2, x)]
      : cote === 't0' ? [point(r, x, d / 2), point(r, x, -d / 2)] : [point(r, x, r.W - d / 2), point(r, x, r.W + d / 2)];
    const za = hauteurGrille(g, dedans), zb = hauteurGrille(g, dehors);
    if (za !== null && zb !== null) ecarts.push(Math.abs(za - zb));
  }
  if (!ecarts.length) return null;
  ecarts.sort((p, q) => p - q);
  return ecarts[Math.floor(ecarts.length / 2)] ?? null;
}

/**
 * Les blocs coupes aux marches, refondus deux a deux quand un seul toit lu par les formes simples
 * (`corpsDepuisFormes`) explique leur reunion presque aussi bien que leurs deux corps
 * (`TOLERANCE_REFONTE`) : la pente forte d'un pan passait pour une marche, et coupait un toit en deux
 * morceaux absurdes (AE 98). Ecart symetrique (`ecartAuCorps`), pondere par l'aire. Deux niveaux
 * vraiment differents ne se refondent pas : les formes n'y lisent qu'un toit de compromis, loin des deux.
 */
function refondre(m: ToitMesure, rects: readonly PtBrut[][], contour: readonly PtBrut[], grille: Grille | null): { rect: PtBrut[]; corps?: CorpsToit }[] {
  const aire = (q: readonly PtBrut[]) => { const r = repere(q); return r.L * r.W; };
  const cache = new Map<PtBrut[], CorpsToit | null>();
  const corpsDe = (x: { rect: PtBrut[]; corps?: CorpsToit }): CorpsToit | null => {
    if (x.corps) return x.corps;
    if (!cache.has(x.rect)) cache.set(x.rect, corpsAvecPignons(m, x.rect, contour));
    return cache.get(x.rect) ?? null;
  };
  const ecartSeul = (x: { rect: PtBrut[]; corps?: CorpsToit }) => { const c = corpsDe(x); return c ? ecartAuCorps(m, c, contour) : Infinity; };
  const ecartDe = (parts: readonly { rect: PtBrut[]; corps?: CorpsToit }[]) => Math.sqrt(parts.reduce((a, x) => a + ecartSeul(x) ** 2 * aire(x.rect), 0) / parts.reduce((a, x) => a + aire(x.rect), 0));
  // D'abord chaque rectangle entier : les pentes d'un pavillon le coupaient en trois bandes, dont aucune
  // paire ne fait un toit.
  const liste: { rect: PtBrut[]; corps?: CorpsToit }[] = [];
  for (const [k, r] of rects.entries()) {
    const parts = decouperParHauteurs(m, [r]).map((rect) => ({ rect }));
    // Une aile presque sous un rectangle plus grand : ses marches sont souvent les pentes du toit qui
    // la couvre. Entiere, si son toit tient la mesure a la tolerance des bandes, sans egout trop bas.
    if (parts.length > 1 && sousUnPlusGrand(r, rects.slice(0, k))) {
      const entiere = corpsAvecPignons(m, r, contour);
      if (entiere && Math.min(...entiere.egouts) >= S.EGOUT_ETENDU_MIN_M && ecartAuCorps(m, entiere, contour) <= S.TOLERANCE_BANDE * ecartDe(parts)) {
        liste.push({ rect: [...r], corps: entiere });
        continue;
      }
    }
    const f = parts.length > 1 ? corpsDepuisFormes(grille ?? m, r) : null;
    const un = f ? ecartAuCorps(m, f, contour) : Infinity;
    // Une bande de moins de 3 m est une tranche coupee dans une pente, pas un corps : plus de tolerance.
    const bande = parts.some((x) => { const q = repere(x.rect); return Math.min(q.L, q.W) < S.LARGEUR_BANDE_M; });
    // Et sans aucune marche aux coupes, c'est le meme toit, tant que les formes simples le lisent.
    const sansMarche = parts.length > 1 && parts.every((x, k) => parts.every((y, l) => {
      if (l <= k) return true;
      const ru = reunionEtCote(x.rect, y.rect);
      if (!ru) return true;
      const saut = sautAuCote(grille ?? m, x.rect, ru.cote);
      return saut !== null && saut < S.CONTINUITE_M;
    }));
    if (f && (sansMarche || un <= (bande ? S.TOLERANCE_BANDE : S.TOLERANCE_REFONTE) * ecartDe(parts))) liste.push({ rect: [...r], corps: { ...f, ecart: cm(un) } });
    else liste.push(...parts);
  }
  if (liste.length < 2) return liste;
  for (let garde = 0; garde < 8; garde++) {
    let fait = false;
    for (let i = 0; i < liste.length && !fait; i++) for (let j = i + 1; j < liste.length && !fait; j++) {
      const a = liste[i] as { rect: PtBrut[]; corps?: CorpsToit }, b = liste[j] as { rect: PtBrut[]; corps?: CorpsToit };
      const ru = reunionEtCote(a.rect, b.rect);
      if (!ru) continue;
      const u = ru.rect;
      const f = corpsDepuisFormes(grille ?? m, u);
      if (!f) continue;
      const deux = ecartDe([a, b]);
      const un = ecartAuCorps(m, f, contour);
      // Le meme toit, sans marche entre eux : refondus des que le toit unique tient la mesure.
      const saut = sautAuCote(grille ?? m, a.rect, ru.cote);
      // Sans marche entre eux, c'est le meme toit : refondus des que les formes simples le lisent (elles
      // renoncent d'elles-memes au-dela de 80 cm d'ecart), meme si les morceaux collaient mieux - une
      // bande d'un deux-pans coupee le long du faitage est un appentis presque parfait.
      const memeToit = saut !== null && saut < S.CONTINUITE_M;
      if (!memeToit && un > S.TOLERANCE_REFONTE * deux) continue;
      liste.splice(j, 1);
      liste[i] = { rect: u, corps: { ...f, ecart: cm(un) } };
      fait = true;
    }
    if (!fait) break;
  }
  return liste;
}

/**
 * Au-dela de cette part de sa surface sous un rectangle plus grand du contour, une aile n'est pas
 * recoupee aux marches : celles qu'on y lit sont les pentes et les murs du toit qui la couvre
 * (Hucqueliers : deux ailes presque confondues sur un pavillon, debitees en bandes de 2 m).
 */
export const PART_SOUS_PLUS_GRAND = R.PART_SOUS_PLUS_GRAND;

/** Vrai quand `r` a plus de PART_SOUS_PLUS_GRAND de sa surface sous l'un des rectangles `grands`. */
function sousUnPlusGrand(r: readonly PtBrut[], grands: readonly PtBrut[][]): boolean {
  if (!grands.length) return false;
  const q = repere(r);
  let n = 0, sous = 0;
  for (let s = 0.25; s < q.L; s += 0.5) for (let t = 0.25; t < q.W; t += 0.5) {
    n++;
    const p = point(q, s, t);
    if (grands.some((g) => pointInPolygon(p, g))) sous++;
  }
  return n > 0 && sous / n > S.PART_SOUS_PLUS_GRAND;
}

/** Des croupes plutot que des pignons de bout : seulement si l'ecart a la mesure tombe a cette part. */
export const GAIN_CROUPES = R.GAIN_CROUPES;
/**
 * Le faitage dans le sens que lisent les formes simples plutot qu'en travers : seulement si l'ecart a
 * la mesure, pignons compris, tombe a cette part. AD 128 (Le Vesinet) : deux pans sur la longueur,
 * le toit releve pour deux fenetres d'etage ; le modele ecartait ce qui depasse le pan, prenait le
 * vrai toit pour des pignons, et posait un faitage ecrase en travers.
 */
export const GAIN_SENS = R.GAIN_SENS;

/**
 * L'ecart d'un corps a la mesure sous lui, chaque mesure bornee a ECART_ABERRANT_M dans les deux sens.
 * Symetrique, a la difference de `profilEn` : celui-la compte peu ce qui depasse le pan (il cherche
 * les pignons), et preferait donc un toit ecrase a un quatre-pans.
 */
export function ecartAuCorps(m: ToitMesure, c: CorpsToit, contour: readonly PtBrut[]): number {
  const r = repere(c.pts);
  const ms = mesuresDans(m, r, c.pts, contour);
  if (!ms.length) return Infinity;
  return Math.sqrt(ms.reduce((a, q) => a + Math.min(S.ECART_ABERRANT_M, Math.abs(q.z - hauteurAvecPignons(c, r, q.s, q.t))) ** 2, 0) / ms.length);
}

/**
 * La hauteur du toit au point `q` du plan : celle du plus haut des corps dont le rectangle le contient (a `marge` metres pres),
 * pignons compris ; null quand aucun corps ne le couvre. C'est le haut du mur sous le toit, vu de pres : la photo d'une facade
 * s'y decoupe (three/releve3d.ts).
 */
export function hauteurDuToitEn(corps: readonly CorpsToit[], q: PtBrut, marge = 0.05): number | null {
  let h: number | null = null;
  for (const c of corps) {
    const r = repere(c.pts);
    const s = (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y, t = (q.x - r.p0.x) * r.v.x + (q.y - r.p0.y) * r.v.y;
    if (s < -marge || s > r.L + marge || t < -marge || t > r.W + marge) continue;
    const z = hauteurAvecPignons(c, r, Math.min(r.L, Math.max(0, s)), Math.min(r.W, Math.max(0, t)));
    if (h === null || z > h) h = z;
  }
  return h;
}

/** La hauteur d'un corps, ses pignons compris : chacun, deux pans perpendiculaires au faitage, de son mur a sa profondeur. */
function hauteurAvecPignons(c: CorpsToit, r: Repere, s: number, t: number): number {
  let z = hauteurCorpsEn(c, r.L, r.W, s, t);
  for (const pg of c.pignons) {
    const d = pg.pan === 0 ? t : r.W - t, demi = (pg.fin - pg.debut) / 2;
    if (s < pg.debut || s > pg.fin || d < 0 || d > pg.profondeur || demi <= 0) continue;
    const e = c.egouts[pg.pan];
    z = Math.max(z, pg.faitage - ((pg.faitage - e) * Math.abs(s - (pg.debut + pg.fin) / 2)) / demi);
  }
  return z;
}

/** Deux faitages dans le meme sens, a 45 degres pres. */
function memeSens(a: readonly PtBrut[], b: readonly PtBrut[]): boolean {
  const ra = repere(a), rb = repere(b);
  return Math.abs(ra.u.x * rb.u.x + ra.u.y * rb.u.y) >= Math.SQRT1_2;
}

/**
 * Le corps a croupes que lisent les formes simples (`corpsDepuisFormes`), quand il explique la mesure
 * nettement mieux que le modele des corps, qui n'a que des pignons de bout : un toit a quatre pans
 * s'y lisait en appentis presque plat (AE 100). Un corps qui a des pignons garde le modele des corps.
 */
function avecCroupesSiMieux(m: ToitMesure, rect: readonly PtBrut[], contour: readonly PtBrut[], grille: Grille | null, modele: CorpsToit | null): CorpsToit | null {
  const f = corpsDepuisFormes(grille ?? m, rect);
  let c = modele;
  // Les formes voient le faitage dans l'autre sens : leur toit, ou le modele refait dans ce sens
  // (pignons compris), l'emporte s'il explique nettement mieux la mesure (GAIN_SENS). L'ecart est
  // symetrique : celui du modele compte peu ce qui depasse le pan, et c'est ainsi qu'il s'ecrase.
  if (c && f && !memeSens(c.pts, f.pts)) {
    const candidats = [f, corpsAvecPignons(m, f.pts, contour, true)]
      .filter((x): x is CorpsToit => x !== null).map((x) => ({ x, e: ecartAuCorps(m, x, contour) })).sort((a, b) => a.e - b.e);
    const mieux = candidats[0];
    if (mieux && mieux.e < S.GAIN_SENS * ecartAuCorps(m, c, contour)) c = { ...mieux.x, ecart: cm(mieux.e) };
  }
  if (c?.pignons.length) return c;
  // Sans corps du modele, la lecture des formes, quelle qu'elle soit (un pan, deux, quatre, plat).
  if (!c) return f;
  if (!f?.croupes) return c;
  const ef = ecartAuCorps(m, f, contour);
  return ef < S.GAIN_CROUPES * ecartAuCorps(m, c, contour) ? { ...f, ecart: cm(ef) } : c;
}

/** La hauteur du mur `i` d'un corps (de `pts[i]` a `pts[i + 1]`) : l'egout de son pan, ou le plus bas des egouts sous un pignon de bout. */
export function hauteursMursCorps(c: CorpsToit): number[] {
  const bas = Math.min(...c.egouts);
  return [c.egouts[0], bas, c.egouts[1], bas];
}

/** La pente d'un corps, en degres : celle de son pan le plus raide ; 0 pour un toit plat. */
export function penteDuCorps(c: CorpsToit): number {
  const W = Math.hypot((c.pts[3] as PtBrut).x - (c.pts[0] as PtBrut).x, (c.pts[3] as PtBrut).y - (c.pts[0] as PtBrut).y);
  const p = c.posFaitage, [e0, e1] = c.egouts, deg = (h: number, l: number) => (l > 0.01 && h > 0 ? (Math.atan(h / l) * 180) / Math.PI : 0);
  return Math.max(deg(c.faitage - e0, p), deg(c.faitage - e1, W - p));
}

/** La pente qui choisit la tuile : celle du plus grand corps en pente (un appentis de garage ne decide pas pour la maison). */
export function penteDominante(corps: readonly CorpsToit[]): number | null {
  const aire = (c: CorpsToit) => Math.abs(signedArea(c.pts as PtBrut[]));
  const enPente = corps.filter((c) => penteDuCorps(c) > 0).sort((a, b) => aire(b) - aire(a));
  return enPente[0] ? penteDuCorps(enPente[0]) : null;
}
