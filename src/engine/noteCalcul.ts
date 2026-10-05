// Note de calcul d'un abri : pergola ou carport (engine/).
//
// Ce module verifie les pieces que `calculerPergola` a posees, selon les Eurocodes et leurs annexes
// nationales francaises :
//   - NF EN 1990 : combinaisons a l'etat limite ultime (ELU) et de service (ELS) ;
//   - NF EN 1991-1-1, 1-3 et 1-4 : poids propres, neige (regions A1 a E, altitude), vent (regions
//     1 a 4, categorie de terrain, toitures isolees du §7.3) ;
//   - NF EN 1995-1-1 : bois massif C24 (NF EN 338) ou lamelle-colle GL24h (NF EN 14080), flexion,
//     cisaillement, deversement, flambement, fleches avec fluage ;
//   - NF EN 1999-1-1 : profiles creux en 6060 T66, classe de section, flambement, fleches.
//
// C'est une note de pre-dimensionnement, et elle le dit : modele simplifie (poutres isostatiques,
// charges reparties sur la projection horizontale, coefficient de force global du vent plutot que
// les pressions locales de bord), sans verification des assemblages ni du sol. Elle ne remplace pas
// l'etude d'un bureau d'etudes. Les valeurs des annexes nationales sont celles de la generation
// d'Eurocodes en vigueur jusqu'au 30 septembre 2027.
//
// Le modele, piece par piece :
//   - chevrons et poutres : poutres sur les appuis que la geometrie leur donne (les pieces qu'elles
//     croisent en plan), avec leurs porte-a-faux ; une poutre recoit les reactions des chevrons ;
//   - poteaux : charge verticale de l'aire de toit la plus proche (cellules de Voronoi), effort
//     horizontal du vent reparti sur tous les poteaux ; console encastree en pied, sauf adossee
//     (le mur stabilise) ;
//   - contrefiches : elles reprennent le moment du portique sous l'effort horizontal ;
//   - ancrages : efforts en pied de poteau et dimension d'un plot beton qui les tient.

import { au } from '../util/tableaux.js';
import { dist, pointInPolygon, shoelace } from '../geometry/basic.js';
import { calculerPergola, dimsPergola, libelleSection, MATERIAUX, natureAbri, SECTIONS_CONTREFICHE, type PergolaCalculee, type PiecePergola, type Pt3, type ReglagesPergola, type RolePiece } from './pergola.js';
import type { CategorieTerrain, HypothesesCalcul, ObjetPlan, PtBrut, ZoneNeige } from '../model/types.js';

// ---- Neige : NF EN 1991-1-3 et son annexe nationale ------------------------------------------

/** Charge caracteristique de neige au sol a 200 m, en kN/m². */
export const SK200: Record<ZoneNeige, number> = { A1: 0.45, A2: 0.45, B1: 0.55, B2: 0.55, C1: 0.65, C2: 0.65, D: 0.90, E: 1.40 };
/** Neige exceptionnelle au sol (situation accidentelle), dans les regions qui en ont une. */
export const SAD: Partial<Record<ZoneNeige, number>> = { A2: 1.0, B2: 1.35, C2: 1.35, D: 1.80 };
export const ZONES_NEIGE = Object.keys(SK200) as ZoneNeige[];

/** La neige au sol a une altitude donnee (annexe nationale, tableau de l'altitude, jusqu'a 2 000 m). */
export function neigeAuSol(zone: ZoneNeige, altitude: number): number {
  const A = Math.max(0, altitude), sk = SK200[zone];
  if (A <= 200) return sk;
  if (zone === 'E') {
    if (A <= 500) return sk + (1.5 * A - 300) / 1000;
    if (A <= 1000) return sk + (3.5 * A - 1300) / 1000;
    return sk + (7 * A - 4800) / 1000;
  }
  if (A <= 500) return sk + (A - 200) / 1000;
  if (A <= 1000) return sk + (1.5 * A - 450) / 1000;
  return sk + (3.5 * A - 2450) / 1000;
}

/** Coefficient de forme d'un versant (μ1, NF EN 1991-1-3 tableau 5.2). */
export function mu1(penteDeg: number): number {
  if (penteDeg <= 30) return 0.8;
  if (penteDeg < 60) return 0.8 * (60 - penteDeg) / 30;
  return 0;
}

// ---- Vent : NF EN 1991-1-4 et son annexe nationale -------------------------------------------

/** Vitesse de reference du vent par region, en m/s. */
export const VB0: Record<number, number> = { 1: 22, 2: 24, 3: 26, 4: 28 };
/** Longueur de rugosite et hauteur minimale par categorie de terrain (annexe nationale, tableau 4.1). */
export const TERRAINS: Record<CategorieTerrain, { z0: number; zmin: number; libelle: string }> = {
  '0': { z0: 0.005, zmin: 1, libelle: '0 — mer, lac, bord de mer' },
  II: { z0: 0.05, zmin: 2, libelle: 'II — rase campagne, haies rares' },
  IIIa: { z0: 0.2, zmin: 5, libelle: 'IIIa — campagne bocagère, habitat dispersé' },
  IIIb: { z0: 0.5, zmin: 9, libelle: 'IIIb — zone urbanisée, industrielle, forêt' },
  IV: { z0: 1.0, zmin: 15, libelle: 'IV — zone urbaine dense (15 % de bâti > 15 m)' }
};

/** Pression dynamique de pointe a la hauteur z, en kN/m² (orographie ignoree : co = 1). */
export function pressionDePointe(zoneVent: number, terrain: CategorieTerrain, z: number): number {
  const vb = VB0[zoneVent] ?? 24;
  const { z0, zmin } = TERRAINS[terrain];
  const zz = Math.max(z, zmin);
  const kr = 0.19 * Math.pow(z0 / 0.05, 0.07);
  const ln = Math.log(zz / z0);
  const cr = kr * ln;
  // Coefficient de turbulence de l'annexe nationale francaise.
  const kl = 1 - 2e-4 * Math.pow(Math.log10(z0) + 3, 6);
  const Iv = kl / ln;
  const qb = 0.5 * 1.225 * vb * vb / 1000;
  return (1 + 7 * Iv) * cr * cr * qb;
}

