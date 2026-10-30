// Qui l'emporte sur un champ d'un batiment (MD/spec-flux-batiment.md, « Le flux de construction d'un batiment », « Qui l'emporte » ;
// decision du 28 octobre 2026).
//
// Un batiment n'a pas d'auteur unique : la personne, l'audit de la parcelle, le moteur de regles, la lecture LiDAR, l'actualisation
// IGN et les valeurs par defaut ecrivent chacun quelques champs, a des moments differents. Une seule hierarchie les departage, la
// plus forte d'abord :
//
//   1. la personne, par un geste explicite (Mode Toit, inspecteur, retouche du contour, case cochee) ; entre deux de ses gestes, le
//      dernier gagne ;
//   2. ce qui a ete vu sur place (audit valide, releve de facade valide) ; une proposition ne remplace un choix de la personne que
//      si elle la coche ;
//   3. le fait du moteur de regles (regles/toits/faits.json, par cleabs) ;
//   4. la mesure (LiDAR HD, sous les garde-fous et les reglages) ;
//   5. la source officielle (BD TOPO, cadastre) ;
//   6. le defaut (2,5 m, profils, 35°).
//
// Un ecrivain automatique de niveau N n'ecrit un groupe de champs que si sa valeur d'aujourd'hui vient d'un niveau N ou plus faible
// (`peutEcrire`). Ce niveau se lit sur l'objet, groupe par groupe, sur les marques qu'il porte deja (`origineActuelle`) : c'est la
// seule regle, et tous les ecrivains la demandent ici. tests/unit/model/protections.test.ts l'epingle case par case.
//
// Pur : pas de DOM, rien d'ecrit.

import type { Toit } from './typesToit.js';

/** Un niveau de la hierarchie : 1 la personne, 2 vu sur place, 3 le fait, 4 la mesure, 5 la source officielle, 6 le defaut. */
export type Niveau = 1 | 2 | 3 | 4 | 5 | 6;
export const NIVEAU = { personne: 1, surPlace: 2, fait: 3, mesure: 4, officiel: 5, defaut: 6 } as const satisfies Record<string, Niveau>;

/** Les ecrivains automatiques d'un batiment, et leur niveau. */
export type Ecrivain = 'audit' | 'faits' | 'lidar' | 'recalage' | 'ortho' | 'panoramax' | 'ign';
export const NIVEAU_ECRIVAIN: Readonly<Record<Ecrivain, Niveau>> = {
  /** La proposition de l'audit cochee d'office (app/audit/parcelle/constats.ts) : arretee, elle arrive decochee. */
  audit: NIVEAU.surPlace,
  /** Les faits par batiment (regles/toits/faits.json), les profils de facades (app/toits/profilsFacadesFond.ts). */
  faits: NIVEAU.fait,
  /** La lecture du toit sur le LiDAR HD (app/toits/toitsLidar.ts, toitsFond.ts). */
  lidar: NIVEAU.mesure,
  /** Le recalage d'un bloc du contour sur le LiDAR (toitsLidar.ts::recalerSurLidar). */
  recalage: NIVEAU.mesure,
  /** La couleur du toit lue sur l'orthophoto, ou son repli (render/couleurToitOrtho.ts, a l'import et en tache de fond). */
  ortho: NIVEAU.mesure,
  /**
   * La couleur des murs lue sur les photos de rue Panoramax (render/couleurMurPhoto.ts a l'import, app/toits/mursFond.ts en tache
   * de fond) : une mesure faite sur une photo, comme la couleur du toit sur l'orthophoto, par personne sur place. Elle n'ecrit que
   * sa case, le groupe `photoMurs`.
   */
  panoramax: NIVEAU.mesure,
  /** L'actualisation IGN, et « Actualiser le projet » (app/cadastre/actualisationIgn.ts). */
  ign: NIVEAU.officiel,
};

