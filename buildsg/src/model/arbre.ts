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