/**
 * Coefficients de force globaux d'une toiture isolee (NF EN 1991-1-4 tableaux 7.6 et 7.7), en
 * fonction de la pente et de l'obstruction φ sous le toit : `bas` pousse vers le bas, `haut`
 * souleve (valeur positive). Interpoles lineairement entre les lignes du tableau.
 */
const CF_UN_VERSANT: [number, number, number, number][] = [
  // pente, cf bas, cf haut φ=0, cf haut φ=1
  [0, 0.2, 0.5, 1.3], [5, 0.4, 0.7, 1.4], [10, 0.5, 0.9, 1.4], [15, 0.7, 1.1, 1.4],
  [20, 0.8, 1.3, 1.4], [25, 1.0, 1.6, 1.4], [30, 1.2, 1.8, 1.4]
];
const CF_DEUX_VERSANTS: [number, number, number, number][] = [
  [0, 0.2, 0.5, 1.3], [5, 0.3, 0.6, 0.9], [10, 0.4, 0.7, 0.9], [15, 0.4, 0.8, 0.9],
  [20, 0.6, 0.9, 0.9], [25, 0.7, 1.0, 0.9], [30, 0.9, 1.0, 0.9]
];
export function coefficientsToiture(deuxVersants: boolean, penteDeg: number, phi: number): { bas: number; haut: number } {
  const t = deuxVersants ? CF_DEUX_VERSANTS : CF_UN_VERSANT;
  const p = Math.max(0, Math.min(30, penteDeg));
  let i = 0;
  while (i < t.length - 2 && p > au(t, i + 1)[0]) i++;
  const a = au(t, i), b = au(t, i + 1);
  const k = (p - a[0]) / (b[0] - a[0]);
  const lin = (j: 1 | 2 | 3) => a[j] + (b[j] - a[j]) * k;
  const f = Math.max(0, Math.min(1, phi));
  return { bas: lin(1), haut: lin(2) * (1 - f) + lin(3) * f };
}

// ---- Materiaux --------------------------------------------------------------------------------

/** Bois : NF EN 338 (C24) et NF EN 14080 (GL24h), MPa et kN/m³. */
export const BOIS = {
  C24: { fmk: 24, ft0k: 14.5, fc0k: 21, fvk: 4.0, E0mean: 11000, E005: 7400, poids: 4.2, gammaM: 1.3, betaC: 0.2 },
  GL24h: { fmk: 24, ft0k: 19.2, fc0k: 24, fvk: 3.5, E0mean: 11500, E005: 9600, poids: 4.2, gammaM: 1.25, betaC: 0.1 }
} as const;
type ClasseBois = keyof typeof BOIS;
/** kmod (NF EN 1995-1-1 tableau 3.1) et kdef (tableau 3.2), par classe de service. */
const KMOD: Record<number, Record<Duree, number>> = {
  1: { permanente: 0.6, longue: 0.7, moyenne: 0.8, courte: 0.9, instantanee: 1.1 },
  2: { permanente: 0.6, longue: 0.7, moyenne: 0.8, courte: 0.9, instantanee: 1.1 },
  3: { permanente: 0.5, longue: 0.55, moyenne: 0.65, courte: 0.7, instantanee: 0.9 }
};
const KDEF: Record<number, number> = { 1: 0.6, 2: 0.8, 3: 2.0 };
/** Aluminium 6060 T66, profiles extrudes d'epaisseur ≤ 3 mm (NF EN 1999-1-1 tableau 3.2b). */
export const ALU = { fo: 150, fu: 195, E: 70000, gammaM1: 1.1, poids: 27 } as const;

type Duree = 'permanente' | 'longue' | 'moyenne' | 'courte' | 'instantanee';

/** Les caracteristiques d'une section, en m, m², m⁴, m³. */
interface Proprietes { b: number; h: number; A: number; I: number; Iz: number; W: number; Av: number; poids: number; reduction: number }

function proprietes(r: ReglagesPergola, h: HypothesesCompletes, sec: string): Proprietes {
  const d = dimsPergola(sec);
  if (r.materiau === 'bois') {
    const A = d.b * d.h;
    return { b: d.b, h: d.h, A, I: d.b * d.h ** 3 / 12, Iz: d.h * d.b ** 3 / 12, W: d.b * d.h * d.h / 6, Av: A, poids: A * BOIS[h.classeBois].poids, reduction: 1 };
  }
  const t = Math.min(h.epaisseurAlu / 1000, d.b / 4, d.h / 4);
  const bi = d.b - 2 * t, hi = d.h - 2 * t;
  const A0 = d.b * d.h - bi * hi;
  const I0 = (d.b * d.h ** 3 - bi * hi ** 3) / 12, Iz0 = (d.h * d.b ** 3 - hi * bi ** 3) / 12;
  // Classe de section (NF EN 1999-1-1 §6.1.4) : la paroi la plus elancee, comprimee. Au-dela de la
  // classe 3, la section efficace est approchee par le coefficient de voilement local applique a
  // toute la section — plus prudent que la section efficace exacte.
  const eps = Math.sqrt(250 / ALU.fo), beta = Math.max(bi, hi) / t / eps;
  const rho = beta > 22 ? Math.min(1, 32 / beta - 220 / (beta * beta)) : 1;
  return { b: d.b, h: d.h, A: A0 * rho, I: I0, Iz: Iz0, W: 2 * I0 / d.h * rho, Av: 2 * hi * t, poids: A0 * ALU.poids, reduction: rho };
}

// ---- Hypotheses -------------------------------------------------------------------------------

