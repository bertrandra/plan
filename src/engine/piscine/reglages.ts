// La piscine, ses reglages : libelles, regles de metier, valeurs par defaut (piscineDe).
// Un morceau de engine/piscine.ts, qui les reexporte tous : le reste du programme importe depuis lui.

import { chiffreFrGroupe } from '../../util/format.js';
import { au } from '../../util/tableaux.js';
import { dist } from '../../geometry/basic.js';
import { ESSENCE_PRICES } from '../bois/essences.js';
import type { ChauffagePiscine, FondPiscine, ImplantationPiscine, LocalTechniquePiscine, ObjetPlan, Piscine, PlagePiscine, PtBrut, RevetementPiscine, SecuritePiscine, StructurePiscine, TraitementPiscine } from '../../model/types.js';

// Les chiffres du dossier et du plan : sans les donnees de langue du moteur, le meme texte sur toute machine (util/format.ts).
export const fr = (v: number, d = 2): string => chiffreFrGroupe(v, d);

// ---- Libelles ---------------------------------------------------------------------------------

export const LIBELLE_IMPLANTATION: Record<ImplantationPiscine, string> = {
  enterree: 'Enterrée', 'semi-enterree': 'Semi-enterrée', 'hors-sol': 'Hors-sol'
};
export const LIBELLE_STRUCTURE: Record<StructurePiscine, string> = {
  coque: 'Coque polyester', maconnerie: 'Maçonnerie (blocs à bancher)', kit: 'Kit panneaux (bois ou acier)'
};
export const LIBELLE_REVETEMENT: Record<RevetementPiscine, string> = {
  liner: 'Liner', 'membrane-armee': 'Membrane armée', carrelage: 'Carrelage', enduit: 'Enduit', gelcoat: 'Gelcoat (coque)'
};
export const LIBELLE_FOND: Record<FondPiscine, string> = {
  plat: 'Fond plat', pente: 'Pente régulière', fosse: 'Plat puis fosse à plonger'
};
export const LIBELLE_PLAGE: Record<PlagePiscine, string> = {
  aucune: 'Aucune (gazon, gravier)', terrasse: 'Terrasse bois du plan', 'terrasse-bois': 'Terrasse en bois', dallage: 'Dallage sur dalle béton'
};
/**
 * La piscine dessine-t-elle et chiffre-t-elle elle-meme sa plage ? Oui pour un dallage et pour la
 * plage en bois calculee des projets anterieurs ; non pour une terrasse du plan, objet a part.
 */
export const plageCalculee = (plage: PlagePiscine): boolean => plage === 'dallage' || plage === 'terrasse-bois';
export const LIBELLE_SECURITE: Record<SecuritePiscine, string> = {
  barriere: 'Barrière (NF P90-306)', alarme: 'Alarme (NF P90-307)', couverture: 'Couverture ou volet (NF P90-308)', abri: 'Abri (NF P90-309)'
};
export const LIBELLE_TRAITEMENT: Record<TraitementPiscine, string> = {
  chlore: 'Chlore', sel: 'Électrolyse au sel', brome: 'Brome', 'oxygene-actif': 'Oxygène actif'
};
export const LIBELLE_CHAUFFAGE: Record<ChauffagePiscine, string> = {
  aucun: 'Aucun', pac: 'Pompe à chaleur', solaire: 'Capteurs solaires', echangeur: 'Échangeur sur chaudière'
};
export const LIBELLE_LOCAL: Record<LocalTechniquePiscine, string> = {
  coffre: 'Coffre de filtration posé', enterre: 'Local technique enterré préfabriqué', maconne: 'Local technique maçonné', existant: 'Local existant'
};

/** Les revetements qu'une structure admet : une coque est deja finie, le reste choisit. */
export const REVETEMENTS_PAR_STRUCTURE: Record<StructurePiscine, RevetementPiscine[]> = {
  coque: ['gelcoat'],
  maconnerie: ['liner', 'membrane-armee', 'carrelage', 'enduit'],
  kit: ['liner', 'membrane-armee']
};

// ---- Regles de metier (constantes) ----------------------------------------------------------

