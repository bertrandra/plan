// Les sections de l'inspecteur pour une piscine (ui/champs/).
//
// Le projet se construit par etapes, dans l'ordre ou l'on decide : 1. l'implantation et la
// structure du bassin, 2. ses profondeurs, 3. ses abords (margelles, plage), 4. ses equipements
// (filtration, lumiere, traitement, chauffage), 5. la securite et l'urbanisme ; puis ce que le
// moteur en tire (engine/piscine.ts) : 6. le metrage et le chiffrage, et les prix, replies. Chaque
// etape ne montre que ce qui a un sens apres les choix precedents : pas de pente sur un bassin
// rond, pas d'essence sans plage en bois, pas de hauteur hors-sol sur un bassin enterre.
//
// Les reglages ne sont ecrits dans l'objet que lorsqu'on les touche : `piscineDe` comble le
// reste a la lecture. La note de calcul, elle, se lit dans le tiroir (zones/resultats/NoteCalcul).

import {
  calculerPiscine, chiffrerPiscine, fr, LIBELLE_CHAUFFAGE, LIBELLE_FOND, LIBELLE_IMPLANTATION, LIBELLE_LOCAL, LIBELLE_PLAGE,
  LIBELLE_REGIME, LIBELLE_REVETEMENT, LIBELLE_SECURITE, LIBELLE_STRUCTURE, LIBELLE_TRAITEMENT, piscineDe, prixSaisi,
  REVETEMENTS_PAR_STRUCTURE, TAXE_AMENAGEMENT_M2, plageCalculee, terrasseDeLaPiscine, type ReglagesPiscine
} from '../../engine/piscine.js';
import { ESSENCE_PRICES } from '../../engine/constantes.js';
import { euros } from '../chiffrage.js';
import type { Piscine, PlagePiscine, StructurePiscine } from '../../model/types.js';
import type { Champ, ContexteChamps, Effet, Section } from './types.js';

const EFFETS: Effet[] = ['rendu', 'scene3d', 'inspecteur', 'terrasse'];

const reglages = (c: ContexteChamps): ReglagesPiscine => piscineDe(c.obj);
/** Les libelles du menu Plage : plus explicites que ceux des documents. */
const LIBELLE_PLAGE_MENU: Record<PlagePiscine, string> = {
  aucune: LIBELLE_PLAGE.aucune, terrasse: 'Terrasse bois du plan (sur plots, coins libres)', dallage: LIBELLE_PLAGE.dallage,
  'terrasse-bois': 'Plage bois calculée (projet antérieur)'
};
/** Ecrit un reglage dans l'objet, en creant `piscine` au premier reglage touche. */
function poser<K extends keyof Piscine>(c: ContexteChamps, cle: K, v: Piscine[K]): void {
  c.obj.piscine = { ...(c.obj.piscine || {}), [cle]: v };
}
const estPolygone = (c: ContexteChamps) => c.obj.type === 'polygon';
const fondPente = (c: ContexteChamps) => reglages(c).fond !== 'plat';
const horsSol = (c: ContexteChamps) => reglages(c).implantation !== 'enterree';
const cotes = (c: ContexteChamps) => c.obj.type === 'polygon' ? c.obj.pts.map((_, i) => ({ valeur: String(i), libelle: c.obj.segmentNames?.[i] || ('Côté ' + (i + 1)) })) : [];

function choix<K extends keyof Piscine & keyof ReglagesPiscine & string>(cle: K, libelle: string, libelles: Record<string, string>, aide?: string, visible?: (c: ContexteChamps) => boolean): Champ {
  return {
    type: 'choix', cle, libelle, effets: EFFETS, ...(aide ? { aide } : {}), ...(visible ? { visible } : {}),
    options: () => Object.entries(libelles).map(([valeur, l]) => ({ valeur, libelle: l })),
    lire: (c) => String(reglages(c)[cle]), ecrire: (c, v) => poser(c, cle, v as Piscine[K])
  };
}
function nombre<K extends keyof Piscine & keyof ReglagesPiscine & string>(cle: K, libelle: string, unite: string, min: number, max: number, pas: number, decimales: number, aide?: string, visible?: (c: ContexteChamps) => boolean): Champ {
  const facteur = unite === 'cm' ? 100 : 1;
  return {
    type: 'nombre', cle, libelle, unite, min, max, pas, decimales, effets: EFFETS, ...(aide ? { aide } : {}), ...(visible ? { visible } : {}),
    lire: (c) => Math.round((reglages(c)[cle] as number) * facteur * 100) / 100,
    ecrire: (c, v) => { if (!(v >= min && v <= max)) return false; poser(c, cle, (v / facteur) as Piscine[K]); }
  };
}
const couleur = (cle: 'couleurEau' | 'couleurMargelle' | 'couleurPlage', libelle: string, visible?: (c: ContexteChamps) => boolean): Champ =>
  ({ type: 'couleur', cle, libelle, effets: ['rendu', 'scene3d'], ...(visible ? { visible } : {}), lire: (c) => reglages(c)[cle], ecrire: (c, v) => poser(c, cle, v) });