export type HypothesesCompletes = Required<Omit<HypothesesCalcul, 'zoneNeige' | 'zoneVent'>> & { zoneNeige: ZoneNeige | null; zoneVent: number | null; classeBois: ClasseBois };

/** Poids de couverture par defaut, en kg/m² : toile, bac acier, tuiles sur un quatre pans en bois. */
function poidsCouvertureDefaut(r: ReglagesPergola): number {
  if (r.toit === 'toile') return 0.5;
  if (r.toit === 'quatre-pans' && r.materiau === 'bois') return 45;
  return 10;
}

export function hypothesesDe(o: ObjetPlan, r: ReglagesPergola = calculerPergola(o)?.reglages ?? ({} as ReglagesPergola)): HypothesesCompletes {
  const c = o.pergola?.calcul || {};
  const carport = natureAbri(o) === 'carport';
  return {
    zoneNeige: c.zoneNeige && c.zoneNeige in SK200 ? c.zoneNeige : null,
    zoneVent: c.zoneVent && c.zoneVent in VB0 ? c.zoneVent : null,
    altitude: c.altitude !== undefined && c.altitude >= 0 ? c.altitude : 100,
    terrain: c.terrain && c.terrain in TERRAINS ? c.terrain : 'IIIa',
    classeBois: c.classeBois === 'GL24h' ? 'GL24h' : 'C24',
    classeService: c.classeService === 2 ? 2 : 3,
    epaisseurAlu: c.epaisseurAlu && c.epaisseurAlu > 0.5 ? c.epaisseurAlu : 3,
    poidsCouverture: c.poidsCouverture !== undefined && c.poidsCouverture >= 0 ? c.poidsCouverture : poidsCouvertureDefaut(r),
    // Une voiture garee sous un carport obstrue une bonne part du passage du vent.
    obstruction: c.obstruction !== undefined && c.obstruction >= 0 && c.obstruction <= 1 ? c.obstruction : (carport ? 0.5 : 0)
  };
}

// ---- Resultats --------------------------------------------------------------------------------

export interface Critere { nom: string; taux: number; detail: string }

export interface VerifPiece {
  role: RolePiece;
  section: string;
  /** Ce qui fixe le modele : portee, porte-a-faux, longueur de flambement. */
  modele: string;
  criteres: Critere[];
  taux: number;
  /** Une section de la liste qui suffit, quand celle en place ne passe pas. */
  proposition: string | null;
}

export interface Ancrage {
  /** Effort vertical descendant maximal, ELU, kN. */
  compression: number;
  /** Soulevement maximal, ELU, kN (0 : aucun). */
  soulevement: number;
  /** Effort horizontal, ELU, kN. */
  horizontal: number;
  /** Moment en pied, ELU, kN·m (0 : pied articule). */
  moment: number;
  /** Cote d'un plot cubique en beton qui tient soulevement et renversement, m. */
  plot: number;
}

export interface Charges {
  sk: number;
  /** Neige sur la toiture (kN/m² en projection horizontale), et neige exceptionnelle. */
  s: number;
  sAd: number | null;
  qp: number;
  cfBas: number;
  cfHaut: number;
  /** Poids de la couverture seule, kN/m² en projection horizontale. */
  gCouverture: number;
  /** Poids de la toiture (couverture, chevrons, poutres), kN/m² en projection : ce que portent les poteaux. */
  g: number;
  /** Effort horizontal total du vent, caracteristique, kN. */
  H: number;
}

export interface NoteCalcul {
  /** Les hypotheses qui manquent pour calculer : la note ne rend rien sans elles. */
  manque: string[];
  hypotheses: HypothesesCompletes;
  charges: Charges | null;
  verifs: VerifPiece[];
  ancrage: Ancrage | null;
  /** Charge lineique sur la lisse murale (ELU, kN/m), a transmettre aux fixations dans le mur. */
  chargeMur: number | null;
  emprise: number;
  urbanisme: string;
  limites: string[];
}

/** La formalite d'urbanisme selon l'emprise au sol du toit (code de l'urbanisme, R*421-9 et suivants). */
export function formaliteUrbanisme(emprise: number, adossee: boolean): string {
  const e = emprise.toFixed(1).replace('.', ',') + ' m²';
  if (emprise < 5) return 'Emprise au sol de ' + e + ' : aucune formalité (hors secteur protégé).';
  if (emprise <= 20) return 'Emprise au sol de ' + e + ' : déclaration préalable de travaux.';
  if (adossee && emprise <= 40) return 'Emprise au sol de ' + e + ' : déclaration préalable si la construction est adossée à l\'habitation en zone urbaine couverte par un PLU ; permis de construire sinon.';
  return 'Emprise au sol de ' + e + ' : permis de construire.';
}

const LIMITES = [
  'Assemblages (boulons, sabots, platines, équerres) et fixations dans le mur : non vérifiés.',
  'Sol et fondations : la portance du terrain n\'est pas vérifiée ; le plot proposé ne tient que le soulèvement et le renversement.',
  'Vent : coefficient de force global de toiture isolée (NF EN 1991-1-4 §7.3), sans les pressions locales de bord ; orographie ignorée (co = 1).',
  'Neige : sans accumulation contre un mur ou une toiture voisine plus haute ; une toile ne porte pas de neige et doit être repliée l\'hiver.',
  'Faîtage et arêtiers d\'un toit à quatre pans : non vérifiés, leur fonctionnement dépend des assemblages.',
  'Note de pré-dimensionnement, établie avec les Eurocodes de première génération : elle ne remplace pas l\'étude d\'un bureau d\'études.'
];

