// La piscine, son calcul : limites, autorisation, plage, securite, terrassement (calculerPiscine).
// Un morceau de engine/piscine.ts, qui les reexporte tous : le reste du programme importe depuis lui.

import { au } from '../../util/tableaux.js';
import { dist, pointInPolygon, shoelace } from '../../geometry/basic.js';
import { distancePointSegment, projectOntoSegment } from '../../geometry/segments.js';
import { PLOT_ENTRAXE_MAX_M, PLOT_HAUTEUR_DTU_CM } from '../bois/platelage.js';
import { solDuProjet, solSousEmprise, type Sol, type SolSousEmprise } from '../sol.js';
import { cellulesDansPolygone } from '../../model/relief.js';
import { maxEntraxeLameCm, maxPorteeVisM } from '../bois/portees.js';
import { perce, terrasseDeLaPiscine } from '../ouvrages/liens.js';
import { estTerrasse, parcelleDuProjet } from '../../model/fonctions.js';
import type { ObjetPlan, PtBrut, SecuritePiscine } from '../../model/types.js';
import { libellePiscine, plageCalculee, REVANCHE_M, VITESSE_FILTRATION_M_H, DIAMETRES_FILTRE_MM, M2_PAR_SKIMMER, M2_PAR_REFOULEMENT, M2_PAR_PROJECTEUR, M3_PAR_KW_PAC, TAXE_AMENAGEMENT_M2, SEUIL_SANS_FORMALITE_M2, SEUIL_PERMIS_M2, CHARGE_PLAGE_KG_M2, POIDS_PROPRE_PLAGE_KG_M2, PROFILS_STRUCTURE, FOISONNEMENT, EPAISSEUR_MARGELLE_M, PLAGE, type ReglagesPiscine, piscineDe, fr } from './reglages.js';
import { bordDesMargelles, contourPiscine, elargir, perimetre, type AxeProfondeur, axeProfondeur, type PointProfil, profilFond, volumeEau } from './geometrie.js';

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
  /** La hauteur d'un poteau au point de reference ; sur un sol en pente, la plus courte. */
  hauteurPoteau: number;
  /** Sur un sol en pente (MD/spec-relief.md §6) : la hauteur de chaque poteau, dans l'ordre de `poteauxPositions`, et la plus longue. */
  hauteursPoteaux: number[];
  hauteurPoteauMax: number;
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
  /**
   * La fouille : son emprise, sa profondeur, son volume ; le remblai et l'evacuation. `nivellement` :
   * sur un sol en pente, les terres a rapporter sous les margelles et la plage pour les mettre au
   * niveau du bord haut (0 sur un terrain plat).
   */
  fouille: { emprise: PtBrut[]; profondeur: number; volume: number; remblai: number; evacuation: number; nivellement: number };
  /** Le sol sous le bassin quand le relief est lu (MD/spec-relief.md §6) : la reference est son point haut. */
  sol: SolSousEmprise | null;
  /** Les contours successifs vers l'exterieur : parois, margelles, plage. */
  parois: PtBrut[];
  margelleExt: PtBrut[];
  margellesMl: number;
  plageExt: PtBrut[];
  surfacePlage: number;
  plageBois: PlageBois | null;
  /** La terrasse du plan qui sert de plage (`plage: 'terrasse'`), si elle existe encore. */
  terrasseAssociee: { key: string; nom: string; surface: number } | null;
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