const sectionImplantation: Section = {
  id: 'piscine', titre: 'Piscine · 1. Implantation et structure',
  explication: 'Le contour est le bord de l\'eau : la surface du plan d\'eau, celle que l\'urbanisme compte. Parois, margelles et plage s\'ajoutent vers l\'extérieur.',
  champs: [
    choix('implantation', 'Implantation', LIBELLE_IMPLANTATION, 'Enterrée : parois au ras du sol. Semi-enterrée ou hors-sol : les parois dépassent du sol'),
    nombre('hauteurHorsSol', 'Hauteur hors du sol', 'm', 0.1, 2.5, 0.05, 2, 'Du sol fini au haut des parois', horsSol),
    {
      type: 'choix', cle: 'structure', libelle: 'Structure', effets: EFFETS,
      aide: 'Coque : livrée d\'une pièce et posée à la grue. Maçonnerie : radier et blocs à bancher, toute forme. Kit : panneaux assemblés, surtout hors-sol',
      options: () => Object.entries(LIBELLE_STRUCTURE).map(([valeur, libelle]) => ({ valeur, libelle })),
      lire: (c) => reglages(c).structure,
      // Le revetement suit la structure tant qu'on ne l'a pas choisi : une coque n'a pas de liner.
      ecrire: (c, v) => { const p: Piscine = { ...(c.obj.piscine || {}), structure: v as StructurePiscine }; delete p.revetement; c.obj.piscine = p; }
    },
    {
      type: 'choix', cle: 'revetement', libelle: 'Revêtement', effets: EFFETS, visible: (c) => reglages(c).structure !== 'coque',
      options: (c) => REVETEMENTS_PAR_STRUCTURE[reglages(c).structure].map(v => ({ valeur: v, libelle: LIBELLE_REVETEMENT[v] })),
      lire: (c) => reglages(c).revetement, ecrire: (c, v) => poser(c, 'revetement', v as Piscine['revetement'])
    },
    couleur('couleurEau', 'Couleur de l\'eau')
  ]
};

const sectionProfondeurs: Section = {
  id: 'profondeursPiscine', titre: '2. Profondeurs',
  champs: [
    choix('fond', 'Fond', LIBELLE_FOND, 'La pente descend du côté du petit bain vers le côté opposé', estPolygone),
    {
      type: 'nombre', cle: 'profondeurPetitBain', libelle: 'Profondeur', unite: 'm', min: 0.3, max: 4, pas: 0.05, decimales: 2, effets: EFFETS,
      note: (c) => fondPente(c) ? 'petit bain' : '',
      aide: 'Profondeur d\'eau ; au petit bain quand le fond n\'est pas plat',
      lire: (c) => reglages(c).profondeurPetitBain, ecrire: (c, v) => { if (!(v >= 0.3 && v <= 4)) return false; poser(c, 'profondeurPetitBain', v); }
    },
    nombre('profondeurGrandBain', 'Profondeur au grand bain', 'm', 0.3, 4, 0.05, 2, 'Au point le plus profond', fondPente),
    {
      type: 'choix', cle: 'cotePetitBain', libelle: 'Côté du petit bain', effets: EFFETS, visible: (c) => estPolygone(c) && fondPente(c),
      options: cotes, lire: (c) => String(reglages(c).cotePetitBain), ecrire: (c, v) => poser(c, 'cotePetitBain', parseInt(v, 10) || 0)
    },
    {
      type: 'nombre', cle: 'partFosse', libelle: 'Part de la fosse', unite: '%', min: 20, max: 70, pas: 5, decimales: 0, effets: EFFETS, visible: (c) => reglages(c).fond === 'fosse',
      aide: 'La part de la longueur du bassin, côté grand bain, prise par la descente et la fosse',
      lire: (c) => Math.round(reglages(c).partFosse * 100), ecrire: (c, v) => { if (!(v >= 20 && v <= 70)) return false; poser(c, 'partFosse', v / 100); }
    },
    {
      type: 'lecture', cle: 'volume', libelle: 'Volume d\'eau',
      valeur: (c) => { const calc = calculerPiscine(c.obj); return calc ? fr(calc.volume, 1) + ' m³ · plan d\'eau ' + fr(calc.surface, 1) + ' m² · parois ' + fr(calc.hauteurParoi) + ' m' : '—'; }
    }
  ]
};