/** Les groupes de champs d'un batiment. */
export type Groupe =
  /** `pts`. */
  | 'contour'
  /** `elevation`, la hauteur a l'egout. */
  | 'hauteur'
  /** La forme du toit et ses corps : `toit` (sauf couleur et couverture), `corpsToit`, `volumesToit`, `toitMesure`. */
  | 'toit'
  /** Ce qui est pose sur les corps : cheminees, lucarnes, terrasse, fenetres de toit et panneaux, appentis ouvert, saillies. */
  | 'elements'
  /** Le materiau de couverture du toit. */
  | 'couverture'
  /** La couleur du toit (`toit.couleur`, `origineCouleur`). */
  | 'couleurToit'
  /** La couleur et le materiau des murs retenus (`couleurMurs` : la source choisie, la couleur et le materiau vus sur place). */
  | 'murs'
  /**
   * La case de la photo de rue (`couleurMurs.photo`, et `lecture`) : une lecture rangee a part, que la couleur retenue
   * (model/couleurMur.ts::couleurMursRetenue) prend ou non selon la source choisie. Groupe a part de `murs` : choisir la source
   * « photo » choisit d'ou vient la couleur, pas sa valeur, et la lecture doit continuer de la tenir a jour.
   */
  | 'photoMurs'
  /** Les releves de facade (par mur, `cote`), le profil de facades. */
  | 'facades'
  /*
   * Les parts de la Facade d'un mur (MD/spec-facade-calage-audit.md §3.1, lot F5), chacune par mur (`cote`) : ses dimensions, sa
   * forme (gabarit, silhouette lue, pointes, corps), sa texture et sa pose (`texture`, `textureCalee`), ses ouvertures (la facade
   * objet). La personne les ecrit a la validation de la facade (V4) ; l'audit pose d'office un releve mesure (`depuisAudit`).
   */
  /** `dimensions` : la largeur, l'egout et le faitage retenus (le plan et le LiDAR), et l'ecart que la photo constate. */
  | 'facadeDimensions'
  /** `forme` : le gabarit, la silhouette lue, les pointes, les corps que la facade porte. */
  | 'facadeForme'
  /** La texture du mur, sa pose et ce qu'elle dit du parement (`texture`, `hauteurTexture`, `textureCalee`, `surface`). */
  | 'facadeTexture'
  /** Les ouvertures hors automatique (la facade objet) ; une ouverture verifiee, corrigee ou ajoutee est gardee une a une (`ouvertureGardee`). */
  | 'facadeOuvertures'
  /**
   * La modenature lue d'un mur et ce qu'il porte (`modenature`, `appendices` ; lot L1 de MD/spec-lecture-ia-elargie.md §4.2) : ecrite
   * par l'audit (la validation V4) ou a la main. L'etat du bati signale (`etat`) n'a pas d'autre ecrivain que l'audit : il n'est pas un
   * groupe, il suit la photo qui l'a montre.
   */
  | 'facadeModenature';

/** D'ou vient la valeur d'aujourd'hui d'un groupe : la marque qui la porte. */
export type Origine =
  /** « Règles » coupees (Mode Toit, elements de facade de l'inspecteur, toit valide par l'audit). */
  | 'fige'
  /** Le contour retouche a la main (model/retouche.ts) ; « Reprendre la version de l'IGN » le leve. */
  | 'retouche'
  /** Un batiment dessine : son contour, sa hauteur posee (pas de `bdtopo`). */
  | 'dessine'
  /** Un toit saisi (inspecteur, forme du catalogue). */
  | 'toitSaisi'
  /** La hauteur a l'egout saisie dans l'inspecteur (`egoutChoisi: 'saisie'`). */
  | 'egoutSaisi'
  /** Une couverture choisie (inspecteur, audit). */
  | 'couvertureChoisie'
  /** Une couleur du toit posee sans `origineCouleur` : choisie (inspecteur, audit, Mode Toit), pas lue par Plan. */
  | 'couleurToitChoisie'
  /** La source de la couleur des murs choisie (Apparence). */
  | 'mursChoisis'
  /** Un releve fait a la main sur le mur vise. */
  | 'releveMain'
  /** Verifie sur place (audit valide, batiment tout vu) ; « Recalculer aussi » le leve. */
  | 'verifie'
  /** La hauteur a l'egout validee par l'audit (`egoutChoisi: 'audit'`). */
  | 'egoutVu'
  /** Un toit lu sur une photo de facade (releve avec toit). */
  | 'toitPhoto'
  /** Des elements poses sur les corps (vus, ou poses a la main). */
  | 'elementsPoses'
  /** La couleur ou le materiau des murs vus sur place (audit). */
  | 'mursVus'
  /** Un releve pose par l'audit sur le mur vise. */
  | 'releveAudit'
  /** La Facade validee par la personne (V4) sur le mur vise : la part du groupe y est (dimensions, forme, pose, ouvertures verifiees). */
  | 'facadeValidee'
  /** Le profil de facades choisi par le moteur. */
  | 'profil'
  /** Lu sur le LiDAR (`toitLidarLu`, toit `lidar`). */
  | 'lidar'
  /** La couleur du toit lue sur l'orthophoto, ou son repli selon le materiau (`origineCouleur`). */
  | 'ortho'
  /** La couleur des murs lue sur une photo de rue. */
  | 'photoRue'
  /** La BD TOPO. */
  | 'bdtopo'
  /** Rien : le defaut. */
  | 'defaut';

