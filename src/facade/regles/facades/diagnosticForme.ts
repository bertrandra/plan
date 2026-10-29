// Le diagnostic de forme d'une facade (MD/spec-facade-calage-audit.md §4 E5 bis, §5 bis, §5 ter ; lot F4) : la silhouette de la
// facade derive du toit (gabaritDesCorps, la meme projection que le mode Toit) ; son ecart avec le haut lu sur la photo est donc
// d'abord un diagnostic du TOIT CALCULE, corps par corps. Decisions de la personne : « la silhouette derive du toit ; son ecart avec
// la photo est un diagnostic de toit » (9), « l'IA propose, le moteur tranche » (3), « toute proposition de toit venue de la photo est
// confirmee par la personne » (10), « hauteurs : le LiDAR l'emporte, la photo signale » (12), « les corrections se font sur le corps
// concerne » (13).
//
// Le deroule :
// - la facade se decoupe en troncons de corps (silhouetteDesCorps.ts::tronconsDeFace) : chaque part du haut et le mur du corps qui la
//   porte ;
// - sur chaque troncon, on essaie un petit nombre de variantes du toit DE CE CORPS, chacune faite par le moteur des toits
//   (pignons.ts : pignonsAuxPlaces, boutAuMur) : un pignon de plus, un de moins, deplace ou elargi sur un long pan ; une croupe a la
//   place d'un pignon (ou l'inverse) sur un mur de bout. Chacune redessine le gabarit par la meme projection, et l'on garde celle
//   qui explique le mieux le haut lu, si elle l'explique mieux que le toit calcule d'au moins `diagnosticGainMin` (§5 bis, regle 1) ;
// - la proposition porte son corps par son MUR (l'adresse que murDuCorps retrouve quelle que soit la renumerotation), sa nature, sa
//   place, son gain, sa provenance, le gabarit modifie, et l'observation que le moteur relira (corpsSousContrainte) si la personne
//   la coche. Rien n'est ecrit ici ;
// - une pointe vue plus haute ou plus basse que le gabarit est une ALERTE, jamais une proposition : le LiDAR garde la hauteur ;
// - Claude (les observations du run, src/regles/facades/observations.ts, par la regle des pointes de ia.ts) dit la provenance :
//   une proposition que ses pointes confirment vient « des deux » ; sans haut lu, ses pointes en plus ou manquantes font des
//   propositions « de l'IA », sans gain mesure, et une proposition de l'IA que le haut lu ne confirme pas n'est pas faite (§5 bis,
//   regles 1 et 5) ;
// - une bosse plus etroite qu'un pignon sur la ligne du haut, ou un element que Claude voit, est une cheminee ou une lucarne (lot F7,
//   §5 quater) : proposee sur le corps du troncon, par son mur, et posee par le moteur une fois cochee (elementsDesMurs.ts) ; ce qui y
//   est deja pose ne se propose pas, et ne bouge jamais ;
// - ce que le moteur ne sait pas poser (un autre volume vu par Claude) est dit en constat, sans proposition.
// Les seuils sont des objectifs de l'E5 bis, dans regles/facades/enchainement.json. Pur.

import { gabaritDesCorps, pointesDuGabarit, type GabaritMur } from '../../gabaritMur.js';
import { silhouetteDeFace, tronconsDeFace } from '../toits/silhouetteDesCorps.js';
import { boutAuMur, pignonsAuxPlaces, type PlacePignon } from '../toits/pignons.js';
import { elementPoseSurLeMur } from '../toits/elementsDesMurs.js';
import { repere } from '../../toits/toitCorps.js';
import { avisDesPointes, reglagesIa } from './ia.js';
import { objectifsEnchainement, type Objectifs } from './enchainement.js';
import { SEUILS_TOITS as S } from '../../../regles/toits/reglages.js';
import type { Facade } from '../../../geometry/cotesVusDeDehors.js';
import type { BoutFait, ElementDeMurFait, MurDesigne, ObservationFait } from '../../../regles/toits/faits.js';
import type { ObservationsFacade } from '../../../regles/facades/observations.js';
import type { CorpsToit, PignonToit } from '../../../model/types.js';

/** Ce qu'une proposition change au corps (la taxonomie du §5 bis que le moteur sait poser). */
export type NatureForme = 'ajouter-pignon' | 'retirer-pignon' | 'deplacer-pignon' | 'pignon-vers-croupe' | 'croupe-vers-pignon';
/** D'ou elle vient : le haut lu sur la photo (le deterministe), Claude, ou les deux d'accord. */
export type ProvenanceForme = 'deterministe' | 'ia' | 'les-deux';

/** Un troncon de la facade : la part `u0` a `u1` (de 0 a 1 le long du mur) dont le haut est porte par le mur `mur` du corps `corps`. */
export interface TronconForme {
  corps: number;
  /** Le cote du corps : 0 et 2 ses longs pans, 1 et 3 ses bouts (murDuCorps.ts). */
  cote: number;
  mur: MurDesigne;
  u0: number;
  u1: number;
}

