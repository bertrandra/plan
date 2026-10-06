// Les sections de l'inspecteur pour la terrasse courante (spec-ihm-zones §4.5, DEFAUTS D-12).
//
// Le configurateur (`renderTerrasseConfigurator`, jusqu'a l'etape 3) etait 360 lignes de DOM, un
// bloc par reglage. Ici chaque reglage de `Construction` est un descripteur, range dans
// `CHAMPS_CONSTRUCTION` — un objet **indexe par toutes les cles du type** : une propriete ajoutee
// a `Construction` sans descripteur (ou sans mention explicite de l'endroit qui l'edite) est une
// erreur de compilation. C'est la garantie que D-12 demandait.
//
// Les sections reprennent la structure de l'ouvrage, du sol vers la finition, et les notes qui
// accompagnent chaque champ sont celles du metier : ce que vaut la portee calculee, quand un plot
// sort du domaine du DTU, combien de vis la grille compte.

import { au } from '../../util/tableaux.js';
import { shoelace } from '../../geometry/basic.js';
import { aDesSommets, sommetsDe } from '../../model/formes.js';
import { chargePlot, longueursBois, longueursDispo, longueursLambourde, prixPlotUnite } from '../../engine/prix.js';
import { MASSIF_COTE_M, CONCASSE_PRICE, DALLE_STAB_PRICE, ESSENCE_PRICES, estPlots, GEOTEXTILE_PRICE, LAME_RIVE_PRICE, PLOT_ASSISE_MIN_CM2, PLOT_ENTRAXE_MAX_M, PLOT_HAUTEUR_DTU_CM, PLOT_HAUTEUR_MAX_CM, PLOT_MODELES, plotModele, SOLIVE_PRICE, SOLIVE_SECTIONS, SUPPORT_TYPES, VIS_DEPASSEMENT_MAX_CM, VIS_DEPASSEMENT_USUEL_CM, VIS_PRICE, VISSERIE_PRICE } from '../../engine/constantes.js';
import { buildVisGrid, findSpaZones, objetsQuiPercent, ouverturesDe, surfaceNetteTerrasse, volumeDecaissementPose, zoneToucheTerrasse } from '../../engine/structure.js';
import { decaissementPoseMm, hauteurStructureMm } from '../../engine/hauteurs.js';
import { estTrou } from '../../model/fonctions.js';
import { CHARGE_REF, coefRaideurLame, dimsSection, ENTRAXE_LAME_K, LAMBOURDE_SECTIONS, LAME_RAIDEUR, maxEntraxeLameCm, maxPorteeVisM, PORTEE_VIS_K, porteeAppuiM, porteeVisSpaM, sectionLambourde, SOLIVE_SECTION_DIMS } from '../../engine/portees.js';
import type { Construction } from '../../model/types.js';
import type { Champ, ContexteChamps, Section } from './types.js';

/** Ce que les champs de construction lisent de la terrasse courante, calcule une fois par rendu. */
interface Lecture {
  c: Construction;
  plots: boolean;
  sansSolives: boolean;
  visCount: number;
  visSpa: number;
  nomsEquip: string;
  surfM2: number;
  spanAppui: number;
}

function lire(cx: ContexteChamps): Lecture {
  const c = cx.construction();
  const obj = cx.obj;
  const plots = estPlots(c);
  const grille = (aDesSommets(obj) && obj.pts.length >= 3) ? buildVisGrid(obj, null, cx.objets) : [];
  const zonesEquip = (aDesSommets(obj) && obj.pts.length >= 3)
    ? findSpaZones(c.visMargeZoneSpa, cx.objets).filter(z => zoneToucheTerrasse(z, sommetsDe(obj))) : [];
  return {
    c, plots,
    sansSolives: plots && !c.plotAvecSolives,
    visCount: grille.length,
    visSpa: grille.filter(p => p.role === 'spa').length,
    nomsEquip: zonesEquip.map(z => z.nom).join(', '),
    surfM2: (obj.type === 'polygon' ? surfaceNetteTerrasse(obj.pts, cx.objets) : shoelace(sommetsDe(obj))) || 1,
    spanAppui: porteeAppuiM(c)
  };
}

/** Un reglage de la construction : historique, puis les panneaux de la terrasse se refont. */
const reglage = (ch: Champ): Champ => ({ ...ch, historique: true, effets: ['terrasse'] });
const nombre = (cle: keyof Construction, libelle: string, opts: { pas: number; min?: number; max?: number; unite?: string; aide?: string; defaut: number; note?: (l: Lecture) => string; visible?: (l: Lecture) => boolean; actif?: (l: Lecture) => boolean; lire?: (l: Lecture) => number }): Champ => {
  const { note, visible, actif, lire: lireOpt } = opts;
  return reglage({
    type: 'nombre', cle, libelle, pas: opts.pas, decimales: 0,
    ...(opts.min !== undefined ? { min: opts.min } : {}),
    ...(opts.max !== undefined ? { max: opts.max } : {}),
    ...(opts.unite ? { unite: opts.unite } : {}),
    ...(opts.aide ? { aide: opts.aide } : {}),
    ...(note ? { note: (cx: ContexteChamps) => note(lire(cx)) } : {}),
    ...(visible ? { visible: (cx: ContexteChamps) => visible(lire(cx)) } : {}),
    ...(actif ? { actif: (cx: ContexteChamps) => actif(lire(cx)) } : {}),
    lire: lireOpt ? (cx) => lireOpt(lire(cx)) : (cx) => (cx.construction()[cle] as number | undefined) ?? opts.defaut,
    ecrire: (cx, v) => { (cx.construction() as Record<string, unknown>)[cle] = v || opts.defaut; }
  });
};
const alerte = (l: Lecture) => l.plots ? 'plots' : 'vis';

/** Ou se regle une propriete de `Construction` quand ce n'est pas ici. */
type Ailleurs = { ailleurs: 'onglet BOM' | 'onglet Chantier' | 'onglet Implantation' | 'Vue 3D' | 'calcul' };

/**
 * Chaque cle de `Construction`, et son descripteur — ou l'endroit qui l'edite. Le type impose que
 * la liste soit complete : ajouter une propriete au modele sans passer ici ne compile pas.
 */