/** Ce que ce module lit d'un batiment. */
export interface BatimentProtege {
  bdtopo?: unknown;
  elevation?: number;
  retoucheMain?: { date: string } | null;
  batiment?: {
    toit?: Pick<Toit, 'source' | 'couverture' | 'couleur' | 'origineCouleur'> | null;
    toitFige?: boolean;
    egoutChoisi?: 'saisie' | 'audit';
    verifieSurPlace?: { date: string } | null;
    toitLidarLu?: number | null;
    corpsToit?: readonly { cheminees?: readonly unknown[]; lucarnes?: readonly unknown[]; elementsToit?: readonly unknown[]; terrasse?: unknown; ouvert?: boolean; saillie?: unknown }[] | null;
    couleurMurs?: { source?: unknown; materiau?: unknown; terrain?: unknown; photo?: unknown; lecture?: unknown } | null;
    facades?: readonly FacadeProtegee[] | null;
    profilFacades?: unknown;
  } | null;
}

/** Une ouverture de la facade objet, telle que ce module la lit : ce qui dit que la personne l'a posee, corrigee ou verifiee. */
export interface OuvertureProtegee { source?: string; verifieeLe?: string }

/** Ce que ce module lit du releve d'un mur. */
export interface FacadeProtegee {
  cote: number;
  depuisAudit?: true;
  dimensions?: unknown;
  forme?: unknown;
  textureCalee?: unknown;
  surface?: unknown;
  modenature?: unknown;
  appendices?: unknown;
  ouvertures?: readonly OuvertureProtegee[];
}

/** Ce que la personne a demande pour cette ecriture, et ce qu'elle vise. */
export interface ContexteEcriture {
  /** « Recalculer aussi » les batiments verifies sur place (actualisation), ou la copie que la tache de fond lit pour comparer. */
  relireVerifies?: boolean;
  /** « Reprendre la version de l'IGN » pour cet objet retouche a la main. */
  reprendreIgn?: boolean;
  /** Le contour a change a la source elle-meme : la mesure lue sur l'ancien (contour, toit) ne vaut plus, elle sera relue. */
  mesurePerimee?: boolean;
  /** Le mur (rang du cote) qu'une ecriture de facade vise. */
  cote?: number;
}

/** Le niveau de chaque origine. */
export const NIVEAU_ORIGINE: Readonly<Record<Origine, Niveau>> = {
  fige: 1, retouche: 1, dessine: 1, toitSaisi: 1, egoutSaisi: 1, couvertureChoisie: 1, couleurToitChoisie: 1, mursChoisis: 1, releveMain: 1, facadeValidee: 1,
  verifie: 2, egoutVu: 2, toitPhoto: 2, elementsPoses: 2, mursVus: 2, releveAudit: 2,
  profil: 3,
  lidar: 4, ortho: 4, photoRue: 4,
  bdtopo: 5,
  defaut: 6,
};

const aElements = (o: BatimentProtege): boolean => (o.batiment?.corpsToit ?? []).some((c) =>
  !!c.cheminees?.length || !!c.lucarnes?.length || !!c.elementsToit?.length || !!c.terrasse || c.ouvert !== undefined || !!c.saillie);

/** Le contour : retouche, fige, verifie, dessine, recale ou lu sur le LiDAR, BD TOPO. */
function origineDuContour(o: BatimentProtege, ctx: ContexteEcriture, fige: boolean, verifie: boolean): Origine {
  if (o.retoucheMain && !ctx.reprendreIgn) return 'retouche';
  if (fige) return 'fige';
  if (verifie) return 'verifie';
  if (!o.bdtopo) return 'dessine';
  return o.batiment?.toitLidarLu && !ctx.mesurePerimee ? 'lidar' : 'bdtopo';
}