const sectionAbords: Section = {
  id: 'abordsPiscine', titre: '3. Abords',
  explication: 'Margelles sur les parois, puis la plage. Une plage en bois est une terrasse du plan, posée sur plots autour du bassin : vous en tirez les coins, elle se chiffre comme toute terrasse, et le bassin la perce. Rien ne s\'appuie sur le bassin.',
  champs: [
    { type: 'case', cle: 'margelle', libelle: 'Margelles', effets: EFFETS, lire: (c) => reglages(c).margelle, ecrire: (c, v) => poser(c, 'margelle', v) },
    nombre('largeurMargelle', 'Largeur des margelles', 'cm', 20, 100, 1, 0, undefined, (c) => reglages(c).margelle),
    couleur('couleurMargelle', 'Couleur des margelles', (c) => reglages(c).margelle),
    {
      type: 'choix', cle: 'plage', libelle: 'Plage', aide: 'Ce qui entoure le bassin au-delà des margelles', effets: EFFETS,
      // La plage en bois calculee par la piscine (jusqu'a la 2.2.0) n'est plus proposee : elle reste
      // dans la liste d'un projet qui l'a, pour s'afficher et se chiffrer comme avant.
      options: (c) => (['aucune', 'terrasse', 'dallage', 'terrasse-bois'] as PlagePiscine[])
        .filter(v => v !== 'terrasse-bois' || reglages(c).plage === 'terrasse-bois')
        .map(v => ({ valeur: v, libelle: LIBELLE_PLAGE_MENU[v] })),
      lire: (c) => reglages(c).plage,
      ecrire: (c, v) => {
        poser(c, 'plage', v as PlagePiscine);
        // Choisir la terrasse la pose aussitot autour du bassin, si elle n'existe pas encore.
        if (v === 'terrasse' && !terrasseDeLaPiscine(c.obj, c.objets)) c.executerCommande('objet.terrassePiscine');
      }
    },
    {
      type: 'lecture', cle: 'terrassePlage', libelle: 'Terrasse', visible: (c) => reglages(c).plage === 'terrasse',
      valeur: (c) => {
        const calc = calculerPiscine(c.obj, c.objets);
        const t = calc?.terrasseAssociee;
        return t && calc ? '« ' + t.nom + ' » — ' + fr(calc.surfacePlage, 1) + ' m² de platelage autour des margelles' : 'Pas encore posée';
      }
    },
    {
      type: 'bouton', cle: 'boutonTerrassePlage', libelle: '', nom: 'Créer ou sélectionner la terrasse de la plage', visible: (c) => reglages(c).plage === 'terrasse',
      texte: (c) => terrasseDeLaPiscine(c.obj, c.objets) ? 'Sélectionner la terrasse' : 'Poser la terrasse autour du bassin',
      agit: { commande: 'objet.terrassePiscine' }, executer: (c) => c.executerCommande('objet.terrassePiscine')
    },
    nombre('largeurPlage', 'Largeur de la plage', 'm', 0.3, 10, 0.1, 1, 'La même tout autour du bassin ; pour une terrasse, celle qu\'elle aura à sa pose',
      (c) => { const r = reglages(c); return plageCalculee(r.plage) || (r.plage === 'terrasse' && !terrasseDeLaPiscine(c.obj, c.objets)); }),
    {
      type: 'choix', cle: 'essencePlage', libelle: 'Essence des lames', effets: EFFETS, visible: (c) => reglages(c).plage === 'terrasse-bois',
      options: () => Object.entries(ESSENCE_PRICES).filter(([k]) => k !== 'autre').map(([valeur, e]) => ({ valeur, libelle: e.label })),
      lire: (c) => reglages(c).essencePlage, ecrire: (c, v) => poser(c, 'essencePlage', v)
    },
    couleur('couleurPlage', 'Couleur de la plage', (c) => plageCalculee(reglages(c).plage)),
    {
      type: 'lecture', cle: 'structurePlage', libelle: 'Structure de la plage', visible: (c) => reglages(c).plage === 'terrasse-bois',
      valeur: (c) => {
        const pb = calculerPiscine(c.obj)?.plageBois;
        if (!pb) return '—';
        return pb.mode === 'plots'
          ? 'Lambourdes 45 × 70 à ' + Math.round(pb.entraxeLambourdes * 100) + ' cm sur ' + pb.appuis + ' plots (portée ' + Math.round(pb.portee * 100) + ' cm), dessus à ' + fr(pb.dessus) + ' m'
          : 'Solives 63 × 175 à 50 cm sur ' + pb.anneaux + ' anneaux de poutres 75 × 200, ' + pb.poteaux + ' poteaux 120 × 120 de ' + fr(pb.hauteurPoteau) + ' m sur massifs, dessus à ' + fr(pb.dessus) + ' m';
      }
    }
  ]
};

