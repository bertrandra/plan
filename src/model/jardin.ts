// Le jardin du plan (lot L3 de la lecture IA elargie) : la plate-bande et le massif plante, l'equipement du jardin (regard,
// eclairage, robinet), et les objets que la lecture du jardin propose (facade/regles/jardin.ts). Une seule fois ici : leurs
// vocabulaires et leurs libelles, la lecture tolerante d'un fichier, et la forme d'un objet neuf.
//
// Un massif sans sous-objet `massif` reste le bloc d'avant (une haie de l'IGN, un ancien fichier) : rien n'y pousse en 3D, et un
// projet qui n'en a pas garde exactement sa forme (empreintes). Un equipement sans `equipement` est celui d'avant : un spa ou un
// jacuzzi, sous lequel la terrasse se renforce (engine/structure.ts, `findSpaZones`) ; un regard, un eclairage ou un robinet ne
// la charge pas.

import type { ChampsEquipement, ChampsMassif, ContenuMassif, NatureEquipement, NatureMassif, ObjetPlan, PtBrut } from './types.js';
import { estOuvrage, EQUIPEMENT, MASSIF } from './ouvrages/index.js';

export const NATURES_MASSIF: readonly { id: NatureMassif; libelle: string }[] = [
  { id: 'massif', libelle: 'Massif planté' },
  { id: 'plate-bande', libelle: 'Plate-bande' },
];

export const CONTENUS_MASSIF: readonly { id: ContenuMassif; libelle: string }[] = [
  { id: 'fleurs', libelle: 'Fleurs' },
  { id: 'arbustes', libelle: 'Arbustes' },
  { id: 'vivaces', libelle: 'Vivaces' },
  { id: 'mixte', libelle: 'Mixte' },
  { id: 'potager', libelle: 'Potager' },
];

export const NATURES_EQUIPEMENT: readonly { id: NatureEquipement; libelle: string }[] = [
  { id: 'regard', libelle: 'Regard' },
  { id: 'eclairage', libelle: 'Éclairage' },
  { id: 'robinet', libelle: 'Robinet' },
];

/** La hauteur d'une plate-bande : la terre au ras de sa bordure, juste au-dessus du sol. */
export const HAUTEUR_PLATE_BANDE_M = 0.12;
/** Un mini-arbre ne depasse pas cette hauteur, quelle que soit son essence : c'est un arbre nain de massif. */
export const HAUTEUR_MINI_ARBRE_MAX_M = 2.5;
/** Le cote d'un regard neuf : la plaque courante d'une chambre de visite (60 × 60 cm). */
export const COTE_REGARD_M = 0.6;

const dans = <T extends string>(liste: readonly { id: T }[], v: unknown): v is T => typeof v === 'string' && liste.some((x) => x.id === v);
const nombreFini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Un massif lu d'un fichier : ses champs connus, ou null s'il n'en a pas de lisible (le massif redevient le bloc d'avant). */
export function lireChampsMassif(v: unknown): ChampsMassif | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  if (!dans(NATURES_MASSIF, m.nature) || !dans(CONTENUS_MASSIF, m.contenu)) return null;
  const a = m.miniArbre as Record<string, unknown> | null | undefined;
  const mini = a && typeof a === 'object' && typeof a.espece === 'string' && nombreFini(a.hauteurM) && a.hauteurM > 0
    ? { espece: a.espece, hauteurM: Math.min(HAUTEUR_MINI_ARBRE_MAX_M, a.hauteurM) } : null;
  return { nature: m.nature, contenu: m.contenu, ...(m.vegetation === false ? { vegetation: false as const } : {}), ...(mini ? { miniArbre: mini } : {}) };
}

/** Un equipement du jardin lu d'un fichier, ou null (l'equipement d'avant). */
export function lireChampsEquipement(v: unknown): ChampsEquipement | null {
  const n = v && typeof v === 'object' ? (v as Record<string, unknown>).nature : undefined;
  return dans(NATURES_EQUIPEMENT, n) ? { nature: n } : null;
}

/**
 * L'interrupteur, en un seul endroit : la vegetation basse par defaut vaut-elle aussi pour un massif SANS sous-objet (un massif
 * d'avant, ceux de la demonstration) ? Non tant que le proprietaire n'en a pas decide : l'allumer change le .glb de la demonstration
 * (onze massifs), donc une version majeure (MD/RELEASE.md §2.1). Une haie de l'IGN (`bdtopo`) n'en recoit jamais.
 */
export const VEGETATION_POUR_TOUS_LES_MASSIFS = false;
/** Ce qu'un massif d'avant ferait pousser si l'interrupteur etait allume. */
const MASSIF_PAR_DEFAUT: ChampsMassif = { nature: 'massif', contenu: 'mixte' };