/** La hauteur a l'egout : saisie, figee avec le toit, validee, verifiee, lue sur le LiDAR, BD TOPO, dessinee ou par defaut. */
function origineDeLaHauteur(o: BatimentProtege, fige: boolean, verifie: boolean): Origine {
  const b = o.batiment, source = b?.toit?.source;
  if (b?.egoutChoisi === 'saisie') return 'egoutSaisi';
  if (fige) return 'fige';
  if (source === 'saisie') return 'toitSaisi';
  if (b?.egoutChoisi === 'audit') return 'egoutVu';
  if (verifie) return 'verifie';
  if (source === 'photo') return 'toitPhoto';
  if (b?.toitLidarLu) return 'lidar';
  if (typeof o.elevation !== 'number') return 'defaut';
  return o.bdtopo ? 'bdtopo' : 'dessine';
}

/** Le toit : fige, saisi, verifie, photo, lu sur le LiDAR, BD TOPO ou rien. */
function origineDuToit(o: BatimentProtege, ctx: ContexteEcriture, fige: boolean, verifie: boolean): Origine {
  const source = o.batiment?.toit?.source;
  if (fige) return 'fige';
  if (source === 'saisie') return 'toitSaisi';
  if (verifie) return 'verifie';
  if (source === 'photo') return 'toitPhoto';
  if ((o.batiment?.toitLidarLu || source === 'lidar') && !ctx.mesurePerimee) return 'lidar';
  return source === 'bdtopo' ? 'bdtopo' : 'defaut';
}

/**
 * La couleur du toit : choisie (posee sans origine), verifiee sur place, lue par Plan (orthophoto ou repli, avec son origine), ou
 * rien. Le toit fige ne la protege pas : figer arrete la forme, et la couleur lue par Plan ne vient pas de la personne.
 */
function origineDeLaCouleurDuToit(o: BatimentProtege, verifie: boolean): Origine {
  const t = o.batiment?.toit;
  if (t?.couleur && !t.origineCouleur) return 'couleurToitChoisie';
  if (verifie) return 'verifie';
  return t?.couleur ? 'ortho' : 'defaut';
}

/** La couleur et le materiau des murs : source choisie, vus sur place, verifie, photo de rue, ou rien. */
function origineDesMurs(o: BatimentProtege, verifie: boolean): Origine {
  const m = o.batiment?.couleurMurs;
  if (m?.source) return 'mursChoisis';
  if (m?.materiau || m?.terrain) return 'mursVus';
  if (verifie) return 'verifie';
  return m?.photo ? 'photoRue' : 'defaut';
}

/**
 * La case de la photo de rue : occupee par une valeur plus forte quand une couleur vue sur place (`terrain`, audit valide) tient la
 * meme place, la teinte des murs ; sinon la lecture elle-meme, ou rien. Ni la source choisie (elle dit d'ou prendre la couleur, et
 * « photo » demande justement la lecture a jour), ni le materiau vu (une matiere, pas la teinte que la photo donne), ni
 * `verifieSurPlace` seul (l'audit n'a pas valide de couleur : la photo reste la seule teinte connue) ne l'arretent. Aucun geste de la
 * personne n'ecrit cette case.
 */
function origineDeLaPhotoDesMurs(o: BatimentProtege): Origine {
  const m = o.batiment?.couleurMurs;
  if (m?.terrain) return 'mursVus';
  return m?.photo ? 'photoRue' : 'defaut';
}

/** Les facades : le releve du mur vise (a la main, par l'audit), verifie, le profil du moteur, ou rien. */
function origineDesFacades(o: BatimentProtege, ctx: ContexteEcriture, verifie: boolean): Origine {
  const r = ctx.cote === undefined ? undefined : (o.batiment?.facades ?? []).find((x) => x.cote === ctx.cote);
  if (r) return r.depuisAudit ? 'releveAudit' : 'releveMain';
  if (verifie) return 'verifie';
  return o.batiment?.profilFacades ? 'profil' : 'defaut';
}

/**
 * Une ouverture que la personne a posee (`ajoutee`), corrigee ou verifiee (`verifieeLe`, V4) : de son niveau, le premier. Aucun
 * ecrivain automatique ne la deplace ni ne la retire ; un rejeu l'apparie aux nouvelles detections (model/facadeObjet.ts).
 */
export const ouvertureGardee = (ov: OuvertureProtegee): boolean => !!ov.verifieeLe || ov.source === 'corrigee' || ov.source === 'ajoutee';

