// Les profils de toits d'un batiment (MD/spec-regles-toits.md §6, §9.1) : ce qu'on sait de lui, les
// profils qui s'y appliquent (model/profilsToits.ts), et le calcul de son toit sous leurs seuils.
//
// Ordre de la spec §9.1 : le calcul produit ses candidats, les regles arbitrent avec les seuils de
// regles/toits/reglages.json surcharges par le profil du batiment, puis vient son fait, puis les
// garde-fous. Le profil se choisit donc avant la lecture du toit, sur ce que le batiment est avant
// toute mesure LiDAR : son lieu (le departement et la latitude du projet), ses attributs BD TOPO
// (materiaux des fichiers fonciers, hauteur, epoque), son contour (surface, forme) et ses voisins
// (mitoyennete). Les seuils de la description elle-meme (la mise a l'equerre du contour) sont ceux du
// fichier, jamais ceux d'un profil : le choix ne depend pas de son resultat.
//
// Sans profil dans le fichier livre, rien n'est decrit ni surcharge : le calcul est celui d'avant le
// moteur des profils, au bit pres.

import { signedArea } from '../geometry/basic.js';
import { longueurFrontiere } from '../geometry/proximite.js';
import { rectanglesDuContour } from '../model/volumesToit.js';
import { couvertureDesFichiersFonciers } from '../model/couleurToit.js';
import { avecSeuilsToit, PROFILS_TOITS, type SurchargesSeuilsToits } from '../model/reglagesToits.js';
import { choisirProfils, niveauMitoyennete, MATERIAUX_MURS_PROFIL, TOLERANCE_MITOYENNETE_M, type ChoixProfils, type DescriptionBatiment, type FormeContour, type MateriauMursProfil, type ProfilToit } from '../model/profilsToits.js';
import { hauteurBdTopo } from './vraisemblance.js';
import type { PtBrut } from '../model/types.js';

/** Ce que le choix lit d'un objet du plan : un batiment, ou la parcelle du projet (son lieu). */
export interface ObjetProfils {
  key?: string;
  fonction?: string;
  pts?: readonly PtBrut[] | undefined;
  bdtopo?: unknown;
  cadastre?: unknown;
  latitude?: number | null | undefined;
}

/** Un contour voisin, pour la mitoyennete. */
export interface ContourVoisin { cle?: string | undefined; pts: readonly PtBrut[] }

/** Ce qui est commun a tous les batiments d'un projet : son lieu, et les contours de ses batiments. */
export interface ContexteProfils {
  departement: string | null;
  latitude: number | null;
  voisins: readonly ContourVoisin[];
}

/** Un contexte sans rien : aucune condition de lieu ni de mitoyennete n'est remplie. */
export const CONTEXTE_PROFILS_VIDE: ContexteProfils = { departement: null, latitude: null, voisins: [] };

const DEPARTEMENT = /^(0[1-9]|[1-8]\d|9[0-5]|2A|2B|97[1-6])$/;

/**
 * Le departement d'un code INSEE de commune (`"78650"`) ou d'un IDU de parcelle (`"78650000AE0101"`, dont
 * les cinq premiers caracteres sont le code INSEE) : deux caracteres, trois outre-mer (`"97105"` : 971).
 */
export function departementDuCode(code: unknown): string | null {
  if (typeof code !== 'string' || code.trim().length < 5) return null;
  const c = code.trim().toUpperCase();
  const d = c.startsWith('97') ? c.slice(0, 3) : c.slice(0, 2);
  return DEPARTEMENT.test(d) ? d : null;
}

const contour = (o: ObjetProfils): readonly PtBrut[] | null => (Array.isArray(o.pts) && o.pts.length >= 3 ? o.pts : null);

/**
 * Le lieu du projet (la parcelle `parcelle` : son cadastre, sa latitude) et les contours de ses batiments.
 * Sans profil, le contexte vide : la tache de fond le demande a chaque batiment, rien ne sert de le batir.
 */
export function contexteProfils(objets: readonly ObjetProfils[], profils: readonly ProfilToit[] = PROFILS_TOITS): ContexteProfils {
  if (!profils.length) return CONTEXTE_PROFILS_VIDE;
  const parcelle = objets.find((o) => o.key === 'parcelle');
  const cad = (parcelle?.cadastre ?? null) as { codeInsee?: unknown; idu?: unknown; origineLat?: unknown } | null;
  const lat = typeof parcelle?.latitude === 'number' ? parcelle.latitude : typeof cad?.origineLat === 'number' ? cad.origineLat : null;
  const voisins = objets.flatMap((o) => { const pts = o.fonction === 'batiment' ? contour(o) : null; return pts ? [{ cle: o.key, pts }] : []; });
  return { departement: departementDuCode(cad?.codeInsee) ?? departementDuCode(cad?.idu), latitude: lat, voisins };
}