/** Une proposition de toit, sur un corps (§5 bis, §5 ter) : jamais ecrite ici ; le moteur la relira si la personne la coche. */
export interface PropositionForme {
  /** Le rang du corps au moment du diagnostic (pour le dire) ; l'adresse est son mur. */
  corps: number;
  cote: number;
  mur: MurDesigne;
  natures: NatureForme[];
  /** Un long pan : ses pignons apres la proposition, dans le repere du corps (`debut`, `fin` le long du faitage depuis `pts[0]`). */
  pignons: Pick<PignonToit, 'pan' | 'debut' | 'fin'>[] | null;
  /** Un mur de bout : ce qui le ferme apres la proposition. */
  bout: BoutFait | null;
  /** La place sur la facade, de 0 a 1 le long du mur. */
  u0: number;
  u1: number;
  /** L'ecart moyen au haut lu sur le troncon, avant et apres (en hauteurs d'egout), et le gain ; null sans haut lu (l'IA seule). */
  ecartAvant: number | null;
  ecartApres: number | null;
  gain: number | null;
  provenance: ProvenanceForme;
  /** Le gabarit de la facade avec cette proposition (la meme projection que le gabarit du plan). */
  gabarit: GabaritMur;
  /** Ce que le moteur relira (corpsSousContrainte), le corps designe par son mur. */
  observation: ObservationFait;
}

/** Ce que la ligne du haut montre et que le moteur pose sur un corps (lot F7, §5 quater). */
export type GenreElement = 'cheminee' | 'lucarne';

/**
 * Une cheminee ou une lucarne a poser sur un corps (lot F7) : jamais ecrite ici ; le moteur la pose (corpsSousContrainte) si la personne
 * la coche. Ce qui est deja pose sur le corps (le Mode Toit, une observation) ne se propose pas.
 */
export interface PropositionElement {
  element: GenreElement;
  /** Le rang du corps au moment du diagnostic (pour le dire) ; l'adresse est son mur. */
  corps: number;
  cote: number;
  mur: MurDesigne;
  /** Son milieu sur la facade, et la bosse lue qui la montre (ou le point de Claude), de 0 a 1 le long du mur. */
  u: number;
  u0: number;
  u1: number;
  provenance: ProvenanceForme;
  /** Ce que le moteur relira (corpsSousContrainte), le corps designe par son mur. */
  observation: ObservationFait;
}

/** Une pointe que la photo voit a une autre hauteur que le gabarit : signalee, jamais corrigee (decision 12). */
export interface AlerteHauteur { u: number; vue: number; attendue: number; corps: number | null; source: 'deterministe' | 'ia' }

export interface DiagnosticForme {
  /** Le gabarit du plan et du LiDAR (le toit calcule). */
  gabarit: GabaritMur;
  troncons: TronconForme[];
  /** Le haut lu a servi (sur la moitie des colonnes au moins). */
  lue: boolean;
  /** L'ecart moyen du gabarit au haut lu sur la facade, en hauteurs d'egout ; null sans haut lu. */
  ecart: number | null;
  propositions: PropositionForme[];
  /** Les cheminees et lucarnes a poser (lot F7). */
  elements: PropositionElement[];
  alertes: AlerteHauteur[];
  /** Ce qui ne se propose pas (le moteur ne sait pas le poser, ou la photo ne le confirme pas), en mots. */
  constats: string[];
}

export interface EntreesDiagnostic {
  facade: Facade;
  corps: readonly CorpsToit[];
  /** La hauteur du mur que pose la chaine (1 en `v`), en metres. */
  hauteurMur: number;
  /** Le haut lu sur la photo : `u` de 0 a 1 le long du mur, `v` en hauteurs d'egout ; null quand il ne se lit pas. */
  lue: readonly { u: number; v: number }[] | null;
  /** Les observations du run de Claude (le vote de ses passes), quand il y en a. */
  ia?: ObservationsFacade | null;
  objectifs?: Partial<Objectifs>;
}

/** Les colonnes lues le long du mur. */
const COLONNES = 120;
/** Un ecart de colonne plafonne a une hauteur d'egout : un arbre devant le pignon ne pese pas plus qu'une colonne fausse. */
const ECART_PLAFOND = 1;
/** Une variante qui ne gagne pas cela sur la meilleure precedente arrete la recherche (en hauteurs d'egout). */
const PROGRES_MIN = 0.003;
/** Les pas de la recherche des bords d'un pignon, en metres, et son etendue de part et d'autre. */
const PAS_BORD_M = 0.25, ETENDUE_BORD_M = 1;
/** Les largeurs essayees pour un pignon ajoute, et le pas de son centre autour de la bosse lue. */
const PAS_LARGEUR_M = 0.5, PAS_CENTRE_M = 0.25, ETENDUE_CENTRE_M = 0.5;
/**
 * Un haut lu sous l'egout (a SOUS_EGOUT pres) sur plus de cette part de ses colonnes ne lit pas le haut du mur : l'ombre d'une galerie
 * prise pour un autre mur, un toit pris pour le mur (AE 101 sud en synthese, ou l'enduit et le ciel ont presque la meme teinte). Il ne
 * sert pas : rien ne se compare, et c'est Claude seul qui propose.
 */
const SOUS_EGOUT = 0.1, PART_SOUS_EGOUT_MAX = 0.1;
/** Au plus tant de changements par corps : la boucle ne tourne qu'une fois par validation (§5 bis, regle 4), pas en cascade. */
const TOURS_MAX = 3;

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const cm = (x: number) => Math.round(x * 100) / 100;

