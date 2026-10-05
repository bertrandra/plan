// Piscine : le bassin, ses abords, sa filtration, son chiffrage et sa note de calcul (engine/).
//
// Une piscine est un polygone ou un cercle du plan de fonction `piscine`. Le contour est le bord
// interieur de l'eau (le nu interieur des parois) : la surface du plan d'eau, celle que l'urbanisme
// compte. Tout le reste s'en deduit vers l'exterieur : parois, margelles, plage, fouille.
//
// Le module repond a trois questions, dans l'ordre ou l'utilisateur les pose :
//   1. ou et comment est le bassin — enterre, semi-enterre ou hors-sol ; coque, maconnerie ou kit ;
//      fond plat, en pente ou a fosse — et ce qu'il contient d'eau ;
//   2. ce qu'il faut autour — margelles, plage en bois (avec sa structure et ses fondations) ou en
//      dallage — et ce qu'il faut dedans — filtration, eclairage, traitement, chauffage, securite ;
//   3. ce que cela coute (`chiffrerPiscine`), et ce que cela vaut comme dimensionnement
//      (`noteDeCalcul`) : volumes, hydraulique, structure de la plage, poussee de l'eau, regime
//      d'autorisation, distances aux limites.
//
// Les quantites sont des quantites d'avant-projet, posees sur des regles de metier (temps de
// recyclage de 4 h, vitesse de filtration de 50 m/h, un skimmer pour 25 m², NF DTU 51.4 pour la
// plage en bois). Les prix sont des ordres de grandeur TTC fourniture et pose, reglables poste par
// poste. Ce n'est ni une etude de sol, ni une note de calcul beton : la note le dit.

import { au } from '../util/tableaux.js';
import { centroid, dist, pointInPolygon, shoelace, signedArea } from '../geometry/basic.js';
import { clipLineToPolygon, polygonOffset } from '../geometry/polygon.js';
import { distancePointSegment, projectOntoSegment } from '../geometry/segments.js';
import { ESSENCE_PRICES, essenceDe, PLOT_ENTRAXE_MAX_M, PLOT_HAUTEUR_DTU_CM } from './constantes.js';
import { maxEntraxeLameCm, maxPorteeVisM } from './portees.js';
import { estPiscine, estTerrasse, parcelleDuProjet } from '../model/fonctions.js';
import type {
  ChauffagePiscine, FondPiscine, ImplantationPiscine, LigneBom, LocalTechniquePiscine, ObjetPlan, Piscine, PlagePiscine,
  PtBrut, RevetementPiscine, SecuritePiscine, StructurePiscine, TraitementPiscine
} from '../model/types.js';

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
  aucune: 'Aucune (gazon, gravier)', 'terrasse-bois': 'Terrasse en bois', dallage: 'Dallage sur dalle béton'
};
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
const FOISONNEMENT = 1.3;
/** Epaisseur d'une margelle, pour la coupe et la 3D. */
export const EPAISSEUR_MARGELLE_M = 0.04;
/** Longueur d'une margelle courante. */
const LONGUEUR_MARGELLE_M = 0.5;

/** Les pieces de la plage en bois : lames de 27 x 145, lambourdes 45 x 70 sur plots, solives 63 x 175 sur poteaux. */
const PLAGE = {
  lameEpaisseur: 27, lameLargeur: 0.145, jeu: 0.006,
  lambourde: { section: '45x70', h: 0.07 },
  solive: { section: '63x175', h: 0.175, entraxe: 0.5 },
  poutre: { section: '75x200', h: 0.2, entraxe: 2.0 },
  poteau: { section: '120x120' },
  plot: { hauteurMin: 0.03 },
  massif: { cote: 0.4, profondeur: 0.5 }
};

// ---- Reglages --------------------------------------------------------------------------------

export type ReglagesPiscine = Required<Omit<Piscine, 'cotePetitBain'>> & { cotePetitBain: number };

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

// ---- Geometrie -------------------------------------------------------------------------------

/** Un cercle en polygone de 48 cotes : assez fin pour les decalages et les coupes, assez court pour le plan. */
export const COTES_CERCLE = 48;

/** Le contour du plan d'eau, en polygone dans tous les cas. Vide si l'objet n'est pas une piscine utilisable. */
export function contourPiscine(o: ObjetPlan): PtBrut[] {
  if (o.type === 'circle') {
    if (!(o.r > 0.05)) return [];
    return Array.from({ length: COTES_CERCLE }, (_, i) => {
      const a = 2 * Math.PI * i / COTES_CERCLE;
      return { x: o.center.x + o.r * Math.cos(a), y: o.center.y + o.r * Math.sin(a) };
    });
  }
  if (o.type !== 'polygon' || o.pts.length < 3 || shoelace(o.pts) < 0.5) return [];
  return o.pts.map(p => ({ x: p.x, y: p.y }));
}

/** Decale un contour vers l'exterieur, sans jamais le retourner. */
export function elargir(contour: PtBrut[], d: number): PtBrut[] {
  if (d <= 1e-9) return contour.map(p => ({ ...p }));
  const off = polygonOffset(contour, -d);
  return off.length >= 3 && off.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) && Math.sign(signedArea(off)) === Math.sign(signedArea(contour)) ? off : contour.map(p => ({ ...p }));
}

export const perimetre = (pts: PtBrut[]): number => pts.reduce((s, p, i) => s + dist(p, au(pts, (i + 1) % pts.length)), 0);

/** L'axe des profondeurs : l'origine sur le cote du petit bain, `v` vers le grand bain, `L` la longueur du bassin dans ce sens. */
export interface AxeProfondeur { origine: PtBrut; u: PtBrut; v: PtBrut; L: number }

export function axeProfondeur(contour: PtBrut[], cotePetitBain: number): AxeProfondeur {
  const n = contour.length;
  const a = au(contour, cotePetitBain % n), b = au(contour, (cotePetitBain + 1) % n);
  const Lab = dist(a, b) || 1;
  const u = { x: (b.x - a.x) / Lab, y: (b.y - a.y) / Lab };
  const ccw = signedArea(contour) > 0;
  // Normale interieure : a gauche du sens de parcours pour un polygone trigonometrique.
  const v = ccw ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
  const L = Math.max(...contour.map(p => (p.x - a.x) * v.x + (p.y - a.y) * v.y));
  return { origine: a, u, v, L: Math.max(0.1, L) };
}

/** Un point du profil de fond : la distance `s` depuis le petit bain, la profondeur d'eau `z`. */
export interface PointProfil { s: number; z: number }

/** Le profil du fond le long de l'axe, en quelques points : ce que la coupe dessine. */
export function profilFond(r: ReglagesPiscine, L: number): PointProfil[] {
  const p1 = r.profondeurPetitBain, p2 = r.profondeurGrandBain;
  if (r.fond === 'plat' || p2 - p1 < 1e-6) return [{ s: 0, z: p1 }, { s: L, z: p1 }];
  if (r.fond === 'pente') return [{ s: 0, z: p1 }, { s: L, z: p2 }];
  // Fosse : plat, puis une descente sur la moitie de la part de fosse, puis le fond de fosse.
  const sDebut = L * (1 - r.partFosse), sFond = sDebut + L * r.partFosse / 2;
  return [{ s: 0, z: p1 }, { s: sDebut, z: p1 }, { s: sFond, z: p2 }, { s: L, z: p2 }];
}

