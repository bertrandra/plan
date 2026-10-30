// Les mesures de l'audit de la parcelle, dans le telephone (MD/spec-audit.md §13.1) : pour chaque
// facade photographiee, ce que Plan sait mesurer sans serveur, de facon deterministe.
//
// - Le releve de la facade : depuis le lot F3, l'audit le demande a l'orchestrateur de l'enchainement d'une facade
//   (facade/releve/enchainement.ts, mode `audit`), le meme que la calibration rejoue : ses photos, avec leur prise de vue, sont
//   redressees (coins poses au doigt, sinon trouves sur les aretes, sinon reportes, sinon predits par la prise de vue), reportees,
//   assemblees ou fusionnees, analysees ; le releve en sort, avec l'etat de chaque etape (la barre de progression, le mode
//   discret de l'audit). Ici, rien ne reordonne les etapes : on prepare les entrees, on lit les sorties.
// - La hauteur a l'egout, mesuree par la perspective : elle ne compte que si les coins ont ete trouves
//   sur la photo ; des coins predits d'apres la hauteur connue rendraient cette hauteur.
// - La couleur du mur (lot L3) : lue sur chaque photo prise avec la boussole ; on garde la lecture
//   qui a le plus de points.
//
// Aucune photo n'est jamais supprimee : une photo qui ne se fusionne pas reste seule, redressee. Les originaux sont immuables ; les
// corrections manuelles (reperes, mur, echelle) priment sur le calcul et ne sont jamais ecrasees par un rejeu.

import type { ImageDuRun } from '../../../facade/releve/imageDuRun.js';
import { CHAMP_GRAND_COTE_DEFAUT } from '../../../facade/vision/cadrage.js';
import { lireFacadeSurPhoto, pixelsDePhoto } from '../../../render/couleurPhotoAudit.js';
import type { EntreeRecherche, ResultatRecherche } from '../../../facade/releve/serie.js';
import { VERSION_CHAINE_FACADES, type PhotoARedresser } from '../../../facade/releve/chaine.js';
import { derouler, type AssemblageAAjuster, type EtapeCalculee } from '../../../facade/releve/enchainement.js';
import { gabaritDesCorps, type GabaritMur } from '../../../facade/gabaritMur.js';
import type { DiagnosticForme } from '../../../facade/regles/facades/diagnosticForme.js';
import type { BilanFacade } from '../../../facade/releve/bilanFacade.js';
import type { PhotoRedresseeAuditee } from '../../../model/fichierAuditParcelle.js';
import type { Pixels } from '../../../render/couleurMurPhoto.js';
import type { Obstacle } from '../../../geometry/ligneDeVue.js';
import type { Facade } from '../../../geometry/cotesVusDeDehors.js';
import type { Image } from '../../../facade/vision/homographie.js';
import type { Prise } from '../../../facade/releve/prise.js';
import type { PhotoCas } from '../../../model/audit.js';
import type { BilanPhotoRedressement, BilanRedressement, CorrectionRedressement } from '../../../model/auditParcelle.js';
import type { SilhouetteFacade } from '../../../model/silhouetteFacade.js';
import type { EtatAffiche, IdEtape } from '../../../model/etapeFacade.js';
import type { CorpsToit, ObjetPolygone, OuvertureFacade, PtBrut, ReleveFacade } from '../../../model/types.js';

/** La cle d'une mesure : le batiment et le cote du mur (`cle#cote`). */
export const cleMesure = (cle: string, cote: number): string => cle + '#' + cote;