/** La valeur d'une ligne (u croissants) en `u`, interpolee ; null hors de ses bouts. */
function surLigne(l: readonly { u: number; v: number }[], u: number): number | null {
  const a = l[0], b = l[l.length - 1];
  if (!a || !b || u < a.u - 1e-9 || u > b.u + 1e-9) return null;
  for (let i = 1; i < l.length; i++) {
    const p = l[i - 1] as { u: number; v: number }, q = l[i] as { u: number; v: number };
    if (u <= q.u + 1e-9) return q.u - p.u < 1e-9 ? Math.max(p.v, q.v) : p.v + ((q.v - p.v) * (u - p.u)) / (q.u - p.u);
  }
  return b.v;
}

const uDe = (k: number) => (k + 0.5) / COLONNES;

/** L'ecart moyen d'un gabarit au haut lu, sur les colonnes de `u0` a `u1` ; null quand moins de la moitie s'y lisent. */
function ecartSur(lu: readonly (number | null)[], g: GabaritMur, u0: number, u1: number): number | null {
  let s = 0, n = 0, total = 0;
  for (let k = 0; k < COLONNES; k++) {
    const u = uDe(k);
    if (u < u0 || u > u1) continue;
    total++;
    const v = lu[k], w = surLigne(g, u);
    if (v === null || v === undefined || w === null) continue;
    s += Math.min(ECART_PLAFOND, Math.abs(v - w));
    n++;
  }
  return total && n * 2 >= total ? s / n : null;
}

/** Les parts du troncon ou le haut lu depasse le gabarit de `relief` au moins : la ou la photo voit un pignon que le toit n'a pas. */
function bosses(lu: readonly (number | null)[], g: GabaritMur, u0: number, u1: number, relief: number): { u0: number; u1: number; haut: number }[] {
  const out: { u0: number; u1: number; haut: number }[] = [];
  let en: { u0: number; u1: number; haut: number } | null = null;
  for (let k = 0; k < COLONNES; k++) {
    const u = uDe(k), v = lu[k], w = surLigne(g, u);
    const dedans = u >= u0 && u <= u1 && v !== null && v !== undefined && w !== null && v - w >= relief;
    if (dedans) { if (en) { en.u1 = u; en.haut = Math.max(en.haut, v - (w as number)); } else en = { u0: u, u1: u, haut: v - (w as number) }; } else if (en) { out.push(en); en = null; }
  }
  if (en) out.push(en);
  return out;
}

/** Le passage de la facade (u, de 0 a 1) au faitage du corps (s, metres depuis `pts[0]`), et retour. */
function repereDuCorps(f: Facade, c: CorpsToit): { s: (u: number) => number; u: (s: number) => number } {
  const r = repere(c.pts);
  const s = (u: number) => { const x = f.gauche.x + (f.droite.x - f.gauche.x) * u, y = f.gauche.y + (f.droite.y - f.gauche.y) * u; return (x - r.p0.x) * r.u.x + (y - r.p0.y) * r.u.y; };
  const s0 = s(0), s1 = s(1);
  return { s, u: (x) => (Math.abs(s1 - s0) < 1e-9 ? 0 : (x - s0) / (s1 - s0)) };
}

/** Les places le long du faitage ramenees le long du mur du corps (metres depuis sa gauche vue de dehors) : l'adresse du moteur. */
function placesSurLeMur(c: CorpsToit, mur: MurDesigne, places: readonly PlacePignon[]): { de: number; a: number }[] {
  const r = repere(c.pts);
  const l = Math.hypot(mur.droite.x - mur.gauche.x, mur.droite.y - mur.gauche.y);
  const sens = ((mur.droite.x - mur.gauche.x) * r.u.x + (mur.droite.y - mur.gauche.y) * r.u.y) / Math.max(1e-9, l) >= 0 ? 1 : -1;
  const sg = (mur.gauche.x - r.p0.x) * r.u.x + (mur.gauche.y - r.p0.y) * r.u.y;
  return places.map((p) => { const a = (p.debut - sg) * sens, b = (p.fin - sg) * sens; return { de: cm(Math.min(a, b)), a: cm(Math.max(a, b)) }; }).sort((x, y) => x.de - y.de);
}

const sansFaitage = (c: CorpsToit): boolean => { const W = repere(c.pts).W; return c.posFaitage <= 0.01 || c.posFaitage >= W - 0.01 || c.faitage - Math.min(...c.egouts) < S.HAUTEUR_PLAT_M; };

interface Contexte {
  e: EntreesDiagnostic;
  obj: Objectifs;
  lu: (number | null)[];
  g0: GabaritMur;
  /** Le gabarit de la facade avec le corps `k` remplace. */
  avec: (k: number, c: CorpsToit) => GabaritMur;
}

/** Les natures d'un passage de `avant` a `apres` (les pignons d'un pan) : ajoute, retire, deplace ou elargi. */
function naturesDesPlaces(avant: readonly PlacePignon[], apres: readonly PlacePignon[]): NatureForme[] {
  const recouvre = (p: PlacePignon, q: PlacePignon) => Math.min(p.fin, q.fin) - Math.max(p.debut, q.debut) >= 0.5 * Math.min(p.fin - p.debut, q.fin - q.debut);
  const out: NatureForme[] = [];
  for (const q of apres) { const p = avant.find((x) => recouvre(x, q)); if (!p) out.push('ajouter-pignon'); else if (Math.abs(p.debut - q.debut) > 0.01 || Math.abs(p.fin - q.fin) > 0.01) out.push('deplacer-pignon'); }
  for (const p of avant) if (!apres.some((q) => recouvre(p, q))) out.push('retirer-pignon');
  return out;
}