export const CHAMPS_CONSTRUCTION: { [K in keyof Required<Construction>]: Champ | Ailleurs } = {
  // ---- Fondation et appuis ------------------------------------------------------------------
  typePose: reglage({
    type: 'choix', cle: 'typePose', libelle: 'Type de pose',
    options: () => [{ valeur: 'vis-fondation', libelle: 'Sur vis de fondation' }, { valeur: 'plots', libelle: 'Sur plots réglables' }],
    note: (cx) => lire(cx).plots ? 'appui posé : il faut une assise' : 'appui fondé : hors gel par la profondeur',
    lire: (cx) => cx.construction().typePose || 'vis-fondation', ecrire: (cx, v) => { cx.construction().typePose = v; }
  }),
  hauteurVis: nombre('hauteurVis', 'Longueur vis dans le sol', { pas: 5, min: 10, unite: 'cm', defaut: 40, visible: l => !l.plots,
    aide: 'Longueur du fût vissé dans le sol, pour aller chercher le hors-gel. Enterrée, elle ne surélève pas la terrasse : c\'est le dépassement de tête qui le fait.',
    note: () => 'enterrée : ne compte pas dans la hauteur finie' }),
  // La seule partie de la vis qui souleve quoi que ce soit : c'est par elle qu'on rattrape un
  // devers ou qu'on vient affleurer un seuil de porte.
  depassementVis: reglage({
    type: 'nombre', cle: 'depassementVis', libelle: 'Dépassement de tête', pas: 1, min: 0, unite: 'cm', decimales: 0,
    aide: 'Hauteur de tête réglable au-dessus du sol : la seule partie de la vis qui compte dans la hauteur finie',
    visible: (cx) => !lire(cx).plots,
    note: (cx) => { const dep = cx.construction().depassementVis || 0;
      return dep > VIS_DEPASSEMENT_MAX_CM ? '⚠ ' + dep + ' cm : c\'est un poteau, pas une tête de vis'
        : dep > VIS_DEPASSEMENT_USUEL_CM ? '⚠ au-delà de ' + VIS_DEPASSEMENT_USUEL_CM + ' cm : hors course usuelle'
        : dep > 0 ? 'hors sol : compte dans la hauteur finie' : 'tête arasée au niveau du sol'; },
    lire: (cx) => cx.construction().depassementVis || 0, ecrire: (cx, v) => { cx.construction().depassementVis = Math.max(0, v || 0); }
  }),
  hauteurPlot: nombre('hauteurPlot', 'Hauteur plot', { pas: 1, min: 1, unite: 'cm', defaut: 10, visible: l => l.plots,
    aide: 'Hauteur de réglage du plot, dessus d\'assise à dessous de lambourde',
    note: l => { const m = plotModele(l.c), h = l.c.hauteurPlot || 10; const horsGamme = h < m.min - 1e-9 || h > m.max + 1e-9;
      return h > PLOT_HAUTEUR_MAX_CM ? '⚠ au-delà d\'1 m : hors domaine NF DTU 51.4'
        : h > PLOT_HAUTEUR_DTU_CM ? '⚠ au-delà de 30 cm : plot réglable hors domaine DTU'
        : horsGamme ? '⚠ hors de la plage du modèle choisi' : 'dans la plage du modèle retenu'; } }),
  plotModele: reglage({
    type: 'choix', cle: 'plotModele', libelle: 'Modèle de plot', visible: (cx) => lire(cx).plots,
    options: () => [{ valeur: 'auto', libelle: 'Automatique (selon hauteur)' }, ...PLOT_MODELES.map(m => ({ valeur: m.cle, libelle: m.label + ' (' + m.min + ' à ' + m.max + ' cm)' }))],
    note: (cx) => { const c = cx.construction(); return 'retenu : ' + plotModele(c).label + ' — ' + prixPlotUnite(c).toFixed(2) + ' € pièce'; },
    lire: (cx) => cx.construction().plotModele || 'auto', ecrire: (cx, v) => { cx.construction().plotModele = v; }
  }),
  plotAvecSolives: reglage({
    type: 'case', cle: 'plotAvecSolives', libelle: 'Structure double (plots sous solives)', visible: (cx) => lire(cx).plots,
    aide: 'Structure double : plots sous solives, lambourdes au-dessus. Sinon les lambourdes reposent directement sur les plots.',
    note: (cx) => cx.construction().plotAvecSolives ? 'solives sur plots, lambourdes dessus' : 'lambourdes directement sur plots',
    lire: (cx) => !!cx.construction().plotAvecSolives, ecrire: (cx, v) => { cx.construction().plotAvecSolives = v; }
  }),
  supportType: reglage({
    type: 'choix', cle: 'supportType', libelle: 'Assise sous les plots', visible: (cx) => lire(cx).plots, note: () => 'chiffrée au BOM',
    options: () => Object.entries(SUPPORT_TYPES).map(([k, t]) => ({ valeur: k, libelle: t.label })),
    lire: (cx) => cx.construction().supportType || 'concasse', ecrire: (cx, v) => { cx.construction().supportType = v; }
  }),
  supportDecaissement: nombre('supportDecaissement', 'Décaissement / concassé', { pas: 5, min: 0, unite: 'cm', defaut: 15, visible: l => l.plots,
    actif: l => !!(SUPPORT_TYPES[l.c.supportType ?? ''] ?? SUPPORT_TYPES.concasse)?.concasse,
    aide: 'Épaisseur de concassé compacté sous les plots', note: () => 'usage : 15 cm minimum sur sol meuble' }),
  // Le niveau fini : le dessus des lames par rapport au terrain naturel. Il ne se montre qu'une fois
  // impose (case « Imposer le niveau fini », plus bas) ; plus bas que la structure, il decaisse.
  niveauFini: {
    type: 'nombre', cle: 'niveauFini', libelle: 'Niveau fini / terrain', unite: 'cm', pas: 1, min: 0, max: 200, decimales: 1,
    historique: true, effets: ['terrasse', 'scene3d'],
    aide: 'Hauteur du dessus des lames au-dessus du terrain naturel. Plus bas que ce que la structure donne posée sur le terrain, la terrasse se pose dans un décaissement.',
    visible: (cx) => niveauImpose(cx),
    note: (cx) => noteNiveauFini(cx),
    lire: (cx) => cx.construction().niveauFini ?? 0,
    ecrire: (cx, v) => { if (!(v >= 0 && v <= 200)) return false; cx.construction().niveauFini = Math.round(v * 10) / 10; }
  },
  plotsDansEmprise: {
    type: 'case', cle: 'plotsDansEmprise', libelle: 'Plots dans l\'emprise', historique: true, effets: ['terrasse', 'scene3d'],
    aide: 'Le cadre recule du bord d\'un rayon d\'embase : l\'embase des plots de rive reste sous la terrasse, les lames débordent du cadre d\'autant.',
    visible: (cx) => lire(cx).plots,
    note: (cx) => { const c = cx.construction(); const r = Math.sqrt((c.plotSurfaceAssise || PLOT_ASSISE_MIN_CM2) / Math.PI);
      return c.plotsDansEmprise ? 'cadre en retrait de ' + r.toFixed(1).replace('.', ',') + ' cm : les lames débordent, rien ne dépasse' : 'cadre au bord : l\'embase des plots de rive dépasse de la terrasse'; },
    lire: (cx) => !!cx.construction().plotsDansEmprise,
    ecrire: (cx, v) => { const c = cx.construction(); if (v) c.plotsDansEmprise = true; else delete c.plotsDansEmprise; }
  },
  plotSurfaceAssise: nombre('plotSurfaceAssise', 'Surface d\'assise du plot', { pas: 10, min: 50, unite: 'cm²', defaut: PLOT_ASSISE_MIN_CM2, visible: l => l.plots,
    aide: 'Surface d\'assise du plot au contact du support',
    note: l => ((l.c.plotSurfaceAssise ?? 0) < PLOT_ASSISE_MIN_CM2 ? '⚠ sous les ' : 'mini NF DTU 51.4 : ') + PLOT_ASSISE_MIN_CM2 + ' cm²' }),
  chargeNormale: nombre('chargeNormale', 'Charge cible — zone courante', { pas: 25, min: 100, unite: 'kg/m²', defaut: 250,
    aide: 'Charge d\'exploitation visée hors zone renforcée. 250 kg/m² = usage courant d\'une terrasse privative.', note: () => 'usage : 250 kg/m²' }),
  chargeSpa: nombre('chargeSpa', 'Charge cible — zone équipement', { pas: 25, min: 100, unite: 'kg/m²', defaut: 500,
    aide: 'Charge visée sous les équipements. Un spa rempli et occupé pèse 1,5 à 2 t sur 3 à 4 m² ; un bac planté ou une cuve sont du même ordre.',
    note: l => l.nomsEquip ? 'appuis à ' + Math.round(porteeVisSpaM(l.c) * 100) + ' cm sous : ' + l.nomsEquip : 'aucun équipement sur cette terrasse' }),
  // Deux drapeaux pour un meme choix, selon le mode : l'inspecteur n'en montre qu'un.
  visModeAuto: reglage({
    type: 'case', cle: 'visModeAuto', libelle: 'Portée vis automatique', visible: (cx) => !lire(cx).plots,
    aide: 'Déduit la portée admissible de la section des solives, de leur entraxe et de la charge cible',
    note: (cx) => 'calculée : ' + Math.round(lire(cx).spanAppui * 100) + ' cm',
    lire: (cx) => cx.construction().visModeAuto !== false, ecrire: (cx, v) => { cx.construction().visModeAuto = v; }
  }),
  plotEntraxeAuto: reglage({
    type: 'case', cle: 'plotEntraxeAuto', libelle: 'Entraxe plots automatique', visible: (cx) => lire(cx).plots,
    aide: 'Déduit l\'entraxe des plots de la section portée, de son entraxe et de la charge, plafonné à 70 cm (NF DTU 51.4)',
    note: (cx) => { const l = lire(cx); return 'calculé : ' + Math.round(l.spanAppui * 100) + ' cm' + (l.spanAppui >= PLOT_ENTRAXE_MAX_M - 1e-9 ? ' (plafond DTU atteint)' : ''); },
    lire: (cx) => cx.construction().plotEntraxeAuto !== false, ecrire: (cx, v) => { cx.construction().plotEntraxeAuto = v; }
  }),
  visEntraxe: nombre('visEntraxe', 'Portée max entre vis', { pas: 5, min: 30, unite: 'cm', defaut: 100, visible: l => !l.plots,
    actif: l => l.c.visModeAuto === false, aide: 'Distance maximale entre deux vis le long d\'une même solive',
    lire: l => l.c.visModeAuto !== false ? Math.round(l.spanAppui * 100) : (l.c.visEntraxe ?? 100),
    note: l => noteDensite(l) }),
  plotEntraxe: nombre('plotEntraxe', 'Entraxe max entre plots', { pas: 5, min: 20, max: 70, unite: 'cm', defaut: 65, visible: l => l.plots,
    actif: l => l.c.plotEntraxeAuto === false, aide: 'Distance entre deux plots le long d\'une même pièce. Plafonnée à 70 cm.',
    lire: l => l.c.plotEntraxeAuto !== false ? Math.round(l.spanAppui * 100) : (l.c.plotEntraxe ?? 65),
    note: l => noteDensite(l) }),
  visEntraxeZoneSpa: nombre('visEntraxeZoneSpa', 'Entraxe — zone équipement', { pas: 5, min: 20, unite: 'cm', defaut: 60,
    actif: l => l.c.visModeAuto === false, aide: 'En mode automatique, déduit de la charge cible sous les équipements',
    lire: l => l.c.visModeAuto !== false ? Math.round(porteeVisSpaM(l.c) * 100) : (l.c.visEntraxeZoneSpa ?? 60),
    note: l => 'entre ' + alerte(l) }),
  visMargeZoneSpa: nombre('visMargeZoneSpa', 'Marge autour de l\'équipement', { pas: 5, min: 0, unite: 'cm', defaut: 30,
    aide: 'Débord de la zone renforcée autour de l\'emprise de l\'équipement : la charge ne s\'arrête pas au bord de la cuve.',
    note: l => (l.plots && l.visSpa) ? '⚠ voir l\'avertissement en bas de section' : '' }),
  // ---- Structure porteuse -------------------------------------------------------------------
  soliveEntraxe: nombre('soliveEntraxe', 'Entraxe solives', { pas: 5, min: 20, unite: 'cm', defaut: 40, actif: l => !l.sansSolives,
    note: l => l.sansSolives ? 'sans objet : pas de solives' : '' }),
  soliveSection: reglage({
    type: 'choix', cle: 'soliveSection', libelle: 'Section solives', actif: (cx) => !lire(cx).sansSolives,
    options: () => SOLIVE_SECTIONS.map(s => ({ valeur: s, libelle: s + ' mm' })),
    note: (cx) => { const l = lire(cx); return l.sansSolives ? 'sans objet : pas de solives' : 'porte ' + Math.round(maxPorteeVisM(l.c) * 100) + ' cm entre appuis'; },
    lire: (cx) => cx.construction().soliveSection || '', ecrire: (cx, v) => { cx.construction().soliveSection = v; }
  }),
  avecLambourde: reglage({
    type: 'case', cle: 'avecLambourde', libelle: 'Avec lambourdes', actif: (cx) => !lire(cx).sansSolives,
    note: (cx) => lire(cx).sansSolives ? 'imposé : ce sont elles qui portent les lames' : '',
    lire: (cx) => lire(cx).sansSolives ? true : !!cx.construction().avecLambourde, ecrire: (cx, v) => { cx.construction().avecLambourde = v; }
  }),
  lambourdeSection: reglage({
    type: 'choix', cle: 'lambourdeSection', libelle: 'Section lambourdes', actif: (cx) => { const l = lire(cx); return l.sansSolives || !!l.c.avecLambourde; },
    options: () => LAMBOURDE_SECTIONS.map(s => ({ valeur: s, libelle: s + ' mm' })),
    note: (cx) => { const l = lire(cx); const actif = l.sansSolives || l.c.avecLambourde;
      return !actif ? 'sans objet sans lambourdes'
        : l.sansSolives ? 'porte ' + Math.round(l.spanAppui * 100) + ' cm entre plots'
        : (sectionLambourde(l.c) === l.c.soliveSection ? 'identique aux solives : un seul débit' : 'différente des solives : débit et prix séparés'); },
    lire: (cx) => sectionLambourde(cx.construction()), ecrire: (cx, v) => { cx.construction().lambourdeSection = v; }
  }),
  lambourdeEntraxe: nombre('lambourdeEntraxe', 'Entraxe lambourdes', { pas: 5, min: 20, unite: 'cm', defaut: 40,
    actif: l => !l.sansSolives && !!l.c.avecLambourde,
    lire: l => l.sansSolives ? maxEntraxeLameCm(l.c) : (l.c.lambourdeEntraxe ?? 40),
    note: l => l.sansSolives ? 'imposé par l\'épaisseur de lame' : '' }),
  // ---- Lames et sens de pose ----------------------------------------------------------------
  segmentReference: reglage({
    type: 'choix', cle: 'segmentReference', libelle: 'Côté de référence',
    options: (cx) => (aDesSommets(cx.obj) ? cx.obj.segmentNames || [] : []).map((sn, i) => ({ valeur: String(i), libelle: sn || ('Côté ' + (i + 1)) })),
    lire: (cx) => String(cx.construction().segmentReference || 0), ecrire: (cx, v) => { cx.construction().segmentReference = parseInt(v, 10) || 0; }
  }),
  sensPose: nombre('sensPose', 'Sens de pose', { pas: 1, unite: '° / côté de référence', defaut: 0, aide: '0 = parallèle au côté de référence',
    lire: l => l.c.sensPose || 0 }),
  // L'essence et l'epaisseur pilotent l'ecartement admissible des appuis sous les lames, donc toute
  // la vue. Changer d'essence remet le coefficient de raideur a la valeur de cette essence : une
  // valeur forcee appartient au type de lame pour lequel elle a ete saisie, pas au projet.
  essenceBois: reglage({
    type: 'choix', cle: 'essenceBois', libelle: 'Essence de bois',
    options: () => Object.entries(ESSENCE_PRICES).map(([k, e]) => ({ valeur: k, libelle: e.label })),
    lire: (cx) => cx.construction().essenceBois || '',
    ecrire: (cx, v) => { const c = cx.construction(); c.essenceBois = v; c.coefRaideurLame = LAME_RAIDEUR[v] ?? 1; }
  }),
  coefRaideurLame: reglage({
    type: 'nombre', cle: 'coefRaideurLame', libelle: 'Coefficient raideur lame', pas: 0.05, min: 0.3, max: 2, decimales: 2,
    aide: 'Raideur de la lame par rapport au résineux (1,00). Multiplie l\'écartement admissible des appuis.',
    note: (cx) => { const c = cx.construction(); const defaut = LAME_RAIDEUR[c.essenceBois ?? ''] ?? 1;
      return 'défaut ' + defaut.toFixed(2) + ' · appuis à ' + maxEntraxeLameCm(c) + ' cm' + (Math.abs(coefRaideurLame(c) - defaut) > 1e-9 ? ' (modifié)' : ''); },
    lire: (cx) => coefRaideurLame(cx.construction()), ecrire: (cx, v) => { cx.construction().coefRaideurLame = v || 1; }
  }),
  largeurLame: nombre('largeurLame', 'Largeur lame', { pas: 5, min: 60, unite: 'mm', defaut: 140 }),
  epaisseurLame: nombre('epaisseurLame', 'Épaisseur lame', { pas: 1, min: 15, unite: 'mm', defaut: 25 }),
  // ---- Finitions du tour : laquelle est verticale, laquelle est a plat, tout de suite ----------
  avecLameRive: reglage({
    type: 'case', cle: 'avecLameRive', libelle: 'Lame de rive — habillage VERTICAL',
    aide: 'Habillage de finition qui fait le tour de la terrasse, accroché sous le niveau des lames pour cacher la structure',
    note: () => 'planche sur chant qui fait le tour, suspendue sous les lames, cache la structure',
    lire: (cx) => !!cx.construction().avecLameRive, ecrire: (cx, v) => { cx.construction().avecLameRive = v; }
  }),
  // Les cotes sans lame de rive se cochent cote par cote (finitions, `champsRiveParCote`) ; ici, le resume.
  cotesSansRive: {
    type: 'lecture', cle: 'cotesSansRive', libelle: 'Côtés sans rive', visible: (cx) => !!cx.construction().avecLameRive,
    valeur: (cx) => { const sans = cx.construction().cotesSansRive ?? []; const noms = cx.obj.type === 'polygon' ? cx.obj.segmentNames : [];
      return sans.length ? sans.map(i => noms?.[i] || 'Côté ' + (i + 1)).join(', ') : 'aucun : la rive fait tout le tour'; }
  },
  riveOuvertures: {
    type: 'case', cle: 'riveOuvertures', libelle: 'Rive autour des trous', historique: true, effets: ['terrasse', 'scene3d'],
    aide: 'Une lame de rive pendue dans chaque trou de la terrasse (arbre, trappe), à l\'aplomb de son bord. Pas autour d\'un bassin : ses margelles le bordent.',
    visible: (cx) => !!cx.construction().avecLameRive && cx.obj.type === 'polygon' && objetsQuiPercent(cx.obj.pts, cx.objets).some(x => estTrou(x.objet)),
    lire: (cx) => !!cx.construction().riveOuvertures,
    ecrire: (cx, v) => { const c = cx.construction(); if (v) c.riveOuvertures = true; else delete c.riveOuvertures; }
  },
  hauteurLameRive: nombre('hauteurLameRive', 'Hauteur lame de rive', { pas: 10, min: 50, unite: 'mm', defaut: 200, actif: l => !!l.c.avecLameRive,
    aide: 'Hauteur de l\'habillage, mesurée depuis le dessus des lames vers le bas' }),
  avecLamePlat: reglage({
    type: 'case', cle: 'avecLamePlat', libelle: 'Planche plate — bordure HORIZONTALE',
    aide: 'Planche plate qui fait le tour de la terrasse, posée à plat au même niveau que les lames, comme un cadre de finition',
    note: (cx) => 'cadre posé à plat au niveau des lames, sur tout le tour' + (cx.construction().avecLamePlat ? ' — le champ de lames se rétrécit d\'autant' : ''),
    lire: (cx) => !!cx.construction().avecLamePlat, ecrire: (cx, v) => { cx.construction().avecLamePlat = v; }
  }),
  // ---- Parametres de calcul -----------------------------------------------------------------
  kPortee: nombre('kPortee', 'K portée', { pas: 0.1, min: 5, defaut: PORTEE_VIS_K, note: () => 'portée = K · h · (b/entraxe)^⅓ · (250/charge)^⅓ — calé sur NF DTU 51.4' }),
  kEntraxeLame: nombre('kEntraxeLame', 'K entraxe lame', { pas: 0.5, min: 5, defaut: ENTRAXE_LAME_K, note: () => 'écartement des appuis = K × épaisseur de lame' }),
  jeuLames: reglage({ type: 'nombre', cle: 'jeuLames', libelle: 'Jeu entre lames', pas: 1, min: 0, unite: 'mm', decimales: 0, note: () => 'ajouté à la largeur de lame pour l\'espacement du platelage',
    lire: (cx) => cx.construction().jeuLames ?? 6, ecrire: (cx, v) => { cx.construction().jeuLames = isNaN(v) ? 6 : v; } }),
  jointsBoisSurAppui: reglage({ type: 'case', cle: 'jointsBoisSurAppui', libelle: 'Aboutures bois sur appui', aide: 'Impose qu\'une abouture de poutre repose sur un appui, vis ou plot', note: () => 'une abouture de poutre doit reposer sur un appui',
    lire: (cx) => cx.construction().jointsBoisSurAppui !== false, ecrire: (cx, v) => { cx.construction().jointsBoisSurAppui = v; } }),
  chuteMinReutilisable: reglage({ type: 'nombre', cle: 'chuteMinReutilisable', libelle: 'Chute minimale réutilisable', pas: 5, min: 0, unite: 'cm', decimales: 0, note: () => 'en dessous, une chute part au rebut au lieu de resservir',
    lire: (cx) => cx.construction().chuteMinReutilisable ?? 50, ecrire: (cx, v) => { cx.construction().chuteMinReutilisable = isNaN(v) ? 50 : v; } }),
  jointsSurAppui: reglage({ type: 'case', cle: 'jointsSurAppui', libelle: 'Joints sur appui', aide: 'Impose que chaque about entre deux lames tombe sur une lambourde ou une solive', note: () => 'un about de lame doit reposer sur une pièce, pas dans le vide',
    lire: (cx) => cx.construction().jointsSurAppui !== false, ecrire: (cx, v) => { cx.construction().jointsSurAppui = v; } }),
  epaisseurLameRive: nombre('epaisseurLameRive', 'Épaisseur lame de rive', { pas: 1, min: 5, unite: 'mm', defaut: 22, note: () => 'épaisseur de l\'habillage périphérique' }),
  // ---- Edites ailleurs ---------------------------------------------------------------------
  longueursLames: { ailleurs: 'onglet BOM' },
  longueursBois: { ailleurs: 'onglet BOM' },
  longueursLambourde: { ailleurs: 'onglet BOM' },
  prixLongueurs: { ailleurs: 'onglet BOM' },
  prixLongueursBois: { ailleurs: 'onglet BOM' },
  prixLongueursLambourde: { ailleurs: 'onglet BOM' },
  prixPlots: { ailleurs: 'onglet BOM' },
  prixVisUnite: { ailleurs: 'onglet BOM' },
  visParBoite: { ailleurs: 'onglet BOM' },
  bom: { ailleurs: 'onglet BOM' },
  cadences: { ailleurs: 'onglet Chantier' },
  equipe: { ailleurs: 'onglet Chantier' },
  heuresJour: { ailleurs: 'onglet Chantier' },
  echelleImplant: { ailleurs: 'onglet Implantation' },
  lames3dFilaire: { ailleurs: 'Vue 3D' },
  vues3d: { ailleurs: 'Vue 3D' }
};