/** Le massif plante d'un objet : un massif qui porte son sous-objet (ou tout massif dessine, interrupteur allume) ; null sinon. */
export function massifPlante(o: ObjetPlan): ChampsMassif | null {
  if (!estOuvrage(o, MASSIF)) return null;
  if (o.massif) return o.massif;
  return VEGETATION_POUR_TOUS_LES_MASSIFS && !o.bdtopo ? MASSIF_PAR_DEFAUT : null;
}

/** La vegetation basse de l'objet se dessine-t-elle en 3D ? Un massif plante, sauf si on l'a retiree. */
export const vegetationVisible = (o: ObjetPlan): boolean => { const m = massifPlante(o); return !!m && m.vegetation !== false; };

/** L'equipement du jardin d'un objet, ou null (un equipement d'avant, ou un autre objet). */
export const equipementDuJardin = (o: ObjetPlan): ChampsEquipement | null => (estOuvrage(o, EQUIPEMENT) && o.equipement ? o.equipement : null);

/** Un equipement qui charge la terrasse sous lui (spa, jacuzzi) : celui d'avant, sans nature de jardin. */
export const equipementPorte = (o: ObjetPlan): boolean => estOuvrage(o, EQUIPEMENT) && !o.equipement && o.existant !== true;

export const libelleNatureMassif = (n: NatureMassif): string => NATURES_MASSIF.find((x) => x.id === n)?.libelle ?? n;
export const libelleContenu = (c: ContenuMassif): string => CONTENUS_MASSIF.find((x) => x.id === c)?.libelle ?? c;
export const libelleEquipement = (n: NatureEquipement): string => NATURES_EQUIPEMENT.find((x) => x.id === n)?.libelle ?? n;

/** Les couleurs d'un objet neuf du jardin, au plan : la terre d'une plate-bande, la fonte d'un regard. */
export const APPARENCES_JARDIN = {
  plateBande: { fill: '#7a5a3a', stroke: '#4a3520' },
  massif: { fill: '#6f8f4e', stroke: '#3f5c33' },
  potager: { fill: '#8a6a44', stroke: '#4a3520' },
  regard: { fill: '#7b7f84', stroke: '#33363a' },
  eclairage: { fill: '#e8d68a', stroke: '#5c5020' },
  robinet: { fill: '#9fb7c9', stroke: '#2e4a5c' },
} as const;

const champsCommuns = (key: string, name: string, fill: string, stroke: string) => ({
  key, name, fill, fillOpacity: 1, stroke, showName: false, showSegNames: false, showVertNames: false, showDims: false, showAngles: false,
  constrained: false, matiere: '', priority: 2, locked: false,
});

/** Un polygone neuf, ses noms de sommets et de cotes poses comme la normalisation les poserait. */
function polygone(pts: readonly PtBrut[]) {
  return { type: 'polygon' as const, pts: pts.map((p) => ({ x: p.x, y: p.y })), vertexNames: pts.map((_, i) => 'Point ' + (i + 1)), segmentNames: pts.map((_, i) => 'Cote ' + (i + 1)), frozenVertices: pts.map(() => false) };
}

/** Un carre de `cote` metres centre sur `c`. */
export function carre(c: PtBrut, cote: number): PtBrut[] {
  const d = cote / 2;
  return [{ x: c.x - d, y: c.y - d }, { x: c.x + d, y: c.y - d }, { x: c.x + d, y: c.y + d }, { x: c.x - d, y: c.y + d }];
}

/** Une plate-bande ou un massif plante neuf, sur ce contour. */
export function nouveauMassif(key: string, pts: readonly PtBrut[], m: ChampsMassif, name?: string): ObjetPlan {
  const ap = m.contenu === 'potager' ? APPARENCES_JARDIN.potager : m.nature === 'plate-bande' ? APPARENCES_JARDIN.plateBande : APPARENCES_JARDIN.massif;
  const nom = name ?? (m.contenu === 'potager' ? 'Potager' : libelleNatureMassif(m.nature));
  return {
    ...champsCommuns(key, nom, ap.fill, ap.stroke), ...polygone(pts), fonction: 'massif', massif: JSON.parse(JSON.stringify(m)) as ChampsMassif,
    ...(m.nature === 'plate-bande' ? { elevation: HAUTEUR_PLATE_BANDE_M } : {}),
  } as ObjetPlan;
}

/** Un equipement du jardin neuf : un regard est un carre de 60 cm, un eclairage ou un robinet un petit cercle. */
export function nouvelEquipement(key: string, c: PtBrut, nature: NatureEquipement): ObjetPlan {
  const ap = APPARENCES_JARDIN[nature];
  const commun = { ...champsCommuns(key, libelleEquipement(nature), ap.fill, ap.stroke), fonction: 'equipement', equipement: { nature } };
  if (nature === 'regard') return { ...commun, ...polygone(carre(c, COTE_REGARD_M)), elevation: 0.02 } as ObjetPlan;
  return { ...commun, type: 'circle', center: { x: c.x, y: c.y }, r: nature === 'eclairage' ? 0.12 : 0.1, elevation: nature === 'eclairage' ? 0.8 : 0.6 } as ObjetPlan;
}
