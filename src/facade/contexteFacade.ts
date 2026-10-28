// Le contexte des facades d'un batiment (MD/spec-facades-calage-detection.md §15.1, lot G11) : ce qui
// permet de dire d'un mur releve s'il donne sur la rue, s'il est l'arriere ou un pignon, et s'il est
// cote voisin. Puis la mesure des facades relevees d'un audit de parcelle (fichier
// `plan-audit-parcelle`, lot L21), rejouee sans reseau par les scripts du skill facades et toits.
//
// Rien ici ne change ce que Plan calcule : les mesures servent aux profils de facades (G12) et au taux
// de conformite (G13), qui viendront avec le corpus.

import { au } from '../util/tableaux.js';
import { sommetDe } from '../geometry/anneau.js';
import { distancePointSegment } from '../geometry/segments.js';
import { facadesDuContour, pointDeFacade } from '../geometry/cotesVusDeDehors.js';
import { facettesToit } from './toits/toit.js';
import { mesurerFacade, type ContexteFacade, type MesureFacade } from '../model/mesureFacade.js';
import type { FichierAuditParcelle } from '../model/fichierAuditParcelle.js';
import type { PtBrut, Toit } from '../model/types.js';

/** Un autre batiment a moins de cela du milieu du mur : il est contre lui (mitoyen) ou presque. */
const VOISIN_M = 1;
/** Deux murs dont les normales font plus de 135 degres se tournent le dos : l'un est l'arriere de l'autre. */
const OPPOSE_COS = -Math.SQRT1_2;

export interface EntreesContexte {
  /** Le contour du batiment. */
  pts: readonly PtBrut[];
  /** Le toit simple du batiment, s'il est connu : il dit quels murs portent un pignon. */
  toit?: Toit | null;
  /** Les contours des batiments proches ; absents : on ne sait rien des voisins. */
  voisins?: readonly { pts: readonly PtBrut[] }[] | null;
  /** Les cotes que l'on sait sur la rue (photo de rue, par exemple). */
  cotesRue?: readonly number[];
}

/**
 * Un pignon : le toit monte au-dessus du mur, et pas a hauteur constante (le mur haut d'un appentis
 * n'est pas un pignon, ses deux murs lateraux le sont).
 */
function cotesPignons(pts: readonly PtBrut[], toit: Toit): Set<number> {
  const out = new Set<number>();
  for (const p of facettesToit(pts, toit).pignons) {
    const zs = p.profil.map((q) => q.z);
    if (Math.max(...zs) - Math.min(...zs) > 0.05) out.add(p.cote);
  }
  return out;
}

function distanceAuContour(m: PtBrut, pts: readonly PtBrut[]): number {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) d = Math.min(d, distancePointSegment(m, au(pts, i), sommetDe(pts, i + 1)));
  return d;
}

/** Le contexte de chaque mur du contour, par son cote. */
export function contextesFacades(e: EntreesContexte): Map<number, ContexteFacade> {
  const facades = facadesDuContour(e.pts, 0);
  const pignons = e.toit ? cotesPignons(e.pts, e.toit) : null;
  const rue = new Set(e.cotesRue ?? []);
  const normalesRue = facades.filter((f) => rue.has(f.cote)).map((f) => f.normale);
  const out = new Map<number, ContexteFacade>();
  for (const f of facades) {
    const m = pointDeFacade(f, f.largeur / 2);
    const oppose = normalesRue.some((n) => n.x * f.normale.x + n.y * f.normale.y < OPPOSE_COS);
    out.set(f.cote, {
      surRue: rue.has(f.cote) ? true : oppose ? false : null,
      pignon: pignons ? pignons.has(f.cote) : null,
      coteVoisin: e.voisins ? e.voisins.some((v) => v.pts.length >= 2 && distanceAuContour(m, v.pts) < VOISIN_M) : null,
    });
  }
  return out;
}

/** Une facade mesuree d'un audit de parcelle. */
export interface FacadeAuditeeMesuree {
  cle: string;
  nom: string;
  cote: number;
  orientation: string | null;
  contexte: ContexteFacade;
  mesure: MesureFacade;
}

/**
 * Les facades relevees d'un audit de parcelle, mesurees. Le contexte vient du cas fige du batiment
 * (contour, toit, voisins a moins de 5 m) ; un releve fait sur une photo de rue (`sourceDistance`
 * `rue`) dit que son mur donne sur la rue, et le mur qui lui tourne le dos est l'arriere.
 */
export function mesurerFacadesAuditees(f: FichierAuditParcelle): FacadeAuditeeMesuree[] {
  return f.batiments.flatMap((b) => {
    const releves = b.facades.flatMap((fa) => (fa.mesure?.releve ? [{ fa, releve: fa.mesure.releve }] : []));
    if (!releves.length) return [];
    const pts = b.cas?.entrees.pts ?? [];
    const contextes = pts.length >= 3
      ? contextesFacades({
        pts, toit: b.cas?.sorties.toit ?? null, voisins: b.cas ? b.cas.entrees.voisins : null,
        cotesRue: releves.filter((r) => r.releve.sourceDistance === 'rue').map((r) => r.fa.cote),
      })
      : new Map<number, ContexteFacade>();
    return releves.map(({ fa, releve }) => {
      const contexte: ContexteFacade = contextes.get(fa.cote) ?? (releve.sourceDistance === 'rue' ? { surRue: true } : {});
      return { cle: b.cle, nom: b.nom, cote: fa.cote, orientation: fa.orientation, contexte, mesure: mesurerFacade(releve, contexte) };
    });
  });
}
