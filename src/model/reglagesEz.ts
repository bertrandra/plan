// Les reglages d'EZ-tree que l'ecran admin « Arbres » propose (zones/EcranArbres.tsx), decrits comme
// des donnees : un chemin dans `Tree.options`, un libelle, un type, des bornes. L'ecran n'ecrit pas
// un champ a la main ; il parcourt cette liste. Tout le reste des reglages d'EZ-tree reste atteignable
// par la zone « JSON » de l'ecran.
//
// Les noms des presets et des ecorces sont ceux d'EZ-tree 1.1.0 (`TreePreset`, `BarkType`, `LeafType`).

import type { ReglagesEz, ValeurReglage } from './especesArbre.js';

export type ChampEz =
  | { chemin: string; libelle: string; type: 'nombre'; min: number; max: number; pas: number; entier?: boolean; aide?: string }
  | { chemin: string; libelle: string; type: 'choix'; options: readonly { valeur: string; libelle: string }[]; aide?: string }
  | { chemin: string; libelle: string; type: 'couleur'; aide?: string }
  | { chemin: string; libelle: string; type: 'case'; aide?: string };

export interface GroupeEz { id: string; titre: string; champs: ChampEz[] }

const niveaux = (cle: string, libelle: string, niveauxListe: number[], min: number, max: number, pas: number, entier = false, aide?: string): ChampEz[] =>
  niveauxListe.map((n) => ({ chemin: 'branch.' + cle + '.' + n, libelle: libelle + (n === 0 ? ' — tronc' : ' — niveau ' + n), type: 'nombre' as const, min, max, pas, ...(entier ? { entier } : {}), ...(aide ? { aide } : {}) }));

export const GROUPES_EZ: GroupeEz[] = [
  {
    id: 'general', titre: 'Forme générale',
    champs: [
      { chemin: 'type', libelle: 'Type', type: 'choix', options: [{ valeur: 'deciduous', libelle: 'Feuillu' }, { valeur: 'evergreen', libelle: 'Conifère' }], aide: 'Un conifère n’a pas de branche terminale et s’effile en pointe' },
      { chemin: 'seed', libelle: 'Graine', type: 'nombre', min: 0, max: 999999, pas: 1, entier: true, aide: 'Change la forme sans changer les réglages ; chaque arbre du plan en tire trois variantes' },
      { chemin: 'branch.levels', libelle: 'Niveaux de branches', type: 'nombre', min: 0, max: 3, pas: 1, entier: true, aide: '0 : un tronc seul. Chaque niveau multiplie les triangles' },
      { chemin: 'branch.force.strength', libelle: 'Poussée vers le haut', type: 'nombre', min: -0.1, max: 0.1, pas: 0.005 }
    ]
  },
  {
    id: 'ecorce', titre: 'Écorce',
    champs: [
      { chemin: 'bark.type', libelle: 'Écorce', type: 'choix', options: [{ valeur: 'oak', libelle: 'Chêne' }, { valeur: 'birch', libelle: 'Bouleau' }, { valeur: 'pine', libelle: 'Pin' }, { valeur: 'willow', libelle: 'Saule' }] },
      { chemin: 'bark.tint', libelle: 'Teinte', type: 'couleur' },
      { chemin: 'bark.textured', libelle: 'Texture', type: 'case', aide: 'Décoché : l’écorce est de la couleur de la teinte, sans image (export plus léger)' },
      { chemin: 'bark.flatShading', libelle: 'Facettes', type: 'case' }
    ]
  },
  {
    id: 'tronc', titre: 'Tronc et branches',
    champs: [
      ...niveaux('length', 'Longueur', [0, 1, 2, 3], 0.1, 100, 0.5),
      ...niveaux('radius', 'Rayon', [0, 1, 2, 3], 0.01, 10, 0.05),
      ...niveaux('children', 'Branches filles', [0, 1, 2], 0, 20, 1, true),
      ...niveaux('angle', 'Angle', [1, 2, 3], 0, 180, 5),
      ...niveaux('gnarliness', 'Tourment', [0, 1, 2, 3], 0, 1, 0.01),
      ...niveaux('taper', 'Effilement', [0, 1, 2, 3], 0, 1, 0.05),
      ...niveaux('start', 'Départ sur la branche mère', [1, 2, 3], 0, 1, 0.05)
    ]
  },
  {
    id: 'finesse', titre: 'Finesse du maillage',
    champs: [
      ...niveaux('sections', 'Sections', [0, 1, 2, 3], 1, 24, 1, true, 'Tronçons le long de la branche : plus il y en a, plus elle est courbe — et plus elle pèse'),
      ...niveaux('segments', 'Côtés', [0, 1, 2, 3], 3, 16, 1, true, 'Côtés du tuyau : 3 suffit aux petites branches')
    ]
  },
  {
    id: 'feuilles', titre: 'Feuilles',
    champs: [
      { chemin: 'leaves.type', libelle: 'Feuille', type: 'choix', options: [{ valeur: 'oak', libelle: 'Chêne' }, { valeur: 'ash', libelle: 'Frêne' }, { valeur: 'aspen', libelle: 'Tremble' }, { valeur: 'pine', libelle: 'Pin (aiguilles)' }] },
      { chemin: 'leaves.billboard', libelle: 'Plans', type: 'choix', options: [{ valeur: 'double', libelle: 'Deux plans croisés' }, { valeur: 'single', libelle: 'Un plan' }], aide: 'Un plan : moitié moins de triangles' },
      { chemin: 'leaves.count', libelle: 'Feuilles par branche', type: 'nombre', min: 0, max: 100, pas: 1, entier: true },
      { chemin: 'leaves.size', libelle: 'Taille', type: 'nombre', min: 0.1, max: 20, pas: 0.1 },
      { chemin: 'leaves.sizeVariance', libelle: 'Variation de taille', type: 'nombre', min: 0, max: 1, pas: 0.05 },
      { chemin: 'leaves.angle', libelle: 'Angle', type: 'nombre', min: 0, max: 90, pas: 1 },
      { chemin: 'leaves.start', libelle: 'Départ sur la branche', type: 'nombre', min: 0, max: 1, pas: 0.05 },
      { chemin: 'leaves.tint', libelle: 'Teinte', type: 'couleur' },
      { chemin: 'leaves.alphaTest', libelle: 'Seuil de transparence', type: 'nombre', min: 0, max: 1, pas: 0.05 }
    ]
  }
];

