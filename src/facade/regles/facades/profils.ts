// Le profil de facades d'un batiment (MD/spec-facades-calage-detection.md §15.2, D19) : ce qu'on sait
// de lui sans le voir, et le profil de regles/facades/reglages.json qui s'y applique
// (regles/facades/reglages.ts). La disposition automatique des ouvertures (facade/ouvertures.ts) lit
// ensuite les valeurs du profil retenu.
//
// Ce qui se sait : le departement du projet (tire de l'IDU de sa parcelle, a defaut de son code INSEE),
// l'epoque (`date_d_apparition` de la BD TOPO, a defaut rien), l'usage (`usage_1`), le nombre d'etages
// et la mitoyennete (la part du contour collee a un autre batiment). Une valeur inconnue ne remplit
// aucune condition : le batiment garde le profil par defaut plutot qu'un profil devine.
//
// Sans autre profil que le defaut dans le fichier livre, rien n'est decrit : le choix rend le defaut
// sans parcourir les voisins, et la disposition est celle d'avant au bit pres.

import { longueurFrontiere } from '../../../geometry/proximite.js';
import {
  choisirProfilFacades, niveauMitoyennete, DEPARTEMENT, valeursDuProfil, PROFILS_FACADES, PROFIL_FACADES_DEFAUT, TOLERANCE_MITOYENNETE_M,
  type DescriptionFacades, type ProfilFacades, type ValeursFacades,
} from '../../../regles/facades/reglages.js';
import type { PtBrut } from '../../../model/types.js';

/** Ce que le choix lit d'un objet du plan : un batiment, ou la parcelle du projet (son lieu). */
export interface ObjetProfilFacades {
  key?: string;
  fonction?: string;
  pts?: readonly PtBrut[] | undefined;
  bdtopo?: unknown;
  cadastre?: unknown;
}

/** Un contour voisin, pour la mitoyennete. */
export interface ContourVoisinFacades { cle?: string | undefined; pts: readonly PtBrut[] }

/** Ce qui est commun aux batiments d'un projet : son departement, et les contours de ses batiments. */
export interface ContexteProfilsFacades {
  departement: string | null;
  voisins: readonly ContourVoisinFacades[];
}

/** Un contexte sans rien : aucune condition de lieu ni de mitoyennete n'est remplie. */
export const CONTEXTE_PROFILS_FACADES_VIDE: ContexteProfilsFacades = { departement: null, voisins: [] };

/**
 * Le departement d'un IDU de parcelle (`"78650000AE0101"`) ou d'un code INSEE de commune (`"78650"`) :
 * les cinq premiers caracteres de l'IDU sont le code INSEE ; deux caracteres, trois outre-mer.
 */
export function departementDuCode(code: unknown): string | null {
  if (typeof code !== 'string' || code.trim().length < 5) return null;
  const c = code.trim().toUpperCase();
  const d = c.startsWith('97') ? c.slice(0, 3) : c.slice(0, 2);
  return DEPARTEMENT.test(d) ? d : null;
}

const contour = (o: ObjetProfilFacades): readonly PtBrut[] | null => (Array.isArray(o.pts) && o.pts.length >= 3 ? o.pts : null);

/** Le lieu du projet et les contours de ses batiments ; sans profil, le contexte vide (rien a decrire). */
export function contexteProfilsFacades(objets: readonly ObjetProfilFacades[], profils: readonly ProfilFacades[] = PROFILS_FACADES): ContexteProfilsFacades {
  if (!profils.length) return CONTEXTE_PROFILS_FACADES_VIDE;
  const cad = (objets.find((o) => o.key === 'parcelle')?.cadastre ?? null) as { idu?: unknown; codeInsee?: unknown } | null;
  const voisins = objets.flatMap((o) => { const pts = o.fonction === 'batiment' ? contour(o) : null; return pts ? [{ cle: o.key, pts }] : []; });
  return { departement: departementDuCode(cad?.idu) ?? departementDuCode(cad?.codeInsee), voisins };
}

const perimetre = (pts: readonly PtBrut[]): number => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length] as PtBrut; return s + Math.hypot(q.x - p.x, q.y - p.y); }, 0);

/** La boite d'un contour, elargie : deux batiments dont les boites ne se touchent pas ne sont pas mitoyens. */
function boite(pts: readonly PtBrut[], marge: number): [number, number, number, number] {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return [Math.min(...xs) - marge, Math.min(...ys) - marge, Math.max(...xs) + marge, Math.max(...ys) + marge];
}

/** La part du perimetre du batiment collee a un autre batiment du projet, entre 0 et 1. */
export function partMitoyenneFacades(o: ObjetProfilFacades, pts: readonly PtBrut[], voisins: readonly ContourVoisinFacades[]): number {
  const p = perimetre(pts);
  if (p <= 0) return 0;
  const [x0, y0, x1, y1] = boite(pts, TOLERANCE_MITOYENNETE_M);
  let colle = 0;
  for (const v of voisins) {
    if (v.pts === pts || (o.key !== undefined && v.cle === o.key)) continue;
    const [a0, b0, a1, b1] = boite(v.pts, 0);
    if (a0 > x1 || a1 < x0 || b0 > y1 || b1 < y0) continue;
    colle += longueurFrontiere(pts, v.pts, TOLERANCE_MITOYENNETE_M);
  }
  return Math.min(1, colle / p);
}

/** L'annee d'une date de la BD TOPO (`"1950-01-01"`, `"1950"`), ou null. */
function annee(date: unknown): number | null {
  const m = typeof date === 'string' ? /^(\d{4})/.exec(date.trim()) : null;
  return m ? Number(m[1]) : null;
}

/** Ce qu'on sait du batiment, dans le vocabulaire des profils de facades. */
export function descriptionFacadesDuBatiment(o: ObjetProfilFacades, ctx: ContexteProfilsFacades): DescriptionFacades {
  const pts = contour(o);
  const b = (o.bdtopo ?? null) as { usage1?: unknown; nombreEtages?: unknown; dateApparition?: unknown } | null;
  const etages = b?.nombreEtages;
  return {
    departement: ctx.departement,
    epoque: annee(b?.dateApparition),
    usage: typeof b?.usage1 === 'string' && b.usage1 ? b.usage1 : null,
    etages: typeof etages === 'number' && Number.isFinite(etages) && etages > 0 ? etages : null,
    mitoyennete: pts ? niveauMitoyennete(partMitoyenneFacades(o, pts, ctx.voisins)) : null,
  };
}

/** Le profil retenu pour un batiment : son identifiant et ses valeurs. */
export interface ChoixProfilFacades { id: string; valeurs: ValeursFacades }

/** Le profil de facades de ce batiment ; sans profil dans le fichier, le defaut, sans rien decrire. */
export function profilFacadesDuBatiment(o: ObjetProfilFacades, ctx: ContexteProfilsFacades, profils: readonly ProfilFacades[] = PROFILS_FACADES): ChoixProfilFacades {
  const p = profils.length ? choisirProfilFacades(profils, descriptionFacadesDuBatiment(o, ctx)) : null;
  return { id: p?.id ?? PROFIL_FACADES_DEFAUT, valeurs: valeursDuProfil(p) };
}