/** La note de calcul d'une pergola ou d'un carport. */
export function noteDeCalcul(o: ObjetPlan): NoteCalcul | null {
  const calc = calculerPergola(o);
  if (!calc) return null;
  const r = calc.reglages;
  const hyp = hypothesesDe(o, r);
  const emprise = shoelace(calc.emprise);
  const base = { hypotheses: hyp, emprise, urbanisme: formaliteUrbanisme(emprise, r.adossee), limites: LIMITES };
  const manque: string[] = [];
  if (!hyp.zoneNeige) manque.push('la région de neige');
  if (!hyp.zoneVent) manque.push('la région de vent');
  if (!hyp.zoneNeige || !hyp.zoneVent) return { ...base, manque, charges: null, verifs: [], ancrage: null, chargeMur: null };
  const m = new Modele(calc, hyp, hyp.zoneNeige, hyp.zoneVent);
  return { ...base, manque, ...m.resultats() };
}

// ---- Le modele --------------------------------------------------------------------------------

/** Une combinaison d'actions : coefficients sur g, s, vent descendant, vent soulevant, entretien. */
interface Combinaison { nom: string; g: number; s: number; wBas: number; wHaut: number; q: number; duree: Duree; accidentelle?: boolean }

class Modele {
  readonly r: ReglagesPergola;
  readonly charges: Charges;
  readonly combinaisons: Combinaison[];
  readonly psi2S: number;
  readonly pente: number;

  constructor(readonly calc: PergolaCalculee, readonly hyp: HypothesesCompletes, zoneNeige: ZoneNeige, zoneVent: number) {
    const r = this.r = calc.reglages;
    this.pente = r.toit === 'toile' ? 0 : r.pente;
    const cos = Math.cos(this.pente * Math.PI / 180);
    const haute = hyp.altitude > 1000;
    const sk = neigeAuSol(zoneNeige, hyp.altitude);
    // Une toile se replie l'hiver : pas de neige sur elle. Une toiture de pente ≤ 3 % est majoree de
    // 0,2 kN/m² (annexe nationale, accumulation sur les toitures plates).
    const s = r.toit === 'toile' ? 0 : mu1(this.pente) * sk + (Math.tan(this.pente * Math.PI / 180) <= 0.03 ? 0.2 : 0);
    const sad = SAD[zoneNeige];
    const sAd = r.toit === 'toile' || sad === undefined ? null : mu1(this.pente) * sad;
    const zMax = Math.max(...calc.pieces.map(p => Math.max(p.a.z, p.b.z)));
    const qp = pressionDePointe(zoneVent, hyp.terrain, zMax);
    const cf = coefficientsToiture(r.toit === 'quatre-pans', this.pente, hyp.obstruction);
    // Le poids des poteaux n'est pas dans la toiture : chacun l'ajoute au sien.
    const poidsToiture = calc.pieces.filter(p => p.role !== 'poteau').reduce((t, p) => t + proprietes(r, hyp, p.section).poids * p.longueur, 0);
    const gCouverture = hyp.poidsCouverture * 0.00981 / cos;
    const g = gCouverture + poidsToiture / Math.max(0.01, shoelace(calc.emprise));
    this.charges = { sk, s, sAd, qp, cfBas: cf.bas, cfHaut: cf.haut, gCouverture, g, H: this.ventHorizontal(qp, cf.bas) };
    // NF EN 1990 et son annexe nationale : ψ0 = 0,5 pour la neige sous 1 000 m (0,7 au-dessus),
    // ψ0 = 0,6 pour le vent ; l'entretien d'une toiture (categorie H) ne se cumule ni a la neige ni
    // au vent. La duree de la combinaison est celle de l'action la plus courte (NF EN 1995 §3.1.3).
    const psi0S = haute ? 0.7 : 0.5;
    this.psi2S = haute ? 0.2 : 0;
    const dureeNeige: Duree = haute ? 'moyenne' : 'courte';
    this.combinaisons = [
      { nom: '1,35 G', g: 1.35, s: 0, wBas: 0, wHaut: 0, q: 0, duree: 'permanente' },
      { nom: '1,35 G + 1,5 S', g: 1.35, s: 1.5, wBas: 0, wHaut: 0, q: 0, duree: dureeNeige },
      { nom: '1,35 G + 1,5 S + 0,9 W', g: 1.35, s: 1.5, wBas: 0.9, wHaut: 0, q: 0, duree: 'instantanee' },
      { nom: '1,35 G + 1,5 W + ' + (1.5 * psi0S).toFixed(2).replace('.', ',') + ' S', g: 1.35, s: 1.5 * psi0S, wBas: 1.5, wHaut: 0, q: 0, duree: 'instantanee' },
      { nom: '1,35 G + 1,5 Q', g: 1.35, s: 0, wBas: 0, wHaut: 0, q: 1.5, duree: 'courte' },
      { nom: 'G + 1,5 W (soulèvement)', g: 1.0, s: 0, wBas: 0, wHaut: 1.5, q: 0, duree: 'instantanee' },
      ...(sAd !== null ? [{ nom: 'G + S accidentelle', g: 1.0, s: 0, wBas: 0, wHaut: 0, q: 0, duree: 'courte' as Duree, accidentelle: true }] : [])
    ];
  }

  /**
   * L'effort horizontal du vent sur l'abri, vent face au plus long cote : frottement sur les deux
   * faces de la toiture (cfr = 0,02, surfaces rugueuses), poutres de rive et poteaux exposes
   * (cf = 2,0 pour une section rectangulaire), composante horizontale de la poussee sur un toit
   * en pente.
   */
  private ventHorizontal(qp: number, cfBas: number): number {
    const empr = shoelace(this.calc.emprise);
    let longueur = 0;
    this.calc.emprise.forEach((p, i, t) => { longueur = Math.max(longueur, dist(p, au(t, (i + 1) % t.length))); });
    const poutre = dimsPergola(this.r.sectionPoutre).h;
    const poteaux = this.calc.pieces.filter(p => p.role === 'poteau');
    const surfPoteaux = poteaux.reduce((t, p) => t + dimsPergola(p.section).b * p.longueur, 0);
    return qp * (0.02 * 2 * empr + 2.0 * poutre * longueur + 2.0 * surfPoteaux)
      + qp * cfBas * empr * Math.sin(this.pente * Math.PI / 180);
  }