/** Le nombre d'appuis et leur densite : ce que la grille dit de l'entraxe choisi. */
function noteDensite(l: Lecture): string {
  const densite = l.visCount / l.surfM2;
  const densiteHorsSpa = (l.visCount - l.visSpa) / l.surfM2;
  // La densite attendue n'est pas la meme d'un mode a l'autre : 1,0 a 1,5 vis/m², mais 3 a 5
  // plots/m². Un seuil unique s'allumerait en permanence et a tort sur plots.
  const seuilDense = l.plots ? 6 : 2;
  const alerteDensite = densiteHorsSpa > seuilDense
    ? ' · dense : élargir l\'entraxe ou monter en section'
    : (l.plots && densiteHorsSpa < 2.2 ? ' · faible pour des plots : vérifier l\'entraxe' : '');
  return l.visCount + ' ' + alerte(l) + (l.visSpa ? ' (dont ' + l.visSpa + ' en zone équipement)' : '') + ' — ' + densite.toFixed(1) + '/m²' + alerteDensite;
}

const champ = (cle: keyof Construction): Champ => {
  const ch = CHAMPS_CONSTRUCTION[cle];
  if ('ailleurs' in ch) throw new Error('Construction.' + cle + ' se règle : ' + ch.ailleurs);
  return ch;
};