/** Les variantes des pignons d'un long pan : retirer, deplacer ou elargir chacun, en ajouter un sur une bosse lue. */
function variantesDuPan(ctx: Contexte, t: TronconForme, c: CorpsToit, places: readonly PlacePignon[], g: GabaritMur): PlacePignon[][] {
  const L = repere(c.pts).L, rc = repereDuCorps(ctx.e.facade, c);
  const dans = (p: PlacePignon) => { const a = rc.u(p.debut), b = rc.u(p.fin); return Math.max(a, b) > t.u0 && Math.min(a, b) < t.u1; };
  const out: PlacePignon[][] = [];
  const pas = Math.round(ETENDUE_BORD_M / PAS_BORD_M);
  places.forEach((p, i) => {
    if (!dans(p)) return;
    const autres = places.filter((_, j) => j !== i);
    out.push(autres);
    for (let a = -pas; a <= pas; a++) for (let b = -pas; b <= pas; b++) {
      if (!a && !b) continue;
      const q = { debut: Math.max(0, p.debut + a * PAS_BORD_M), fin: Math.min(L, p.fin + b * PAS_BORD_M) };
      if (q.fin - q.debut < S.LARGEUR_PIGNON_MIN_M || q.fin - q.debut > S.LARGEUR_PIGNON_MAX_M || autres.some((x) => x.fin > q.debut && x.debut < q.fin)) continue;
      out.push([...autres, q]);
    }
  });
  // Un pignon ajoute : centre sur une bosse du haut lu, de chaque largeur admise, dans le troncon (un diagnostic ne traverse pas deux corps).
  for (const b of bosses(ctx.lu, g, t.u0, t.u1, ctx.obj['facades.enchainement.diagnosticReliefMin'])) {
    const centre = (rc.s(b.u0) + rc.s(b.u1)) / 2;
    // Le troncon borne le pignon ; au bout de la facade, le mur du corps qui continue au-dela aussi (le pignon d'AE 101 part du bout du corps).
    const a = rc.s(t.u0 <= 1e-3 ? -1 : t.u0), z = rc.s(t.u1 >= 1 - 1e-3 ? 2 : t.u1);
    const smin = Math.min(a, z), smax = Math.max(a, z);
    for (let dc = -ETENDUE_CENTRE_M; dc <= ETENDUE_CENTRE_M + 1e-9; dc += PAS_CENTRE_M) for (let w = S.LARGEUR_PIGNON_MIN_M; w <= S.LARGEUR_PIGNON_MAX_M + 1e-9; w += PAS_LARGEUR_M) {
      const q = { debut: Math.max(0, Math.max(smin, centre + dc - w / 2)), fin: Math.min(L, Math.min(smax, centre + dc + w / 2)) };
      if (q.fin - q.debut < S.LARGEUR_PIGNON_MIN_M || places.some((x) => x.fin > q.debut && x.debut < q.fin)) continue;
      out.push([...places, q]);
    }
  }
  return out;
}

/** Le meilleur jeu de pignons d'un long pan pour le haut lu, en quelques tours ; null quand rien ne l'explique mieux. */
function diagnosticDuPan(ctx: Contexte, t: TronconForme, c: CorpsToit): Omit<PropositionForme, 'provenance' | 'observation'> | null {
  if (sansFaitage(c)) return null;
  const pan: 0 | 1 = t.cote === 0 ? 0 : 1;
  const avant = c.pignons.filter((p) => p.pan === pan).map((p) => ({ debut: p.debut, fin: p.fin }));
  const e0 = ecartSur(ctx.lu, ctx.g0, t.u0, t.u1);
  if (e0 === null || e0 < ctx.obj['facades.enchainement.diagnosticEcartMin']) return null;
  let best = { places: avant, corps: c, g: ctx.g0, e: e0 };
  for (let tour = 0; tour < TOURS_MAX; tour++) {
    let meilleur: typeof best | null = null;
    for (const places of variantesDuPan(ctx, t, c, best.places, best.g)) {
      const corps = pignonsAuxPlaces(c, pan, places);
      const g = ctx.avec(t.corps, corps), e = ecartSur(ctx.lu, g, t.u0, t.u1);
      if (e !== null && (!meilleur || e < meilleur.e)) meilleur = { places: [...places].sort((a, b) => a.debut - b.debut), corps, g, e };
    }
    if (!meilleur || best.e - meilleur.e < PROGRES_MIN) break;
    best = meilleur;
  }
  // Un pignon a peine bouge (ses bords a moins d'un pas et demi) reste celui du calcul : la photo ne dit pas mieux que le LiDAR a 30 cm.
  const garde = best.places.map((q) => avant.find((p) => Math.abs(p.debut - q.debut) <= 1.5 * PAS_BORD_M && Math.abs(p.fin - q.fin) <= 1.5 * PAS_BORD_M) ?? q);
  if (garde.some((q, i) => q !== best.places[i])) {
    const corps = pignonsAuxPlaces(c, pan, garde), g = ctx.avec(t.corps, corps), e = ecartSur(ctx.lu, g, t.u0, t.u1);
    if (e !== null) best = { places: garde, corps, g, e };
  }
  const natures = naturesDesPlaces(avant, best.places);
  const gain = (e0 - best.e) / e0;
  if (!natures.length || gain < ctx.obj['facades.enchainement.diagnosticGainMin']) return null;
  const rc = repereDuCorps(ctx.e.facade, c);
  const changees = [...best.places.filter((q) => !avant.some((p) => Math.abs(p.debut - q.debut) < 0.01 && Math.abs(p.fin - q.fin) < 0.01)), ...avant.filter((p) => !best.places.some((q) => Math.abs(p.debut - q.debut) < 0.01 && Math.abs(p.fin - q.fin) < 0.01))];
  const us = changees.flatMap((p) => [rc.u(p.debut), rc.u(p.fin)]);
  return {
    corps: t.corps, cote: t.cote, mur: t.mur, natures, pignons: best.corps.pignons.filter((p) => p.pan === pan).map(({ pan: q, debut, fin }) => ({ pan: q, debut, fin })), bout: null,
    u0: r3(Math.max(0, Math.min(...us))), u1: r3(Math.min(1, Math.max(...us))), ecartAvant: r3(e0), ecartApres: r3(best.e), gain: r3(gain), gabarit: best.g,
  };
}