/** Revanche : du plan d'eau au haut des parois, en metres. */
export const REVANCHE_M = 0.10;
/** Vitesse de filtration retenue pour un filtre a sable, en m/h, et les diametres du commerce (mm). */
export const VITESSE_FILTRATION_M_H = 50;
export const DIAMETRES_FILTRE_MM = [400, 500, 600, 750, 900];
/** Un skimmer pour 25 m² de plan d'eau, une buse de refoulement pour 15 m², un projecteur pour 25 m². */
export const M2_PAR_SKIMMER = 25;
export const M2_PAR_REFOULEMENT = 15;
export const M2_PAR_PROJECTEUR = 25;
/** Volume d'eau par kilowatt de pompe a chaleur, en m³/kW : six, pour une saison d'avril a septembre. */
export const M3_PAR_KW_PAC = 6;
/** Valeur forfaitaire de la taxe d'amenagement pour un bassin, en euros par m² (loi de finances 2023). */
export const TAXE_AMENAGEMENT_M2 = 250;
/** Seuils d'urbanisme : aucune formalite sous 10 m², declaration prealable jusqu'a 100 m², permis au-dela. */
export const SEUIL_SANS_FORMALITE_M2 = 10;
export const SEUIL_PERMIS_M2 = 100;
/** Hauteur d'un abri au-dela de laquelle il releve du permis de construire. */
export const HAUTEUR_ABRI_PERMIS_M = 1.8;
/** Charges retenues pour la plage : exploitation 250 kg/m², poids propre d'un platelage 40 kg/m². */
export const CHARGE_PLAGE_KG_M2 = 250;
export const POIDS_PROPRE_PLAGE_KG_M2 = 40;

/** Epaisseurs et surlargeurs par structure, en metres. */
interface ProfilStructure {
  /** Epaisseur des parois. */
  paroi: number;
  /** Ce qu'il y a sous le fond : radier, lit de pose, dalle. */
  fond: number;
  /** Largeur de travail autour des parois, pour la fouille. */
  surlargeurFouille: number;
  /** Hauteur hors-sol admise sans etude particuliere. */
  horsSolMax: number;
}
export const PROFILS_STRUCTURE: Record<StructurePiscine, ProfilStructure> = {
  coque: { paroi: 0.01, fond: 0.20, surlargeurFouille: 0.50, horsSolMax: 0.6 },
  maconnerie: { paroi: 0.27, fond: 0.25, surlargeurFouille: 0.60, horsSolMax: 1.5 },
  kit: { paroi: 0.05, fond: 0.15, surlargeurFouille: 0.40, horsSolMax: 1.6 }
};

/** Foisonnement des terres extraites. */
export const FOISONNEMENT = 1.3;
/** Epaisseur d'une margelle, pour la coupe et la 3D. */
export const EPAISSEUR_MARGELLE_M = 0.04;
/** Longueur d'une margelle courante. */
export const LONGUEUR_MARGELLE_M = 0.5;

/** Les pieces de la plage en bois : lames de 27 x 145, lambourdes 45 x 70 sur plots, solives 63 x 175 sur poteaux. */
export const PLAGE = {
  lameEpaisseur: 27, lameLargeur: 0.145, jeu: 0.006,
  lambourde: { section: '45x70', h: 0.07 },
  solive: { section: '63x175', h: 0.175, entraxe: 0.5 },
  poutre: { section: '75x200', h: 0.2, entraxe: 2.0 },
  poteau: { section: '120x120' },
  plot: { hauteurMin: 0.03 },
  massif: { cote: 0.4, profondeur: 0.5 }
};

// ---- Reglages --------------------------------------------------------------------------------

export type ReglagesPiscine = Required<Omit<Piscine, 'cotePetitBain' | 'terrasseKey'>> & { cotePetitBain: number };

const indiceValide = (i: number | undefined, n: number): i is number => i !== undefined && Number.isInteger(i) && i >= 0 && i < n;
const dans = <T extends string>(v: string | undefined, liste: readonly T[], defaut: T): T => (v && (liste as readonly string[]).includes(v) ? v as T : defaut);
const positif = (v: number | undefined, defaut: number, min = 0, max = Infinity): number => (v !== undefined && Number.isFinite(v) && v >= min && v <= max ? v : defaut);