/** La profondeur d'eau a la distance `s` du petit bain, lue sur le profil. */
export function profondeurA(profil: PointProfil[], s: number): number {
  for (let i = 0; i < profil.length - 1; i++) {
    const a = au(profil, i), b = au(profil, i + 1);
    if (s <= b.s + 1e-9) return b.s - a.s < 1e-9 ? b.z : a.z + (b.z - a.z) * Math.max(0, s - a.s) / (b.s - a.s);
  }
  return au(profil, profil.length - 1).z;
}

/**
 * Le volume d'eau : la surface fois la profondeur pour un fond plat ; sinon l'integrale de la
 * profondeur sur le plan d'eau, par bandes perpendiculaires a l'axe (exacte sur un fond en pente
 * pour un rectangle, approchee au millieme ailleurs).
 */
export function volumeEau(contour: PtBrut[], axe: AxeProfondeur, profil: PointProfil[], surface: number): number {
  if (profil.length === 2 && Math.abs(au(profil, 0).z - au(profil, 1).z) < 1e-9) return surface * au(profil, 0).z;
  const N = 400;
  let vol = 0;
  for (let k = 0; k < N; k++) {
    const s = axe.L * (k + 0.5) / N;
    const origine = { x: axe.origine.x + axe.v.x * s, y: axe.origine.y + axe.v.y * s };
    const largeur = clipLineToPolygon(origine, axe.u, contour).reduce((t, seg) => t + dist(seg.a, seg.b), 0);
    vol += largeur * profondeurA(profil, s) * axe.L / N;
  }
  return vol;
}

// ---- Calcul ----------------------------------------------------------------------------------

/** Une distance d'un bassin a un cote de la parcelle : pour la coter sur le plan de masse. */
export interface DistanceLimite {
  cote: number;
  nom: string;
  distance: number;
  /** Le point du bassin le plus proche, et son pied sur la limite. */
  depuis: PtBrut;
  vers: PtBrut;
}

/** La distance la plus courte du bassin a chaque cote de la parcelle. */
export function distancesAuxLimites(contour: PtBrut[], parcelle: ObjetPlan | undefined): DistanceLimite[] {
  if (!parcelle || parcelle.type !== 'polygon' || parcelle.pts.length < 3 || !contour.length) return [];
  const pp = parcelle.pts;
  return pp.map((a, i) => {
    const b = au(pp, (i + 1) % pp.length);
    let best = Infinity, depuis = au(contour, 0);
    contour.forEach(p => { const d = distancePointSegment(p, a, b); if (d < best) { best = d; depuis = p; } });
    // Un sommet de la parcelle peut etre plus pres d'un cote du bassin que tout sommet du bassin de la limite.
    contour.forEach((p, k) => {
      const q = au(contour, (k + 1) % contour.length);
      [a, b].forEach(s => { const d = distancePointSegment(s, p, q); if (d < best) { best = d; depuis = projectOntoSegment(s, p, q); } });
    });
    return { cote: i, nom: parcelle.segmentNames?.[i] || ('Côté ' + (i + 1)), distance: best, depuis, vers: projectOntoSegment(depuis, a, b) };
  });
}

export type RegimeAutorisation = 'aucune' | 'declaration' | 'permis';

export const LIBELLE_REGIME: Record<RegimeAutorisation, string> = {
  aucune: 'Aucune formalité (hors secteur protégé)',
  declaration: 'Déclaration préalable (cerfa n° 13703)',
  permis: 'Permis de construire (cerfa n° 13406)'
};

/** Le regime d'urbanisme d'un bassin, d'apres sa surface et la hauteur d'un eventuel abri. */
export function regimeAutorisation(surface: number, securite: SecuritePiscine, secteurProtege: boolean): RegimeAutorisation {
  if (surface > SEUIL_PERMIS_M2) return 'permis';
  if (surface > SEUIL_SANS_FORMALITE_M2 || secteurProtege || securite === 'abri') return 'declaration';
  return 'aucune';
}

/** La structure de la plage en bois : sur plots au ras du sol, ou sur poteaux quand elle est haute. */
export interface PlageBois {
  mode: 'plots' | 'poteaux';
  /** Hauteur du dessus de la plage au-dessus du sol fini. */
  dessus: number;
  entraxeLambourdes: number;
  /** Portee admissible de la piece porteuse (lambourde sur plots, solive sur poteaux). */
  portee: number;
  /** Le nombre d'anneaux d'appuis entre le bord des margelles et le bord exterieur (2 au moins). */
  anneaux: number;
  lamesMl: number;
  ossatureMl: number;
  poutresMl: number;
  appuis: number;
  poteaux: number;
  hauteurPoteau: number;
  /** Charge sur un appui ou un poteau, en kN. */
  chargeAppuiKn: number;
  /** Les anneaux de poutres (mode poteaux), du bord des margelles vers l'exterieur, et les poteaux dessous. */
  anneauxPoutres: PtBrut[][];
  poteauxPositions: PtBrut[];
  massifsM3: number;
  /** Decaissement sous la plage pour l'affleurer aux margelles, en m³ (0 si elle est au niveau ou en l'air). */
  decaissementM3: number;
}

export interface PiscineCalculee {
  reglages: ReglagesPiscine;
  contour: PtBrut[];
  surface: number;
  perimetre: number;
  axe: AxeProfondeur;
  profil: PointProfil[];
  volume: number;
  profondeurMax: number;
  /** Haut des parois au-dessus du sol fini (0 enterree), et sous le sol fini. */
  hauteurHorsSol: number;
  hauteurParoi: number;
  profondeurEnterree: number;
  /** La fouille : son emprise, sa profondeur, son volume ; le remblai et l'evacuation. */
  fouille: { emprise: PtBrut[]; profondeur: number; volume: number; remblai: number; evacuation: number };
  /** Les contours successifs vers l'exterieur : parois, margelles, plage. */
  parois: PtBrut[];
  margelleExt: PtBrut[];
  margellesMl: number;
  plageExt: PtBrut[];
  surfacePlage: number;
  plageBois: PlageBois | null;
  hydraulique: {
    debit: number; diametreFiltre: number; surfaceFiltre: number; puissancePompeCv: number;
    skimmers: number; refoulements: number; bondes: number; prisesBalai: number; diametreTuyau: number; canalisationsMl: number;
  };
  equipements: { projecteurs: number; puissancePacKw: number; electrolyseur: boolean };
  securite: { dispositif: SecuritePiscine; quantite: number; unite: string };
  regime: RegimeAutorisation;
  secteurProtege: boolean;
  taxeAmenagementBase: number;
  distances: DistanceLimite[];
  /** Les terrasses du plan que le bassin perce. */
  terrassesPercees: string[];
  avertissements: string[];
}