  /**
   * Charges reparties caracteristiques sur une piece, par m, pour une largeur tributaire donnee :
   * la couverture et ce qui pese sur la piece (les chevrons, pour une poutre), plus son poids propre.
   */
  private chargesLineiques(largeur: number, poidsPropre: number, gSurfacique = this.charges.gCouverture) {
    const c = this.charges;
    return { g: gSurfacique * largeur + poidsPropre, s: c.s * largeur, wBas: c.qp * c.cfBas * largeur, wHaut: c.qp * c.cfHaut * largeur, sAd: (c.sAd ?? 0) * largeur };
  }

  resultats(): Omit<NoteCalcul, 'manque' | 'hypotheses' | 'emprise' | 'urbanisme' | 'limites'> {
    const verifs: VerifPiece[] = [];
    const chevrons = this.calc.pieces.filter(p => p.role === 'chevron');
    const porteuses = this.calc.pieces.filter(p => p.role === 'poutre' || p.role === 'lisse' || p.role === 'faitage' || p.role === 'aretier');
    const reactions = new Map<PiecePergola, number>();
    const pireChevron = this.verifierChevrons(chevrons, porteuses, reactions);
    if (pireChevron) verifs.push(pireChevron);
    const pirePoutre = this.verifierPoutres(reactions);
    if (pirePoutre) verifs.push(pirePoutre);
    const { verif: pirePoteau, ancrage } = this.verifierPoteaux();
    if (pirePoteau) verifs.push(pirePoteau);
    const contrefiche = this.verifierContrefiches();
    if (contrefiche) verifs.push(contrefiche);
    const lisse = this.calc.pieces.find(p => p.role === 'lisse');
    let chargeMur: number | null = null;
    if (lisse) {
      const t = this.largeurDesReactions(lisse, reactions);
      const q = this.chargesLineiques(t, 0);
      chargeMur = Math.max(...this.combinaisons.filter(c => !c.accidentelle).map(c => c.g * q.g + c.s * q.s + c.wBas * q.wBas));
    }
    return { charges: this.charges, verifs, ancrage, chargeMur };
  }

  // ---- Chevrons ----

  /** Les appuis d'un chevron : ou il croise une piece porteuse, en abscisse le long du chevron (m). */
  private appuis(p: PiecePergola, porteuses: PiecePergola[]): { x: number; sur: PiecePergola }[] {
    const L = dist(p.a, p.b);
    const out: { x: number; sur: PiecePergola }[] = [];
    porteuses.forEach(q => {
      const t = intersection(p.a, p.b, q.a, q.b);
      if (t !== null) out.push({ x: t * L, sur: q });
    });
    return out.sort((a, b) => a.x - b.x);
  }

  private verifierChevrons(chevrons: PiecePergola[], porteuses: PiecePergola[], reactions: Map<PiecePergola, number>): VerifPiece | null {
    const e = this.r.entraxeChevrons;
    let pire: { verif: VerifPiece; taux: number } | null = null;
    // Les chevrons de meme geometrie se ressemblent : on garde les distincts, puis le plus defavorable.
    chevrons.forEach(p => {
      const L = dist(p.a, p.b);
      const appuis = this.appuis(p, porteuses);
      // Un chevron qui ne trouve qu'un appui (empannon contre un aretier) porte sur ses deux bouts.
      const xs = appuis.length >= 2 ? appuis.map(a => a.x) : [0, L];
      const x0 = au(xs, 0), x1 = au(xs, xs.length - 1);
      // Reactions sous 1 kN/m sur toute la longueur : ce qui descend dans chaque appui, en kN.
      const travee = Math.max(0.05, x1 - x0), pafG = x0, pafD = L - x1;
      const R1 = (L * (L / 2 - x1)) / (x0 - x1 || -1);
      const unite = [R1, L - R1];
      if (appuis.length >= 2) {
        const a0 = au(appuis, 0), a1 = au(appuis, appuis.length - 1);
        reactions.set(a0.sur, (reactions.get(a0.sur) || 0) + au(unite, 0) * e);
        reactions.set(a1.sur, (reactions.get(a1.sur) || 0) + au(unite, 1) * e);
      }
      const q = (sec: string) => this.chargesLineiques(e, proprietes(this.r, this.hyp, sec).poids);
      const verif = (sec: string) => this.verifierFlexion('chevron', sec, travee, Math.max(pafG, pafD), q(sec), !this.couvert());
      const v = verif(this.r.sectionChevron);
      if (!pire || v.taux > pire.taux) pire = { verif: { ...v, proposition: v.taux > 1 ? this.proposer(MATERIAUX[this.r.materiau].chevrons, this.r.sectionChevron, verif) : null }, taux: v.taux };
    });
    return pire === null ? null : (pire as { verif: VerifPiece }).verif;
  }

  /** Une toiture couverte tient les chevrons contre le deversement ; une toile non. */
  private couvert(): boolean { return this.r.toit !== 'toile'; }

  // ---- Poutres ----

  /** La largeur de toit qui charge une piece porteuse, deduite des reactions des chevrons (m). */
  private largeurDesReactions(p: PiecePergola, reactions: Map<PiecePergola, number>): number {
    const L = Math.max(0.1, dist(p.a, p.b));
    return Math.max((reactions.get(p) || 0) / L, this.r.entraxeChevrons / 2);
  }

