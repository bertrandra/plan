// La section « Note de calcul » d'une pergola ou d'un carport (ui/champs/).
//
// Les hypotheses (regions de neige et de vent, altitude, terrain, materiau) se reglent ici ; les
// resultats sont ceux d'engine/noteCalcul.ts, piece par piece, avec la section qui suffit quand
// celle en place ne passe pas. La note complete, avec ses combinaisons et ses limites, sort en PDF
// par la commande `export.noteCalcul`.

import { hypothesesDe, noteDeCalcul, SK200, TERRAINS, VB0, ZONES_NEIGE, type NoteCalcul, type VerifPiece } from '../../engine/noteCalcul.js';
import { libelleSection, LIBELLE_ROLE, pergolaDe } from '../../engine/pergola.js';
import type { CategorieTerrain, HypothesesCalcul, ZoneNeige } from '../../model/types.js';
import type { Champ, ContexteChamps, Effet, Section } from './types.js';

const EFFETS: Effet[] = ['inspecteur'];
const fr = (v: number, d = 2): string => v.toFixed(d).replace('.', ',');
const pct = (t: number): string => Math.round(t * 100) + ' %';

/** Ecrit une hypothese dans l'objet, en creant `pergola.calcul` au premier reglage touche. */
function poser<K extends keyof HypothesesCalcul>(c: ContexteChamps, cle: K, v: HypothesesCalcul[K] | undefined): void {
  const calcul: HypothesesCalcul = { ...(c.obj.pergola?.calcul || {}) };
  if (v === undefined) delete calcul[cle]; else calcul[cle] = v;
  c.obj.pergola = { ...(c.obj.pergola || {}), calcul };
}

const hyp = (c: ContexteChamps) => hypothesesDe(c.obj, pergolaDe(c.obj));
const enBois = (c: ContexteChamps) => pergolaDe(c.obj).materiau === 'bois';

const CHAMPS_HYPOTHESES: Champ[] = [
  {
    type: 'choix', cle: 'zoneNeige', libelle: 'Région de neige', effets: EFFETS,
    aide: 'Carte de l\'annexe nationale de NF EN 1991-1-3 : la région de la commune du projet',
    options: () => [{ valeur: '', libelle: 'À choisir' }, ...ZONES_NEIGE.map(z => ({ valeur: z, libelle: z + ' — ' + fr(SK200[z]) + ' kN/m² à 200 m' }))],
    lire: (c) => hyp(c).zoneNeige ?? '', ecrire: (c, v) => poser(c, 'zoneNeige', v ? v as ZoneNeige : undefined)
  },
  {
    type: 'choix', cle: 'zoneVent', libelle: 'Région de vent', effets: EFFETS,
    aide: 'Carte de l\'annexe nationale de NF EN 1991-1-4 : la région de la commune du projet',
    options: () => [{ valeur: '', libelle: 'À choisir' }, ...Object.keys(VB0).map(z => ({ valeur: z, libelle: 'Région ' + z + ' — ' + VB0[Number(z)] + ' m/s' }))],
    lire: (c) => String(hyp(c).zoneVent ?? ''), ecrire: (c, v) => poser(c, 'zoneVent', v ? Number(v) : undefined)
  },
  {
    type: 'nombre', cle: 'altitude', libelle: 'Altitude', unite: 'm', pas: 10, min: 0, max: 2000, decimales: 0, effets: EFFETS,
    aide: 'Altitude du terrain : la neige augmente au-dessus de 200 m',
    lire: (c) => hyp(c).altitude, ecrire: (c, v) => { if (!(v >= 0 && v <= 2000)) return false; poser(c, 'altitude', v); }
  },
  {
    type: 'choix', cle: 'terrain', libelle: 'Catégorie de terrain', effets: EFFETS,
    aide: 'La rugosité des abords, au vent de l\'ouvrage (NF EN 1991-1-4, annexe nationale)',
    options: () => (Object.keys(TERRAINS) as CategorieTerrain[]).map(t => ({ valeur: t, libelle: TERRAINS[t].libelle })),
    lire: (c) => hyp(c).terrain, ecrire: (c, v) => poser(c, 'terrain', v as CategorieTerrain)
  },
  {
    type: 'nombre', cle: 'obstruction', libelle: 'Obstruction sous le toit', unite: '%', pas: 10, min: 0, max: 100, decimales: 0, effets: EFFETS,
    aide: 'Part du passage du vent bouchée sous le toit (φ) : une voiture garée, du mobilier, un mur. Elle augmente le soulèvement',
    lire: (c) => Math.round(hyp(c).obstruction * 100), ecrire: (c, v) => { if (!(v >= 0 && v <= 100)) return false; poser(c, 'obstruction', v / 100); }
  },
  {
    type: 'nombre', cle: 'poidsCouverture', libelle: 'Poids de la couverture', unite: 'kg/m²', pas: 1, min: 0, max: 200, decimales: 1, effets: EFFETS,
    aide: 'Toile : 0,5 ; bac acier ou polycarbonate : 10 ; tuiles : 45',
    lire: (c) => hyp(c).poidsCouverture, ecrire: (c, v) => { if (!(v >= 0 && v <= 200)) return false; poser(c, 'poidsCouverture', v); }
  },
  {
    type: 'choix', cle: 'classeBois', libelle: 'Classe du bois', effets: EFFETS, visible: enBois,
    options: () => [{ valeur: 'C24', libelle: 'C24 — bois massif' }, { valeur: 'GL24h', libelle: 'GL24h — lamellé-collé' }],
    lire: (c) => hyp(c).classeBois, ecrire: (c, v) => poser(c, 'classeBois', v === 'GL24h' ? 'GL24h' : 'C24')
  },
  {
    type: 'choix', cle: 'classeService', libelle: 'Classe de service', effets: EFFETS, visible: enBois,
    aide: 'Classe 3 : bois exposé aux intempéries ; classe 2 : bois abrité de la pluie',
    options: () => [{ valeur: '3', libelle: '3 — extérieur exposé' }, { valeur: '2', libelle: '2 — sous abri' }],
    lire: (c) => String(hyp(c).classeService), ecrire: (c, v) => poser(c, 'classeService', v === '2' ? 2 : 3)
  },
  {
    type: 'nombre', cle: 'epaisseurAlu', libelle: 'Épaisseur des profilés', unite: 'mm', pas: 0.5, min: 1, max: 10, decimales: 1, effets: EFFETS,
    visible: (c) => !enBois(c), aide: 'Épaisseur des parois des tubes, d\'après la fiche du fabricant',
    lire: (c) => hyp(c).epaisseurAlu, ecrire: (c, v) => { if (!(v >= 1 && v <= 10)) return false; poser(c, 'epaisseurAlu', v); }
  }
];