const boutDe = (c: CorpsToit, cote: number): BoutFait => ((c.croupes?.[cote === 3 ? 0 : 1] ?? 0) > 0 ? 'croupe' : 'pignon');

/** Le mur de bout d'un corps : une croupe a la place de son pignon, ou l'inverse, si le haut lu l'explique mieux. */
function diagnosticDuBout(ctx: Contexte, t: TronconForme, c: CorpsToit): Omit<PropositionForme, 'provenance' | 'observation'> | null {
  if (sansFaitage(c)) return null;
  const e0 = ecartSur(ctx.lu, ctx.g0, t.u0, t.u1);
  if (e0 === null || e0 < ctx.obj['facades.enchainement.diagnosticEcartMin']) return null;
  const autre: BoutFait = boutDe(c, t.cote) === 'pignon' ? 'croupe' : 'pignon';
  const corps = boutAuMur(c, t.cote, autre);
  if (corps === c) return null;
  const g = ctx.avec(t.corps, corps), e = ecartSur(ctx.lu, g, t.u0, t.u1);
  if (e === null || (e0 - e) / e0 < ctx.obj['facades.enchainement.diagnosticGainMin']) return null;
  return { corps: t.corps, cote: t.cote, mur: t.mur, natures: [autre === 'croupe' ? 'pignon-vers-croupe' : 'croupe-vers-pignon'], pignons: null, bout: autre, u0: r3(t.u0), u1: r3(t.u1), ecartAvant: r3(e0), ecartApres: r3(e), gain: r3((e0 - e) / e0), gabarit: g };
}

/** L'observation que le moteur relira (corpsSousContrainte) : les pignons du long pan, ou le bout du mur, le corps designe par son mur. */
function observationDe(p: Omit<PropositionForme, 'provenance' | 'observation'>, c: CorpsToit, azimut: number): ObservationFait {
  if (p.bout) return { boutsDesMurs: [{ mur: p.mur, bout: p.bout }] };
  const places = placesSurLeMur(c, p.mur, (p.pignons ?? []).map(({ debut, fin }) => ({ debut, fin })));
  return { pignons: [{ facade: { azimutDeg: Math.round(azimut) }, mur: p.mur, position: 'places', places, haut: 'faitage' }] };
}

/** Le troncon qui porte `u`, ou null. */
const tronconEn = (ts: readonly TronconForme[], u: number): TronconForme | null => ts.find((t) => u >= t.u0 - 1e-9 && u <= t.u1 + 1e-9) ?? null;

const f2 = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

/** Les propositions de Claude seul (sans haut lu) : un pignon en plus la ou il voit une pointe, un de moins la ou il n'en voit pas. */
function propositionsDeLIa(ctx: Contexte, ts: readonly TronconForme[], ia: ObservationsFacade, constats: string[]): Omit<PropositionForme, 'provenance' | 'observation'>[] {
  const out: Omit<PropositionForme, 'provenance' | 'observation'>[] = [];
  for (const a of avisDesPointes(ia, pointesDuGabarit(ctx.g0).filter((p) => p.u >= 0 && p.u <= 1))) {
    if (a.avis !== 'en-plus' && a.avis !== 'manquante') continue;
    const t = tronconEn(ts, a.u), c = t ? ctx.e.corps[t.corps] : undefined;
    if (!t || !c || (t.cote !== 0 && t.cote !== 2) || sansFaitage(c)) { constats.push(`Claude voit ${a.avis === 'en-plus' ? 'une pointe' : 'l’absence de la pointe'} à u ${f2(a.u)}, sur un mur qui n’est pas un long pan : rien n’est proposé (le Mode Toit).`); continue; }
    const pan: 0 | 1 = t.cote === 0 ? 0 : 1, rc = repereDuCorps(ctx.e.facade, c), s = rc.s(a.u);
    const places = c.pignons.filter((p) => p.pan === pan).map((p) => ({ debut: p.debut, fin: p.fin }));
    let apres: PlacePignon[] | null = null;
    if (a.avis === 'manquante') {
      const ici = places.filter((p) => s >= p.debut - 0.5 && s <= p.fin + 0.5);
      if (ici.length) apres = places.filter((p) => !ici.includes(p));
    } else {
      // La largeur d'un pignon de Claude seul : celle d'un pignon du meme corps ; sans elle, la photo ne la dit pas.
      const ref = c.pignons.find((p) => p.fin - p.debut >= S.LARGEUR_PIGNON_MIN_M);
      if (ref) apres = [...places, { debut: s - (ref.fin - ref.debut) / 2, fin: s + (ref.fin - ref.debut) / 2 }];
      else constats.push(`Claude voit une pointe à u ${f2(a.u)} que le plan n’a pas, mais rien ne dit la largeur du pignon : le Mode Toit.`);
    }
    if (!apres) continue;
    const corps = pignonsAuxPlaces(c, pan, apres);
    if (corps === c) continue;
    const natures = naturesDesPlaces(places, corps.pignons.filter((p) => p.pan === pan));
    if (!natures.length) continue;
    out.push({ corps: t.corps, cote: t.cote, mur: t.mur, natures, pignons: corps.pignons.filter((p) => p.pan === pan).map(({ pan: q, debut, fin }) => ({ pan: q, debut, fin })), bout: null, u0: r3(Math.max(t.u0, a.u - 0.1)), u1: r3(Math.min(t.u1, a.u + 0.1)), ecartAvant: null, ecartApres: null, gain: null, gabarit: ctx.avec(t.corps, corps) });
  }
  return out;
}

