// Rejouer un cas d'audit avec le code courant, et le comparer (MD/spec-audit.md §21 a §23,
// MD/spec-regles-toits.md §8).
//
// Un cas fige (model/audit.ts) garde ce qu'il faut pour refaire le calcul sans reseau : le contour
// recale, la BD TOPO et la grille LiDAR relue au moment de la marque. Le rejeu refait la lecture que
// la promenade a faite, en calcul entier (app/audit/chargement.ts : chaque batiment y est traite
// comme un mitoyen, celui de la parcelle de depart comme le projet), avec les memes garde-fous
// (facade/regles/toits/vraisemblance.ts), les reglages courants (regles/toits/reglages.json) et les faits
// (regles/toits/faits.json, facade/regles/toits/faits.ts). On compare
// ensuite a `sorties` (ce que le code avait produit ce jour-la) et a `attendu` (ce que vous avez
// valide) ; le script `.claude/skills/toits/scripts/audit.ts` en fait un tableau, et
// tests/unit/facade/audit.test.ts bloque la CI quand un cas valide bouge.
//
// Ce qui ne se rejoue pas sans reseau, et reste tel que note : la couleur lue sur une photo
// Panoramax (la photo n'est pas dans le cas), la reponse a la question d'un batiment a cheval (les
// parcelles n'y sont pas), et le toit BD TOPO d'un batiment qu'aucune forme n'explique.

import { corpsCalcules } from './toits/catalogue.js';
import { ajusterToit } from '../toits/toitLidar.js';
import { corpsVraisemblables, mesureVraisemblable, ajusteVraisemblable, elevationApresLecture, hauteurBdTopo } from './toits/vraisemblance.js';
import { echantillonsDeGrille } from '../../geo/mnh.js';
import { toitMesureDepuisGrille } from '../../model/toitMesure.js';
import { couleurMursRetenue, ecartTeintes, ECART_TEINTE } from '../../model/couleurMur.js';
import { faitDuBatiment, faitsEnVigueur, type FaitsToits } from '../../regles/toits/faits.js';
import { ajusteSelonFait, corpsDeRemplacement, corpsSelonFait, toitDeRemplacement } from './toits/faits.js';
import { avecProfilsDuBatiment, type ContexteProfils } from './toits/profils.js';
import type { CasAudit, SortiesCas } from '../../model/audit.js';

/** Ce que le rejeu rend : les sorties recalculees, et s'il y avait de quoi refaire la lecture du toit. */
export interface RejeuCas {
  sorties: SortiesCas;
  /** Faux sans grille LiDAR ni contour : seule la couleur des murs a ete refaite. */
  rejoue: boolean;
}

/** La couleur des murs refaite : le materiau des fichiers fonciers ; la photo Panoramax notee, telle quelle. */
function couleurRejouee(c: CasAudit): { couleur: string; source: 'photo' | 'materiau' } | null {
  const s = c.sorties as SortiesCas | null;
  const photo = s?.sourceMurs === 'photo' && s.couleurMurs ? { couleur: s.couleurMurs, id: '', date: null, auteur: null, licence: null } : null;
  return couleurMursRetenue({ bdtopo: c.entrees.bdtopo, batiment: { couleurMurs: photo ? { photo } : null } });
}

/** Le batiment est-il celui de la parcelle de depart (le projet) ? Son toit mesure se garde alors toujours. */
const estPrincipal = (bdtopo: unknown): boolean => (bdtopo as { surParcellePrincipale?: unknown } | null)?.surParcellePrincipale === true;

/**
 * Le lieu d'un cas, pour ses profils de toits (facade/regles/toits/profils.ts) : la latitude de l'origine de la
 * promenade, le departement quand on le sait. Les voisins a moins de 5 m viennent du cas lui-meme.
 */
export interface LieuDuCas { departement?: string | null; latitude?: number | null }

/**
 * Rejoue un cas avec le code, les reglages, les profils et les faits courants (`faits` : un autre jeu,
 * celui qu'une PR propose, pour les images d'apres). Pur : ni reseau, ni plan. Un fait en remplacement
 * donne le toit sans la grille, comme a l'import (app/toits/toitsLidar.ts).
 */
export function rejouerCas(c: CasAudit, faits: FaitsToits = faitsEnVigueur(), lieu: LieuDuCas = {}): RejeuCas {
  const ctx: ContexteProfils = { departement: lieu.departement ?? null, latitude: lieu.latitude ?? null, voisins: (c.entrees.voisins ?? []).map((v) => ({ cle: v.cle, pts: v.pts })) };
  return avecProfilsDuBatiment({ bdtopo: c.entrees.bdtopo, pts: c.entrees.pts }, ctx, () => rejouer(c, faits));
}