const chargeParPlot: Champ = {
  type: 'lecture', cle: 'chargeParPlot', libelle: 'Charge par plot', visible: (cx) => lire(cx).plots,
  valeur: (cx) => { const l = lire(cx); const ch = chargePlot(l.c, l.visCount, l.surfM2);
    return ch.charge.toFixed(0) + ' kg — ' + ch.tributaire.toFixed(2) + ' m² repris · ' + ch.pression.toFixed(2) + ' kg/cm² sur ' + ch.assise + ' cm²' +
      noteAssise(l.c.supportType); }
};
const niveauImpose = (cx: ContexteChamps): boolean => cx.construction().niveauFini !== undefined && cx.construction().niveauFini !== null;

/** Ce que le niveau demande donne : un decaissement, ou une structure trop basse pour l'atteindre. */
function noteNiveauFini(cx: ContexteChamps): string {
  const d = decaissementPoseMm(cx.obj), s = hauteurStructureMm(cx.obj), n = (cx.construction().niveauFini ?? 0) * 10;
  if (d > 0) return 'décaissement de ' + (d / 10).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' cm';
  if (n > s + 0.5) return '⚠ posée sur le terrain, la structure n\'arrive qu\'à ' + (s / 10).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' cm : relevez les plots ou la tête de vis';
  return 'posée sur le terrain, sans décaissement';
}