export const NOMS_PRESETS_EZ = ['Ash Small', 'Ash Medium', 'Ash Large', 'Aspen Small', 'Aspen Medium', 'Aspen Large', 'Bush 1', 'Bush 2', 'Bush 3', 'Oak Small', 'Oak Medium', 'Oak Large', 'Pine Small', 'Pine Medium', 'Pine Large'] as const;

/** Lit la valeur au bout d'un chemin (`branch.length.0`), `undefined` si elle n'existe pas. */
export function lireChemin(reglages: ReglagesEz, chemin: string): ValeurReglage | undefined {
  let v: ValeurReglage | undefined = reglages;
  for (const cle of chemin.split('.')) {
    if (v === undefined || typeof v !== 'object') return undefined;
    v = (v as { [k: string]: ValeurReglage })[cle];
  }
  return v;
}

/** Une copie des reglages ou la valeur au bout du chemin est remplacee (les niveaux manquants se creent). */
export function ecrireChemin(reglages: ReglagesEz, chemin: string, valeur: ValeurReglage): ReglagesEz {
  const copie = JSON.parse(JSON.stringify(reglages)) as ReglagesEz;
  const cles = chemin.split('.');
  let courant = copie as { [k: string]: ValeurReglage };
  for (const cle of cles.slice(0, -1)) {
    const suite = courant[cle];
    if (!suite || typeof suite !== 'object') courant[cle] = {};
    courant = courant[cle] as { [k: string]: ValeurReglage };
  }
  courant[cles[cles.length - 1] ?? ''] = valeur;
  return copie;
}

/** Une teinte d'EZ-tree (un entier 0xRRGGBB) en `#rrggbb`, et inversement. */
export const teinteEnHex = (n: unknown): string => '#' + (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(0xffffff, Math.round(n))) : 0xffffff).toString(16).padStart(6, '0');
export const hexEnTeinte = (h: string): number => (/^#[0-9a-f]{6}$/i.test(h) ? parseInt(h.slice(1), 16) : 0xffffff);

/** Les niveaux de branches qui comptent : le tronc et les `levels` suivants. */
export const niveauActif = (chemin: string, reglages: ReglagesEz): boolean => {
  const m = /^branch\.\w+\.(\d)$/.exec(chemin);
  if (!m) return true;
  const levels = lireChemin(reglages, 'branch.levels');
  return Number(m[1]) <= (typeof levels === 'number' ? levels : 3);
};