/** Claude confirme-t-il la proposition ? Une pointe vue dans la place d'un pignon ajoute ou deplace, aucune la ou il est retire. */
function confirmeeParLIa(p: Omit<PropositionForme, 'provenance' | 'observation'>, ia: ObservationsFacade, pres: number): boolean {
  const pointes = ia.calage.pointes;
  const dans = (u: number) => u >= p.u0 - pres && u <= p.u1 + pres;
  if (p.bout) return (p.bout === 'croupe' && ia.forme.silhouette === 'trapeze') || (p.bout === 'pignon' && ia.forme.silhouette === 'triangle');
  if (p.natures.includes('retirer-pignon') && !p.natures.includes('ajouter-pignon') && !p.natures.includes('deplacer-pignon')) return !pointes.some((q) => dans(q.u));
  return pointes.some((q) => dans(q.u));
}

/** Les alertes de hauteur : une pointe du gabarit que la photo (ou Claude) voit plus haute ou plus basse ; le LiDAR la garde. */
function alertes(ctx: Contexte, ts: readonly TronconForme[], props: readonly Omit<PropositionForme, 'provenance' | 'observation'>[], ia: ObservationsFacade | null): AlerteHauteur[] {
  const ri = reglagesIa(), pres = ri['facades.ia.pointeEcartU'], hauteur = ri['facades.ia.pointeEcartHauteur'];
  const attendues = pointesDuGabarit(ctx.g0).filter((p) => p.u >= 0 && p.u <= 1 && !props.some((x) => p.u >= x.u0 - pres && p.u <= x.u1 + pres));
  const out: AlerteHauteur[] = [];
  for (const p of attendues) {
    let vue: number | null = null;
    for (let k = 0; k < COLONNES; k++) { const v = ctx.lu[k]; if (v !== null && v !== undefined && Math.abs(uDe(k) - p.u) <= pres) vue = vue === null ? v : Math.max(vue, v); }
    // Une pointe que la photo ne montre pas (le haut reste a l'egout) n'est pas une hauteur : c'est un pignon de moins, ou un haut cache.
    if (vue !== null && vue >= 1 + ctx.obj['facades.enchainement.diagnosticReliefMin'] && Math.abs(vue - p.v) > hauteur * p.v) out.push({ u: r3(p.u), vue: r3(vue), attendue: r3(p.v), corps: tronconEn(ts, p.u)?.corps ?? null, source: 'deterministe' });
  }
  if (ia) {
    for (const a of avisDesPointes(ia, attendues, ri)) if (a.avis === 'hauteur' && a.vue !== null && a.attendue !== null && !out.some((x) => Math.abs(x.u - a.u) <= pres)) out.push({ u: r3(a.u), vue: r3(a.vue), attendue: r3(a.attendue), corps: tronconEn(ts, a.u)?.corps ?? null, source: 'ia' });
  }
  return out;
}

const GENRES: Readonly<Record<GenreElement, string>> = { cheminee: 'une cheminée', lucarne: 'une lucarne' };
const GENRES_PHRASE: Readonly<Record<GenreElement, string>> = { cheminee: 'Une cheminée', lucarne: 'Une lucarne' };

/** La place d'un point de la facade (u) le long d'un mur de corps, en metres depuis sa gauche vue de dehors : l'adresse du moteur. */
function surLeMur(f: Facade, mur: MurDesigne, u: number): number {
  const l = Math.hypot(mur.droite.x - mur.gauche.x, mur.droite.y - mur.gauche.y);
  const x = f.gauche.x + (f.droite.x - f.gauche.x) * u, y = f.gauche.y + (f.droite.y - f.gauche.y) * u;
  return l > 0 ? cm(((x - mur.gauche.x) * (mur.droite.x - mur.gauche.x) + (y - mur.gauche.y) * (mur.droite.y - mur.gauche.y)) / l) : 0;
}

/**
 * Les cheminees et lucarnes de la ligne du haut (lot F7, §5 bis « une bosse etroite », §5 quater) : une bosse du haut lu plus etroite
 * qu'un pignon (et d'au moins `diagnosticElementLargeurMinM`), hors d'une proposition de pignon, est une cheminee si elle monte au
 * faitage du corps (une souche le depasse), une lucarne sinon (sur un long pan) ; un element que Claude voit lui donne son mot et vient
 * « des deux ». Claude seul ne propose que sans haut lu : un element qu'il voit la ou le haut lu n'a pas de bosse est dit en constat
 * (§5 bis, regles 1 et 5). Chaque element est pose a blanc par le moteur sur le corps du troncon (elementPoseSurLeMur) : un corps qui
 * le porte deja, ou qui ne peut pas le porter, ne se propose pas.
 */