/** Le plus court cote : le petit bain d'un bassin rectangulaire est sur une largeur. */
function plusCourtCote(pts: PtBrut[]): number {
  let best = 0, L = Infinity;
  pts.forEach((p, i) => { const d = dist(p, au(pts, (i + 1) % pts.length)); if (d < L - 1e-9) { L = d; best = i; } });
  return best;
}

/** Les reglages complets d'une piscine : ce que l'objet porte, et les valeurs par defaut pour le reste. */
export function piscineDe(o: ObjetPlan): ReglagesPiscine {
  const p = o.piscine || {};
  const implantation = dans(p.implantation, Object.keys(LIBELLE_IMPLANTATION) as ImplantationPiscine[], 'enterree');
  const horsSol = implantation === 'hors-sol';
  const structure = dans(p.structure, Object.keys(LIBELLE_STRUCTURE) as StructurePiscine[], horsSol ? 'kit' : 'coque');
  const revetements = REVETEMENTS_PAR_STRUCTURE[structure];
  const revetement = dans(p.revetement, revetements, au(revetements, 0));
  const pts = o.type === 'polygon' ? o.pts : [];
  // Un bassin rond n'a pas de cote : son fond est plat.
  const fond: FondPiscine = o.type === 'circle' ? 'plat' : dans(p.fond, Object.keys(LIBELLE_FOND) as FondPiscine[], 'plat');
  const profondeurPetitBain = positif(p.profondeurPetitBain, horsSol ? 1.2 : 1.2, 0.3, 4);
  const profondeurGrandBain = Math.max(profondeurPetitBain, positif(p.profondeurGrandBain, fond === 'fosse' ? 2.2 : 1.8, 0.3, 4));
  // Hors-sol, les parois montent juste au-dessus de l'eau la plus profonde du bassin.
  const profondeurMax = fond === 'plat' ? profondeurPetitBain : profondeurGrandBain;
  const hauteurHorsSol = implantation === 'enterree' ? 0
    : positif(p.hauteurHorsSol, horsSol ? Math.round((profondeurMax + REVANCHE_M + 0.02) * 100) / 100 : 0.6, 0.1, 2.5);
  // Un kit hors-sol porte sa propre margelle : il n'y a pas de margelle a poser.
  const margelle = p.margelle !== undefined ? !!p.margelle : !(horsSol && structure === 'kit');
  const plage = dans(p.plage, Object.keys(LIBELLE_PLAGE) as PlagePiscine[], 'aucune');
  return {
    implantation, structure, revetement, fond, profondeurPetitBain, profondeurGrandBain,
    cotePetitBain: indiceValide(p.cotePetitBain, pts.length) ? p.cotePetitBain : (pts.length ? plusCourtCote(pts) : 0),
    partFosse: positif(p.partFosse, 0.4, 0.2, 0.7),
    hauteurHorsSol,
    margelle,
    largeurMargelle: positif(p.largeurMargelle, 0.33, 0.2, 1),
    plage,
    largeurPlage: positif(p.largeurPlage, 1.5, 0.3, 10),
    essencePlage: p.essencePlage && p.essencePlage in ESSENCE_PRICES ? p.essencePlage : 'pin-classe4',
    tempsRecyclage: positif(p.tempsRecyclage, 4, 1, 12),
    traitement: dans(p.traitement, Object.keys(LIBELLE_TRAITEMENT) as TraitementPiscine[], 'chlore'),
    chauffage: dans(p.chauffage, Object.keys(LIBELLE_CHAUFFAGE) as ChauffagePiscine[], 'aucun'),
    eclairage: p.eclairage !== undefined ? !!p.eclairage : true,
    securite: dans(p.securite, Object.keys(LIBELLE_SECURITE) as SecuritePiscine[], 'alarme'),
    local: dans(p.local, Object.keys(LIBELLE_LOCAL) as LocalTechniquePiscine[], horsSol ? 'coffre' : 'enterre'),
    distanceLocal: positif(p.distanceLocal, 5, 0.5, 60),
    couleurEau: p.couleurEau || o.fill || '#5bb7e6',
    couleurMargelle: p.couleurMargelle || '#d9d2c3',
    couleurPlage: p.couleurPlage || (plage === 'dallage' ? '#cfc8bb' : '#c9a15a'),
    prix: p.prix || {}
  };
}