const arrondi = (v: number, d = 2): number => Math.round(v * 10 ** d) / 10 ** d;

/** Calcule une piscine. `null` si l'objet n'est pas un bassin utilisable (moins de trois coins, surface sous 0,5 m²). */
export function calculerPiscine(o: ObjetPlan, objets: ObjetPlan[] = []): PiscineCalculee | null {
  const contour = contourPiscine(o);
  if (!contour.length) return null;
  const r = piscineDe(o);
  const surface = o.type === 'circle' ? Math.PI * o.r * o.r : shoelace(contour);
  const perim = o.type === 'circle' ? 2 * Math.PI * o.r : perimetre(contour);
  const axe = axeProfondeur(contour, r.cotePetitBain);
  const profil = profilFond(r, axe.L);
  const volume = volumeEau(contour, axe, profil, surface);
  const profondeurMax = Math.max(...profil.map(p => p.z));
  const ps = PROFILS_STRUCTURE[r.structure];
  const avertissements: string[] = [];

  const hauteurParoi = profondeurMax + REVANCHE_M;
  const hauteurHorsSol = Math.min(r.hauteurHorsSol, hauteurParoi);
  const profondeurEnterree = Math.max(0, hauteurParoi - hauteurHorsSol);
  const parois = elargir(contour, ps.paroi);

  // La fouille : les parois plus la surlargeur de travail, sur la partie enterree et le fond.
  const profondeurFouille = profondeurEnterree > 1e-6 ? profondeurEnterree + ps.fond : (r.structure === 'kit' ? ps.fond : 0);
  const empriseFouille = elargir(contour, ps.paroi + (profondeurEnterree > 1e-6 ? ps.surlargeurFouille : 0.2));
  const volumeFouille = shoelace(empriseFouille) * profondeurFouille;
  const volumeBassinEnterre = shoelace(parois) * profondeurEnterree;
  // Ce qui revient autour des parois : du gravier drainant pour une coque (achete), les terres pour le reste.
  const remblai = Math.max(0, volumeFouille - volumeBassinEnterre - shoelace(parois) * ps.fond);
  const evacuation = volumeFouille * FOISONNEMENT - (r.structure === 'coque' ? 0 : remblai);

  const margelleExt = r.margelle ? elargir(parois, r.largeurMargelle) : parois;
  const margellesMl = r.margelle ? perimetre(elargir(parois, r.largeurMargelle / 2)) : 0;
  const plageExt = r.plage === 'aucune' ? margelleExt : elargir(margelleExt, r.largeurPlage);
  const surfacePlage = r.plage === 'aucune' ? 0 : Math.max(0, shoelace(plageExt) - shoelace(margelleExt));
  const plageBois = r.plage === 'terrasse-bois' ? structurePlageBois(r, hauteurHorsSol, surfacePlage, margelleExt, perimetre(margelleExt), perimetre(plageExt), avertissements) : null;

  // Hydraulique : le volume recycle en `tempsRecyclage` heures, filtre a 50 m/h.
  const debit = volume / r.tempsRecyclage;
  const surfaceFiltre = debit / VITESSE_FILTRATION_M_H;
  const dCalc = Math.sqrt(4 * surfaceFiltre / Math.PI) * 1000;
  const diametreFiltre = DIAMETRES_FILTRE_MM.find(d => d >= dCalc) ?? au(DIAMETRES_FILTRE_MM, DIAMETRES_FILTRE_MM.length - 1);
  const puissancePompeCv = debit <= 8 ? 0.5 : debit <= 12 ? 0.75 : debit <= 16 ? 1 : debit <= 22 ? 1.5 : 2;
  const skimmers = Math.max(1, Math.ceil(surface / M2_PAR_SKIMMER));
  const refoulements = Math.max(2, Math.ceil(surface / M2_PAR_REFOULEMENT));
  const diametreTuyau = debit <= 10 ? 50 : debit <= 20 ? 63 : 75;
  const canalisationsMl = (skimmers + refoulements + 2) * r.distanceLocal + perim;

  const projecteurs = r.eclairage ? Math.max(1, Math.ceil(surface / M2_PAR_PROJECTEUR)) : 0;
  const puissancePacKw = r.chauffage === 'pac' ? Math.ceil(volume / M3_PAR_KW_PAC * 2) / 2 : 0;

  const securite = quantiteSecurite(r.securite, surface, perimetre(plageExt), plageExt);

  const parcelle = parcelleDuProjet(objets);
  const plu = parcelle?.plu;
  const secteurProtege = !!plu && (plu.spr.length > 0 || plu.servitudes.some(s => /^AC[124]/.test(s.type)));
  const regime = regimeAutorisation(surface, r.securite, secteurProtege);
  const distances = distancesAuxLimites(contour, parcelle);
  const terrassesPercees = objets.filter(t => estTerrasse(t) && t.type === 'polygon' && contour.some(p => pointInPolygon(p, t.pts))).map(t => t.name);

  if (profondeurMax > 2.5) avertissements.push('Profondeur de ' + fr(profondeurMax) + ' m : au-delà de 2,50 m, le bassin sort des gammes courantes (coques, kits) et demande une étude.');
  if (hauteurHorsSol > ps.horsSolMax + 1e-9) avertissements.push('Hauteur hors-sol de ' + fr(hauteurHorsSol) + ' m : ' + LIBELLE_STRUCTURE[r.structure].toLowerCase() + ' admet ' + fr(ps.horsSolMax) + ' m au plus sans étude de la poussée de l\'eau.');
  if (r.structure === 'coque' && surface > 60) avertissements.push('Coque de ' + fr(surface, 1) + ' m² : au-delà de 60 m², le transport et le grutage sortent du courant.');
  if (r.structure === 'coque' && r.fond === 'fosse') avertissements.push('Fosse à plonger sur une coque : vérifiez que le modèle existe au catalogue du fabricant.');
  if (o.type === 'circle' && o.piscine?.fond && o.piscine.fond !== 'plat') avertissements.push('Un bassin rond a le fond plat : la pente réglée n\'est pas appliquée.');
  if (r.profondeurPetitBain < 1.1 && r.fond === 'plat') avertissements.push('Profondeur de ' + fr(r.profondeurPetitBain) + ' m : sous 1,10 m, le plongeon doit être interdit par une signalisation.');
  if (surface > SEUIL_PERMIS_M2) avertissements.push('Bassin de ' + fr(surface, 1) + ' m² : au-delà de 100 m², c\'est un permis de construire, pas une déclaration préalable.');
  const limiteProche = distances.find(d => d.distance < 3);
  if (limiteProche) avertissements.push('Le bassin est à ' + fr(limiteProche.distance) + ' m de la limite « ' + limiteProche.nom + ' » : la plupart des PLU imposent 3 m, certains 1 m ou plus. Vérifiez le règlement de zone.');
  terrassesPercees.forEach(nom => avertissements.push('La terrasse « ' + nom + ' » est percée par le bassin : ses pièces s\'arrêtent au bord des margelles sur un chevêtre, avec des appuis le long.'));

  return {
    reglages: r, contour, surface, perimetre: perim, axe, profil, volume, profondeurMax,
    hauteurHorsSol, hauteurParoi, profondeurEnterree,
    fouille: { emprise: empriseFouille, profondeur: profondeurFouille, volume: volumeFouille, remblai, evacuation: Math.max(0, evacuation) },
    parois, margelleExt, margellesMl, plageExt, surfacePlage, plageBois,
    hydraulique: { debit, diametreFiltre, surfaceFiltre, puissancePompeCv, skimmers, refoulements, bondes: 1, prisesBalai: 1, diametreTuyau, canalisationsMl },
    equipements: { projecteurs, puissancePacKw, electrolyseur: r.traitement === 'sel' },
    securite, regime, secteurProtege, taxeAmenagementBase: surface * TAXE_AMENAGEMENT_M2, distances, terrassesPercees, avertissements
  };
}