const sectionEquipements: Section = {
  id: 'equipementsPiscine', titre: '4. Équipements',
  champs: [
    nombre('tempsRecyclage', 'Temps de recyclage', 'h', 1, 12, 0.5, 1, 'Le temps pour passer tout le volume au filtre : 4 h en usage familial, moins pour une eau chaude ou très fréquentée'),
    {
      type: 'lecture', cle: 'filtration', libelle: 'Filtration',
      valeur: (c) => { const h = calculerPiscine(c.obj)?.hydraulique; return h ? fr(h.debit, 1) + ' m³/h · filtre Ø ' + h.diametreFiltre + ' · pompe ' + fr(h.puissancePompeCv, 2) + ' CV · ' + h.skimmers + ' skimmer(s), ' + h.refoulements + ' refoulements' : '—'; }
    },
    choix('local', 'Local technique', LIBELLE_LOCAL),
    nombre('distanceLocal', 'Distance au local', 'm', 0.5, 60, 0.5, 1, 'Du bord du bassin au local : la longueur des canalisations en dépend. Au-delà de 10 m, les pertes de charge grossissent la pompe'),
    { type: 'case', cle: 'eclairage', libelle: 'Éclairage immergé', effets: EFFETS, lire: (c) => reglages(c).eclairage, ecrire: (c, v) => poser(c, 'eclairage', v) },
    choix('traitement', 'Traitement de l\'eau', LIBELLE_TRAITEMENT, 'L\'électrolyse au sel ajoute l\'électrolyseur et la régulation du pH au chiffrage'),
    choix('chauffage', 'Chauffage', LIBELLE_CHAUFFAGE, 'Une pompe à chaleur se dimensionne sur le volume : un kilowatt pour six mètres cubes')
  ]
};

const sectionSecurite: Section = {
  id: 'securitePiscine', titre: '5. Sécurité et urbanisme',
  explication: 'Un dispositif de sécurité normalisé est obligatoire pour tout bassin enterré ou semi-enterré. Le bassin se déclare en mairie dès 10 m².',
  champs: [
    choix('securite', 'Dispositif de sécurité', LIBELLE_SECURITE),
    { type: 'lecture', cle: 'regime', libelle: 'Autorisation', valeur: (c) => { const calc = calculerPiscine(c.obj, c.objets); return calc ? LIBELLE_REGIME[calc.regime] + (calc.secteurProtege ? ' · secteur protégé' : '') : '—'; } },
    {
      type: 'lecture', cle: 'distances', libelle: 'Distances aux limites',
      valeur: (c) => { const d = calculerPiscine(c.obj, c.objets)?.distances ?? []; return d.length ? d.map(x => x.nom + ' ' + fr(x.distance) + ' m').join(' · ') : 'pas de parcelle dans le plan'; }
    },
    { type: 'lecture', cle: 'taxe', libelle: 'Taxe d\'aménagement', valeur: (c) => { const calc = calculerPiscine(c.obj); return calc ? fr(calc.taxeAmenagementBase, 0) + ' € de base (' + TAXE_AMENAGEMENT_M2 + ' €/m²) × taux communal et départemental' : '—'; } },
    {
      type: 'bouton', cle: 'dossierMairie', libelle: '', nom: 'Dossier mairie (PDF)', texte: () => 'Dossier mairie (PDF)',
      explication: 'Plan de situation, plan de masse coté, coupe, aide au remplissage du cerfa, note de calcul.',
      agit: { commande: 'export.dossierPiscine' }, executer: (c) => c.executerCommande('export.dossierPiscine')
    }
  ]
};