function elementsDuHaut(ctx: Contexte, ts: readonly TronconForme[], props: readonly Omit<PropositionForme, 'provenance' | 'observation'>[], ia: ObservationsFacade | null, constats: string[]): PropositionElement[] {
  const f = ctx.e.facade, H = ctx.e.hauteurMur, pres = reglagesIa()['facades.ia.pointeEcartU'];
  const lue = ctx.lu.some((v) => v !== null);
  const vus: { element: GenreElement; u0: number; u1: number; provenance: ProvenanceForme }[] = [];
  for (const t of lue ? ts : []) {
    const c = ctx.e.corps[t.corps];
    if (!c) continue;
    for (const b of bosses(ctx.lu, ctx.g0, t.u0, t.u1, ctx.obj['facades.enchainement.diagnosticReliefMin'])) {
      const largeur = (b.u1 - b.u0 + 1 / COLONNES) * f.largeur;
      if (largeur >= S.LARGEUR_PIGNON_MIN_M || largeur < ctx.obj['facades.enchainement.diagnosticElementLargeurMinM'] || props.some((p) => b.u0 >= p.u0 && b.u1 <= p.u1)) continue;
      let haut = 0;
      for (let k = 0; k < COLONNES; k++) { const v = ctx.lu[k]; if (v !== null && v !== undefined && uDe(k) >= b.u0 && uDe(k) <= b.u1) haut = Math.max(haut, v); }
      const longPan = (t.cote === 0 || t.cote === 2) && !sansFaitage(c);
      vus.push({ element: haut * H >= c.faitage || !longPan ? 'cheminee' : 'lucarne', u0: b.u0, u1: b.u1, provenance: 'deterministe' });
    }
  }
  for (const x of ia?.elements ?? []) {
    const k = vus.findIndex((v) => x.u >= v.u0 - pres && x.u <= v.u1 + pres);
    const v = vus[k];
    if (v) { if (v.provenance === 'deterministe') vus[k] = { ...v, element: x.element, provenance: 'les-deux' }; continue; }
    if (lue) { constats.push(`Claude voit ${GENRES[x.element]} à u ${f2(x.u)}, que le haut lu sur la photo ne confirme pas : rien n’est proposé.`); continue; }
    vus.push({ element: x.element, u0: x.u, u1: x.u, provenance: 'ia' });
  }
  const out: PropositionElement[] = [];
  for (const v of vus) {
    const u = r3((v.u0 + v.u1) / 2), t = tronconEn(ts, u);
    if (!t) { constats.push(`${GENRES_PHRASE[v.element]} à u ${f2(u)}, hors des corps de la façade : rien n’est proposé.`); continue; }
    const vu: ElementDeMurFait = { mur: t.mur, element: v.element, a: surLeMur(f, t.mur, u) };
    const pose = elementPoseSurLeMur(ctx.e.corps, vu);
    if (!pose) { constats.push(`${GENRES_PHRASE[v.element]} à u ${f2(u)} : le corps ${t.corps + 1} la porte déjà, ou ne peut pas la porter ; rien n’est proposé.`); continue; }
    if (out.some((p) => p.element === v.element && p.corps === t.corps && Math.abs(p.u - u) <= pres)) continue;
    out.push({ element: v.element, corps: t.corps, cote: t.cote, mur: t.mur, u, u0: r3(v.u0), u1: r3(v.u1), provenance: v.provenance, observation: { elementsDesMurs: [vu] } });
  }
  return out;
}

/**
 * Le diagnostic de forme d'une facade : ses troncons de corps, les propositions de toit qui expliquent mieux le haut lu (chacune sur son
 * corps), les alertes de hauteur et ce qui ne se propose pas. Sans corps, rien a diagnostiquer.
 */