/** Ce que le dispositif de securite represente en quantite : des metres de barriere, des m² de couverture ou d'abri, un forfait d'alarme. */
function quantiteSecurite(dispositif: SecuritePiscine, surface: number, perimetreExt: number, plageExt: PtBrut[]): PiscineCalculee['securite'] {
  if (dispositif === 'barriere') return { dispositif, quantite: perimetreExt + 4, unite: 'ml' };
  if (dispositif === 'alarme') return { dispositif, quantite: 1, unite: 'u' };
  if (dispositif === 'couverture') return { dispositif, quantite: surface * 1.1, unite: 'm²' };
  // Un abri couvre le bassin et ses margelles, dans son rectangle englobant.
  const xs = plageExt.map(p => p.x), ys = plageExt.map(p => p.y);
  return { dispositif, quantite: Math.max(surface * 1.4, (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) * 0.6), unite: 'm²' };
}

/**
 * La plage en bois : au ras du sol, des lambourdes sur plots a l'entraxe que l'epaisseur de lame
 * permet (NF DTU 51.4) ; en hauteur, des solives 63 x 175 sur deux poutres portees par des poteaux,
 * le long des margelles et du bord exterieur, avec un anneau de plus chaque fois que la largeur
 * depasse la portee. Rien ne s'appuie sur les parois du bassin : un poteau ou un plot a ses propres
 * fondations.
 */
function structurePlageBois(r: ReglagesPiscine, hauteurHorsSol: number, surface: number, margelleExt: PtBrut[], perimInt: number, perimExt: number, avertissements: string[]): PlageBois {
  const lameH = PLAGE.lameEpaisseur / 1000;
  const entraxeLambourdes = maxEntraxeLameCm({ epaisseurLame: PLAGE.lameEpaisseur, essenceBois: r.essencePlage }) / 100;
  // Le dessus de la plage affleure le dessus des margelles.
  const dessus = hauteurHorsSol + EPAISSEUR_MARGELLE_M;
  const hauteurPlotNecessaire = dessus - lameH - PLAGE.lambourde.h;
  const largeur = r.largeurPlage;
  const pasLame = PLAGE.lameLargeur + PLAGE.jeu;
  const lamesMl = surface / pasLame * 1.05;
  if (hauteurPlotNecessaire <= PLOT_HAUTEUR_DTU_CM / 100) {
    const hauteurPlot = Math.max(PLAGE.plot.hauteurMin, hauteurPlotNecessaire);
    const portee = Math.min(PLOT_ENTRAXE_MAX_M, maxPorteeVisM({ soliveSection: PLAGE.lambourde.section, soliveEntraxe: entraxeLambourdes * 100 }));
    const anneaux = Math.max(2, Math.ceil(largeur / portee) + 1);
    const ossatureMl = surface / entraxeLambourdes + perimInt + perimExt;
    const appuis = Math.ceil(ossatureMl / portee);
    const decaissement = Math.max(0, lameH + PLAGE.lambourde.h + hauteurPlot - dessus);
    const tributaire = entraxeLambourdes * portee;
    return {
      mode: 'plots', dessus, entraxeLambourdes, portee, anneaux, lamesMl, ossatureMl, poutresMl: 0, appuis, poteaux: 0, hauteurPoteau: 0,
      chargeAppuiKn: (CHARGE_PLAGE_KG_M2 + POIDS_PROPRE_PLAGE_KG_M2) * tributaire * 9.81 / 1000,
      anneauxPoutres: [], poteauxPositions: [],
      massifsM3: 0, decaissementM3: decaissement * surface
    };
  }
  // En hauteur : solives entre deux poutres, poteaux sous les poutres.
  const portee = maxPorteeVisM({ soliveSection: PLAGE.solive.section, soliveEntraxe: PLAGE.solive.entraxe * 100 });
  const travees = Math.max(1, Math.ceil(largeur / portee));
  const anneaux = travees + 1;
  // Les anneaux de poutres : rentres de 12 cm des deux bords, repartis entre les deux ; un poteau
  // a chaque coin et tous les 2 m au plus le long de chaque cote.
  const RETRAIT = 0.12;
  const anneauxPoutres = Array.from({ length: anneaux }, (_, k) => elargir(margelleExt, RETRAIT + (largeur - 2 * RETRAIT) * k / travees));
  const poutresMl = anneauxPoutres.reduce((s, a) => s + perimetre(a), 0);
  const poteauxPositions: PtBrut[] = [];
  anneauxPoutres.forEach(a => a.forEach((p, i) => {
    const q = au(a, (i + 1) % a.length), L = dist(p, q), n = Math.max(1, Math.ceil(L / PLAGE.poutre.entraxe - 1e-6));
    for (let j = 0; j < n; j++) poteauxPositions.push({ x: p.x + (q.x - p.x) * j / n, y: p.y + (q.y - p.y) * j / n });
  }));
  const poteaux = poteauxPositions.length;
  const hauteurPoteau = Math.max(0.3, dessus - lameH - PLAGE.solive.h - PLAGE.poutre.h);
  const ossatureMl = surface / PLAGE.solive.entraxe;
  // Un poteau d'un anneau intermediaire reprend une travee de chaque cote ; un poteau de rive une demie.
  const tributaire = PLAGE.poutre.entraxe * (largeur / travees) * (travees > 1 ? 1 : 0.5);
  const chargeAppuiKn = (CHARGE_PLAGE_KG_M2 + POIDS_PROPRE_PLAGE_KG_M2) * tributaire * 9.81 / 1000;
  if (dessus > 1.0) avertissements.push('Plage à ' + fr(dessus) + ' m du sol : au-delà d\'un mètre, un garde-corps de 1 m est obligatoire sur les côtés libres.');
  return {
    mode: 'poteaux', dessus, entraxeLambourdes: PLAGE.solive.entraxe, portee, anneaux, lamesMl, ossatureMl, poutresMl, appuis: 0, poteaux, hauteurPoteau,
    chargeAppuiKn, anneauxPoutres, poteauxPositions, massifsM3: poteaux * PLAGE.massif.cote * PLAGE.massif.cote * PLAGE.massif.profondeur, decaissementM3: 0
  };
}