/** Ce que la pression sous un plot veut dire, selon ce sur quoi il repose. */
function noteAssise(cle: string | undefined): string {
  const t = SUPPORT_TYPES[cle ?? ''];
  if (t?.dalles) return '';
  if (cle === 'dalle' || t?.dalleBeton) return ' — sur dalle, sans objet';
  if (t?.massifs) return ' — sur massif béton de ' + Math.round(MASSIF_COTE_M * 100) + ' cm, sans objet';
  return ' — sur concassé, vérifier le poinçonnement';
};

// Un equipement lourd sur plots : on laisse passer, mais on dit clairement pourquoi c'est douteux.
const alertes: Champ[] = [
  {
    type: 'alerte', cle: 'alerteEquipement', libelle: '', nom: 'Alerte : équipement lourd sur plots', visible: (cx) => { const l = lire(cx); return l.plots && l.visSpa > 0; },
    texte: (cx) => { const l = lire(cx); return '⚠ Équipement lourd sur plots' + (l.nomsEquip ? ' — ' + l.nomsEquip : '') + '. Les ' + l.visSpa + ' appuis de la zone sont resserrés comme en mode vis, mais un plot n\'est pas ancré et reporte sa charge sur une assise qui peut tasser de façon différentielle. Un spa rempli et occupé, c\'est 1,5 à 2 t sur 3 à 4 m², et une cuve ou un bac maçonné sont du même ordre. La solution du métier est une dalle béton dédiée, fondée pour elle-même, le platelage étant construit autour. Le chiffrage décrit un ouvrage que je ne recommande pas en l\'état.'; }
  },
  {
    type: 'alerte', cle: 'alertePlot', libelle: '', nom: 'Alerte : plot hors du NF DTU 51.4', visible: (cx) => { const l = lire(cx); return l.plots && (l.c.hauteurPlot || 10) > PLOT_HAUTEUR_DTU_CM; },
    texte: (cx) => { const h = cx.construction().hauteurPlot || 10; return 'Hauteur de plot ' + h + ' cm : au-delà de ' + PLOT_HAUTEUR_DTU_CM + ' cm le plot réglable sort du domaine du NF DTU 51.4' + (h > PLOT_HAUTEUR_MAX_CM ? ', et au-delà d\'1 m c\'est le platelage entier qui en sort.' : '.'); }
  },
  // Une tete qui depasse trop transforme la vis en poteau : la charge n'arrive plus dans l'axe du
  // sol mais au bout d'un bras de levier, et c'est le sol autour du fut qui encaisse.
  {
    type: 'alerte', cle: 'alerteVis', libelle: '', nom: 'Alerte : dépassement de tête de vis', visible: (cx) => { const l = lire(cx); return !l.plots && (l.c.depassementVis || 0) > VIS_DEPASSEMENT_USUEL_CM; },
    texte: (cx) => { const dep = cx.construction().depassementVis || 0; return 'Dépassement de tête ' + dep + ' cm : au-delà de ' + VIS_DEPASSEMENT_USUEL_CM + ' cm on sort de la course des têtes réglables du commerce' + (dep > VIS_DEPASSEMENT_MAX_CM ? ', et à ' + dep + ' cm ce n\'est plus une tête mais un poteau : il faut alors un contreventement et une vérification du moment en pied, que ce calcul ne couvre pas.' : ', et la longueur enterrée doit rester nettement supérieure à la partie hors sol.'); }
  }
];