export function diagnostiquerForme(e: EntreesDiagnostic): DiagnosticForme {
  const obj = objectifsEnchainement(e.objectifs);
  const f = e.facade, H = e.hauteurMur;
  const g0 = gabaritDesCorps(f, e.corps, H);
  const troncons: TronconForme[] = f.largeur > 0 ? tronconsDeFace(silhouetteDeFace(f, e.corps)).map((t) => ({ corps: t.corps, cote: t.cote, mur: { gauche: t.gauche, droite: t.droite }, u0: r3(Math.max(0, t.x0 / f.largeur)), u1: r3(Math.min(1, t.x1 / f.largeur)) })).filter((t) => t.u1 - t.u0 >= 0.05) : [];
  const lu = Array.from({ length: COLONNES }, (_, k) => (e.lue && e.lue.length >= 2 ? surLigne([...e.lue].sort((a, b) => a.u - b.u), uDe(k)) : null));
  const lus = lu.filter((v): v is number => v !== null);
  // Sous l'egout, ou sous le haut d'un corps plus bas que le mur (un appentis au bout de la facade), le haut lu n'est plus le haut du mur.
  const sousEgout = lu.filter((v, k) => v !== null && v < Math.min(1, surLigne(g0, uDe(k)) ?? 1) - SOUS_EGOUT).length;
  const lue = lus.length * 2 >= COLONNES && sousEgout <= PART_SOUS_EGOUT_MAX * lus.length;
  const constats: string[] = lus.length * 2 >= COLONNES && !lue ? ['Le haut lu sur la photo passe sous l’égout : il ne lit pas le haut du mur (une ombre, un toit pris pour le mur), il ne sert pas au diagnostic.'] : [];
  const ctx: Contexte = { e, obj, lu: lue ? lu : lu.map(() => null), g0, avec: (k, c) => gabaritDesCorps(f, e.corps.map((x, i) => (i === k ? c : x)), H) };
  if (!e.corps.length) return { gabarit: g0, troncons, lue, ecart: null, propositions: [], elements: [], alertes: [], constats };
  const bruts: Omit<PropositionForme, 'provenance' | 'observation'>[] = [];
  if (lue) {
    for (const t of troncons) {
      const c = e.corps[t.corps];
      if (!c) continue;
      const p = t.cote === 0 || t.cote === 2 ? diagnosticDuPan(ctx, t, c) : diagnosticDuBout(ctx, t, c);
      if (p) bruts.push(p);
    }
  }
  const ia = e.ia ?? null;
  if (ia && !lue) bruts.push(...propositionsDeLIa(ctx, troncons, ia, constats));
  if (ia) {
    for (const x of ia.calage.corps) constats.push(`Claude voit un autre volume de u ${f2(x.debut)} à ${f2(x.fin)} (le découpage par corps vient du plan).`);
    if (lue) for (const a of avisDesPointes(ia, pointesDuGabarit(g0).filter((p) => p.u >= 0 && p.u <= 1))) {
      if ((a.avis === 'en-plus' || a.avis === 'manquante') && !bruts.some((p) => a.u >= p.u0 - 0.1 && a.u <= p.u1 + 0.1)) constats.push(`Claude voit ${a.avis === 'en-plus' ? 'une pointe que le plan n’a pas' : 'l’absence de la pointe du plan'} à u ${f2(a.u)}, que le haut lu sur la photo ne confirme pas : rien n’est proposé.`);
    }
  }
  const pres = reglagesIa()['facades.ia.pointeEcartU'];
  const propositions = bruts.map((p): PropositionForme => {
    const c = e.corps[p.corps] as CorpsToit;
    const provenance: ProvenanceForme = p.gain === null ? 'ia' : ia && confirmeeParLIa(p, ia, pres) ? 'les-deux' : 'deterministe';
    return { ...p, provenance, observation: observationDe(p, c, f.azimut) };
  });
  const elements = elementsDuHaut(ctx, troncons, bruts, ia, constats);
  return { gabarit: g0, troncons, lue, ecart: lue ? (() => { const x = ecartSur(ctx.lu, g0, 0, 1); return x === null ? null : r3(x); })() : null, propositions, elements, alertes: alertes(ctx, troncons, bruts, ia), constats: [...new Set(constats)] };
}

/** Un element propose, en clair : « une cheminée à 0,42 de la largeur de la façade, d'après le haut lu sur la photo et Claude ». */
export function direElement(p: Pick<PropositionElement, 'element' | 'u' | 'provenance'>): string {
  return GENRES[p.element] + ' à ' + f2(p.u) + ' de la largeur de la façade, d’après ' + PROVENANCES[p.provenance];
}

const NATURES: Readonly<Record<NatureForme, string>> = {
  'ajouter-pignon': 'un pignon de plus', 'retirer-pignon': 'un pignon de moins', 'deplacer-pignon': 'un pignon déplacé ou élargi',
  'pignon-vers-croupe': 'une croupe à la place du pignon', 'croupe-vers-pignon': 'un pignon à la place de la croupe',
};
const PROVENANCES: Readonly<Record<ProvenanceForme, string>> = { deterministe: 'le haut lu sur la photo', ia: 'Claude seul', 'les-deux': 'le haut lu sur la photo et Claude' };
const pct = (x: number) => Math.round(x * 100) + ' %';

/** Ce qu'une proposition change, en clair : « un pignon de plus (pignons de 0 à 3,7 m et de 6,23 à 9,91 m le long du faîtage) ». */
export function direChangement(p: Pick<PropositionForme, 'natures' | 'pignons' | 'bout'>): string {
  const quoi = [...new Set(p.natures)].map((n) => NATURES[n]).join(', ');
  if (p.bout) return quoi;
  const pg = p.pignons ?? [];
  return quoi + (pg.length ? ' (' + (pg.length > 1 ? 'pignons ' : 'pignon ') + pg.map((x) => 'de ' + f2(x.debut) + ' à ' + f2(x.fin) + ' m').join(' et ') + ' le long du faîtage)' : ' (plus aucun pignon sur ce pan)');
}

/** D'ou vient une proposition et ce qu'elle explique : « d'après le haut lu sur la photo et Claude, écart 0,21 → 0,02 (gain 92 %) ». */
export function direPreuve(p: Pick<PropositionForme, 'provenance' | 'gain' | 'ecartAvant' | 'ecartApres'>): string {
  return 'd’après ' + PROVENANCES[p.provenance] + (p.gain !== null && p.ecartAvant !== null && p.ecartApres !== null ? ', écart au haut lu ' + f2(p.ecartAvant) + ' → ' + f2(p.ecartApres) + ' hauteur d’égout (gain ' + pct(p.gain) + ')' : ', sans haut lu pour le mesurer');
}

/** Une alerte de hauteur, en clair : la hauteur du LiDAR est gardee. */
export function direAlerte(a: AlerteHauteur): string {
  return `la pointe à u ${f2(a.u)} est vue à ${f2(a.vue)} fois l’égout (${a.source === 'ia' ? 'Claude' : 'le haut lu'}), le plan la met à ${f2(a.attendue)} : la hauteur du LiDAR est gardée`;
}
