// Un cas de calibration (admin › Calibrer la detection) tire d'une facade d'un audit de parcelle : ses photos, et les dimensions du
// mur que donne le plan, sans rien mesurer sur place. La largeur est celle du cote du contour (cadastre, BD TOPO), la hauteur celle
// du mur sous le toit que lit le LiDAR (les corps du cas fige, `hauteurMurSousToit`) ; un ancien fichier, qui ne gardait que la
// hauteur du prisme, est relu sur son cas fige.

import { MATERIAUX_MURS_VUS, libelleDe } from '../../../model/ceQueJeVois.js';
import { facadesDuContour, type Facade } from '../../../geometry/cotesVusDeDehors.js';
import { GABARIT_RECTANGLE, gabaritDesCorps, relief, type GabaritMur } from '../../../facade/gabaritMur.js';
import { FORMAT_CAS_REEL, type CasStocke, type PhotoReelle } from '../../../facade/corpusReel.js';
import type { BilanPhotoRedressement, CorrectionRedressement, MurConfirme, OuverturesRelues } from '../../../model/auditParcelle.js';
import { hauteurMurSousToit } from './liste.js';
import type { FichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import type { PhotoCas } from '../../../model/audit.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../model/types.js';

/** Une facade photographiee d'un audit, prete a devenir un cas de calibration. */
export interface FacadeACalibrer {
  cle: string;
  nom: string;
  cote: number;
  orientation: string;
  largeurM: number;
  hauteurM: number;
  /** D'ou vient la hauteur : le LiDAR (corps du cas fige), ou la hauteur notee dans le fichier. */
  sourceHauteur: 'lidar' | 'fichier';
  photos: PhotoCas[];
  /** Ce que la personne a corrige a la main sur chaque photo (reperes, mur), par rang. */
  corrections: Readonly<Record<string, CorrectionRedressement>>;
  /** Le mur confirme au point V1, s'il l'a ete : une entree de l'audit, que la calibration rejoue (« Confirmer le mur »). */
  murConfirme?: MurConfirme;
  /** Les ouvertures relues au point V3, si elles l'ont ete : une entree de l'audit, que la calibration rejoue. */
  ouverturesRelues?: OuverturesRelues;
  /** Ce que la chaine a retenu de chaque photo le jour de la mesure (les coins du mur). */
  bilans: readonly BilanPhotoRedressement[];
  /** Le gabarit du mur : sa silhouette sous les corps du LiDAR (le cas fige), un rectangle sans corps. */
  gabarit: GabaritMur;
  /** Les corps du LiDAR qui font ce gabarit, et le mur de la facade : le diagnostic de forme du cas (lot F4) ; null sans corps. */
  toit: CasStocke['toit'] | null;
  /** Le parement des murs vu sur place (« Ce que je vois »), en clair ; null : non dit. */
  parement: string | null;
  /**
   * Le cote du contour et le contour du batiment (le cas fige) : avec la prise de vue de chaque photo, les entrees que l'audit avait,
   * que la calibration rejoue telles quelles (facade/releve/prisesFacade.ts) ; null sans contour.
   */
  facade: Facade | null;
  contour: PtBrut[] | null;
}

const arrondi = (v: number) => Math.round(v * 100) / 100;

/** La hauteur du mur sous le toit, relue sur le cas fige du batiment (contour et corps du LiDAR) ; null sans corps. */
function hauteurLidar(pts: readonly PtBrut[] | undefined, corps: readonly CorpsToit[] | null | undefined, elevation: number, cote: number): number | null {
  if (!pts?.length || !corps?.length) return null;
  const f = facadesDuContour(pts, elevation).find((x) => x.cote === cote);
  if (!f) return null;
  return hauteurMurSousToit({ pts, batiment: { corpsToit: corps } } as unknown as ObjetPlan, f);
}

/** Le gabarit du mur, relu sur le cas fige du batiment (contour et corps du LiDAR) ; un rectangle sans corps. */
function gabaritLidar(pts: readonly PtBrut[] | undefined, corps: readonly CorpsToit[] | null | undefined, elevation: number, cote: number, hauteur: number): GabaritMur {
  const f = pts?.length ? facadesDuContour(pts, elevation).find((x) => x.cote === cote) : undefined;
  return f ? gabaritDesCorps(f, corps, hauteur) : GABARIT_RECTANGLE;
}

/** Les corps du cas fige et le mur de la facade, vu de dehors ; null sans corps. */
function toitDuCas(pts: readonly PtBrut[] | undefined, corps: readonly CorpsToit[] | null | undefined, cote: number): CasStocke['toit'] | null {
  const f = pts?.length && corps?.length ? facadesDuContour(pts, 0).find((x) => x.cote === cote) : undefined;
  return f && corps?.length ? { mur: { gauche: { x: f.gauche.x, y: f.gauche.y }, droite: { x: f.droite.x, y: f.droite.y } }, corps: corps.map((c) => JSON.parse(JSON.stringify(c)) as CorpsToit) } : null;
}

/** Le cote du contour (a la hauteur du mur sous le toit) et le contour, relus sur le cas fige ; null sans contour. */
function coteDuCas(pts: readonly PtBrut[] | undefined, elevation: number, cote: number, hauteur: number): Pick<FacadeACalibrer, 'facade' | 'contour'> {
  const f = pts?.length ? facadesDuContour(pts, elevation).find((x) => x.cote === cote) : undefined;
  return f && pts ? { facade: { ...f, hauteur }, contour: pts.map((p) => ({ x: p.x, y: p.y })) } : { facade: null, contour: null };
}

/** Les facades photographiees d'un audit, du batiment le plus photographie au moins, avec leurs dimensions du plan. */
export function facadesACalibrer(fichier: FichierAuditParcelle): FacadeACalibrer[] {
  const out: FacadeACalibrer[] = [];
  for (const b of fichier.batiments) {
    const entrees = b.cas?.entrees as { pts?: PtBrut[] } | undefined;
    const sorties = b.cas?.sorties as { corps?: CorpsToit[] | null; elevation?: number | null } | undefined;
    for (const f of b.facades) {
      if (!f.photos.length || !(f.largeurM && f.largeurM > 0)) continue;
      const lidar = hauteurLidar(entrees?.pts, sorties?.corps, sorties?.elevation ?? f.hauteurM ?? 0, f.cote);
      const hauteur = lidar ?? f.hauteurM;
      if (!(hauteur && hauteur > 0)) continue;
      out.push({ cle: b.cle, nom: b.nom, cote: f.cote, orientation: f.orientation ?? '', largeurM: arrondi(f.largeurM), hauteurM: arrondi(hauteur), sourceHauteur: lidar !== null ? 'lidar' : 'fichier', photos: f.photos, corrections: f.corrections ?? {}, ...(f.murConfirme ? { murConfirme: f.murConfirme } : {}), ...(f.ouverturesRelues ? { ouverturesRelues: f.ouverturesRelues } : {}), bilans: f.mesure?.redressement?.photos ?? [],
        gabarit: gabaritLidar(entrees?.pts, sorties?.corps, sorties?.elevation ?? f.hauteurM ?? 0, f.cote, hauteur),
        toit: toitDuCas(entrees?.pts, sorties?.corps, f.cote),
        parement: b.vu?.murs ? libelleDe(MATERIAUX_MURS_VUS, b.vu.murs).toLowerCase() : null,
        ...coteDuCas(entrees?.pts, sorties?.elevation ?? f.hauteurM ?? 0, f.cote, hauteur) });
    }
  }
  return out.sort((a, b) => b.photos.length - a.photos.length);
}

/**
 * Le cas de calibration d'une facade d'audit : ses photos, ses dimensions et son gabarit du plan (le LiDAR), et ce que l'audit en a
 * retenu, photo par photo : les reperes poses, le mur ajuste a la main (sinon les coins que la chaine avait lus). L'editeur cherche de
 * nouveau ce qui n'a pas ete pose a la main.
 */
export function casDepuisFacade(f: FacadeACalibrer, idu: string | null = null): CasStocke {
  const images = f.photos.map((p) => 'data:' + p.type + ';base64,' + p.base64);
  // Des coins provisoires (le cadre entier d'une photo de 1 000 px) quand l'audit n'en a rien garde.
  const provisoires = [{ x: 120, y: 160 }, { x: 880, y: 160 }, { x: 880, y: 1120 }, { x: 120, y: 1120 }];
  const copie = (l: readonly { x: number; y: number }[]) => l.map((p) => ({ x: p.x, y: p.y }));
  const photo = (k: number): PhotoReelle => {
    const c = f.corrections[String(k)], b = f.bilans.find((x) => x.rang === k);
    const coins = c?.coins?.length === 4 ? c.coins : b?.coinsPx?.length === 4 ? b.coinsPx : provisoires;
    const prise = f.photos[k]?.prise;
    return {
      fichier: 'photo-' + (k + 1), coins: copie(coins),
      ...(prise ? { prise: { ...prise } } : {}),
      ...(c?.reperes?.length === 4 ? { reperes: copie(c.reperes) } : {}),
      ...(c?.coins?.length === 4 ? { murALaMain: true } : {}),
    };
  };
  // La largeur corrigee a la main dans l'audit (l'echelle, la premiere donnee l'emporte, comme prisesFacade.ts) : celle que l'audit a
  // mesuree, que la calibration rejoue.
  const echelle = Object.keys(f.corrections).map(Number).sort((a, b) => a - b).map((k) => f.corrections[String(k)]?.echelleLargeurM).find((v) => typeof v === 'number' && v > 0);
  const largeurM = echelle ? arrondi(echelle) : f.largeurM;
  return {
    format: FORMAT_CAS_REEL, version: 1, statut: 'brouillon', source: 'admin',
    nom: f.nom + ' · façade ' + f.orientation.toLowerCase() + (idu ? ' (' + idu + ')' : ''),
    largeurM, hauteurM: f.hauteurM,
    ...(f.parement ? { parement: f.parement } : {}),
    ...(relief(f.gabarit) > 0 ? { gabarit: f.gabarit.map((p) => ({ u: p.u, v: p.v })) } : {}),
    ...(f.toit ? { toit: f.toit } : {}),
    ...(f.facade ? { facade: { ...f.facade, largeur: largeurM, hauteur: f.hauteurM } } : {}), ...(f.contour ? { contour: f.contour } : {}),
    photos: images.map((_, k) => photo(k)),
    ...(f.murConfirme ? { murConfirme: JSON.parse(JSON.stringify(f.murConfirme)) as MurConfirme } : {}),
    ...(f.ouverturesRelues ? { ouverturesRelues: JSON.parse(JSON.stringify(f.ouverturesRelues)) as OuverturesRelues } : {}),
    images, ouvertures: [],
  };
}
