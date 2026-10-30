// Le jardin du plan (lot L3 de la lecture IA elargie, MD/spec-lecture-ia-elargie.md §4.4) : la plantation d'un massif (plate-bande ou
// massif plante), la nature d'un equipement (regard, eclairage, robinet), et les objets que la lecture du jardin propose
// (facade/regles/jardin.ts). Une seule fois ici : leurs vocabulaires et leurs libelles, la lecture tolerante d'un fichier, et la forme
// d'un objet neuf.
//
// Un massif sans `plantation` reste le bloc d'avant (une haie de l'IGN, un ancien fichier, les onze massifs de la demonstration) :
// rien n'y pousse en 3D, et un projet qui n'en a pas garde exactement sa forme (empreintes). Un equipement sans `nature` est un spa,
// sous lequel la terrasse se renforce (engine/structure.ts, `findSpaZones`) ; un regard, un eclairage ou un robinet ne la charge pas.

import type { FormePlantation, NatureEquipement, ObjetPlan, Plantation, PtBrut, TypePlantation } from './types.js';
import { estOuvrage, EQUIPEMENT, MASSIF } from './ouvrages/index.js';

export const FORMES_PLANTATION: readonly { id: FormePlantation; libelle: string }[] = [
  { id: 'massif', libelle: 'Massif planté' },
  { id: 'plate-bande', libelle: 'Plate-bande' },
];

export const TYPES_PLANTATION: readonly { id: TypePlantation; libelle: string }[] = [
  { id: 'fleurs', libelle: 'Fleurs' },
  { id: 'arbustes', libelle: 'Arbustes' },
  { id: 'vivaces', libelle: 'Vivaces' },
  { id: 'mixte', libelle: 'Mixte' },
  { id: 'potager', libelle: 'Potager' },
  { id: 'haie', libelle: 'Haie' },
];

/** Les natures d'un equipement que ce lot connait, et si elles chargent la terrasse (`findSpaZones` ne lit que celles-la). */
export const NATURES_EQUIPEMENT: readonly { id: NatureEquipement; libelle: string; charge: boolean }[] = [
  { id: 'spa', libelle: 'Spa, jacuzzi', charge: true },
  { id: 'regard', libelle: 'Regard', charge: false },
  { id: 'eclairage', libelle: 'Éclairage', charge: false },
  { id: 'robinet', libelle: 'Robinet', charge: false },
  // Lus sur une facade (lot L1) : poses contre le mur, ils ne chargent rien.
  { id: 'perron', libelle: 'Perron', charge: false },
  { id: 'unite-exterieure', libelle: 'Unité extérieure (climatisation, pompe à chaleur)', charge: false },
  { id: 'boite-aux-lettres', libelle: 'Boîte aux lettres', charge: false },
];

/** La hauteur d'une plate-bande : la terre au ras de sa bordure, juste au-dessus du sol. */
export const HAUTEUR_PLATE_BANDE_M = 0.12;
/** Un mini-arbre ne depasse pas cette hauteur, quelle que soit son essence : c'est un arbre nain de massif. */
export const HAUTEUR_MINI_ARBRE_MAX_M = 2.5;
/** Le cote d'un regard neuf : la plaque courante d'une chambre de visite (60 × 60 cm). */
export const COTE_REGARD_M = 0.6;

const dans = <T extends string>(liste: readonly { id: T }[], v: unknown): v is T => typeof v === 'string' && liste.some((x) => x.id === v);
const nombreFini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Une plantation lue d'un fichier : ses champs connus, ou null s'il n'en a pas de lisible (le massif redevient le bloc d'avant). */
export function lirePlantation(v: unknown): Plantation | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  if (!dans(TYPES_PLANTATION, m.type)) return null;
  const a = m.miniArbre as Record<string, unknown> | null | undefined;
  const mini = a && typeof a === 'object' && typeof a.espece === 'string' && nombreFini(a.hauteurM) && a.hauteurM > 0
    ? { espece: a.espece, hauteurM: Math.min(HAUTEUR_MINI_ARBRE_MAX_M, a.hauteurM) } : null;
  return { type: m.type, ...(dans(FORMES_PLANTATION, m.forme) ? { forme: m.forme } : {}), source: m.source === 'ia' ? 'ia' : 'main', ...(mini ? { miniArbre: mini } : {}) };
}