/** Les groupes de la Facade d'un mur, et la part du releve que chacun designe (lot F5). */
type GroupeDeFacade = 'facadeDimensions' | 'facadeForme' | 'facadeTexture' | 'facadeOuvertures' | 'facadeModenature';
const PART_VALIDEE: Readonly<Record<GroupeDeFacade, (r: FacadeProtegee) => boolean>> = {
  facadeDimensions: (r) => !!r.dimensions,
  facadeForme: (r) => !!r.forme,
  facadeTexture: (r) => !!r.textureCalee || !!r.surface,
  facadeOuvertures: (r) => (r.ouvertures ?? []).some(ouvertureGardee),
  facadeModenature: (r) => !!r.modenature || !!r.appendices,
};

/**
 * Une part de la Facade du mur vise : posee d'office par l'audit (`depuisAudit`, 2), validee par la personne (V4 : la part y est,
 * 1), sinon un releve fait a la main (1) ; sans releve, verifie sur place (2) ou rien. Le profil de facades ne s'y applique pas : il
 * regle la disposition automatique, qui n'est pas stockee.
 */
function origineDUnePartDeFacade(o: BatimentProtege, groupe: GroupeDeFacade, ctx: ContexteEcriture, verifie: boolean): Origine {
  const r = ctx.cote === undefined ? undefined : (o.batiment?.facades ?? []).find((x) => x.cote === ctx.cote);
  if (!r) return verifie ? 'verifie' : 'defaut';
  if (r.depuisAudit) return 'releveAudit';
  return PART_VALIDEE[groupe](r) ? 'facadeValidee' : 'releveMain';
}

/**
 * D'ou vient la valeur d'aujourd'hui de ce groupe : la premiere origine qui s'applique, de la plus forte a la plus faible. C'est la
 * table « Qui l'emporte » de la spec, ligne par ligne.
 */
export function origineActuelle(o: BatimentProtege, groupe: Groupe, ctx: ContexteEcriture = {}): Origine {
  const fige = o.batiment?.toitFige === true, verifie = !!o.batiment?.verifieSurPlace && !ctx.relireVerifies;
  switch (groupe) {
    case 'contour': return origineDuContour(o, ctx, fige, verifie);
    case 'hauteur': return origineDeLaHauteur(o, fige, verifie);
    case 'toit': return origineDuToit(o, ctx, fige, verifie);
    case 'elements': return fige ? 'fige' : aElements(o) ? 'elementsPoses' : 'defaut';
    case 'couverture': return o.batiment?.toit?.couverture ? 'couvertureChoisie' : 'defaut';
    case 'couleurToit': return origineDeLaCouleurDuToit(o, verifie);
    case 'murs': return origineDesMurs(o, verifie);
    case 'photoMurs': return origineDeLaPhotoDesMurs(o);
    case 'facades': return origineDesFacades(o, ctx, verifie);
    case 'facadeDimensions': case 'facadeForme': case 'facadeTexture': case 'facadeOuvertures': case 'facadeModenature': return origineDUnePartDeFacade(o, groupe, ctx, verifie);
  }
}

/** Le niveau de la valeur d'aujourd'hui de ce groupe. */
export const niveauActuel = (o: BatimentProtege, groupe: Groupe, ctx: ContexteEcriture = {}): Niveau => NIVEAU_ORIGINE[origineActuelle(o, groupe, ctx)];

/** Un ecrivain de ce niveau peut-il ecrire ce groupe ? Oui si la valeur d'aujourd'hui vient d'un niveau egal ou plus faible. */
export const peutEcrire = (o: BatimentProtege, groupe: Groupe, niveau: Niveau, ctx: ContexteEcriture = {}): boolean => niveauActuel(o, groupe, ctx) >= niveau;

/** La meme question, posee par un ecrivain nomme. */
export const ecrivainPeut = (o: BatimentProtege, ecrivain: Ecrivain, groupe: Groupe, ctx: ContexteEcriture = {}): boolean => peutEcrire(o, groupe, NIVEAU_ECRIVAIN[ecrivain], ctx);

/**
 * La hauteur a l'egout choisie (`egoutChoisi`, saisie ou validee par l'audit) peut-elle etre rendue au calcul ? Oui si, sans elle, la
 * lecture du LiDAR pourrait l'ecrire : pas d'un batiment dessine, ni d'un toit fige, saisi, vu sur place ou lu sur une photo, ou ce
 * geste ne changerait rien.
 */
export function egoutRendable(o: BatimentProtege): boolean {
  if (!o.batiment?.egoutChoisi) return false;
  const sans = { ...o.batiment };
  delete sans.egoutChoisi;
  return ecrivainPeut({ ...o, batiment: sans }, 'lidar', 'hauteur');
}
