// La piscine, son chiffrage, poste par poste (chiffrerPiscine).
// Un morceau de engine/piscine.ts, qui les reexporte tous : le reste du programme importe depuis lui.

import { shoelace } from '../../geometry/basic.js';
import { essenceDe } from '../bois/essences.js';
import type { LigneBom, LocalTechniquePiscine, ObjetPlan } from '../../model/types.js';
import { libellePiscine, type ChampFermePiscine, PROFILS_STRUCTURE, LONGUEUR_MARGELLE_M, PLAGE, type ReglagesPiscine, fr } from './reglages.js';
import { perimetre } from './geometrie.js';
import { type PiscineCalculee, arrondi } from './calcul.js';

// ---- Chiffrage -------------------------------------------------------------------------------

/** Les prix par defaut, en euros TTC fourniture et pose : des ordres de grandeur, bas et haut. */
const PRIX: Record<string, { bas: number; haut: number }> = {
  terrassement: { bas: 25, haut: 45 },        // m³ de deblai, evacuation comprise
  nivellement: { bas: 20, haut: 40 },         // m³ de remblai compacte par couches, terres du deblai ou rapportees
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

export function chiffrerPiscine(calc: PiscineCalculee, o?: ObjetPlan | null): ChiffragePiscine {
  // `o` : la piscine elle-meme, pour qu'un mot hors vocabulaire s'ecrive tel qu'il est lu dans le libelle d'une ligne (libellePiscine).
  const L = (cle: ChampFermePiscine, forme?: (l: string) => string) => libellePiscine(o, r, cle, forme);
  const r = calc.reglages, ps = PROFILS_STRUCTURE[r.structure];
  const lignes: LigneBom[] = [];
  const ligne = (poste: string, label: string, qte: number, unite: string, prix = PRIX[poste] ?? { bas: 0, haut: 0 }) => {
    if (!(qte > 1e-9)) return;
    const saisi = prixSaisi(r, poste);
    lignes.push({ poste, label, qte: arrondi(qte), unite, prixBas: prix.bas, prixHaut: prix.haut, prixReel: saisi !== undefined ? arrondi(saisi * qte) : null });
  };
  const f = calc.fouille;
  if (f.volume > 0) ligne('terrassement', 'Terrassement : déblai, mise en dépôt et évacuation (' + fr(f.evacuation, 1) + ' m³ foisonnés)' + (calc.sol ? ' — fouille sur le sol réel (relief IGN)' : ''), f.volume, 'm³');
  if (f.nivellement > 0.05) ligne('nivellement', 'Remblai de nivellement des abords au niveau du bord haut (sol en pente)', f.nivellement, 'm³');
  const surfaceParois = calc.perimetre * calc.hauteurParoi;
  const surfaceInterieure = calc.surface + calc.perimetre * calc.profondeurMax;
  if (r.structure === 'maconnerie') {
    ligne('radier', 'Radier béton armé de ' + Math.round(ps.fond * 100) + ' cm', shoelace(calc.parois) * ps.fond, 'm³');
    ligne('murs', 'Parois en blocs à bancher de 27 cm, béton et aciers, ceinture', surfaceParois, 'm²');
    ligne(r.revetement, 'Revêtement : ' + L('revetement', (l) => l.toLowerCase()) + (r.revetement === 'liner' ? ', feutre et profilés' : ''), surfaceInterieure, 'm²');
  } else if (r.structure === 'coque') {
    ligne('coque', 'Coque polyester, livrée (plan d\'eau ' + fr(calc.surface, 1) + ' m²)', calc.surface, 'm²');
    ligne('grutage', 'Grutage et pose de la coque', 1, 'forfait');
    ligne('gravierDrainant', 'Lit de pose et remblai en gravier drainant', shoelace(calc.parois) * ps.fond + f.remblai, 'm³');
    if (r.margelle) ligne('ceinture', 'Dalle de ceinture béton sous les margelles', calc.perimetre, 'ml');
  } else {
    ligne('dalle', 'Dalle béton armé de 15 cm sous le bassin', shoelace(calc.parois), 'm²');
    ligne('kit', 'Kit panneaux (structure, jambes de force, margelle de kit)', calc.surface, 'm²');
    ligne(r.revetement, 'Revêtement : ' + L('revetement', (l) => l.toLowerCase()) + ', feutre et profilés', surfaceInterieure, 'm²');
  }
  if (r.margelle) ligne('margelles', 'Margelles de ' + Math.round(r.largeurMargelle * 100) + ' cm (' + Math.ceil(calc.margellesMl / LONGUEUR_MARGELLE_M) + ' pièces)', calc.margellesMl, 'ml');
  const pb = calc.plageBois;
  if (pb) {
    const essence = essenceDe(r.essencePlage);
    // Le prix d'une lame suit l'essence : celui du m² ramene au metre lineaire de lame.
    ligne('plageLames', 'Plage : lames 27 × 145 (' + L('essencePlage') + ')', pb.lamesMl, 'ml', { bas: Math.max(PRIX.plageLames?.bas ?? 0, essence.bas * PLAGE.lameLargeur), haut: Math.max(PRIX.plageLames?.haut ?? 0, essence.haut * PLAGE.lameLargeur) });
    ligne('plageOssature', pb.mode === 'plots' ? 'Plage : lambourdes 45 × 70 (entraxe ' + Math.round(pb.entraxeLambourdes * 100) + ' cm)' : 'Plage : solives 63 × 175 (entraxe 50 cm)', pb.ossatureMl, 'ml');
    if (pb.mode === 'plots') ligne('plageAppuis', 'Plage : plots réglables (portée ' + Math.round(pb.portee * 100) + ' cm)', pb.appuis, 'u');
    else {
      ligne('plagePoutres', 'Plage : poutres 75 × 200 sur ' + pb.anneaux + ' anneaux', pb.poutresMl, 'ml');
      ligne('plagePoteaux', 'Plage : poteaux 120 × 120 de ' + (pb.hauteurPoteauMax > pb.hauteurPoteau + 0.005 ? fr(pb.hauteurPoteau) + ' à ' + fr(pb.hauteurPoteauMax) + ' m (sol en pente)' : fr(pb.hauteurPoteau) + ' m') + ' sur massif béton 40 × 40 × 50', pb.poteaux, 'u');
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
  ligne('local', L('local'), r.local === 'existant' ? 0 : 1, 'forfait', PRIX_LOCAL[r.local]);
  ligne('electricite', 'Coffret électrique, liaison, différentiel 30 mA, liaison équipotentielle', 1, 'forfait');
  if (calc.equipements.projecteurs) ligne('projecteurs', 'Projecteurs LED immergés', calc.equipements.projecteurs, 'u');
  if (calc.equipements.electrolyseur) ligne('electrolyseur', 'Électrolyseur au sel et régulation pH (' + Math.ceil(calc.volume / 10) * 10 + ' m³)', 1, 'forfait');
  if (r.chauffage === 'pac') ligne('pac', 'Pompe à chaleur de ' + fr(calc.equipements.puissancePacKw, 1) + ' kW', calc.equipements.puissancePacKw, 'kW');
  else if (r.chauffage === 'solaire') ligne('solaire', 'Capteurs solaires (la moitié du plan d\'eau)', calc.surface / 2, 'm²');
  else if (r.chauffage === 'echangeur') ligne('echangeur', 'Échangeur sur chaudière, circulateur et régulation', 1, 'forfait');
  const s = calc.securite;
  ligne(s.dispositif, 'Sécurité : ' + L('securite'), s.quantite, s.unite);
  ligne('miseEnEau', 'Mise en eau', calc.volume, 'm³');

  let bas = 0, haut = 0, reel = 0, unReel = false;
  lignes.forEach(l => {
    bas += l.prixBas * l.qte; haut += l.prixHaut * l.qte;
    if (l.prixReel !== null && l.prixReel !== undefined) { reel += l.prixReel; unReel = true; }
  });
  return { lignes, bas, haut, reel: unReel ? reel : null };
}