// ---- Chiffrage -------------------------------------------------------------------------------

/** Les prix par defaut, en euros TTC fourniture et pose : des ordres de grandeur, bas et haut. */
const PRIX: Record<string, { bas: number; haut: number }> = {
  terrassement: { bas: 25, haut: 45 },        // m³ de deblai, evacuation comprise
  gravierDrainant: { bas: 45, haut: 70 },     // m³
  radier: { bas: 220, haut: 320 },            // m³ beton arme
  murs: { bas: 120, haut: 180 },              // m² de blocs a bancher, beton et aciers
  dalle: { bas: 90, haut: 140 },              // m² de dalle beton de 15 cm
  coque: { bas: 350, haut: 600 },             // m² de plan d'eau
  grutage: { bas: 800, haut: 1800 },          // forfait
  ceinture: { bas: 60, haut: 100 },           // ml de dalle de ceinture
  kit: { bas: 180, haut: 420 },               // m² de plan d'eau
  liner: { bas: 35, haut: 60 },               // m²
  'membrane-armee': { bas: 70, haut: 120 },
  carrelage: { bas: 110, haut: 200 },
  enduit: { bas: 60, haut: 110 },
  margelles: { bas: 60, haut: 140 },          // ml
  decaissementPlage: { bas: 25, haut: 45 },   // m³
  plageLames: { bas: 5, haut: 12 },           // ml de lame (surcharge selon l'essence ci-dessous)
  plageOssature: { bas: 6, haut: 10 },        // ml
  plagePoutres: { bas: 18, haut: 30 },        // ml
  plageAppuis: { bas: 4, haut: 8 },           // u
  plagePoteaux: { bas: 60, haut: 110 },       // u, massif compris
  plageDalle: { bas: 90, haut: 140 },         // m² herisson + dalle
  plageDallage: { bas: 80, haut: 180 },       // m² de dallage pose
  plageBordure: { bas: 25, haut: 45 },        // ml
  filtration: { bas: 1200, haut: 2800 },      // forfait pompe + filtre, selon le debit
  piecesSceller: { bas: 180, haut: 320 },     // u (skimmer, refoulement, bonde, prise balai)
  canalisations: { bas: 18, haut: 30 },       // ml PVC pression, tranchee comprise
  local: { bas: 900, haut: 4500 },            // forfait selon le type
  electricite: { bas: 900, haut: 1800 },      // coffret, liaison, differentiel
  projecteurs: { bas: 350, haut: 700 },       // u
  electrolyseur: { bas: 1200, haut: 2500 },
  pac: { bas: 350, haut: 600 },               // kW
  solaire: { bas: 60, haut: 120 },            // m² de capteurs (la moitie du plan d'eau)
  echangeur: { bas: 900, haut: 2000 },
  barriere: { bas: 120, haut: 250 },          // ml
  alarme: { bas: 400, haut: 1200 },
  couverture: { bas: 150, haut: 400 },        // m² (volet)
  abri: { bas: 500, haut: 1300 },             // m²
  miseEnEau: { bas: 4, haut: 5 }              // m³
};

/** Le groupe de filtration se vend par classe de debit : le forfait grandit avec lui. */
const PRIX_FILTRATION = { bas: 1200, haut: 2800 };

const PRIX_LOCAL: Record<LocalTechniquePiscine, { bas: number; haut: number }> = {
  coffre: { bas: 600, haut: 1500 }, enterre: { bas: 1500, haut: 3500 }, maconne: { bas: 2500, haut: 6000 }, existant: { bas: 0, haut: 0 }
};

/** Le chiffrage : des lignes au format de la nomenclature, avec le prix saisi par poste quand il y en a un. */
export interface ChiffragePiscine {
  lignes: LigneBom[];
  bas: number;
  haut: number;
  /** La somme des prix saisis, ou `null` quand aucun ne l'est. */
  reel: number | null;
}

/** Le prix unitaire saisi pour un poste, ou `undefined`. */
export const prixSaisi = (r: ReglagesPiscine, poste: string): number | undefined => {
  const v = r.prix[poste];
  return v !== undefined && Number.isFinite(v) && v >= 0 ? v : undefined;
};

