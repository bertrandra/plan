// Un cas de calibration (admin › Calibrer la detection) tire d'une facade d'un audit de parcelle : ses photos, et les dimensions du
// mur que donne le plan, sans rien mesurer sur place. La largeur est celle du cote du contour (cadastre, BD TOPO), la hauteur celle
// du mur sous le toit que lit le LiDAR (les corps du cas fige, `hauteurMurSousToit`) ; un ancien fichier, qui ne gardait que la
// hauteur du prisme, est relu sur son cas fige.

import { facadesDuContour } from '../../../facade/geometrie.js';
import { FORMAT_CAS_REEL, type CasStocke, type PhotoReelle } from '../../../facade/corpusReel.js';
import type { BilanPhotoRedressement, CorrectionRedressement } from '../../../model/auditParcelle.js';
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
  /** Ce que la personne a corrige a la main sur chaque photo (reperes, mur, silhouette), par rang. */
  corrections: Readonly<Record<string, CorrectionRedressement>>;
  /** Ce que la chaine a retenu de chaque photo le jour de la mesure (coins du mur, silhouette du haut du mur). */
  bilans: readonly BilanPhotoRedressement[];
}

const arrondi = (v: number) => Math.round(v * 100) / 100;

/** La hauteur du mur sous le toit, relue sur le cas fige du batiment (contour et corps du LiDAR) ; null sans corps. */
function hauteurLidar(pts: readonly PtBrut[] | undefined, corps: readonly CorpsToit[] | null | undefined, elevation: number, cote: number): number | null {
  if (!pts?.length || !corps?.length) return null;
  const f = facadesDuContour(pts, elevation).find((x) => x.cote === cote);
  if (!f) return null;
  return hauteurMurSousToit({ pts, corpsToit: corps } as unknown as ObjetPlan, f);
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
      out.push({ cle: b.cle, nom: b.nom, cote: f.cote, orientation: f.orientation ?? '', largeurM: arrondi(f.largeurM), hauteurM: arrondi(hauteur), sourceHauteur: lidar !== null ? 'lidar' : 'fichier', photos: f.photos, corrections: f.corrections ?? {}, bilans: f.mesure?.redressement?.photos ?? [] });
    }
  }
  return out.sort((a, b) => b.photos.length - a.photos.length);
}

/**
 * Le cas de calibration d'une facade d'audit : ses photos, ses dimensions du plan, et ce que l'audit en a retenu, photo par photo : les
 * reperes poses, le mur ajuste a la main et la silhouette du haut du mur (sinon ceux que la chaine avait lus). L'editeur cherche de
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
    const silhouette = c?.silhouette ?? b?.silhouettePx;
    return {
      fichier: 'photo-' + (k + 1), coins: copie(coins),
      ...(c?.reperes?.length === 4 ? { reperes: copie(c.reperes) } : {}),
      ...(silhouette && silhouette.length >= 2 ? { silhouette: copie(silhouette) } : {}),
      ...(c?.coins?.length === 4 ? { murALaMain: true } : {}),
    };
  };
  return {
    format: FORMAT_CAS_REEL, version: 1, statut: 'brouillon', source: 'admin',
    nom: f.nom + ' · façade ' + f.orientation.toLowerCase() + (idu ? ' (' + idu + ')' : ''),
    largeurM: f.largeurM, hauteurM: f.hauteurM,
    photos: images.map((_, k) => photo(k)),
    images, ouvertures: [],
  };
}