/** `'Chevrons 45 × 145 mm'`. */
const titrePiece = (v: VerifPiece) => LIBELLE_ROLE[v.role][1].replace(/^./, (l) => l.toUpperCase()) + ' ' + libelleSection(v.section);

function lignesResultats(n: NoteCalcul): Champ[] {
  const champs: Champ[] = [];
  const ch = n.charges;
  if (!ch) {
    champs.push({ type: 'alerte', cle: 'calcul-manque', libelle: '', nom: 'Alerte : hypothèses manquantes', texte: () => 'Choisissez ' + n.manque.join(' et ') + ' pour obtenir la note.' });
  } else {
    champs.push(
      { type: 'lecture', cle: 'calcul-neige', libelle: 'Neige', valeur: () => ch.s > 0 ? fr(ch.sk) + ' kN/m² au sol · ' + fr(ch.s) + ' kN/m² sur le toit' + (ch.sAd !== null ? ' · exceptionnelle ' + fr(ch.sAd) : '') : 'aucune : la toile se replie l\'hiver' },
      { type: 'lecture', cle: 'calcul-vent', libelle: 'Vent', valeur: () => 'q_p ' + fr(ch.qp) + ' kN/m² · c_f +' + fr(ch.cfBas) + ' / −' + fr(ch.cfHaut) + ' · effort horizontal ' + fr(ch.H, 1) + ' kN' },
      { type: 'lecture', cle: 'calcul-poids', libelle: 'Poids propres', valeur: () => 'couverture ' + fr(ch.gCouverture) + ' kN/m² · toiture ' + fr(ch.g) + ' kN/m²' }
    );
    n.verifs.forEach(v => {
      const detail = v.criteres.map(k => k.nom.toLowerCase() + ' ' + pct(k.taux)).join(', ');
      champs.push({ type: 'lecture', cle: 'calcul-' + v.role, libelle: titrePiece(v), valeur: () => pct(v.taux) + (v.taux <= 1 ? ' — vérifié' : ' — insuffisant') + ' · ' + v.modele + ' · ' + detail });
      if (v.taux > 1) champs.push({ type: 'alerte', cle: 'calcul-alerte-' + v.role, libelle: '', nom: 'Alerte : ' + titrePiece(v) + ' insuffisant', texte: () => titrePiece(v) + ' : ' + pct(v.taux) + ' de la résistance. ' + (v.proposition?.startsWith('aucune') ? 'Aucune section de la liste ne suffit : réduisez la portée ou l\'entraxe.' : 'Section suffisante : ' + v.proposition + '.') });
    });
    const a = n.ancrage;
    if (a) champs.push({ type: 'lecture', cle: 'calcul-ancrage', libelle: 'Pied de poteau', valeur: () => 'compression ' + fr(a.compression, 1) + ' kN · soulèvement ' + fr(a.soulevement, 1) + ' kN · horizontal ' + fr(a.horizontal, 1) + ' kN' + (a.moment > 0 ? ' · moment ' + fr(a.moment, 1) + ' kN·m' : '') + ' (ELU) · plot béton ' + Math.round(a.plot * 100) + ' cm de côté' });
    if (n.chargeMur !== null) champs.push({ type: 'lecture', cle: 'calcul-mur', libelle: 'Lisse murale', valeur: () => fr(n.chargeMur ?? 0) + ' kN/m (ELU) à reprendre par les fixations dans le mur' });
  }
  champs.push({ type: 'lecture', cle: 'calcul-urbanisme', libelle: 'Urbanisme', valeur: () => n.urbanisme });
  champs.push({
    type: 'bouton', cle: 'calcul-pdf', libelle: '', nom: 'Exporter la note de calcul', texte: () => 'Exporter la note de calcul (PDF)',
    agit: { commande: 'export.noteCalcul' }, actif: () => n.charges !== null, executer: (c) => c.executerCommande('export.noteCalcul')
  });
  return champs;
}

/** La note de calcul d'un abri : ses hypotheses, puis ses resultats. */
export function sectionNoteCalcul(c: ContexteChamps): Section {
  const n = noteDeCalcul(c.obj);
  return {
    id: 'noteCalcul', titre: 'Note de calcul',
    explication: 'Pré-dimensionnement selon NF EN 1990, 1991, 1995 et 1999 et leurs annexes nationales. Il ne vérifie ni les assemblages ni le sol, et ne remplace pas l\'étude d\'un bureau d\'études : la note PDF détaille ses limites.',
    champs: [...CHAMPS_HYPOTHESES, ...(n ? lignesResultats(n) : [])]
  };
}