/** `'12,5 m³'`, `'3 u'`, `'1 forfait'`. */
const quantite = (qte: number, unite: string): string => (unite === 'u' || unite === 'forfait' ? String(Math.round(qte)) : fr(qte, 1)) + ' ' + unite;

/** Le metrage et le chiffrage, une ligne par poste : la liste depend des choix, la section aussi. */
export function sectionChiffragePiscine(c: ContexteChamps): Section {
  const calc = calculerPiscine(c.obj, c.objets);
  const champs: Champ[] = [];
  if (calc) {
    const ch = chiffrerPiscine(calc);
    ch.lignes.forEach(l => champs.push({
      type: 'lecture', cle: 'chiffrage-' + l.poste, libelle: l.label,
      valeur: () => quantite(l.qte, l.unite) + ' · ' + (l.prixReel !== null && l.prixReel !== undefined ? euros(l.prixReel) + ' (prix saisi)' : euros(l.prixBas * l.qte) + ' – ' + euros(l.prixHaut * l.qte))
    }));
    champs.push({
      type: 'lecture', cle: 'chiffrage-total', libelle: 'Estimation TTC',
      valeur: () => euros(ch.bas) + ' – ' + euros(ch.haut) + (ch.reel !== null ? ' · ' + euros(ch.reel) + ' sur les postes au prix saisi' : '') + ', fourniture et pose'
    });
    calc.avertissements.forEach((t, i) => champs.push({ type: 'alerte', cle: 'chiffrage-alerte-' + i, libelle: '', nom: 'Alerte : ' + t, texte: () => t }));
  } else {
    champs.push({ type: 'alerte', cle: 'chiffrage-vide', libelle: '', nom: 'Alerte : contour inutilisable', texte: () => 'Le bassin doit avoir au moins trois coins et plus d\'un demi-mètre carré pour être calculé.' });
  }
  return {
    id: 'chiffragePiscine', titre: '6. Métrage et chiffrage',
    explication: 'Ordres de grandeur TTC fourniture et pose, par poste et dans l\'ordre du chantier. Les prix se règlent dans la section Prix ; la note de calcul est dans le tiroir des résultats.',
    champs
  };
}

/** Les prix unitaires par poste : ceux du chiffrage en cours, saisis ou indicatifs. */
export function sectionPrixPiscine(c: ContexteChamps): Section {
  const calc = calculerPiscine(c.obj, c.objets);
  const champs: Champ[] = [];
  if (calc) {
    chiffrerPiscine(calc).lignes.forEach(l => champs.push({
      type: 'nombre', cle: 'prix-' + l.poste, libelle: l.label, unite: '€/' + l.unite, pas: 1, min: 0, decimales: 0, effets: ['inspecteur'],
      note: (cx) => prixSaisi(reglages(cx), l.poste) !== undefined ? 'saisi' : 'indicatif ' + euros(l.prixBas) + ' – ' + euros(l.prixHaut),
      lire: (cx) => prixSaisi(reglages(cx), l.poste) ?? Math.round((l.prixBas + l.prixHaut) / 2),
      ecrire: (cx, v) => { if (!(v >= 0)) return false; poser(cx, 'prix', { ...reglages(cx).prix, [l.poste]: v }); }
    }));
  }
  return {
    id: 'prixPiscine', titre: 'Prix', repliee: true,
    explication: 'Prix unitaires TTC fourniture et pose. Un prix saisi remplace la fourchette indicative de son poste ; les devis d\'entreprise s\'y reportent poste par poste.',
    champs
  };
}

/** Les sections propres a une piscine, dans l'ordre des etapes. */
export function sectionsPiscine(c: ContexteChamps): Section[] {
  return [sectionImplantation, sectionProfondeurs, sectionAbords, sectionEquipements, sectionSecurite, sectionChiffragePiscine(c), sectionPrixPiscine(c)];
}