export function chiffrerPiscine(calc: PiscineCalculee): ChiffragePiscine {
  const r = calc.reglages, ps = PROFILS_STRUCTURE[r.structure];
  const lignes: LigneBom[] = [];
  const ligne = (poste: string, label: string, qte: number, unite: string, prix = PRIX[poste] ?? { bas: 0, haut: 0 }) => {
    if (!(qte > 1e-9)) return;
    const saisi = prixSaisi(r, poste);
    lignes.push({ poste, label, qte: arrondi(qte), unite, prixBas: prix.bas, prixHaut: prix.haut, prixReel: saisi !== undefined ? arrondi(saisi * qte) : null });
  };
  const f = calc.fouille;
  if (f.volume > 0) ligne('terrassement', 'Terrassement : déblai, mise en dépôt et évacuation (' + fr(f.evacuation, 1) + ' m³ foisonnés)', f.volume, 'm³');
  const surfaceParois = calc.perimetre * calc.hauteurParoi;
  const surfaceInterieure = calc.surface + calc.perimetre * calc.profondeurMax;
  if (r.structure === 'maconnerie') {
    ligne('radier', 'Radier béton armé de ' + Math.round(ps.fond * 100) + ' cm', shoelace(calc.parois) * ps.fond, 'm³');
    ligne('murs', 'Parois en blocs à bancher de 27 cm, béton et aciers, ceinture', surfaceParois, 'm²');
    ligne(r.revetement, 'Revêtement : ' + LIBELLE_REVETEMENT[r.revetement].toLowerCase() + (r.revetement === 'liner' ? ', feutre et profilés' : ''), surfaceInterieure, 'm²');
  } else if (r.structure === 'coque') {
    ligne('coque', 'Coque polyester, livrée (plan d\'eau ' + fr(calc.surface, 1) + ' m²)', calc.surface, 'm²');
    ligne('grutage', 'Grutage et pose de la coque', 1, 'forfait');
    ligne('gravierDrainant', 'Lit de pose et remblai en gravier drainant', shoelace(calc.parois) * ps.fond + f.remblai, 'm³');
    if (r.margelle) ligne('ceinture', 'Dalle de ceinture béton sous les margelles', calc.perimetre, 'ml');
  } else {
    ligne('dalle', 'Dalle béton armé de 15 cm sous le bassin', shoelace(calc.parois), 'm²');
    ligne('kit', 'Kit panneaux (structure, jambes de force, margelle de kit)', calc.surface, 'm²');
    ligne(r.revetement, 'Revêtement : ' + LIBELLE_REVETEMENT[r.revetement].toLowerCase() + ', feutre et profilés', surfaceInterieure, 'm²');
  }
  if (r.margelle) ligne('margelles', 'Margelles de ' + Math.round(r.largeurMargelle * 100) + ' cm (' + Math.ceil(calc.margellesMl / LONGUEUR_MARGELLE_M) + ' pièces)', calc.margellesMl, 'ml');
  const pb = calc.plageBois;
  if (pb) {
    const essence = essenceDe(r.essencePlage);
    // Le prix d'une lame suit l'essence : celui du m² ramene au metre lineaire de lame.
    ligne('plageLames', 'Plage : lames 27 × 145 (' + essence.label + ')', pb.lamesMl, 'ml', { bas: Math.max(PRIX.plageLames?.bas ?? 0, essence.bas * PLAGE.lameLargeur), haut: Math.max(PRIX.plageLames?.haut ?? 0, essence.haut * PLAGE.lameLargeur) });
    ligne('plageOssature', pb.mode === 'plots' ? 'Plage : lambourdes 45 × 70 (entraxe ' + Math.round(pb.entraxeLambourdes * 100) + ' cm)' : 'Plage : solives 63 × 175 (entraxe 50 cm)', pb.ossatureMl, 'ml');
    if (pb.mode === 'plots') ligne('plageAppuis', 'Plage : plots réglables (portée ' + Math.round(pb.portee * 100) + ' cm)', pb.appuis, 'u');
    else {
      ligne('plagePoutres', 'Plage : poutres 75 × 200 sur ' + pb.anneaux + ' anneaux', pb.poutresMl, 'ml');
      ligne('plagePoteaux', 'Plage : poteaux 120 × 120 de ' + fr(pb.hauteurPoteau) + ' m sur massif béton 40 × 40 × 50', pb.poteaux, 'u');
    }
    if (pb.decaissementM3 > 0.05) ligne('decaissementPlage', 'Plage : décaissement pour affleurer les margelles', pb.decaissementM3, 'm³');
  } else if (r.plage === 'dallage') {
    ligne('plageDalle', 'Plage : hérisson 15 cm et dalle béton armé 12 cm', calc.surfacePlage, 'm²');
    ligne('plageDallage', 'Plage : dallage (pierre, grès cérame) posé', calc.surfacePlage, 'm²');
    ligne('plageBordure', 'Plage : bordure extérieure', perimetre(calc.plageExt), 'ml');
  }
  const h = calc.hydraulique;
  ligne('filtration', 'Groupe de filtration : pompe ' + fr(h.puissancePompeCv, 2) + ' CV, filtre à sable Ø ' + h.diametreFiltre + ' mm (' + fr(h.debit, 1) + ' m³/h)', 1, 'forfait', { bas: PRIX_FILTRATION.bas * (0.7 + h.debit / 30), haut: PRIX_FILTRATION.haut * (0.7 + h.debit / 30) });
  ligne('piecesSceller', 'Pièces à sceller : ' + h.skimmers + ' skimmer(s), ' + h.refoulements + ' refoulements, bonde de fond, prise balai', h.skimmers + h.refoulements + h.bondes + h.prisesBalai, 'u');
  ligne('canalisations', 'Canalisations PVC pression Ø ' + h.diametreTuyau + ', tranchées comprises', h.canalisationsMl, 'ml');
  ligne('local', LIBELLE_LOCAL[r.local], r.local === 'existant' ? 0 : 1, 'forfait', PRIX_LOCAL[r.local]);
  ligne('electricite', 'Coffret électrique, liaison, différentiel 30 mA, liaison équipotentielle', 1, 'forfait');
  if (calc.equipements.projecteurs) ligne('projecteurs', 'Projecteurs LED immergés', calc.equipements.projecteurs, 'u');
  if (calc.equipements.electrolyseur) ligne('electrolyseur', 'Électrolyseur au sel et régulation pH (' + Math.ceil(calc.volume / 10) * 10 + ' m³)', 1, 'forfait');
  if (r.chauffage === 'pac') ligne('pac', 'Pompe à chaleur de ' + fr(calc.equipements.puissancePacKw, 1) + ' kW', calc.equipements.puissancePacKw, 'kW');
  else if (r.chauffage === 'solaire') ligne('solaire', 'Capteurs solaires (la moitié du plan d\'eau)', calc.surface / 2, 'm²');
  else if (r.chauffage === 'echangeur') ligne('echangeur', 'Échangeur sur chaudière, circulateur et régulation', 1, 'forfait');
  const s = calc.securite;
  ligne(s.dispositif, 'Sécurité : ' + LIBELLE_SECURITE[s.dispositif], s.quantite, s.unite);
  ligne('miseEnEau', 'Mise en eau', calc.volume, 'm³');

  let bas = 0, haut = 0, reel = 0, unReel = false;
  lignes.forEach(l => {
    bas += l.prixBas * l.qte; haut += l.prixHaut * l.qte;
    if (l.prixReel !== null && l.prixReel !== undefined) { reel += l.prixReel; unReel = true; }
  });
  return { lignes, bas, haut, reel: unReel ? reel : null };
}

// ---- Note de calcul --------------------------------------------------------------------------

export interface LigneNote { libelle: string; valeur: string; note?: string }
export interface SectionNote { titre: string; lignes: LigneNote[]; remarque?: string }

export const fr = (v: number, d = 2): string => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const m = (v: number) => fr(v) + ' m';
const m2 = (v: number) => fr(v, 1) + ' m²';
const m3 = (v: number) => fr(v, 1) + ' m³';

/**
 * La note de calcul : ce que le moteur a retenu, section par section, avec la regle qui a servi.
 * Elle se lit dans le tiroir et s'imprime en annexe du dossier de mairie.
 */
