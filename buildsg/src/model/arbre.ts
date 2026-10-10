// Un arbre en 3D, decrit sans Three (MD/spec-arbres-3d.md).
//
// Le plan ne connait d'un arbre que son tronc (un cercle, sa hauteur), le diametre et la couleur
// de son feuillage. Ce module ajoute ce qui le fait ressembler a un arbre : un **port** (la forme
// de son houppier), une **essence** (caduc ou persistant : un caduc est nu de novembre a mars, a
// la date de l'etude d'ensoleillement), et un houppier en lobes - quelques ellipsoides qui se
// chevauchent, tires d'une graine propre a l'arbre, donc toujours les memes pour le meme arbre.
//
// Tout est en metres, dans le repere de l'arbre : l'origine au sommet du tronc, y vers le haut.

import { graineDe, tirage } from './voisinage3d.js';
import type { ObjetPlan } from './types.js';

export type PortArbre = 'rond' | 'etale' | 'colonnaire' | 'conique' | 'parasol';
export type EssenceArbre = 'caduc' | 'persistant';

export const PORTS: readonly PortArbre[] = ['rond', 'etale', 'colonnaire', 'conique', 'parasol'];
export const ESSENCES: readonly EssenceArbre[] = ['caduc', 'persistant'];
export const LIBELLES_PORT: Record<PortArbre, string> = { rond: 'Rond (chêne, érable)', etale: 'Étalé (platane, cerisier)', colonnaire: 'Colonnaire (cyprès, peuplier)', conique: 'Conique (sapin, épicéa)', parasol: 'Parasol (pin, olivier)' };
export const LIBELLES_ESSENCE: Record<EssenceArbre, string> = { caduc: 'Caduc (nu de novembre à mars)', persistant: 'Persistant' };

export const PORT_DEFAUT: PortArbre = 'rond';
export const ESSENCE_DEFAUT: EssenceArbre = 'caduc';
export const DIAMETRE_DEFAUT_M = 3;
export const COULEUR_FEUILLAGE_DEFAUT = '#4a7c3a';
export const COULEUR_TRONC_DEFAUT = '#6b5236';

export function portDe(o: Pick<ObjetPlan, 'portArbre'>): PortArbre {
  return o.portArbre && (PORTS as readonly string[]).includes(o.portArbre) ? o.portArbre : PORT_DEFAUT;
}
export function essenceDe(o: Pick<ObjetPlan, 'essenceArbre'>): EssenceArbre {
  return o.essenceArbre && (ESSENCES as readonly string[]).includes(o.essenceArbre) ? o.essenceArbre : ESSENCE_DEFAUT;
}

/** Un caduc est nu de novembre a mars ; une date illisible laisse l'arbre en feuilles. */
export function arbreNu(essence: EssenceArbre, dateStr: string | null | undefined): boolean {
  if (essence !== 'caduc') return false;
  const mois = parseInt((dateStr ?? '').slice(5, 7), 10);
  return Number.isFinite(mois) && (mois >= 11 || mois <= 3);
}

/** Un conifere est conique et persistant ; un verger, etale ; une haie, colonnaire ; le reste, rond et caduc. */
export function portParNature(nature: string | null | undefined): { port: PortArbre; essence: EssenceArbre } {
  const n = (nature ?? '').toLowerCase();
  if (n.includes('conif')) return { port: 'conique', essence: 'persistant' };
  if (n.includes('verger')) return { port: 'etale', essence: 'caduc' };
  if (n.includes('haie')) return { port: 'colonnaire', essence: 'persistant' };
  if (n.includes('peupleraie')) return { port: 'colonnaire', essence: 'caduc' };
  return { port: 'rond', essence: 'caduc' };
}

/** Un lobe du houppier : un ellipsoide, centre et demi-axes. */
export interface Lobe { x: number; y: number; z: number; rx: number; ry: number; rz: number }
/** Une branche : un troncon de cylindre, du point `de` au point `a`. */
export interface Branche { de: { x: number; y: number; z: number }; a: { x: number; y: number; z: number }; rayon: number }
export interface Houppier {
  lobes: Lobe[];
  branches: Branche[];
  /** Hauteur du houppier au-dessus du sommet du tronc. */
  hauteur: number;
}

/** Les proportions de chaque port : hauteur du houppier pour un diametre de 1, lobes, etalement. */
const PROPORTIONS: Record<PortArbre, { hauteur: number; lobes: number; etalement: number; aplatissement: number }> = {
  rond: { hauteur: 1.0, lobes: 7, etalement: 0.32, aplatissement: 1.0 },
  etale: { hauteur: 0.6, lobes: 9, etalement: 0.42, aplatissement: 0.65 },
  colonnaire: { hauteur: 2.6, lobes: 6, etalement: 0.12, aplatissement: 1.0 },
  conique: { hauteur: 2.2, lobes: 1, etalement: 0, aplatissement: 1.0 },
  parasol: { hauteur: 0.45, lobes: 8, etalement: 0.4, aplatissement: 0.5 },
};

