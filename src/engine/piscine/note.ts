// La piscine, sa note de calcul (noteDeCalcul, noteEnTexte).
// Un morceau de engine/piscine.ts, qui les reexporte tous : le reste du programme importe depuis lui.

import { au } from '../../util/tableaux.js';
import { shoelace } from '../../geometry/basic.js';
import { libellePiscine, type ChampFermePiscine, REVANCHE_M, VITESSE_FILTRATION_M_H, M2_PAR_SKIMMER, M2_PAR_REFOULEMENT, M2_PAR_PROJECTEUR, M3_PAR_KW_PAC, TAXE_AMENAGEMENT_M2, PROFILS_STRUCTURE, FOISONNEMENT, EPAISSEUR_MARGELLE_M, LONGUEUR_MARGELLE_M, fr } from './reglages.js';
import { LIBELLE_REGIME, type PiscineCalculee } from './calcul.js';
import type { ObjetPlan } from '../../model/types.js';

// ---- Note de calcul --------------------------------------------------------------------------

export interface LigneNote { libelle: string; valeur: string; note?: string }
export interface SectionNote { titre: string; lignes: LigneNote[]; remarque?: string }

const m = (v: number) => fr(v) + ' m';
const minuscules = (l: string): string => l.toLowerCase();
const m2 = (v: number) => fr(v, 1) + ' m²';
const m3 = (v: number) => fr(v, 1) + ' m³';

/**
 * La note de calcul : ce que le moteur a retenu, section par section, avec la regle qui a servi.
 * Elle se lit dans le tiroir et s'imprime en annexe du dossier de mairie.
 */
export function noteDeCalcul(calc: PiscineCalculee, o?: ObjetPlan | null): SectionNote[] {
  // `o` : la piscine elle-meme, pour ecrire un mot hors vocabulaire tel qu'il est lu (libellePiscine) ; sans elle, les libelles retenus.
  const L = (cle: ChampFermePiscine, forme?: (l: string) => string) => libellePiscine(o, r, cle, forme);
  const r = calc.reglages, h = calc.hydraulique, ps = PROFILS_STRUCTURE[r.structure];
  const sections: SectionNote[] = [];
  const profondeurs = r.fond === 'plat' ? m(r.profondeurPetitBain) : m(r.profondeurPetitBain) + ' au petit bain, ' + m(r.profondeurGrandBain) + ' au grand bain';
  sections.push({
    titre: '1. Géométrie et volume',
    lignes: [
      { libelle: 'Implantation', valeur: L('implantation') + (calc.hauteurHorsSol > 0 ? ', parois à ' + m(calc.hauteurHorsSol) + ' au-dessus du sol' : '') },
      { libelle: 'Plan d\'eau', valeur: m2(calc.surface) + ', périmètre ' + m(calc.perimetre), note: 'Mesuré au nu intérieur des parois ; c\'est la surface que l\'urbanisme compte.' },
      { libelle: 'Fond', valeur: L('fond') + ' : ' + profondeurs + (r.fond === 'fosse' ? ' (fosse sur ' + Math.round(r.partFosse * 100) + ' % de la longueur)' : '') },
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
      { libelle: 'Évacuation', valeur: m3(calc.fouille.evacuation), note: 'Foisonnement de ' + Math.round((FOISONNEMENT - 1) * 100) + ' %.' },
      ...(calc.sol ? [{ libelle: 'Sol en pente (relief IGN)', valeur: 'bord haut à +' + m(calc.sol.zHaut) + ', bord bas à +' + m(calc.sol.zBas) + ' au-dessus du zéro du plan', note: 'Le bassin est de niveau sur le point haut ; la fouille est comptée cellule par cellule sur le sol réel.' },
        ...(calc.fouille.nivellement > 0.05 ? [{ libelle: 'Remblai de nivellement des abords', valeur: m3(calc.fouille.nivellement), note: 'Pour mettre margelles et plage au niveau du bord haut.' }] : [])] : [])
    ],
    remarque: 'Sans étude de sol : une nappe haute, un rocher ou un remblai récent changent la fouille, le drainage et le fond (plot de lestage, vide sanitaire, puits de décompression).'
  });
  const pression = 9.81 * calc.profondeurMax;
  const poussee = 9.81 * calc.hauteurParoi * calc.hauteurParoi / 2;
  const lignesStructure: LigneNote[] = [
    { libelle: 'Structure', valeur: L('structure') + ', ' + L('revetement', minuscules) },
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
    r.plage === 'terrasse'
      ? { libelle: 'Plage', valeur: calc.terrasseAssociee ? 'Terrasse « ' + calc.terrasseAssociee.nom + ' », ' + m2(calc.surfacePlage) + ' autour des margelles' : 'Terrasse du plan, pas encore créée', note: 'Structure, appuis et chiffrage dans la nomenclature de la terrasse ; le bassin y fait une ouverture bordée d\'un chevêtre.' }
      : { libelle: 'Plage', valeur: L('plage') + (r.plage !== 'aucune' ? ', ' + m(r.largeurPlage) + ' de large, ' + m2(calc.surfacePlage) : '') }
  ];
  const pb = calc.plageBois;
  if (pb) {
    lignesAbords.push(
      { libelle: 'Dessus de la plage', valeur: m(pb.dessus) + ' au-dessus du sol fini', note: 'Affleure le dessus des margelles (' + Math.round(EPAISSEUR_MARGELLE_M * 100) + ' cm).' },
      { libelle: 'Lames', valeur: '27 × 145 mm, ' + fr(pb.lamesMl, 1) + ' ml (' + L('essencePlage') + ')' }
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
    { libelle: 'Local technique', valeur: L('local') },
    { libelle: 'Éclairage', valeur: calc.equipements.projecteurs ? calc.equipements.projecteurs + ' projecteur(s) LED 12 V (un pour ' + M2_PAR_PROJECTEUR + ' m²)' : 'Aucun' },
    { libelle: 'Traitement', valeur: L('traitement') + (calc.equipements.electrolyseur ? ', électrolyseur de ' + Math.ceil(calc.volume / 10) * 10 + ' m³ et régulation pH' : '') },
    { libelle: 'Chauffage', valeur: L('chauffage') + (r.chauffage === 'pac' ? ' de ' + fr(calc.equipements.puissancePacKw, 1) + ' kW' : '') }
  ];
  if (r.chauffage === 'pac') au(lignesEquip, lignesEquip.length - 1).note = 'Un kilowatt pour ' + M3_PAR_KW_PAC + ' m³ d\'eau, pour une saison d\'avril à septembre ; une couverture divise la consommation par deux.';
  sections.push({ titre: '6. Équipements', lignes: lignesEquip });

  const distances = calc.distances.map(d => d.nom + ' : ' + m(d.distance)).join(' ; ');
  const lignesRegl: LigneNote[] = [
    { libelle: 'Sécurité', valeur: L('securite') + ' — ' + fr(calc.securite.quantite, calc.securite.unite === 'u' ? 0 : 1) + ' ' + calc.securite.unite, note: 'Obligatoire pour tout bassin enterré ou semi-enterré non clos (loi du 3 janvier 2003, art. L.128-1 du CCH). Un bassin hors-sol en est dispensé mais reste conseillé.' },
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