export function noteDeCalcul(calc: PiscineCalculee): SectionNote[] {
  const r = calc.reglages, h = calc.hydraulique, ps = PROFILS_STRUCTURE[r.structure];
  const sections: SectionNote[] = [];
  const profondeurs = r.fond === 'plat' ? m(r.profondeurPetitBain) : m(r.profondeurPetitBain) + ' au petit bain, ' + m(r.profondeurGrandBain) + ' au grand bain';
  sections.push({
    titre: '1. Géométrie et volume',
    lignes: [
      { libelle: 'Implantation', valeur: LIBELLE_IMPLANTATION[r.implantation] + (calc.hauteurHorsSol > 0 ? ', parois à ' + m(calc.hauteurHorsSol) + ' au-dessus du sol' : '') },
      { libelle: 'Plan d\'eau', valeur: m2(calc.surface) + ', périmètre ' + m(calc.perimetre), note: 'Mesuré au nu intérieur des parois ; c\'est la surface que l\'urbanisme compte.' },
      { libelle: 'Fond', valeur: LIBELLE_FOND[r.fond] + ' : ' + profondeurs + (r.fond === 'fosse' ? ' (fosse sur ' + Math.round(r.partFosse * 100) + ' % de la longueur)' : '') },
      { libelle: 'Volume d\'eau', valeur: m3(calc.volume), note: r.fond === 'plat' ? 'Surface × profondeur.' : 'Intégrale de la profondeur sur le plan d\'eau, par bandes perpendiculaires à l\'axe du petit bain.' },
      { libelle: 'Hauteur des parois', valeur: m(calc.hauteurParoi), note: 'Profondeur maximale + revanche de ' + Math.round(REVANCHE_M * 100) + ' cm (du plan d\'eau au haut des parois).' },
      { libelle: 'Partie enterrée', valeur: m(calc.profondeurEnterree) }
    ]
  });
  sections.push({
    titre: '2. Terrassement',
    lignes: [
      { libelle: 'Emprise de la fouille', valeur: m2(shoelace(calc.fouille.emprise)), note: 'Parois de ' + Math.round(ps.paroi * 100) + ' cm plus ' + Math.round(ps.surlargeurFouille * 100) + ' cm de surlargeur de travail, parois de fouille supposées verticales.' },
      { libelle: 'Profondeur de fouille', valeur: m(calc.fouille.profondeur), note: 'Partie enterrée + ' + Math.round(ps.fond * 100) + ' cm sous le fond (' + (r.structure === 'coque' ? 'lit de pose en gravier' : r.structure === 'maconnerie' ? 'radier' : 'dalle') + ').' },
      { libelle: 'Déblai', valeur: m3(calc.fouille.volume) },
      { libelle: r.structure === 'coque' ? 'Remblai en gravier drainant' : 'Remblai périphérique (terres du déblai)', valeur: m3(calc.fouille.remblai) },
      { libelle: 'Évacuation', valeur: m3(calc.fouille.evacuation), note: 'Foisonnement de ' + Math.round((FOISONNEMENT - 1) * 100) + ' %.' }
    ],
    remarque: 'Sans étude de sol : une nappe haute, un rocher ou un remblai récent changent la fouille, le drainage et le fond (plot de lestage, vide sanitaire, puits de décompression).'
  });
  const pression = 9.81 * calc.profondeurMax;
  const poussee = 9.81 * calc.hauteurParoi * calc.hauteurParoi / 2;
  const lignesStructure: LigneNote[] = [
    { libelle: 'Structure', valeur: LIBELLE_STRUCTURE[r.structure] + ', ' + LIBELLE_REVETEMENT[r.revetement].toLowerCase() },
    { libelle: 'Pression de l\'eau au fond', valeur: fr(pression, 1) + ' kPa', note: 'ρ·g·h, avec h la profondeur maximale.' },
    { libelle: 'Poussée de l\'eau sur une paroi', valeur: fr(poussee, 1) + ' kN par mètre de paroi', note: 'ρ·g·h²/2 sur la hauteur de paroi ; la poussée des terres s\'y oppose bassin plein et s\'exerce seule bassin vide.' }
  ];
  if (r.structure === 'maconnerie') lignesStructure.push(
    { libelle: 'Radier', valeur: Math.round(ps.fond * 100) + ' cm, ' + m3(shoelace(calc.parois) * ps.fond), note: 'Béton C25/30, deux nappes de treillis ST25C, sur béton de propreté et film.' },
    { libelle: 'Parois', valeur: '27 cm, ' + m2(calc.perimetre * calc.hauteurParoi), note: 'Blocs à bancher, aciers verticaux HA10 tous les 25 cm liés au radier, deux HA8 par rang, ceinture haute.' }
  );
  if (r.structure === 'coque') lignesStructure.push(
    { libelle: 'Pose', valeur: 'Lit de gravier de ' + Math.round(ps.fond * 100) + ' cm, remblai en gravier roulé', note: 'Remblayer par couches en même temps que la mise en eau : la coque ne tient que remplie et soutenue.' }
  );
  if (r.structure === 'kit') lignesStructure.push(
    { libelle: 'Dalle', valeur: Math.round(ps.fond * 100) + ' cm, ' + m2(shoelace(calc.parois)), note: 'Dalle armée plane à ± 5 mm : le kit ne rattrape rien.' },
    { libelle: 'Jambes de force', valeur: 'Une par panneau, tous les 1,25 m environ', note: 'Hors-sol, les parois reprennent seules la poussée : la hauteur admise est celle du fabricant.' }
  );
  sections.push({ titre: '3. Structure du bassin', lignes: lignesStructure, remarque: 'Pré-dimensionnement d\'avant-projet : le béton, le ferraillage et le drainage relèvent d\'une étude d\'exécution (DTU 65.11 réservoirs, Eurocode 2) et de la notice du fabricant pour une coque ou un kit.' });

  const lignesAbords: LigneNote[] = [
    { libelle: 'Margelles', valeur: r.margelle ? fr(calc.margellesMl, 1) + ' ml de ' + Math.round(r.largeurMargelle * 100) + ' cm (' + Math.ceil(calc.margellesMl / LONGUEUR_MARGELLE_M) + ' pièces de 50 cm)' : 'Aucune' },
    { libelle: 'Plage', valeur: LIBELLE_PLAGE[r.plage] + (r.plage !== 'aucune' ? ', ' + m(r.largeurPlage) + ' de large, ' + m2(calc.surfacePlage) : '') }
  ];
  const pb = calc.plageBois;
  if (pb) {
    lignesAbords.push(
      { libelle: 'Dessus de la plage', valeur: m(pb.dessus) + ' au-dessus du sol fini', note: 'Affleure le dessus des margelles (' + Math.round(EPAISSEUR_MARGELLE_M * 100) + ' cm).' },
      { libelle: 'Lames', valeur: '27 × 145 mm, ' + fr(pb.lamesMl, 1) + ' ml (' + essenceDe(r.essencePlage).label + ')' }
    );
    if (pb.mode === 'plots') lignesAbords.push(
      { libelle: 'Lambourdes', valeur: '45 × 70 mm à ' + Math.round(pb.entraxeLambourdes * 100) + ' cm, ' + fr(pb.ossatureMl, 1) + ' ml', note: 'Entraxe donné par l\'épaisseur de lame (≈ 18,5 × épaisseur, NF DTU 51.4).' },
      { libelle: 'Plots', valeur: pb.appuis + ' plots réglables, portée ' + Math.round(pb.portee * 100) + ' cm', note: 'Plafond de 70 cm sous lambourdes (NF DTU 51.4) ; ' + fr(pb.chargeAppuiKn, 2) + ' kN par plot.' }
    );
    else lignesAbords.push(
      { libelle: 'Solives', valeur: '63 × 175 mm à 50 cm, ' + fr(pb.ossatureMl, 1) + ' ml, portée admissible ' + m(pb.portee), note: 'Portée = K·h·(b/entraxe)^(1/3) avec K = 25,8 (mm), calée sur 250 kg/m².' },
      { libelle: 'Poutres et poteaux', valeur: pb.anneaux + ' anneaux de poutres 75 × 200 (' + fr(pb.poutresMl, 1) + ' ml), ' + pb.poteaux + ' poteaux 120 × 120 de ' + m(pb.hauteurPoteau), note: 'Poteaux tous les 2 m, ' + fr(pb.chargeAppuiKn, 1) + ' kN chacun, sur massif 40 × 40 × 50 cm (' + m3(pb.massifsM3) + ' de béton). Aucun appui sur les parois du bassin.' }
    );
    if (pb.decaissementM3 > 0.05) lignesAbords.push({ libelle: 'Décaissement sous la plage', valeur: m3(pb.decaissementM3) });
  }
  if (r.plage === 'dallage') lignesAbords.push({ libelle: 'Dallage', valeur: 'Hérisson 15 cm, dalle armée 12 cm, dallage posé, pente de 1,5 % vers l\'extérieur', note: 'Joint de dilatation contre les margelles ; pierre non gélive et antidérapante (R11).' });
  sections.push({ titre: '4. Abords', lignes: lignesAbords });

  sections.push({
    titre: '5. Hydraulique et filtration',
    lignes: [
      { libelle: 'Temps de recyclage', valeur: fr(r.tempsRecyclage, 0) + ' h', note: 'Le volume passe entièrement au filtre en ce temps.' },
      { libelle: 'Débit de filtration', valeur: fr(h.debit, 1) + ' m³/h', note: 'Volume / temps de recyclage.' },
      { libelle: 'Filtre à sable', valeur: 'Ø ' + h.diametreFiltre + ' mm (' + fr(h.surfaceFiltre, 2) + ' m² de section nécessaires)', note: 'Vitesse de filtration de ' + VITESSE_FILTRATION_M_H + ' m/h ; diamètre du commerce immédiatement supérieur.' },
      { libelle: 'Pompe', valeur: fr(h.puissancePompeCv, 2) + ' CV' },
      { libelle: 'Skimmers', valeur: h.skimmers + ' (un pour ' + M2_PAR_SKIMMER + ' m²)', note: 'Face aux vents dominants ; en hors-sol, un skimmer flottant ou de kit.' },
      { libelle: 'Refoulements', valeur: h.refoulements + ' buses (une pour ' + M2_PAR_REFOULEMENT + ' m², deux au moins)' },
      { libelle: 'Bonde de fond, prise balai', valeur: '1 et 1', note: 'La bonde au point bas du grand bain.' },
      { libelle: 'Canalisations', valeur: 'PVC pression Ø ' + h.diametreTuyau + ' mm, ' + fr(h.canalisationsMl, 0) + ' ml', note: 'Local technique à ' + m(r.distanceLocal) + ' ; un circuit par pièce à sceller, plus le tour du bassin.' }
    ]
  });
  const lignesEquip: LigneNote[] = [
    { libelle: 'Local technique', valeur: LIBELLE_LOCAL[r.local] },
    { libelle: 'Éclairage', valeur: calc.equipements.projecteurs ? calc.equipements.projecteurs + ' projecteur(s) LED 12 V (un pour ' + M2_PAR_PROJECTEUR + ' m²)' : 'Aucun' },
    { libelle: 'Traitement', valeur: LIBELLE_TRAITEMENT[r.traitement] + (calc.equipements.electrolyseur ? ', électrolyseur de ' + Math.ceil(calc.volume / 10) * 10 + ' m³ et régulation pH' : '') },
    { libelle: 'Chauffage', valeur: LIBELLE_CHAUFFAGE[r.chauffage] + (r.chauffage === 'pac' ? ' de ' + fr(calc.equipements.puissancePacKw, 1) + ' kW' : '') }
  ];
  if (r.chauffage === 'pac') au(lignesEquip, lignesEquip.length - 1).note = 'Un kilowatt pour ' + M3_PAR_KW_PAC + ' m³ d\'eau, pour une saison d\'avril à septembre ; une couverture divise la consommation par deux.';
  sections.push({ titre: '6. Équipements', lignes: lignesEquip });

  const distances = calc.distances.map(d => d.nom + ' : ' + m(d.distance)).join(' ; ');
  const lignesRegl: LigneNote[] = [
    { libelle: 'Sécurité', valeur: LIBELLE_SECURITE[r.securite] + ' — ' + fr(calc.securite.quantite, calc.securite.unite === 'u' ? 0 : 1) + ' ' + calc.securite.unite, note: 'Obligatoire pour tout bassin enterré ou semi-enterré non clos (loi du 3 janvier 2003, art. L.128-1 du CCH). Un bassin hors-sol en est dispensé mais reste conseillé.' },
    { libelle: 'Autorisation d\'urbanisme', valeur: LIBELLE_REGIME[calc.regime], note: 'Aucune formalité jusqu\'à 10 m² hors secteur protégé ; déclaration préalable de 10 à 100 m² (et pour un bassin hors-sol installé plus de trois mois par an) ; permis au-delà de 100 m² ou avec un abri de plus de 1,80 m.' + (calc.secteurProtege ? ' Le terrain est en secteur protégé (SPR, monument historique) : l\'architecte des Bâtiments de France est consulté, les délais s\'allongent d\'un mois.' : '') },
    { libelle: 'Distances aux limites', valeur: distances || 'Pas de parcelle dans le plan', note: 'À comparer au règlement de zone du PLU (souvent 3 m, parfois 1 m ou plus) et au Code civil (vues).' },
    { libelle: 'Taxe d\'aménagement', valeur: fr(calc.taxeAmenagementBase, 0) + ' € de base', note: TAXE_AMENAGEMENT_M2 + ' €/m² de plan d\'eau, à multiplier par les taux communal et départemental (de 1 à 5 %, plus 2,5 % au plus).' },
    { libelle: 'Après les travaux', valeur: 'Déclaration d\'achèvement (DAACT) et déclaration foncière H1 (cerfa n° 6650) dans les 90 jours', note: 'Le bassin entre dans la taxe foncière ; une exonération de deux ans suit la déclaration faite à temps.' }
  ];
  sections.push({ titre: '7. Sécurité et réglementation', lignes: lignesRegl });
  if (calc.avertissements.length) sections.push({ titre: '8. Points de vigilance', lignes: calc.avertissements.map((a, i) => ({ libelle: String(i + 1), valeur: a })) });
  return sections;
}

/** La note en texte brut, pour le résumé copiable et les tests. */
export function noteEnTexte(sections: SectionNote[]): string {
  return sections.map(s => s.titre + '\n' + s.lignes.map(l => '  ' + l.libelle + ' : ' + l.valeur + (l.note ? ' — ' + l.note : '')).join('\n') + (s.remarque ? '\n  ' + s.remarque : '')).join('\n\n');
}

/** Les piscines calculables du plan. */
export const piscinesDu = (objets: ObjetPlan[]): ObjetPlan[] => objets.filter(estPiscine);

/** Le centre du bassin, pour les etiquettes et les cotes. */
export const centrePiscine = (o: ObjetPlan): PtBrut => o.type === 'circle' ? { x: o.center.x, y: o.center.y } : centroid(o.pts);