/**
 * Le houppier d'un arbre de `diametre` metres, selon son port, tire de `graine`. Un conique est un
 * seul lobe en pointe (le rendu en fait un cone) ; les autres sont un lobe central et des lobes
 * satellites, repartis autour et en hauteur, enfonces dans le central. Les branches partent du
 * sommet du tronc vers les lobes satellites.
 */
export function houppier(port: PortArbre, diametre: number, graine: number): Houppier {
  const p = PROPORTIONS[port];
  const r = Math.max(0.05, diametre / 2);
  const hauteur = diametre * p.hauteur;
  const alea = tirage(graine);
  if (port === 'conique') {
    return { lobes: [{ x: 0, y: hauteur / 2, z: 0, rx: r, ry: hauteur / 2, rz: r }], branches: [], hauteur };
  }
  const lobes: Lobe[] = [];
  const branches: Branche[] = [];
  // Le lobe central : un peu moins large que le diametre, aussi haut que le houppier.
  const rc = r * (port === 'colonnaire' ? 0.9 : 0.72);
  const central: Lobe = { x: 0, y: hauteur / 2, z: 0, rx: rc, ry: hauteur / 2, rz: rc };
  lobes.push(central);
  const n = p.lobes - 1;
  for (let i = 0; i < n; i++) {
    const angle = ((i + alea() * 0.6) / n) * Math.PI * 2;
    const rayon = r * (0.42 + alea() * 0.22);
    // Le satellite reste dans le diametre annonce : c'est lui que le plan montre et que l'ombre suit.
    const dist = Math.max(0, Math.min(r * p.etalement * (0.8 + alea() * 0.4), r - rayon));
    // Les satellites s'etagent sur la hauteur ; un port etale ou parasol les garde en couronne.
    const t = port === 'etale' || port === 'parasol' ? 0.55 + alea() * 0.3 : 0.25 + (i / Math.max(1, n - 1)) * 0.6 + alea() * 0.12;
    const y = hauteur * t;
    const ry = rayon * p.aplatissement;
    lobes.push({ x: Math.cos(angle) * dist, y, z: Math.sin(angle) * dist, rx: rayon, ry, rz: rayon });
    branches.push({ de: { x: 0, y: -0.05, z: 0 }, a: { x: Math.cos(angle) * dist * 0.9, y: y - ry * 0.3, z: Math.sin(angle) * dist * 0.9 }, rayon: Math.max(0.03, r * 0.035) });
  }
  return { lobes, branches, hauteur };
}

/** Le houppier d'un objet du plan, tire de sa cle. */
export function houppierDe(o: Pick<ObjetPlan, 'key' | 'portArbre' | 'diametreArbre'>): Houppier {
  const d = o.diametreArbre !== undefined && o.diametreArbre !== null && o.diametreArbre > 0 ? o.diametreArbre : DIAMETRE_DEFAUT_M;
  return houppier(portDe(o), d, graineDe(o.key));
}

/* ------------------------------------------------------------------------------------------------
 * Les feuilles, pour la vue de pres
 * --------------------------------------------------------------------------------------------- */

/** Eclaircissement du dessus et assombrissement du dessous du feuillage. */
export const TON_CLAIR = 1.22;
export const TON_SOMBRE = 0.68;

/** La couleur d'un point du feuillage selon la hauteur de sa normale : clair dessus, sombre dessous. */
export function tonDuSommet(base: [number, number, number], normaleY: number): [number, number, number] {
  const t = (normaleY + 1) / 2;
  const k = TON_SOMBRE + (TON_CLAIR - TON_SOMBRE) * t;
  return [Math.min(1, base[0] * k), Math.min(1, base[1] * k), Math.min(1, base[2] * k)];
}

/** Au plus tant de feuilles par arbre : au-dela, la vue de pres n'y gagne rien et la memoire si. */
export const MAX_FEUILLES_PAR_ARBRE = 900;
/** Feuilles par metre carre de surface de houppier, avant le plafond. */
export const DENSITE_FEUILLES_M2 = 14;
/** Part de la surface que les feuilles couvrent : leur taille s'en deduit. */
const COUVERTURE = 0.35;
/** Bornes de la longueur d'une feuille, en metres : lisible de pres, jamais une tuile. */
export const TAILLE_FEUILLE_MIN_M = 0.08;
export const TAILLE_FEUILLE_MAX_M = 0.4;
/** Un point est dans un autre lobe sous cette valeur de l'equation de l'ellipsoide : la feuille y serait cachee. */
const DEDANS = 0.92;