/** Ce que les mesures ont tire des photos d'une facade. */
export interface MesureFacade {
  cle: string;
  cote: number;
  /** Le releve, a la hauteur mesuree (ou estimee) ; null si la photo n'a pas pu s'analyser. */
  releve: ReleveFacade | null;
  /** La photo du releve, par son rang parmi celles de la facade. */
  rangReleve: number | null;
  /** Les quatre coins ont-ils ete trouves sur la photo (et non seulement predits) ? */
  coinsTrouves: boolean;
  /** La note du calage fin, de 0 a 1 ; null sans calage fin. */
  confiance: number | null;
  /** La hauteur a l'egout mesuree, quand les coins ont ete trouves. */
  hauteurM: number | null;
  /** La couleur du mur, la lecture la plus sure de ses photos. */
  couleur: { couleur: string; pixels: number; rang: number } | null;
  /**
   * Les baies devinees par la structure, laissees en pointille par le releve : le run de Claude
   * peut les confirmer (runsFacades.ts). Absentes d'une mesure lue dans un fichier d'audit, dont
   * le format ne les porte pas.
   */
  devinees?: OuvertureFacade[];
  /**
   * La ligne du haut du mur sur la photo (pignon, trapeze, rectangle, rampe...), lue par la silhouette au-dessus de l'egout
   * (facade/toits/toit.ts) : de quoi dire les bouts du toit (facade/regles/toits/silhouettes.ts). `indetermine` quand le toit est
   * hors cadre. Absente d'une mesure lue dans un fichier d'audit d'avant elle.
   */
  silhouette?: SilhouetteFacade;
  /**
   * Le haut du mur lu a la matiere du mur (u de 0 a 1 le long du mur, v en hauteurs d'egout), que le diagnostic de forme compare au
   * gabarit (lot F4). Derive : il ne s'ecrit pas dans le fichier de l'audit ; une mesure relue d'un fichier ne l'a pas.
   */
  hautLu?: { u: number; v: number }[] | null;
  /**
   * L'image que le run de Claude lit (lot F7) : la photo du releve redressee du sol jusqu'au haut de la facade (pointes, toit, cheminees,
   * lucarnes), en JPEG, et la place de l'egout sur elle. Derivee : elle ne s'ecrit pas dans le fichier de l'audit ; une mesure relue d'un
   * fichier envoie le mur seul, coupe dans la texture de son releve.
   */
  imageRun?: ImageDuRun | null;
  /**
   * Le diagnostic de forme de la facade (E5 bis, lot F4) : ses troncons de corps, les propositions de toit (chacune sur son corps, par
   * son mur), les alertes de hauteur. Derive, comme les etapes : il ne s'ecrit pas dans le fichier de l'audit.
   */
  diagnostic?: DiagnosticForme | null;
  /**
   * Le redressement de chaque photo (automatique, manuel ou en echec, avec son motif) et la fusion. Derive : le bouton
   * « Rejouer redressement + fusion » le recalcule, les originaux et les corrections manuelles n'y changent jamais.
   */
  redressement?: BilanRedressement;
  /**
   * Chaque photo redressee seule, en JPEG, entre les coins que la chaine a retenus : ce que le modele voyait le jour de la
   * mesure. Les photos brutes et les corrections restent la source d'un rejeu ; ces images disent ce qu'il change.
   */
  redressees?: PhotoRedresseeAuditee[];
  /**
   * L'assemblage de deux photos ou plus, pris pour la suite, et le mur que la chaine y a pose : « Ajuster l'égout et le sol » le montre
   * (jamais une photo seule), et le mur tire dessus revient sur chaque photo assemblee. Derive : il ne s'ecrit pas dans le fichier de
   * l'audit ; absent avec une photo, ou d'une mesure relue d'un fichier.
   */
  assemblage?: AssemblageAAjuster;
  /** La version de la chaine des facades qui a fait ces mesures (facade/releve/chaine.ts). */
  versionChaine?: number;
  /** Le gabarit du mur (le plan et le LiDAR) pose sur les photos : la reprise a la main le montre tel quel. */
  gabarit?: GabaritMur;
  /**
   * L'etat de chaque etape de l'enchainement de la facade (E0 a E9) et ce qu'elle a donne : la barre de progression et le mode discret
   * de l'audit les lisent. Derive : il se recalcule a chaque rejeu ; absent d'une mesure lue dans un fichier d'audit.
   */
  etapes?: Pick<EtapeCalculee, 'id' | 'etat' | 'resume'>[];
  /**
   * Le bilan de la facade (E9, lot F5) : la Facade que la validation V4 ecrira (dimensions, forme, pose de la texture, ouvertures
   * numerotees). Derive, comme les etapes : absent d'une mesure lue dans un fichier d'audit, « Rejouer la façade » le refait.
   */
  facade?: BilanFacade;
}

export interface DependancesMesures {
  pixels?: (base64: string) => Promise<Pixels | null>;
  /** Le calage fin (worker du releve, app/releve/rechercheCoins.ts). */
  chercherCoins: (e: EntreeRecherche) => Promise<ResultatRecherche>;
  /** L'elevation redressee en JPEG (`data:`) : le canevas du navigateur. */
  jpeg: (img: Image) => string;
  /** Les limites de parcelle, ou se tiennent les clotures (lecture de la couleur). */
  limites: () => readonly Obstacle[];
  /** A chaque etape commencee puis finie : la barre de progression de la facade avance. */
  surEtape?: (id: IdEtape, etat: EtatAffiche) => void;
  /** Vrai : la personne a demande d'arreter ; les etapes restantes restent a venir. */
  arrete?: () => boolean;
  /** Rendre la main au navigateur entre deux etapes (le calcul est long sur un telephone). */
  rendreLaMain?: () => Promise<void>;
}

