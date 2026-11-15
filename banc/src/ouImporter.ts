// « Ou importer ensuite » (demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 8) : la ou le jeu est pauvre. Une
// heuristique simple, sans modele : une liste fixe de vingt-six communes (une grande ville et une petite par region de la metropole),
// notees par ce qui manque au banc — la region d'abord, puis le type de batiment qu'on y trouve surtout (des immeubles au centre d'une
// grande ville, des maisons dans une petite) — et gardees seulement si Panoramax y a des photos (une requete par commune, a la
// demande). La saison ne depend pas du lieu : l'ecran dit seulement ce qu'il en est. Sans DOM, testable seul.

import type { Equilibre } from './equilibre.js';
import { zoneAutour, type Zone } from './lot.js';
import { urlRechercheEmprise } from './panoramax.js';

export interface Lieu { nom: string; region: string; lat: number; lon: number; type: 'immeuble' | 'maison' }

/**
 * Le centre de chaque commune, tel que le geocodage de la Geoplateforme le donne (15 novembre 2026) ; pour Ajaccio, Corte et Marseille,
 * dont ce point tombe loin du bourg (vu a Corte : quatorze batiments pour trois mille photos), le centre-ville.
 */
export const LIEUX: readonly Lieu[] = [
  { nom: 'Lyon', region: 'Auvergne-Rhône-Alpes', lat: 45.758, lon: 4.835, type: 'immeuble' }, { nom: 'Riom', region: 'Auvergne-Rhône-Alpes', lat: 45.8915, lon: 3.1319, type: 'maison' },
  { nom: 'Dijon', region: 'Bourgogne-Franche-Comté', lat: 47.332, lon: 5.0336, type: 'immeuble' }, { nom: 'Beaune', region: 'Bourgogne-Franche-Comté', lat: 47.0254, lon: 4.8409, type: 'maison' },
  { nom: 'Rennes', region: 'Bretagne', lat: 48.1109, lon: -1.6837, type: 'immeuble' }, { nom: 'Vitré', region: 'Bretagne', lat: 48.1114, lon: -1.1926, type: 'maison' },
  { nom: 'Orléans', region: 'Centre-Val de Loire', lat: 47.8736, lon: 1.9114, type: 'immeuble' }, { nom: 'Vendôme', region: 'Centre-Val de Loire', lat: 47.7958, lon: 1.0627, type: 'maison' },
  { nom: 'Ajaccio', region: 'Corse', lat: 41.9192, lon: 8.7386, type: 'immeuble' }, { nom: 'Corte', region: 'Corse', lat: 42.3063, lon: 9.15, type: 'maison' },
  { nom: 'Strasbourg', region: 'Grand Est', lat: 48.5798, lon: 7.7615, type: 'immeuble' }, { nom: 'Sélestat', region: 'Grand Est', lat: 48.264, lon: 7.4518, type: 'maison' },
  { nom: 'Lille', region: 'Hauts-de-France', lat: 50.631, lon: 3.0454, type: 'immeuble' }, { nom: 'Arras', region: 'Hauts-de-France', lat: 50.2879, lon: 2.7683, type: 'maison' },
  { nom: 'Paris', region: 'Île-de-France', lat: 48.859, lon: 2.347, type: 'immeuble' }, { nom: 'Le Vésinet', region: 'Île-de-France', lat: 48.8947, lon: 2.1312, type: 'maison' },
  { nom: 'Rouen', region: 'Normandie', lat: 49.4401, lon: 1.0939, type: 'immeuble' }, { nom: 'Bayeux', region: 'Normandie', lat: 49.2782, lon: -0.7023, type: 'maison' },
  { nom: 'Bordeaux', region: 'Nouvelle-Aquitaine', lat: 44.8519, lon: -0.5879, type: 'immeuble' }, { nom: 'Périgueux', region: 'Nouvelle-Aquitaine', lat: 45.1931, lon: 0.7113, type: 'maison' },
  { nom: 'Toulouse', region: 'Occitanie', lat: 43.6041, lon: 1.4338, type: 'immeuble' }, { nom: 'Albi', region: 'Occitanie', lat: 43.9304, lon: 2.1363, type: 'maison' },
  { nom: 'Nantes', region: 'Pays de la Loire', lat: 47.2394, lon: -1.5553, type: 'immeuble' }, { nom: 'Saumur', region: 'Pays de la Loire', lat: 47.2618, lon: -0.0828, type: 'maison' },
  { nom: 'Marseille', region: 'Provence-Alpes-Côte d’Azur', lat: 43.2951, lon: 5.3744, type: 'immeuble' }, { nom: 'Manosque', region: 'Provence-Alpes-Côte d’Azur', lat: 43.8265, lon: 5.7902, type: 'maison' },
];