/** Une feuille : son point d'attache, la normale de la surface, sa rotation, sa taille et sa nuance. */
export interface Feuille {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  /** Rotation autour de la normale, en radians. */
  spin: number;
  /** Ecart au decollement commun (`LEVEE_FEUILLE` du gabarit), en radians, de part et d'autre. */
  inclinaison: number;
  /** Facteur de taille, autour de 1. */
  echelle: number;
  /** Facteur de clarte, autour de 1 : deux feuilles voisines ne sont pas du meme vert. */
  teinte: number;
}
export interface Feuillage {
  feuilles: Feuille[];
  /** Longueur d'une feuille d'echelle 1, en metres. */
  taille: number;
  /** Une feuille large, ou une aiguille (conifere). */
  forme: 'feuille' | 'aiguille';
}

/** Aire approchee d'un ellipsoide (formule de Knud Thomsen, a 1 % pres). */
export function aireEllipsoide(l: Pick<Lobe, 'rx' | 'ry' | 'rz'>): number {
  const p = 1.6075;
  const a = Math.pow(l.rx, p), b = Math.pow(l.ry, p), c = Math.pow(l.rz, p);
  return 4 * Math.PI * Math.pow((a * b + a * c + b * c) / 3, 1 / p);
}

/** La valeur de l'equation de l'ellipsoide en un point : < 1 dedans, 1 sur la surface. */
export function dansLobe(l: Lobe, x: number, y: number, z: number): number {
  return ((x - l.x) / l.rx) ** 2 + ((y - l.y) / l.ry) ** 2 + ((z - l.z) / l.rz) ** 2;
}

/**
 * Les feuilles d'un houppier, tirees de `graine` : reparties sur la surface de chaque lobe au
 * prorata de son aire, sans celles qui tomberaient dans un autre lobe (on ne les verrait pas), un
 * peu ecartees vers l'exterieur. Un conifere porte des aiguilles sur son cone. Leur nombre suit la
 * surface, plafonne ; leur taille, ce qu'il faut pour couvrir le houppier aux deux tiers.
 */
export function feuillesDuHouppier(h: Houppier, port: PortArbre, graine: number): Feuillage {
  // Une suite a part de celle du houppier : changer le nombre de feuilles ne deplace pas les lobes.
  const alea = tirage(((graine * 31 + 7) % 2147483646) + 1);
  const conique = port === 'conique';
  const aires = h.lobes.map((l) => (conique ? Math.PI * l.rx * Math.hypot(l.rx, l.ry * 2) : aireEllipsoide(l)));
  const aireTotale = aires.reduce((s, a) => s + a, 0);
  const total = Math.min(MAX_FEUILLES_PAR_ARBRE, Math.round(aireTotale * DENSITE_FEUILLES_M2));
  const taille = Math.max(TAILLE_FEUILLE_MIN_M, Math.min(TAILLE_FEUILLE_MAX_M, Math.sqrt((aireTotale * COUVERTURE) / Math.max(1, total)) * (conique ? 1.4 : 1)));
  const feuilles: Feuille[] = [];
  h.lobes.forEach((l, i) => {
    const voulues = Math.round((total * (aires[i] ?? 0)) / Math.max(1e-9, aireTotale));
    let posees = 0;
    for (let essai = 0; essai < voulues * 3 && posees < voulues; essai++) {
      let x: number, y: number, z: number, nx: number, ny: number, nz: number;
      if (conique) {
        // Sur le flanc du cone, a aire egale : plus de points pres de la base, plus large.
        const t = 1 - Math.sqrt(alea());
        const a = alea() * Math.PI * 2;
        const rayon = l.rx * (1 - t);
        const hauteur = l.ry * 2;
        x = l.x + Math.cos(a) * rayon; y = l.y - l.ry + t * hauteur; z = l.z + Math.sin(a) * rayon;
        const n = Math.hypot(hauteur, l.rx);
        nx = (Math.cos(a) * hauteur) / n; ny = l.rx / n; nz = (Math.sin(a) * hauteur) / n;
      } else {
        // Une direction au hasard, portee sur l'ellipsoide ; la normale est le gradient.
        const uz = alea() * 2 - 1, phi = alea() * Math.PI * 2, s = Math.sqrt(1 - uz * uz);
        const ux = s * Math.cos(phi), uy = uz, uw = s * Math.sin(phi);
        x = l.x + l.rx * ux; y = l.y + l.ry * uy; z = l.z + l.rz * uw;
        const gx = ux / l.rx, gy = uy / l.ry, gz = uw / l.rz, g = Math.hypot(gx, gy, gz);
        nx = gx / g; ny = gy / g; nz = gz / g;
        if (h.lobes.some((m, j) => j !== i && dansLobe(m, x, y, z) < DEDANS)) continue;
      }
      const decolle = taille * (0.05 + alea() * 0.15);
      feuilles.push({
        x: x + nx * decolle, y: y + ny * decolle, z: z + nz * decolle, nx, ny, nz,
        spin: alea() * Math.PI * 2, inclinaison: (alea() * 2 - 1) * 0.2, echelle: 0.75 + alea() * 0.5, teinte: 0.9 + alea() * 0.25,
      });
      posees++;
    }
  });
  return { feuilles, taille, forme: conique ? 'aiguille' : 'feuille' };
}