/** Ce que l'optimisation demande au module des panneaux, sans DOM ici. */
/** L'ouverture du bloc d'optimisation : un pli de l'interface (app/resultats.ts), pas une donnee du projet. */
export interface ContexteOptimisation { visible: () => boolean }

/**
 * Une case par cote du contour : lame de rive ou non. Le cote se met en evidence sur le plan au
 * survol, comme dans la section Cotes. Sans contexte (un test, un inventaire), pas de cote.
 */
function champsRiveParCote(c?: ContexteChamps): Champ[] {
  if (!c || c.obj.type !== 'polygon') return [];
  const noms = c.obj.segmentNames ?? [];
  return c.obj.pts.map((_, i): Champ => ({
    type: 'case', cle: 'rive' + i, libelle: 'Rive · ' + (noms[i] || 'Côté ' + (i + 1)), historique: true, effets: ['terrasse', 'scene3d'],
    aide: 'Décocher pour ne pas poser de lame de rive sur ce côté (contre un mur, une marche, une jardinière)',
    visible: (cx) => !!cx.construction().avecLameRive,
    surbrillance: (cx) => cx.etat.highlight.type === 'segment' && cx.etat.highlight.index === i,
    lire: (cx) => !(cx.construction().cotesSansRive ?? []).includes(i),
    ecrire: (cx, v) => {
      const k = cx.construction();
      const sans = new Set(k.cotesSansRive ?? []);
      if (v) sans.delete(i); else sans.add(i);
      if (sans.size) k.cotesSansRive = [...sans].sort((a, b) => a - b); else delete k.cotesSansRive;
    }
  }));
}