/** La nature d'un equipement lue d'un fichier, ou undefined (un spa). */
export const lireNatureEquipement = (v: unknown): NatureEquipement | undefined => (dans(NATURES_EQUIPEMENT, v) ? v : undefined);

/**
 * L'interrupteur, en un seul endroit : la vegetation basse par defaut vaut-elle aussi pour un massif SANS plantation (un massif
 * d'avant, ceux de la demonstration) ? Non tant que le proprietaire n'en a pas decide : l'allumer change le .glb de la demonstration
 * (onze massifs), donc une version majeure (MD/RELEASE.md §2.1). Une haie de l'IGN (`bdtopo`) n'en recoit jamais.
 */
export const VEGETATION_POUR_TOUS_LES_MASSIFS = false;
/** Ce qu'un massif d'avant ferait pousser si l'interrupteur etait allume. */
const PLANTATION_PAR_DEFAUT: Plantation = { type: 'mixte', source: 'main' };

/** La plantation d'un objet : un massif qui en porte une (ou tout massif dessine, interrupteur allume) ; null sinon. */
export function plantationDe(o: ObjetPlan): Plantation | null {
  if (!estOuvrage(o, MASSIF)) return null;
  if (o.plantation) return o.plantation;
  return VEGETATION_POUR_TOUS_LES_MASSIFS && !o.bdtopo ? PLANTATION_PAR_DEFAUT : null;
}

/**
 * La vegetation basse de l'objet se dessine-t-elle en 3D ? Une plantation, sauf une haie (un volume vert, comme celles de l'IGN) ou
 * une vegetation retiree (`vegetation3d: false`).
 */
export const vegetationVisible = (o: ObjetPlan): boolean => { const p = plantationDe(o); return !!p && p.type !== 'haie' && o.vegetation3d !== false; };

/** La nature de jardin d'un equipement (regard, eclairage, robinet), ou null (un spa, ou un autre objet). */
export const natureDuJardin = (o: ObjetPlan): Exclude<NatureEquipement, 'spa'> | null => (estOuvrage(o, EQUIPEMENT) && o.nature && o.nature !== 'spa' ? o.nature : null);

/** Un equipement qui charge la terrasse sous lui : un spa (nature absente ou `spa`), qui n'est pas deja la (`existant`). */
export const equipementPorte = (o: ObjetPlan): boolean => estOuvrage(o, EQUIPEMENT) && (NATURES_EQUIPEMENT.find((n) => n.id === (o.nature ?? 'spa'))?.charge ?? true) && o.existant !== true;

export const libelleForme = (f: FormePlantation): string => FORMES_PLANTATION.find((x) => x.id === f)?.libelle ?? f;
export const libelleEquipement = (n: NatureEquipement): string => NATURES_EQUIPEMENT.find((x) => x.id === n)?.libelle ?? n;

/** Les couleurs d'un objet neuf du jardin, au plan : la terre d'une plate-bande, la fonte d'un regard. */
export const APPARENCES_JARDIN = {
  plateBande: { fill: '#7a5a3a', stroke: '#4a3520' },
  massif: { fill: '#6f8f4e', stroke: '#3f5c33' },
  potager: { fill: '#8a6a44', stroke: '#4a3520' },
  haie: { fill: '#7FA86B', stroke: '#3F5C33' },
  regard: { fill: '#7b7f84', stroke: '#33363a' },
  eclairage: { fill: '#e8d68a', stroke: '#5c5020' },
  robinet: { fill: '#9fb7c9', stroke: '#2e4a5c' },
  perron: { fill: '#c9c2b4', stroke: '#6b645a' },
  'unite-exterieure': { fill: '#e4e6e8', stroke: '#5d6166' },
  'boite-aux-lettres': { fill: '#5b6a74', stroke: '#2b3338' },
} as const;

/**
 * Ce que pose un equipement lu sur une facade (lot L1), en metres : son emprise (largeur le long du mur, profondeur depuis lui) et sa
 * hauteur. La profondeur ne se lit pas sur une vue de face (decision 4) : ce sont des valeurs courantes, dites dans la proposition.
 */