/** La distance de la prise de vue au mur, perpendiculairement, en metres. */
export function distanceAuMur(f: Facade, p: PtBrut): number {
  const dx = f.droite.x - f.gauche.x, dy = f.droite.y - f.gauche.y;
  const l = Math.hypot(dx, dy);
  if (!(l > 0)) return Math.hypot(p.x - f.gauche.x, p.y - f.gauche.y);
  return Math.abs(dx * (p.y - f.gauche.y) - dy * (p.x - f.gauche.x)) / l;
}

const versImage = (p: Pixels): Image => ({ largeur: p.largeur, hauteur: p.hauteur, donnees: p.data instanceof Uint8ClampedArray ? p.data : new Uint8ClampedArray(Array.from(p.data)) });

/**
 * La prise du releve d'apres la photo de l'audit : sa position donne la distance au mur (a la
 * precision du GPS), la boussole le cap, l'EXIF le champ de l'objectif.
 * Le cap du sens de la marche ne dit pas ou visait le telephone : il n'est pas repris.
 *
 * L'attitude n'est pas reprise non plus : elle est lue au retour de l'appareil photo, telephone baisse vers l'ecran, pas au
 * declenchement. Sur l'audit d'AE 101 (18 octobre), elle valait -17 a -48 degres pour des photos prises vers le haut : le calage,
 * qui ne lui laisse que 3 degres de marge, cherchait les coins la ou le mur n'etait pas. Inconnue, elle se lit sur la photo (le
 * point de fuite des verticales, calageFin.ts), dans une marge de 20 degres.
 */
export function priseDeLaPhoto(photo: PhotoCas, image: Image, facade: Facade, champLu: number | null = null): Prise {
  const p = photo.prise;
  const distance = p ? distanceAuMur(facade, p) : 0;
  // Un GPS de telephone se trompe de 3 a 8 m : a cette distance du mur, il ne dit pas ou se tenait la personne (AE 101 : 2,7 m
  // pour un pignon vu en entier, a 7 m). La distance ne sert que si elle depasse deux fois la precision ; sinon le cadrage la
  // suppose (le mur sur les sept dixiemes de la photo), avec sa marge.
  const fiable = distance > 0.5 && p?.precisionM != null && distance > 2 * p.precisionM;
  // Sans EXIF, le champ note est celui d'un telephone : celui que donnent les points de fuite de la photo l'emporte (AE 101 : des
  // photos a l'ultra grand-angle, deux fois plus larges que le champ suppose ; l'inclinaison lue sur les verticales en depend).
  const champ = p?.sourceFocale === 'defaut' || p?.champDeg == null ? (champLu ?? p?.champDeg ?? null) : p.champDeg;
  return {
    photo: { image, url: '', champ, focalePx: null },
    mesure: fiable ? { distance: Math.round(distance * 100) / 100, source: 'gps' } : null,
    champ: champ ?? CHAMP_GRAND_COTE_DEFAUT,
    cap: p?.sourceAzimut === 'boussole' ? p.azimutDeg : null,
    attitude: null,
  };
}

/** La couleur du mur sur chaque photo prise a la boussole ; la lecture qui a le plus de points. */
async function couleurDesPhotos(photos: readonly PhotoCas[], images: (i: number) => Promise<Pixels | null>, f: Facade, d: DependancesMesures): Promise<MesureFacade['couleur']> {
  let meilleure: MesureFacade['couleur'] = null;
  for (let i = 0; i < photos.length; i++) {
    const prise = photos[i]?.prise;
    if (!prise || prise.azimutDeg === null || prise.sourceAzimut !== 'boussole') continue;
    const img = await images(i);
    if (!img) continue;
    const l = lireFacadeSurPhoto(img, prise, { a: f.gauche, b: f.droite, egout: f.hauteur }, d.limites());
    if (l.couleur && (!meilleure || l.pixels > meilleure.pixels)) meilleure = { couleur: l.couleur, pixels: l.pixels, rang: i };
  }
  return meilleure;
}


/**
 * Les mesures d'une facade, depuis ses photos. Ne rejette jamais : une photo illisible ne donne rien.
 * Toutes les photos sont redressees ; deux ou plus, sans echec, sont fusionnees. Aucune n'est supprimee.
 */