/** Le nombre de sommets qui font tourner le contour : sans les doublons ni les sommets alignes (a 5 degres pres). */
function sommetsUtiles(pts: readonly PtBrut[]): number {
  const n = pts.length;
  let utiles = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n] as PtBrut, b = pts[i] as PtBrut, c = pts[(i + 1) % n] as PtBrut;
    const u = Math.atan2(b.y - a.y, b.x - a.x), v = Math.atan2(c.y - b.y, c.x - b.x);
    const tour = Math.abs(Math.atan2(Math.sin(v - u), Math.cos(v - u)));
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-6 && Math.hypot(c.x - b.x, c.y - b.y) > 1e-6 && tour > (5 * Math.PI) / 180) utiles++;
  }
  return utiles;
}

/** La forme du contour, dans le vocabulaire des profils. */
export function formeDuContour(pts: readonly PtBrut[]): FormeContour | null {
  if (pts.length < 3) return null;
  const rects = rectanglesDuContour(pts);
  if (rects) return rects.length === 1 ? 'rectangle' : 'composee';
  return sommetsUtiles(pts) === 4 ? 'trapeze' : 'biais';
}

const perimetre = (pts: readonly PtBrut[]): number => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length] as PtBrut; return s + Math.hypot(q.x - p.x, q.y - p.y); }, 0);

/** La boite d'un contour, elargie : deux batiments dont les boites ne se touchent pas ne sont pas mitoyens. */
function boite(pts: readonly PtBrut[], marge: number): [number, number, number, number] {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return [Math.min(...xs) - marge, Math.min(...ys) - marge, Math.max(...xs) + marge, Math.max(...ys) + marge];
}

/** La part du perimetre du batiment collee a un autre batiment du projet, entre 0 et 1. */
export function partMitoyenne(o: ObjetProfils, pts: readonly PtBrut[], voisins: readonly ContourVoisin[]): number {
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

const materiauMurs = (code: unknown): MateriauMursProfil | null => {
  if (typeof code !== 'string') return null;
  for (const c of code.trim()) if (c in MATERIAUX_MURS_PROFIL) return MATERIAUX_MURS_PROFIL[c as keyof typeof MATERIAUX_MURS_PROFIL];
  return null;
};

/** L'annee d'une date de la BD TOPO (`"1950-01-01"`, `"1950"`), ou null. */
const annee = (date: unknown): number | null => {
  const m = typeof date === 'string' ? /^(\d{4})/.exec(date.trim()) : null;
  return m ? Number(m[1]) : null;
};

/** Ce qu'on sait du batiment, dans le vocabulaire des profils. */
export function descriptionDuBatiment(o: ObjetProfils, ctx: ContexteProfils): DescriptionBatiment {
  const pts = contour(o);
  const b = (o.bdtopo ?? null) as { materiauxMurs?: unknown; materiauxToiture?: unknown; dateApparition?: unknown } | null;
  return {
    departement: ctx.departement,
    latitude: ctx.latitude,
    materiauMurs: materiauMurs(b?.materiauxMurs),
    materiauToiture: couvertureDesFichiersFonciers(b?.materiauxToiture),
    hauteur: hauteurBdTopo(o),
    surface: pts ? Math.abs(signedArea(pts)) : null,
    mitoyennete: pts ? niveauMitoyennete(partMitoyenne(o, pts, ctx.voisins)) : null,
    formeContour: pts ? formeDuContour(pts) : null,
    epoque: annee(b?.dateApparition),
  };
}

/** Les profils de ce batiment et ce qu'ils surchargent ; sans profil, rien, sans rien decrire. */
export function profilsDuBatiment(o: ObjetProfils, ctx: ContexteProfils, profils: readonly ProfilToit[] = PROFILS_TOITS): ChoixProfils {
  if (!profils.length) return { surcharges: {}, source: {}, applicables: [] };
  return choisirProfils(profils, descriptionDuBatiment(o, ctx));
}

/** Les seuils que les profils changent pour ce batiment (les autres restent ceux du fichier). */
export function surchargesDuBatiment(o: ObjetProfils, ctx: ContexteProfils, profils: readonly ProfilToit[] = PROFILS_TOITS): SurchargesSeuilsToits {
  return profilsDuBatiment(o, ctx, profils).surcharges as SurchargesSeuilsToits;
}

/** Le calcul du toit de ce batiment, sous les seuils de ses profils. `calcul` doit etre synchrone. */
export function avecProfilsDuBatiment<T>(o: ObjetProfils, ctx: ContexteProfils, calcul: () => T, profils: readonly ProfilToit[] = PROFILS_TOITS): T {
  return avecSeuilsToit(surchargesDuBatiment(o, ctx, profils), calcul);
}