export const EQUIPEMENTS_DE_FACADE = {
  perron: { profondeurM: 0.9, hauteurMarcheM: 0.17 },
  'unite-exterieure': { largeurM: 0.9, profondeurM: 0.35, hauteurM: 0.7 },
  'boite-aux-lettres': { largeurM: 0.4, profondeurM: 0.3, hauteurM: 1.2 },
} as const;
/** Un perron sans nombre de marches lu en a deux ; il n'en a jamais plus de huit. */
export const MARCHES_PERRON = { defaut: 2, max: 8 } as const;

const champsCommuns = (key: string, name: string, fill: string, stroke: string) => ({
  key, name, fill, fillOpacity: 1, stroke, showName: false, showSegNames: false, showVertNames: false, showDims: false, showAngles: false,
  constrained: false, matiere: '', priority: 2, locked: false,
});

/** Un polygone neuf, ses noms de sommets et de cotes poses comme la normalisation les poserait. */
export function polygoneNeuf(pts: readonly PtBrut[]) {
  return { type: 'polygon' as const, pts: pts.map((p) => ({ x: p.x, y: p.y })), vertexNames: pts.map((_, i) => 'Point ' + (i + 1)), segmentNames: pts.map((_, i) => 'Cote ' + (i + 1)), frozenVertices: pts.map(() => false) };
}

/** Un carre de `cote` metres centre sur `c`. */
export function carre(c: PtBrut, cote: number): PtBrut[] {
  const d = cote / 2;
  return [{ x: c.x - d, y: c.y - d }, { x: c.x + d, y: c.y - d }, { x: c.x + d, y: c.y + d }, { x: c.x - d, y: c.y + d }];
}

/** Un massif plante neuf (une plate-bande, un potager, une haie...), sur ce contour ; `elevation` : sa hauteur, sinon celle de sa forme. */
export function nouveauMassif(key: string, pts: readonly PtBrut[], p: Plantation, name?: string, elevation?: number): ObjetPlan {
  const ap = p.type === 'potager' ? APPARENCES_JARDIN.potager : p.type === 'haie' ? APPARENCES_JARDIN.haie : p.forme === 'plate-bande' ? APPARENCES_JARDIN.plateBande : APPARENCES_JARDIN.massif;
  const nom = name ?? (p.type === 'potager' ? 'Potager' : p.type === 'haie' ? 'Haie' : libelleForme(p.forme ?? 'massif'));
  const hauteur = elevation ?? (p.forme === 'plate-bande' ? HAUTEUR_PLATE_BANDE_M : undefined);
  return {
    ...champsCommuns(key, nom, ap.fill, ap.stroke), ...polygoneNeuf(pts), fonction: 'massif', plantation: JSON.parse(JSON.stringify(p)) as Plantation,
    ...(hauteur !== undefined ? { elevation: hauteur } : {}),
  } as ObjetPlan;
}

/** Un equipement du jardin neuf : un regard est un carre de 60 cm, un eclairage ou un robinet un petit cercle. */
export function nouvelEquipement(key: string, c: PtBrut, nature: 'regard' | 'eclairage' | 'robinet'): ObjetPlan {
  const ap = APPARENCES_JARDIN[nature];
  const commun = { ...champsCommuns(key, libelleEquipement(nature), ap.fill, ap.stroke), fonction: 'equipement', nature };
  if (nature === 'regard') return { ...commun, ...polygoneNeuf(carre(c, COTE_REGARD_M)), elevation: 0.02 } as ObjetPlan;
  return { ...commun, type: 'circle', center: { x: c.x, y: c.y }, r: nature === 'eclairage' ? 0.12 : 0.1, elevation: nature === 'eclairage' ? 0.8 : 0.6 } as ObjetPlan;
}

/**
 * Un equipement lu sur une facade (lot L1), pose contre son mur : `pts` son emprise (le rectangle contre le mur, de la facade vers
 * dehors) ; `elevation` sa hauteur (un perron : ses marches). Il ne charge rien (NATURES_EQUIPEMENT).
 */
export function equipementDeFacade(key: string, pts: readonly PtBrut[], nature: 'perron' | 'unite-exterieure' | 'boite-aux-lettres', elevation: number): ObjetPlan {
  const ap = APPARENCES_JARDIN[nature];
  return { ...champsCommuns(key, libelleEquipement(nature), ap.fill, ap.stroke), ...polygoneNeuf(pts), fonction: 'equipement', nature, elevation } as ObjetPlan;
}