export const arrondi = (v: number, d = 2): number => Math.round(v * 10 ** d) / 10 ** d;

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
  // Le sol en pente : le bord du bassin est de niveau, `hauteurHorsSol` au-dessus du point le plus
  // haut du sol sous les parois ; la fouille est plus profonde la ou le sol monte, et les abords
  // bas se remblaient jusqu'a cette reference.
  const sol = solDuProjet(objets);
  const solSous = solSousEmprise(sol, parois);

  // La fouille : les parois plus la surlargeur de travail, sur la partie enterree et le fond.
  const profondeurFouille = profondeurEnterree > 1e-6 ? profondeurEnterree + ps.fond : (r.structure === 'kit' ? ps.fond : 0);
  const empriseFouille = elargir(contour, ps.paroi + (profondeurEnterree > 1e-6 ? ps.surlargeurFouille : 0.2));
  const volumeFouille = sol && solSous ? volumeFouilleEnPente(sol, solSous, empriseFouille, profondeurFouille) : shoelace(empriseFouille) * profondeurFouille;
  const volumeBassinEnterre = shoelace(parois) * profondeurEnterree;
  // Ce qui revient autour des parois : du gravier drainant pour une coque (achete), les terres pour le reste.
  const remblai = Math.max(0, volumeFouille - volumeBassinEnterre - shoelace(parois) * ps.fond);
  const evacuation = volumeFouille * FOISONNEMENT - (r.structure === 'coque' ? 0 : remblai);

  const margelleExt = bordDesMargelles(parois, r);
  const margellesMl = r.margelle ? perimetre(elargir(parois, r.largeurMargelle / 2)) : 0;
  // Une plage « terrasse du plan » est l'objet terrasse lui-meme : son contour est l'emprise
  // exterieure (barriere, plan de masse), sa surface celle du platelage autour des margelles.
  const terrasse = r.plage === 'terrasse' ? terrasseDeLaPiscine(o, objets) : undefined;
  const plageExt = terrasse ? terrasse.pts : plageCalculee(r.plage) ? elargir(margelleExt, r.largeurPlage) : margelleExt;
  const surfacePlage = r.plage === 'aucune' ? 0 : Math.max(0, shoelace(plageExt) - shoelace(margelleExt));
  const plageBois = r.plage === 'terrasse-bois' ? structurePlageBois(r, hauteurHorsSol, surfacePlage, margelleExt, perimetre(margelleExt), perimetre(plageExt), avertissements, sol && solSous ? { sol, zHaut: solSous.zHaut } : null) : null;
  const nivellement = sol && solSous ? volumeNivellement(sol, solSous, plageExt, parois) : 0;

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
  // Percer a une definition, celle du lien (engine/ouvrages/liens.ts) : le bord des margelles, la ou la terrasse s'arrete.
  const terrassesPercees = objets.filter(t => estTerrasse(t) && t.type === 'polygon' && perce(margelleExt, t.pts)).map(t => t.name);

  if (profondeurMax > 2.5) avertissements.push('Profondeur de ' + fr(profondeurMax) + ' m : au-delà de 2,50 m, le bassin sort des gammes courantes (coques, kits) et demande une étude.');
  if (hauteurHorsSol > ps.horsSolMax + 1e-9) avertissements.push('Hauteur hors-sol de ' + fr(hauteurHorsSol) + ' m : ' + libellePiscine(o, r, 'structure', (l) => l.toLowerCase()) + ' admet ' + fr(ps.horsSolMax) + ' m au plus sans étude de la poussée de l\'eau.');
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
    fouille: { emprise: empriseFouille, profondeur: profondeurFouille, volume: volumeFouille, remblai, evacuation: Math.max(0, evacuation), nivellement },
    sol: solSous,
    parois, margelleExt, margellesMl, plageExt, surfacePlage, plageBois,
    terrasseAssociee: terrasse ? { key: terrasse.key, nom: terrasse.name, surface: shoelace(terrasse.pts) } : null,
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
function structurePlageBois(r: ReglagesPiscine, hauteurHorsSol: number, surface: number, margelleExt: PtBrut[], perimInt: number, perimExt: number, avertissements: string[],
  pente: { sol: Sol; zHaut: number } | null = null): PlageBois {
  const lameH = PLAGE.lameEpaisseur / 1000;
  // Sur un sol en pente, la plage est de niveau : ses appuis descendent d'autant que le sol baisse
  // sous elle. C'est le point le plus bas sous la plage qui decide du mode (plots ou poteaux).
  const plageExt = elargir(margelleExt, r.largeurPlage);
  const descente = pente ? pente.zHaut - (solSousEmprise(pente.sol, plageExt)?.zBas ?? pente.zHaut) : 0;
  const supplementDe = (p: PtBrut): number => (pente ? pente.zHaut - (pente.sol.z(p) ?? pente.zHaut) : 0);
  const entraxeLambourdes = maxEntraxeLameCm({ epaisseurLame: PLAGE.lameEpaisseur, essenceBois: r.essencePlage }) / 100;
  // Le dessus de la plage affleure le dessus des margelles.
  const dessus = hauteurHorsSol + EPAISSEUR_MARGELLE_M;
  const hauteurPlotNecessaire = dessus - lameH - PLAGE.lambourde.h;
  const largeur = r.largeurPlage;
  const pasLame = PLAGE.lameLargeur + PLAGE.jeu;
  const lamesMl = surface / pasLame * 1.05;
  if (hauteurPlotNecessaire + descente <= PLOT_HAUTEUR_DTU_CM / 100) {
    const hauteurPlot = Math.max(PLAGE.plot.hauteurMin, hauteurPlotNecessaire);
    const portee = Math.min(PLOT_ENTRAXE_MAX_M, maxPorteeVisM({ soliveSection: PLAGE.lambourde.section, soliveEntraxe: entraxeLambourdes * 100 }));
    const anneaux = Math.max(2, Math.ceil(largeur / portee) + 1);
    const ossatureMl = surface / entraxeLambourdes + perimInt + perimExt;
    const appuis = Math.ceil(ossatureMl / portee);
    const decaissement = Math.max(0, lameH + PLAGE.lambourde.h + hauteurPlot - dessus);
    const tributaire = entraxeLambourdes * portee;
    return {
      mode: 'plots', dessus, entraxeLambourdes, portee, anneaux, lamesMl, ossatureMl, poutresMl: 0, appuis, poteaux: 0, hauteurPoteau: 0, hauteursPoteaux: [], hauteurPoteauMax: 0,
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
  const hauteursPoteaux = poteauxPositions.map(p => arrondi(hauteurPoteau + supplementDe(p)));
  const hauteurPoteauMax = hauteursPoteaux.length ? Math.max(...hauteursPoteaux) : hauteurPoteau;
  const ossatureMl = surface / PLAGE.solive.entraxe;
  // Un poteau d'un anneau intermediaire reprend une travee de chaque cote ; un poteau de rive une demie.
  const tributaire = PLAGE.poutre.entraxe * (largeur / travees) * (travees > 1 ? 1 : 0.5);
  const chargeAppuiKn = (CHARGE_PLAGE_KG_M2 + POIDS_PROPRE_PLAGE_KG_M2) * tributaire * 9.81 / 1000;
  if (dessus > 1.0) avertissements.push('Plage à ' + fr(dessus) + ' m du sol : au-delà d\'un mètre, un garde-corps de 1 m est obligatoire sur les côtés libres.');
  return {
    mode: 'poteaux', dessus, entraxeLambourdes: PLAGE.solive.entraxe, portee, anneaux, lamesMl, ossatureMl, poutresMl, appuis: 0, poteaux, hauteurPoteau, hauteursPoteaux, hauteurPoteauMax,
    chargeAppuiKn, anneauxPoutres, poteauxPositions, massifsM3: poteaux * PLAGE.massif.cote * PLAGE.massif.cote * PLAGE.massif.profondeur, decaissementM3: 0
  };
}

/**
 * Le volume de la fouille sur un sol en pente : cellule par cellule de la grille dans l'emprise, la
 * profondeur comptee depuis le sol reel jusqu'au fond de fouille (qui est de niveau, sous le bord
 * haut). Une emprise qui ne contient aucune cellule (grille a 5 m, petit bassin) garde le volume
 * d'un terrain plat.
 */
function volumeFouilleEnPente(sol: Sol, s: SolSousEmprise, emprise: PtBrut[], profondeurFouille: number): number {
  if (profondeurFouille <= 0) return 0;
  const cellules = cellulesDansPolygone(sol.relief, emprise).filter((c): c is typeof c & { z: number } => c.z !== null);
  if (!cellules.length) return shoelace(emprise) * profondeurFouille;
  const fond = s.zHaut - profondeurFouille;
  const aire = sol.relief.pas * sol.relief.pas;
  return cellules.reduce((v, c) => v + Math.max(0, c.z - sol.relief.zRef - fond) * aire, 0);
}

/** Les terres a rapporter autour du bassin (margelles et plage) pour les mettre au niveau du bord haut. */
function volumeNivellement(sol: Sol, s: SolSousEmprise, plageExt: PtBrut[], parois: PtBrut[]): number {
  const aire = sol.relief.pas * sol.relief.pas;
  return cellulesDansPolygone(sol.relief, plageExt)
    .filter((c): c is typeof c & { z: number } => c.z !== null && !pointInPolygon(c, parois))
    .reduce((v, c) => v + Math.max(0, s.zHaut - (c.z - sol.relief.zRef)) * aire, 0);
}