/** La zone proposee autour d'un lieu : un carre de ce cote (seize paves de 300 m), en metres. */
export const COTE_PROPOSE_M = 1200;
/** Combien de zones l'ecran propose, et combien de lieux il sonde au plus pour y arriver (une requete a Panoramax chacun). */
export const PROPOSITIONS_MAX = 5, SONDES_MAX = 10;

export interface Proposition { lieu: Lieu; score: number; raisons: string[] }

/**
 * Les lieux ranges par ce qui manque au banc. La region compte pour 60 points (pleins quand elle n'a aucune photo, la moitie avec une
 * seule…), le type de batiment pour 40 (pleins quand le banc n'en a aucun de ce type, nuls quand il en a la moitie ou plus). Un banc
 * sans mur connu ne dit rien des types : seule la region compte alors. Une seule proposition par region : cinq zones, cinq regions.
 */
export function ouImporter(e: Pick<Equilibre, 'region' | 'batiment' | 'total' | 'sansMur'>, lieux: readonly Lieu[] = LIEUX): Proposition[] {
  const parRegion = new Map(e.region.map((r) => [r.cle, r.n])), situees = e.region.reduce((s, r) => s + r.n, 0);
  const avecMur = e.total - e.sansMur, nType = (t: string) => e.batiment.find((b) => b.cle === t)?.n ?? 0;
  const tous = lieux.map((lieu): Proposition => {
    const n = parRegion.get(lieu.region) ?? 0, part = avecMur ? nType(lieu.type) / avecMur : null;
    const region = 60 / (1 + n), type = part === null ? 0 : 40 * Math.max(0, 1 - 2 * part);
    const raisons = [n ? `${n} photo(s) seulement en ${lieu.region}${situees ? ` (${Math.round((n / situees) * 100)} % du jeu)` : ''}` : `aucune photo en ${lieu.region}`];
    if (part !== null && part < 0.5) raisons.push(lieu.type === 'immeuble' ? `${Math.round(part * 100)} % d’immeubles dans le jeu` : `${Math.round(part * 100)} % de maisons dans le jeu`);
    return { lieu, score: Math.round(region + type), raisons };
  }).sort((a, b) => b.score - a.score || a.lieu.nom.localeCompare(b.lieu.nom, 'fr'));
  const vues = new Set<string>();
  return tous.filter((p) => (vues.has(p.lieu.region) ? false : (vues.add(p.lieu.region), true)));
}

/** La zone proposee pour un lieu, et la requete qui dit si Panoramax y a des photos (une seule photo demandee). */
export const zoneDuLieu = (l: Lieu): Zone => ({ ...zoneAutour(l, COTE_PROPOSE_M), nom: `${l.nom} (centre, ${(COTE_PROPOSE_M / 1000).toString().replace('.', ',')} km de côté)` });
export function urlSondeDuLieu(l: Lieu): string {
  const z = zoneAutour(l, 400).anneau;
  return urlRechercheEmprise({ sud: (z[0] as { lat: number }).lat, ouest: (z[0] as { lon: number }).lon, nord: (z[2] as { lat: number }).lat, est: (z[2] as { lon: number }).lon }, 1);
}
export const aDesPhotos = (json: unknown): boolean => (((json as { features?: unknown[] })?.features ?? []).length) > 0;

/** Ce que l'ecran dit de la saison : elle ne se choisit pas par le lieu, mais l'import en lot prefere deja l'hiver. */
export function avisDeSaison(e: Pick<Equilibre, 'saison' | 'sansFeuilles' | 'total' | 'sansDate'>): string | null {
  const datees = e.total - e.sansDate;
  if (datees < 10) return null;
  const part = Math.round((e.sansFeuilles / datees) * 100);
  return part < 30 ? `Seulement ${part} % des photos datées sont prises sans feuilles (novembre à mars) : l’import préfère déjà l’hiver quand un mur a plusieurs dates, mais il ne choisit pas la saison d’une rue.` : null;
}