  private verifierPoutres(reactions: Map<PiecePergola, number>): VerifPiece | null {
    const poutres = this.calc.pieces.filter(p => p.role === 'poutre');
    const poteaux = this.calc.pieces.filter(p => p.role === 'poteau').map(p => ({ x: p.a.x, y: p.a.y }));
    // Les contrefiches raccourcissent la portee libre : on retient la travee moins une fois leur
    // portee horizontale (elles ne sont pas des appuis rigides).
    const dCf = this.r.avecContrefiches ? this.r.longueurContrefiche * Math.SQRT1_2 : 0;
    // Les chevrons pesent sur les poutres : leur poids lineique etale sur leur entraxe.
    const gChevrons = this.charges.gCouverture + proprietes(this.r, this.hyp, this.r.sectionChevron).poids / this.r.entraxeChevrons;
    let pire: VerifPiece | null = null;
    poutres.forEach(p => {
      const { travee, paf } = traveesSurPoteaux(p, poteaux);
      const t = this.largeurDesReactions(p, reactions);
      const verif = (sec: string) => this.verifierFlexion('poutre', sec, Math.max(0.1, travee - dCf), paf, this.chargesLineiques(t, proprietes(this.r, this.hyp, sec).poids, gChevrons), true);
      const v = verif(this.r.sectionPoutre);
      if (!pire || v.taux > pire.taux) pire = { ...v, proposition: v.taux > 1 ? this.proposer(MATERIAUX[this.r.materiau].poutres, this.r.sectionPoutre, verif) : null };
    });
    return pire;
  }

  /**
   * Une piece flechie : travee isostatique et porte-a-faux, charges reparties par combinaison,
   * entretien ponctuel de 1,5 kN au milieu. Flexion (avec deversement pour le bois), cisaillement,
   * fleches instantanee et finale.
   */
  private verifierFlexion(role: RolePiece, sec: string, L: number, paf: number, q: ReturnType<Modele['chargesLineiques']>, maintenue: boolean): VerifPiece {
    const pr = proprietes(this.r, this.hyp, sec);
    const bois = this.r.materiau === 'bois';
    const mat = BOIS[this.hyp.classeBois];
    let tauxM = 0, tauxV = 0, combM = '', combV = '';
    const Q = 1.5; // kN, charge d'entretien ponctuelle (NF EN 1991-1-1, categorie H)
    // Deversement d'une poutre rectangulaire en bois (NF EN 1995-1-1 §6.3.3), longueur efficace 0,9 L.
    const sigCrit = 0.78 * pr.b * pr.b * mat.E005 / (pr.h * 0.9 * Math.max(L, 0.1));
    const lam = Math.sqrt(mat.fmk / sigCrit);
    const kcrit = !bois || maintenue ? 1 : lam <= 0.75 ? 1 : lam <= 1.4 ? 1.56 - 0.75 * lam : 1 / (lam * lam);
    this.combinaisons.forEach(c => {
      const wd = c.wHaut ? c.wHaut * q.wHaut - c.g * q.g : c.g * q.g + c.s * q.s + c.wBas * q.wBas + (c.accidentelle ? q.sAd : 0);
      const M = Math.max(Math.abs(wd) * L * L / 8, Math.abs(wd) * paf * paf / 2) + c.q * Q * L / 4;
      const V = Math.max(Math.abs(wd) * L / 2, Math.abs(wd) * paf) + c.q * Q / 2;
      const fm = bois ? KMOD[this.hyp.classeService]?.[c.duree] ?? 0.7 : 1;
      const gM = c.accidentelle ? 1.0 : bois ? mat.gammaM : ALU.gammaM1;
      const resM = bois ? kcrit * fm * mat.fmk * 1000 / gM * pr.W : ALU.fo * 1000 / gM * pr.W;
      const resV = bois ? fm * mat.fvk * 1000 / gM * 0.67 * pr.A / 1.5 : pr.Av * ALU.fo * 1000 / (Math.sqrt(3) * gM);
      if (M / resM > tauxM) { tauxM = M / resM; combM = c.nom; }
      if (V / resV > tauxV) { tauxV = V / resV; combV = c.nom; }
    });
    // Fleches (ELS caracteristique) : L/300 sous l'action variable seule, L/200 en finale (fluage du
    // bois : kdef, neige quasi permanente ψ2). Le porte-a-faux se compare a 2 fois sa longueur.
    const E = (bois ? mat.E0mean : ALU.E) * 1000;
    const enTravee = (w: number) => 5 * w * L ** 4 / (384 * E * pr.I);
    const enConsole = (w: number) => w * paf ** 4 / (8 * E * pr.I);
    const kdef = bois ? KDEF[this.hyp.classeService] ?? 2 : 0;
    const variable = (f: (w: number) => number) => f(Math.max(q.s, q.wBas));
    const finale = (f: (w: number) => number) => f(q.g) * (1 + kdef) + f(q.s) * (1 + this.psi2S * kdef);
    // Rapport a la limite : L pour la travee, 2 fois la longueur pour le porte-a-faux.
    const rapport = (w: (f: (w: number) => number) => number, div: number) =>
      Math.max(w(enTravee) / (Math.max(L, 0.1) / div), paf > 0.01 ? w(enConsole) / (2 * paf / div) : 0);
    const wVar = Math.max(variable(enTravee), variable(enConsole)), wFin = Math.max(finale(enTravee), finale(enConsole));
    const tauxInst = rapport(variable, 300), tauxFin = rapport(finale, 200);
    const criteres: Critere[] = [
      { nom: 'Flexion', taux: tauxM, detail: combM + (bois && kcrit < 1 ? ', déversement k_crit = ' + kcrit.toFixed(2).replace('.', ',') : '') },
      { nom: 'Cisaillement', taux: tauxV, detail: combV },
      { nom: 'Flèche instantanée', taux: tauxInst, detail: (wVar * 1000).toFixed(1).replace('.', ',') + ' mm, limite L/300' },
      { nom: 'Flèche finale', taux: tauxFin, detail: (wFin * 1000).toFixed(1).replace('.', ',') + ' mm, limite L/200' + (bois ? ', fluage k_def = ' + kdef : '') }
    ];
    if (pr.reduction < 1) criteres.push({ nom: 'Voilement local', taux: 0, detail: 'section de classe 4 : résistance réduite à ' + Math.round(pr.reduction * 100) + ' %' });
    return {
      role, section: sec, criteres, taux: Math.max(...criteres.map(k => k.taux)), proposition: null,
      modele: 'portée ' + fr(L) + ' m' + (paf > 0.01 ? ', porte-à-faux ' + fr(paf) + ' m' : '')
    };
  }