/** Le rejeu lui-meme, sous les seuils du profil du batiment. */
function rejouer(c: CasAudit, faits: FaitsToits): RejeuCas {
  const b = { bdtopo: c.entrees.bdtopo };
  const murs = couleurRejouee(c);
  const hauteur = hauteurBdTopo(b);
  const { pts, grille } = c.entrees;
  const sans: SortiesCas = { mode: 'entier', elevation: hauteur, toit: null, corps: null, toitMesure: null, couleurMurs: murs?.couleur ?? null, sourceMurs: murs?.source ?? null };
  const fait = faitDuBatiment(b, faits);
  const remplace = fait?.application === 'remplacement' && pts.length >= 3 ? toitDeRemplacement(fait, pts) : null;
  if (fait && remplace) return { sorties: { ...sans, elevation: remplace.egout, toit: remplace.toit, corps: corpsDeRemplacement(fait, pts) }, rejoue: true };
  if (!grille || pts.length < 3) return { sorties: sans, rejoue: false };
  const ech = echantillonsDeGrille(grille, pts);
  const ajuste = ajusteVraisemblable(b, ajusteSelonFait(fait, pts, ech, ajusterToit(pts, ech)));
  const mesure = mesureVraisemblable(b, toitMesureDepuisGrille(grille, pts));
  const corps = mesure ? corpsVraisemblables(b, corpsSelonFait(fait, corpsCalcules(mesure, pts, { coupes: true, grille, hauteurBdTopo: hauteur }), mesure, pts, grille)) : null;
  const principal = estPrincipal(c.entrees.bdtopo);
  // Comme app/toits/toitsLidar.ts : le projet garde sa surface et en tire son egout ; un mitoyen ne garde la
  // surface qu'avec des corps, et son egout vient de la forme ajustee.
  const toitMesure = principal || corps ? mesure : null;
  const egout = principal && mesure ? mesure.egout : ajuste ? ajuste.egout : null;
  const elevation = elevationApresLecture(hauteur ?? undefined, egout) ?? null;
  return { sorties: { ...sans, elevation, toit: ajuste?.toit ?? null, corps, toitMesure }, rejoue: true };
}

/** Un nombre au centimetre : la precision de la comparaison, comme pour AE 101. */
const auCentimetre = (v: unknown): unknown => {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (Array.isArray(v)) return v.map(auCentimetre);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, auCentimetre(x)]));
  return v;
};

/** Les corps sont-ils les memes, au centimetre ? Deux absences de corps le sont. */
export function memesCorps(a: SortiesCas['corps'], b: SortiesCas['corps']): boolean {
  return JSON.stringify(auCentimetre(a ?? null)) === JSON.stringify(auCentimetre(b ?? null));
}

/** Ce qui differe entre deux sorties, en mots courts (`corps`, `couleurMurs`, `sourceMurs`, `elevation`, `forme`). */
export interface EcartSorties { champ: 'corps' | 'couleurMurs' | 'sourceMurs' | 'elevation' | 'forme'; avant: string; apres: string }

const texte = (v: unknown): string => (v === null || v === undefined ? '—' : String(v));
const resumeCorps = (c: SortiesCas['corps']): string => (c ? c.length + ' corps' : 'aucun');
/** Deux hauteurs au centimetre ; deux absences sont la meme. */
const memeHauteur = (a: number | null, b: number | null): boolean => (a === null || b === null ? a === b : Math.abs(a - b) < 0.005);

/**
 * Compare les sorties rejouees a une reference (`sorties` ou `attendu`). `champs` limite la comparaison :
 * le test des cas valides ne regarde que les corps et les murs (spec §23), le tableau regarde tout.
 */
export function ecartsSorties(rejeu: SortiesCas, ref: SortiesCas, champs: readonly EcartSorties['champ'][] = ['corps', 'couleurMurs', 'sourceMurs', 'elevation', 'forme']): EcartSorties[] {
  const out: EcartSorties[] = [];
  const voir = (c: EcartSorties['champ']) => champs.includes(c);
  if (voir('corps') && !memesCorps(rejeu.corps, ref.corps)) out.push({ champ: 'corps', avant: resumeCorps(ref.corps), apres: resumeCorps(rejeu.corps) });
  if (voir('couleurMurs') && (rejeu.couleurMurs ?? '').toLowerCase() !== (ref.couleurMurs ?? '').toLowerCase()) out.push({ champ: 'couleurMurs', avant: texte(ref.couleurMurs), apres: texte(rejeu.couleurMurs) });
  if (voir('sourceMurs') && (rejeu.sourceMurs ?? null) !== (ref.sourceMurs ?? null)) out.push({ champ: 'sourceMurs', avant: texte(ref.sourceMurs), apres: texte(rejeu.sourceMurs) });
  if (voir('elevation') && !memeHauteur(rejeu.elevation, ref.elevation)) out.push({ champ: 'elevation', avant: texte(ref.elevation), apres: texte(rejeu.elevation) });
  // La forme simple : seulement quand le rejeu en lit une (sinon le toit BD TOPO noté reste, et rien ne se compare).
  if (voir('forme') && rejeu.toit && ref.toit && rejeu.toit.forme !== ref.toit.forme) out.push({ champ: 'forme', avant: ref.toit.forme, apres: rejeu.toit.forme });
  return out;
}

/** Une couleur de facade lue sur une photo du cas, trop loin de celle que Plan retient. */
export interface EcartFacade { cote: number; lue: string; retenue: string; ecart: number }

/**
 * Les facades lues sur les photos du cas (`lectures.facades`) dont la teinte s'ecarte de la couleur
 * des murs rejouee de plus que ECART_TEINTE (model/couleurMur.ts). Sans couleur retenue, rien ne se
 * mesure : la couleur du plan n'est pas une lecture.
 */
export function facadesEcartees(c: CasAudit, rejeu: SortiesCas): EcartFacade[] {
  const retenue = rejeu.couleurMurs;
  if (!retenue) return [];
  return (c.lectures?.facades ?? []).flatMap((l) => {
    const ecart = ecartTeintes(l.couleur, retenue);
    return ecart !== null && ecart > ECART_TEINTE ? [{ cote: l.cote, lue: l.couleur, retenue, ecart: Math.round(ecart) }] : [];
  });
}

/**
 * Les problemes que le rejeu propose sur le cas, sans les cocher (spec §18.4) : `facade.couleur`
 * quand une facade lue sur photo s'ecarte de la couleur retenue, s'il n'est pas deja coche.
 */
export function propositionsAuRejeu(c: CasAudit, rejeu: SortiesCas): string[] {
  const deja = new Set(c.constat.problemes);
  return facadesEcartees(c, rejeu).length && !deja.has('facade.couleur') ? ['facade.couleur'] : [];
}
