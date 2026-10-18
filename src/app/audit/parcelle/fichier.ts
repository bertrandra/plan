// Le fichier de l'audit de la parcelle, dans la page (MD/spec-audit.md §15) : l'ecrire depuis la
// session (la capture, la liste de controle, les mesures et les propositions), et preparer un
// fichier lu pour l'import (« Fichier › Importer un audit de parcelle »).
//
// L'ecriture fige chaque batiment comme la promenade fige un cas (§9, app/audit/cas.ts) : contour,
// BD TOPO, batiments proches, grille LiDAR relue a cet instant et sorties du jour. La grille vient du
// reseau : sans lui, le cas part sans grille plutot que de bloquer le fichier.
//
// L'import ne pose rien dans le projet : il rend un fichier dont les batiments portent les cles de ce
// projet, ou la raison de son refus (une autre parcelle, un fichier illisible).

import { lireGrilleSous } from '../../../geo/mnh.js';
import { projecteurLocal } from '../../../geo/projection.js';
import { aDesSommets } from '../../../model/formes.js';
import { estBatiment, parcelleDuProjet } from '../../../model/fonctions.js';
import {
  correspondanceBatiments, fichierAuditParcelle, FichierAuditParcelleIllisible, lireFichierAuditParcelle, refusParcelle, renommerBatiments,
  type BatimentPourFichier, type FichierAuditParcelle,
} from '../../../model/fichierAuditParcelle.js';
import { APP_VERSION, BUILD_SHA } from '../../../model/version.js';
import { EMPREINTE_REGLAGES_TOITS } from '../../../regles/toits/reglages.js';
import { VERSION_LECTURE_TOITS } from '../../toitsLidar.js';
import { VERSION_LECTURE_MURS } from '../../mursFond.js';
import { entreesDe, identiteDe, sortiesDe } from '../cas.js';
import type { CaptureParcelle } from '../../../model/auditParcelle.js';
import type { GrilleRelief } from '../../../model/relief.js';
import type { Proposition } from '../../../regles/decisions.js';
import type { ObjetPlan, PtBrut } from '../../../model/types.js';
import type { ProjecteurLocal } from '../../../geo/projection.js';
import type { ListeDeControle } from './liste.js';
import type { MesureFacade } from './mesures.js';

/** La grille d'un batiment ne fait pas attendre le fichier plus que cela : sans reseau, il part sans. */
const DELAI_GRILLE_MS = 15000;

export interface EntreesEcriture {
  objets: readonly ObjetPlan[];
  capture: CaptureParcelle;
  liste: ListeDeControle;
  mesures: ReadonlyMap<string, MesureFacade>;
  propositions: readonly Proposition[];
  maintenant: Date;
  /** La grille LiDAR sous un contour ; par defaut, le service de l'IGN (geo/mnh.ts). */
  lireGrille?: (pts: readonly PtBrut[], proj: ProjecteurLocal) => Promise<GrilleRelief | null>;
}

const cadastreDe = (objets: readonly ObjetPlan[]) =>
  (parcelleDuProjet(objets as ObjetPlan[])?.cadastre ?? null) as { idu?: unknown; adresse?: unknown; origineLat?: unknown; origineLon?: unknown } | null;

/** La grille sous ce batiment, ou null : hors delai, sans reseau, sans calage. */
async function grilleDe(o: ObjetPlan, proj: ProjecteurLocal | null, lire: NonNullable<EntreesEcriture['lireGrille']>): Promise<GrilleRelief | null> {
  if (!proj || !aDesSommets(o)) return null;
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<null>((ok) => { minuteur = setTimeout(() => ok(null), DELAI_GRILLE_MS); });
  try { return await Promise.race([lire(o.pts, proj).catch(() => null), delai]); } finally { clearTimeout(minuteur); }
}

/** Le fichier de l'audit, tel qu'il se partage et s'envoie au corpus. */
export async function ecrireFichierAudit(e: EntreesEcriture): Promise<FichierAuditParcelle> {
  const cad = cadastreDe(e.objets);
  const lat = typeof cad?.origineLat === 'number' ? cad.origineLat : null, lon = typeof cad?.origineLon === 'number' ? cad.origineLon : null;
  const proj = lat !== null && lon !== null ? projecteurLocal(lat, lon) : null;
  const lire = e.lireGrille ?? lireGrilleSous;
  const batiments: BatimentPourFichier[] = await Promise.all(e.liste.batiments.map(async (b) => {
    const o = e.objets.find((x) => x.key === b.cle);
    const cas = o && estBatiment(o)
      ? { identite: { ...identiteDe(o, e.objets), adresse: typeof cad?.adresse === 'string' ? cad.adresse : null }, entrees: entreesDe(o, e.objets, await grilleDe(o, proj, lire)), sorties: sortiesDe(o) }
      : null;
    return {
      cle: b.cle, nom: b.nom, mitoyen: b.mitoyen, cas,
      facades: b.facades.map((f) => ({ cote: f.cote, orientation: f.facade.orientation, largeurM: Math.round(f.facade.largeur * 100) / 100, hauteurM: Math.round(f.hauteurMur * 100) / 100 })),
    };
  }));
  return fichierAuditParcelle({
    parcelle: {
      idu: e.capture.idu ?? (typeof cad?.idu === 'string' ? cad.idu : ''),
      adresse: typeof cad?.adresse === 'string' ? cad.adresse : null,
      origine: lat !== null && lon !== null ? { lat, lon } : null,
    },
    code: { version: APP_VERSION, commit: BUILD_SHA },
    regles: { lectureToits: VERSION_LECTURE_TOITS, lectureMurs: VERSION_LECTURE_MURS, reglagesToits: EMPREINTE_REGLAGES_TOITS },
    capture: e.capture, batiments, mesures: e.mesures, propositions: e.propositions, ecritLe: e.maintenant,
  });
}

export type ImportPrepare = { fichier: FichierAuditParcelle; batimentsRetrouves: number; batimentsAbsents: number } | { refus: string };

/**
 * Un fichier lu, pret a reprendre a la phase 3 dans ce projet : meme parcelle (meme IDU), batiments
 * sous les cles de ce projet. Rend la raison du refus sinon, a montrer telle quelle.
 */
export function preparerImport(texte: string, objets: readonly ObjetPlan[], iduProjet: string | null): ImportPrepare {
  let f: FichierAuditParcelle;
  try {
    f = lireFichierAuditParcelle(JSON.parse(texte));
  } catch (err) {
    return { refus: err instanceof FichierAuditParcelleIllisible ? err.message : 'Ce fichier n’est pas un JSON lisible.' };
  }
  const refus = refusParcelle(f, iduProjet);
  if (refus) return { refus };
  const projet = objets.filter((o) => estBatiment(o)).map((o) => ({ cle: o.key, cleBdtopo: identiteDe(o, objets).cleBdtopo }));
  const renommage = correspondanceBatiments(f, projet);
  return { fichier: renommerBatiments(f, renommage), batimentsRetrouves: renommage.size, batimentsAbsents: f.batiments.length - renommage.size };
}