  // ---- Poteaux et ancrages ----

  /** L'aire de toit portee par chaque poteau : les points du toit les plus proches de lui. */
  private airesTributaires(poteaux: Pt3[]): number[] {
    const emprise = this.calc.emprise;
    const xs = emprise.map(p => p.x), ys = emprise.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pas = Math.max(0.05, Math.sqrt((x1 - x0) * (y1 - y0) / 6000));
    const aires = poteaux.map(() => 0);
    // Une pergola adossee : le mur est un appui continu, il prend ce qui est plus pres de lui.
    const mur = this.calc.pieces.find(p => p.role === 'lisse');
    for (let x = x0 + pas / 2; x < x1; x += pas) {
      for (let y = y0 + pas / 2; y < y1; y += pas) {
        const pt = { x, y };
        if (!pointInPolygon(pt, emprise)) continue;
        let best = -1, d = mur ? distanceSegment(pt, mur.a, mur.b) : Infinity;
        poteaux.forEach((p, i) => { const di = Math.hypot(p.x - x, p.y - y); if (di < d) { d = di; best = i; } });
        if (best >= 0) aires[best] = (aires[best] || 0) + pas * pas;
      }
    }
    return aires;
  }

  private verifierPoteaux(): { verif: VerifPiece | null; ancrage: Ancrage | null } {
    const poteaux = this.calc.pieces.filter(p => p.role === 'poteau');
    if (!poteaux.length) return { verif: null, ancrage: null };
    const aires = this.airesTributaires(poteaux.map(p => p.a));
    const c = this.charges;
    const adossee = this.r.adossee;
    // Chaque poteau prend sa part de l'effort horizontal ; adossee, le mur le reprend.
    const Hk = adossee ? 0 : c.H / poteaux.length;
    const console = !adossee && !this.r.avecContrefiches;
    let pire: VerifPiece | null = null;
    const anc: Ancrage = { compression: 0, soulevement: 0, horizontal: 1.5 * Hk, moment: 0, plot: 0.4 };
    poteaux.forEach((p, i) => {
      const A = aires[i] || 0, h = p.longueur;
      const dCf = this.r.avecContrefiches ? this.r.longueurContrefiche * Math.SQRT1_2 : 0;
      // Le moment de calcul : en pied pour une console, au droit de la contrefiche pour un portique.
      const brasDeLevier = console ? h : this.r.avecContrefiches ? Math.max(0, h - dCf) : 0;
      const verif = (sec: string) => this.verifierPoteau(sec, h, A, Hk, brasDeLevier, adossee ? 1 : 2);
      const v = verif(this.r.sectionPoteau);
      if (!pire || v.taux > pire.taux) pire = { ...v, proposition: v.taux > 1 ? this.proposer(MATERIAUX[this.r.materiau].poteaux, this.r.sectionPoteau, verif) : null };
      const gk = c.g * A + proprietes(this.r, this.hyp, this.r.sectionPoteau).poids * h;
      this.combinaisons.forEach(k => {
        const n = k.wHaut ? k.g * gk - k.wHaut * c.qp * c.cfHaut * A : k.g * gk + k.s * c.s * A + k.wBas * c.qp * c.cfBas * A + (k.accidentelle ? (c.sAd ?? 0) * A : 0);
        anc.compression = Math.max(anc.compression, n);
        anc.soulevement = Math.max(anc.soulevement, -n);
      });
      if (console) anc.moment = Math.max(anc.moment, 1.5 * Hk * h);
    });
    // Plot cubique en beton (24 kN/m³, favorable : 0,9) : son poids tient le soulevement, et son
    // poids sur un demi-cote de bras de levier tient le moment en pied (sol et portance non verifies).
    const cotePourSoulevement = Math.cbrt(anc.soulevement / (0.9 * 24));
    const cotePourMoment = Math.pow(2 * anc.moment / (0.9 * 24), 0.25);
    anc.plot = Math.ceil(Math.max(0.4, cotePourSoulevement, cotePourMoment) * 20) / 20;
    return { verif: pire, ancrage: anc };
  }

  /** Un poteau : compression avec flambement, et flexion sous l'effort horizontal (NF EN 1995 §6.3.2, NF EN 1999 §6.3). */
  private verifierPoteau(sec: string, h: number, A: number, Hk: number, bras: number, kLf: number): VerifPiece {
    const pr = proprietes(this.r, this.hyp, sec);
    const bois = this.r.materiau === 'bois';
    const mat = BOIS[this.hyp.classeBois];
    const c = this.charges;
    const Lf = kLf * h;
    const i = Math.sqrt(Math.min(pr.I, pr.Iz) / (pr.A / pr.reduction));
    let taux = 0, comb = '', kc = 1;
    this.combinaisons.forEach(k => {
      const gk = c.g * A + pr.poids * h;
      const N = k.wHaut ? k.g * gk - k.wHaut * c.qp * c.cfHaut * A : k.g * gk + k.s * c.s * A + k.wBas * c.qp * c.cfBas * A + (k.accidentelle ? (c.sAd ?? 0) * A : 0);
      const M = (k.wBas || k.wHaut) * Hk * bras;
      let t: number;
      if (bois) {
        const fm = KMOD[this.hyp.classeService]?.[k.duree] ?? 0.7, gM = k.accidentelle ? 1.0 : mat.gammaM;
        const lamRel = (Lf / i) / Math.PI * Math.sqrt(mat.fc0k / mat.E005);
        const kk = 0.5 * (1 + mat.betaC * (lamRel - 0.3) + lamRel * lamRel);
        kc = lamRel <= 0.3 ? 1 : 1 / (kk + Math.sqrt(kk * kk - lamRel * lamRel));
        const fc = fm * mat.fc0k * 1000 / gM, ft = fm * mat.ft0k * 1000 / gM, fmd = fm * mat.fmk * 1000 / gM;
        t = N >= 0 ? N / (kc * pr.A * fc) + M / (pr.W * fmd) : -N / (pr.A * ft) + M / (pr.W * fmd);
      } else {
        const fo = ALU.fo * 1000 / (k.accidentelle ? 1.0 : ALU.gammaM1);
        const Ncr = Math.PI ** 2 * ALU.E * 1000 * Math.min(pr.I, pr.Iz) / (Lf * Lf);
        const lb = Math.sqrt(pr.A * ALU.fo * 1000 / Ncr);
        const phi = 0.5 * (1 + 0.2 * (lb - 0.1) + lb * lb);
        kc = Math.min(1, 1 / (phi + Math.sqrt(phi * phi - lb * lb)));
        t = Math.abs(N) / ((N >= 0 ? kc : 1) * pr.A * fo) + M / (pr.W * fo);
      }
      if (t > taux) { taux = t; comb = k.nom; }
    });
    return {
      role: 'poteau', section: sec, proposition: null, taux,
      modele: 'hauteur ' + fr(h) + ' m, flambement L_f = ' + fr(Lf) + ' m' + (bras > 0 ? ', moment du vent sur ' + fr(bras) + ' m' : ''),
      criteres: [{ nom: 'Compression et flexion', taux, detail: comb + ', k_c = ' + kc.toFixed(2).replace('.', ',') + (pr.reduction < 1 ? ', section de classe 4' : '') }]
    };
  }