export async function mesurerFacade(cle: string, f: Facade, bat: Pick<ObjetPolygone, 'pts'> & { corpsToit?: readonly CorpsToit[] | null }, photos: readonly PhotoCas[], d: DependancesMesures, corrections: Readonly<Record<string, CorrectionRedressement>> = {}): Promise<MesureFacade> {
  const charger = d.pixels ?? pixelsDePhoto;
  const cache = new Map<number, Promise<Pixels | null>>();
  const images = (i: number) => {
    let p = cache.get(i);
    if (!p) { p = charger(photos[i]?.base64 ?? '').catch(() => null); cache.set(i, p); }
    return p;
  };
  const vide: MesureFacade = { cle, cote: f.cote, releve: null, rangReleve: null, coinsTrouves: false, confiance: null, hauteurM: null, couleur: null };
  const couleur = await couleurDesPhotos(photos, images, f, d).catch(() => null);
  if (!photos.length) return { ...vide, couleur };
  // L'echelle corrigee a la main (la largeur reelle du mur) vaut pour toutes les photos du mur : la premiere donnee l'emporte.
  const largeurM = Object.keys(corrections).map(Number).sort((a, b) => a - b).map((k) => corrections[String(k)]?.echelleLargeurM).find((v) => typeof v === 'number' && v > 0);
  const fm: Facade = largeurM ? { ...f, largeur: largeurM } : f;

  // 1. Le redressement de chaque photo, la premiere avec une prise de vue d'abord, puis la fusion : la chaine de tous
  // (facade/releve/chaine.ts), celle du releve et de la calibration.
  const ordre = photos.map((_, i) => i).sort((a, b) => Number(!photos[a]?.prise) - Number(!photos[b]?.prise) || a - b);
  const entrees: PhotoARedresser[] = [];
  const illisibles: BilanPhotoRedressement[] = [];
  for (const i of ordre) {
    const photo = photos[i] as PhotoCas;
    const img = await images(i);
    if (!img) { illisibles.push({ rang: i, statut: 'echec', verticaliteDeg: null, coins: 'predit', motif: 'image illisible' }); continue; }
    const image = versImage(img);
    entrees.push({ rang: i, image, prise: (champLu) => priseDeLaPhoto(photo, image, fm, champLu), champConnu: photo.prise?.sourceFocale === 'exif' });
  }
  // Le gabarit du mur : sa silhouette sous les corps du toit lus sur le LiDAR (un rectangle sans corps), posee sur les photos.
  const gabarit = gabaritDesCorps(f, bat.corpsToit, f.hauteur);
  // L'enchainement de la facade, par l'orchestrateur (mode `audit`) : le releve et l'etat de chaque etape en sortent.
  const r = await derouler({
    largeurM: fm.largeur, hauteurM: fm.hauteur, gabarit,
    photos: entrees.map((x) => ({ image: x.image, coins: [], reperes: corrections[String(x.rang)]?.reperes ?? null, focalePx: null, murALaMain: !!corrections[String(x.rang)]?.coins })),
    // Les corps du toit qui font le gabarit : le diagnostic de forme (E5 bis) se fait corps par corps.
    toit: bat.corpsToit?.length ? { mur: { gauche: f.gauche, droite: f.droite }, corps: bat.corpsToit } : null,
  }, {
    coins: 'chercher', image: 'audit', chercherCoins: d.chercherCoins, audit: { facade: fm, contour: bat.pts, photos: entrees, illisibles, corrections, jpeg: d.jpeg },
    ...(d.surEtape ? { surEtape: d.surEtape } : {}), ...(d.arrete ? { arrete: d.arrete } : {}), ...(d.rendreLaMain ? { rendreLaMain: d.rendreLaMain } : {}),
  });
  const sortie = r.sorties.audit;
  const etapes = r.etapes.map(({ id, etat, resume }) => ({ id, etat, resume }));
  const diagnostic = r.sorties.forme?.diagnostic ?? null;
  const trace = { ...(sortie ? { redressement: sortie.redressement, redressees: sortie.redressees, imageRun: sortie.imageRun, ...(sortie.assemblage ? { assemblage: sortie.assemblage } : {}) } : {}), versionChaine: VERSION_CHAINE_FACADES, gabarit, etapes, ...(diagnostic ? { diagnostic } : {}), ...(r.sorties.facade ? { facade: r.sorties.facade } : {}) };
  return { ...vide, ...(sortie?.mesure ?? {}), couleur, ...trace };
}