export function sectionsConstruction(ctxOptim: ContexteOptimisation, c?: ContexteChamps): Section[] {
  const fondation: Section = {
    id: 'fondation', titre: 'Fondation et appuis',
    champs: [
      {
        type: 'case', cle: 'poseDecaissee', libelle: 'Imposer le niveau fini', historique: true, effets: ['terrasse', 'scene3d'],
        aide: 'Fixer la hauteur du dessus des lames par rapport au terrain naturel : de plain-pied (0 cm), au ras d\'un seuil ou des margelles d\'une piscine. La terrasse se pose alors dans le décaissement qu\'il faut.',
        note: (cx) => niveauImpose(cx) ? 'niveau imposé' : 'posée sur le terrain, dessus à ' + (hauteurStructureMm(cx.obj) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' cm',
        lire: (cx) => niveauImpose(cx),
        ecrire: (cx, v) => { const c = cx.construction(); if (v) c.niveauFini = 0; else delete c.niveauFini; }
      },
      champ('niveauFini'),
      {
        type: 'lecture', cle: 'decaissementPose', libelle: 'Décaissement de pose', visible: (cx) => niveauImpose(cx) && decaissementPoseMm(cx.obj) > 0,
        valeur: (cx) => {
          const obj = cx.obj;
          if (obj.type !== 'polygon') return '—';
          const m3 = volumeDecaissementPose({ pts: obj.pts, construction: cx.construction() }, ouverturesDe(obj.pts, cx.objets));
          return (decaissementPoseMm(obj) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' cm, ' + m3.toFixed(2).replace('.', ',') + ' m³ de terre à évacuer — chiffré au BOM';
        }
      },
      champ('typePose'), champ('hauteurVis'), champ('depassementVis'), champ('hauteurPlot'), champ('plotModele'), champ('plotAvecSolives'),
      champ('supportType'), champ('supportDecaissement'), champ('plotSurfaceAssise'), champ('plotsDansEmprise'), champ('chargeNormale'), champ('chargeSpa'),
      champ('visModeAuto'), champ('plotEntraxeAuto'), champ('visEntraxe'), champ('plotEntraxe'), chargeParPlot, champ('visEntraxeZoneSpa'), champ('visMargeZoneSpa'),
      ...alertes
    ]
  };
  // Ce qui interrompt le platelage : un bassin, un trou (arbre conserve, trappe). Chacun est un objet
  // du plan, qu'on deplace et qu'on retaille comme les autres ; la terrasse s'arrete a son bord.
  const ouvertures: Section = {
    id: 'ouvertures', titre: 'Trous et ouvertures',
    champs: [
      {
        type: 'lecture', cle: 'listeOuvertures', libelle: 'Ouvertures',
        valeur: (cx) => {
          const liste = cx.obj.type === 'polygon' ? objetsQuiPercent(cx.obj.pts, cx.objets) : [];
          return liste.length ? liste.map(x => x.objet.name + ' (' + shoelace(x.contour).toFixed(2) + ' m²)').join(' · ') : 'Aucune — la terrasse est pleine';
        }
      },
      {
        type: 'bouton', cle: 'ajouterTrou', libelle: '', nom: 'Ajouter un trou dans la terrasse', texte: () => 'Ajouter un trou',
        explication: 'Un trou de 1,20 × 1,20 m au centre de la terrasse : tirez ses coins à la forme voulue. Les pièces s\'arrêtent à son bord sur un chevêtre.',
        agit: { commande: 'terrasse.ajouterTrou' }, executer: (cx) => cx.executerCommande('terrasse.ajouterTrou')
      }
    ]
  };
  const structure: Section = {
    id: 'structure', titre: 'Structure porteuse',
    champs: [champ('soliveEntraxe'), champ('soliveSection'), champ('avecLambourde'), champ('lambourdeSection'), champ('lambourdeEntraxe')]
  };
  const lames: Section = {
    id: 'lames', titre: 'Lames et sens de pose',
    champs: [champ('segmentReference'), champ('sensPose'), champ('essenceBois'), champ('coefRaideurLame'), champ('largeurLame'), champ('epaisseurLame')]
  };
  const finitions: Section = {
    id: 'finitions', titre: 'Finitions du tour',
    champs: [champ('avecLameRive'), champ('hauteurLameRive'), ...champsRiveParCote(c), champ('cotesSansRive'), champ('riveOuvertures'), champ('avecLamePlat')]
  };
  // Le bloc d'optimisation reste ouvert une fois demande, et se reclasse a chaque changement.
  const optimisation: Section = {
    id: 'optimisation', titre: 'Optimisation',
    champs: [
      { type: 'bouton', cle: 'optimiser', libelle: '', nom: 'Optimisation des paramètres (afficher ou masquer)', texte: () => ctxOptim.visible() ? 'Masquer l\'optimisation' : 'Optimisation des paramètres', agit: { commande: 'terrasse.optimisation' }, executer: (cx) => cx.executerCommande('terrasse.optimisation') },
      { type: 'optimisation', cle: 'resultat', libelle: '', nom: 'Tableau d’optimisation' }
    ]
  };
  const parametres: Section = {
    id: 'parametres', titre: 'Paramètres de calcul', repliee: true,
    explication: 'Les constantes du moteur, modifiables. Elles pilotent toutes les quantités du BOM — les valeurs par défaut sont celles calées sur le NF DTU 51.4 et l\'usage du métier (voir l\'onglet Méthode).',
    champs: [
      champ('kPortee'), champ('kEntraxeLame'),
      { type: 'lecture', cle: 'chargeRef', libelle: 'Charge de référence', valeur: () => CHARGE_REF + ' kg/m² — charge sur laquelle K portée est calé' },
      champ('jeuLames'),
      { type: 'lecture', cle: 'longueurs', libelle: 'Longueurs achetables', valeur: (cx) => { const c = cx.construction(); return 'lames ' + longueursDispo(c).join(' / ') + '  ·  bois ' + longueursBois(c).join(' / ') + (sectionLambourde(c) !== c.soliveSection ? '  ·  lambourdes ' + longueursLambourde(c).join(' / ') : '') + ' — se règlent au-dessus de chaque tableau de débit, onglet BOM'; } },
      champ('jointsBoisSurAppui'), champ('chuteMinReutilisable'), champ('jointsSurAppui'), champ('epaisseurLameRive'),
      { type: 'lecture', cle: 'raideurs', libelle: 'Raideur par essence', valeur: () => Object.entries(LAME_RAIDEUR).map(([k, r]) => k.replace('-classe4', '') + ' ' + r.toFixed(2)).join(' · ') },
      { type: 'lecture', cle: 'sections', libelle: 'Sections de solive', valeur: () => SOLIVE_SECTIONS.map(s => { const d = SOLIVE_SECTION_DIMS[s]; return s + (d ? ' (' + d.b + '×' + d.h + ')' : ''); }).join(' · ') + ' — largeur × hauteur en mm, posée sur chant' },
      { type: 'lecture', cle: 'bornesPortee', libelle: 'Bornes de portée', valeur: () => '50 à 250 cm' },
      { type: 'lecture', cle: 'bornesEntraxe', libelle: 'Bornes entraxe lame', valeur: () => '30 à 55 cm' },
      { type: 'lecture', cle: 'fusion', libelle: 'Fusion des appuis', valeur: (cx) => Math.round(Math.min(0.35, porteeVisSpaM(cx.construction()) * 0.45) * 100) + ' cm — deux appuis plus proches n\'en font qu\'un (10 cm en rive)' },
      { type: 'lecture', cle: 'axeCadre', libelle: 'Axe du cadre', valeur: (cx) => { const c = cx.construction(); return (dimsSection(estPlots(c) && !c.plotAvecSolives ? sectionLambourde(c) : c.soliveSection).b / 2) + ' mm — rentré d\'une demi-section pour affleurer le bord'; } },
      // Chaque mode ne montre que ses propres tarifs.
      { type: 'lecture', cle: 'plafondPlots', libelle: 'Plafond d\'entraxe des plots', visible: (cx) => lire(cx).plots, valeur: () => Math.round(PLOT_ENTRAXE_MAX_M * 100) + ' cm — NF DTU 51.4, appuis sous lambourdes' },
      { type: 'lecture', cle: 'domainePlots', libelle: 'Domaine d\'emploi', visible: (cx) => lire(cx).plots, valeur: () => PLOT_HAUTEUR_DTU_CM + ' cm / ' + PLOT_HAUTEUR_MAX_CM + ' cm — plot réglable / hauteur du platelage au-dessus du support' },
      { type: 'lecture', cle: 'prixPlots', libelle: 'Prix indicatifs', visible: (cx) => lire(cx).plots, valeur: () => 'plots ' + au(PLOT_MODELES, 0).prix.toFixed(2) + '-' + au(PLOT_MODELES, PLOT_MODELES.length - 1).prix.toFixed(2) + ' €/u · bois ' + SOLIVE_PRICE.bas + '-' + SOLIVE_PRICE.haut + ' €/ml · géotextile ' + GEOTEXTILE_PRICE.bas + '-' + GEOTEXTILE_PRICE.haut + ' €/m² · concassé ' + CONCASSE_PRICE.bas + '-' + CONCASSE_PRICE.haut + ' €/m³ · dalle stab ' + DALLE_STAB_PRICE.bas + '-' + DALLE_STAB_PRICE.haut + ' €/u — utilisés tant qu\'aucun prix réel n\'est saisi' },
      { type: 'lecture', cle: 'courseVis', libelle: 'Course de tête réglable', visible: (cx) => !lire(cx).plots, valeur: () => VIS_DEPASSEMENT_USUEL_CM + ' cm / ' + VIS_DEPASSEMENT_MAX_CM + ' cm — dépassement usuel / limite au-delà de laquelle la vis devient un poteau' },
      { type: 'lecture', cle: 'prixVis', libelle: 'Prix indicatifs', visible: (cx) => !lire(cx).plots, valeur: () => 'vis ' + VIS_PRICE.bas + '-' + VIS_PRICE.haut + ' €/u · bois ' + SOLIVE_PRICE.bas + '-' + SOLIVE_PRICE.haut + ' €/ml · visserie ' + VISSERIE_PRICE.bas + '-' + VISSERIE_PRICE.haut + ' €/m² · rive ' + LAME_RIVE_PRICE.bas + '-' + LAME_RIVE_PRICE.haut + ' €/ml — utilisés tant qu\'aucun prix réel n\'est saisi' }
    ]
  };
  return [fondation, ouvertures, structure, lames, finitions, optimisation, parametres];
}