  // ---- Contrefiches ----

  private verifierContrefiches(): VerifPiece | null {
    if (!this.r.avecContrefiches || this.r.adossee) return null;
    const cf = this.calc.pieces.find(p => p.role === 'contrefiche');
    const poteau = this.calc.pieces.find(p => p.role === 'poteau');
    if (!cf || !poteau) return null;
    const n = this.calc.pieces.filter(p => p.role === 'poteau').length;
    const Hk = this.charges.H / n;
    const d = this.r.longueurContrefiche * Math.SQRT1_2;
    // Portique a pieds articules : la contrefiche equilibre H·h autour du noeud de tete.
    const Nk = Math.SQRT2 * Hk * poteau.longueur / d;
    const verif = (sec: string): VerifPiece => {
      const pr = proprietes(this.r, this.hyp, sec);
      const mat = BOIS[this.hyp.classeBois];
      const L = this.r.longueurContrefiche;
      const lamRel = (L / Math.sqrt(Math.min(pr.I, pr.Iz) / pr.A)) / Math.PI * Math.sqrt(mat.fc0k / mat.E005);
      const kk = 0.5 * (1 + mat.betaC * (lamRel - 0.3) + lamRel * lamRel);
      const kc = lamRel <= 0.3 ? 1 : 1 / (kk + Math.sqrt(kk * kk - lamRel * lamRel));
      const fc = (KMOD[this.hyp.classeService]?.instantanee ?? 0.9) * mat.fc0k * 1000 / mat.gammaM;
      const taux = 1.5 * Nk / (kc * pr.A * fc);
      return {
        role: 'contrefiche', section: sec, taux, proposition: null,
        modele: 'longueur ' + fr(L) + ' m, effort ' + fr(1.5 * Nk, 1) + ' kN (ELU)',
        criteres: [{ nom: 'Compression et flambement', taux, detail: 'G + 1,5 W, k_c = ' + kc.toFixed(2).replace('.', ',') }]
      };
    };
    const v = verif(this.r.sectionContrefiche);
    return { ...v, proposition: v.taux > 1 ? this.proposer(SECTIONS_CONTREFICHE, this.r.sectionContrefiche, verif) : null };
  }

  /** La premiere section de la liste, plus forte que celle en place, qui passe. */
  private proposer(liste: string[], actuelle: string, verif: (sec: string) => VerifPiece): string {
    const aire = (s: string) => { const d = dimsPergola(s); return d.b * d.h; };
    const ok = liste.filter(s => aire(s) > aire(actuelle)).sort((a, b) => aire(a) - aire(b)).find(s => verif(s).taux <= 1);
    return ok ? libelleSection(ok) : 'aucune section de la liste ne suffit : réduire la portée ou l\'entraxe';
  }
}

// ---- Geometrie --------------------------------------------------------------------------------

const fr = (v: number, d = 2): string => v.toFixed(d).replace('.', ',');

/** Abscisse relative (0..1) sur [a, b] de son croisement avec [c, d] en plan, ou null. */
function intersection(a: PtBrut, b: PtBrut, c: PtBrut, d: PtBrut): number | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  const eps = 1e-3;
  return t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps ? Math.max(0, Math.min(1, t)) : null;
}

function distanceSegment(p: PtBrut, a: PtBrut, b: PtBrut): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** La plus longue travee d'une poutre entre les poteaux qu'elle coiffe, et son plus long porte-a-faux. */
function traveesSurPoteaux(p: PiecePergola, poteaux: PtBrut[]): { travee: number; paf: number } {
  const L = dist(p.a, p.b);
  const ux = (p.b.x - p.a.x) / (L || 1), uy = (p.b.y - p.a.y) / (L || 1);
  const xs = poteaux
    .filter(q => Math.abs((q.x - p.a.x) * uy - (q.y - p.a.y) * ux) < 0.01)
    .map(q => (q.x - p.a.x) * ux + (q.y - p.a.y) * uy)
    .filter(x => x > -0.01 && x < L + 0.01)
    .sort((a, b) => a - b);
  if (xs.length < 2) return { travee: L, paf: 0 };
  let travee = 0;
  for (let i = 1; i < xs.length; i++) travee = Math.max(travee, au(xs, i) - au(xs, i - 1));
  return { travee, paf: Math.max(au(xs, 0), L - au(xs, xs.length - 1)) };
}
