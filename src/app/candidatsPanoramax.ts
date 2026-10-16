// Les cas candidats Panoramax (MD/spec-regles-toits.md §13.3 phase 4 et §14.5, usage 3 de Claude
// analyste : « observer sans marcher » ; lot G3 bis) : pour chaque batiment d'un village (le JSON
// de village.mjs, skill toits), les photos de rue qui le voient, trois passes de Claude par les
// routes de l'analyse (deploy/analyse.php, usage `candidats` : plafonds et journal de l'analyse),
// le vote, et les batiments qui ont probablement une forme visee (model/casCandidats.ts).
//
// Rien ne s'applique au calcul : le resultat est un fichier de candidats au statut `propose`, que
// le script du skill regles-toits ecrit dans le corpus. Le reseau (Panoramax, les photos, le
// serveur de Plan) est injecte : ce module se teste avec des reponses figees et l'API simulee.
//
// Le choix des photos reprend celui de la couleur des murs (render/couleurMurPhoto.ts,
// `mursVisibles` : devant le mur, de face, sans autre batiment entre deux) ; s'y ajoute ce qu'il
// faut pour un toit : assez de recul, et le faite dans le cadre.

import { centroid } from '../geometry/basic.js';
import { obstacle } from '../geometry/ligneDeVue.js';
import { projecteurLocal, type ProjecteurLocal } from '../geo/projection.js';
import { chercherPhotosRue, type PhotoRue } from '../geo/panoramax.js';
import { mursVisibles, pointDansImage, type VueRue } from '../render/couleurMurPhoto.js';
import { contradictionsLidar, contourCompact, estReponseAnalyse, indicesLidar, voter, PASSES_ANALYSE, type IndicesLidar, type ReponseAnalyse } from '../model/analyseClaude.js';
import { candidatDepuisVote, VISEES_PAR_DEFAUT, type CasCandidat, type PhotoCandidat, type SourceCandidat, type ViseeCandidat } from '../model/casCandidats.js';
import { toitMesureDepuisGrille } from '../model/toitMesure.js';
import type { BlocAnalyse, ClientAnalyse, DemandeAnalyse, RequeteAnalyse, ResultatBatch } from '../io/analyseClaude.js';
import type { GrilleRelief } from '../model/relief.js';
import type { CorpsToit, PtBrut, Toit } from '../model/types.js';

/** Un batiment du JSON de village (skill toits, village.mjs) : ce que ce module en lit. */
export interface BatimentVillage {
  key: string;
  pts: PtBrut[];
  /** La distance au centre de la parcelle du projet, en metres : les plus proches d'abord. */
  d?: number;
  bdtopo?: { cleabs?: string; hauteurM?: number | null; hauteurRetenueM?: number | null } | null;
  toit?: Toit | null;
  corps?: CorpsToit[] | null;
  grille?: GrilleRelief | null;
}

export interface VillageJson {
  parcelle?: string | null;
  /** L'origine du repere du plan (cadastre de la parcelle du projet), ecrite par village.mjs. */
  origine?: { lat: number; lon: number } | null;
  batiments: BatimentVillage[];
}

/** Les photos gardees par batiment : deux vues suffisent a une forme, et chaque image se paie. */
export const PHOTOS_PAR_BATIMENT = 2;
/** Plus pres, la photo montre le mur mais plus le toit (la pente fuit au-dessus du cadre). */
export const RECUL_TOIT_MIN_M = 8;
/** Le rayon de la recherche Panoramax, borne, et le nombre de photos demandees (render/couleurMurPhoto.ts). */
const RAYON_MAX_M = 250;
const MARGE_RECHERCHE_M = 40;
const LIMITE_RECHERCHE = 500;
/** Les requetes d'un batch au plus, comme le plafond par defaut du serveur (`requetesParBatch`) : vingt batiments. */
export const REQUETES_PAR_BATCH = 60;
/** Sous deux passes reussies, pas de vote : le batiment est compte en echec, il sera relu. */
const PASSES_MIN = 2;

const egoutDe = (b: BatimentVillage): number => {
  const h = b.bdtopo?.hauteurRetenueM ?? b.bdtopo?.hauteurM ?? null;
  return h && h > 1 ? h : 3;
};

/** Le faite d'un batiment : sa mesure LiDAR, sinon ses corps, sinon trois metres au-dessus de l'egout. */
function faiteDe(b: BatimentVillage, indices: IndicesLidar | null): number {
  if (indices) return indices.faiteM;
  const corps = b.corps ?? [];
  return corps.length ? Math.max(...corps.map((c) => c.faitage)) : egoutDe(b) + 3;
}

/** Les indices LiDAR chiffres du batiment, depuis la grille du fichier de village ; null sans grille. */
export function indicesDuBatiment(b: BatimentVillage): IndicesLidar | null {
  if (!b.grille || b.pts.length < 3) return null;
  return indicesLidar(toitMesureDepuisGrille(b.grille, b.pts), b.corps ?? null);
}

/**
 * Ou tombe un point dans la photo, en part de sa largeur depuis la gauche ; null hors du cadre. Les
 * proportions sont celles de la photo (4:3 a defaut ; 2:1 pour un panoramique) : le faite d'un
 * toit proche sort du haut d'une image plate, c'est ce que l'on veut savoir.
 */
export function dansLeCadre(vue: VueRue, p: { x: number; y: number; z: number }): number | null {
  const [L, H] = vue.photo.panoramique ? [2000, 1000] : [vue.photo.largeurPx ?? 4000, vue.photo.hauteurPx ?? 3000];
  const ou = pointDansImage(vue, p, L, H);
  return ou ? ou.u / L : null;
}

/** Une photo retenue pour un batiment : la vue, sa distance et son cap vers lui, sa place dans l'image. */
export interface PhotoDuBatiment { vue: VueRue; distanceM: number; capDeg: number; partLargeur: number }

/**
 * Les photos qui montrent le toit de chaque batiment : celles qui voient un de ses murs (`mursVisibles`),
 * avec assez de recul, et dont le faite tombe dans l'image ; les plus proches et de face d'abord.
 */
export function photosParBatiment(batiments: readonly BatimentVillage[], vues: readonly VueRue[], faites: ReadonlyMap<string, number>, parBatiment = PHOTOS_PAR_BATIMENT): Map<string, PhotoDuBatiment[]> {
  const avecContour = batiments.filter((b) => b.pts.length >= 3);
  const murs = mursVisibles(avecContour.map((b) => ({ key: b.key, pts: b.pts, egout: egoutDe(b) })), vues, avecContour.map((b) => obstacle(b.pts)), parBatiment * 2);
  const centres = new Map(avecContour.map((b) => [b.key, centroid(b.pts)]));
  const notes = new Map<string, Map<string, { p: PhotoDuBatiment; note: number }>>();
  for (const m of murs) {
    const c = centres.get(m.cle) as PtBrut;
    const dx = c.x - m.vue.x, dy = c.y - m.vue.y, d = Math.hypot(dx, dy);
    const faite = faites.get(m.cle) ?? m.egout + 3;
    if (d < RECUL_TOIT_MIN_M || dansLeCadre(m.vue, { x: c.x, y: c.y, z: faite }) === null) continue;
    const p: PhotoDuBatiment = { vue: m.vue, distanceM: d, capDeg: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360, partLargeur: dansLeCadre(m.vue, { x: c.x, y: c.y, z: (m.egout + faite) / 2 }) ?? 0.5 };
    const parPhoto = notes.get(m.cle) ?? new Map<string, { p: PhotoDuBatiment; note: number }>();
    const avant = parPhoto.get(m.vue.photo.id);
    if (!avant || m.note < avant.note) parPhoto.set(m.vue.photo.id, { p, note: m.note });
    notes.set(m.cle, parPhoto);
  }
  const out = new Map<string, PhotoDuBatiment[]>();
  for (const [cle, parPhoto] of notes) out.set(cle, [...parPhoto.values()].sort((a, b) => a.note - b.note || (a.p.vue.photo.id < b.p.vue.photo.id ? -1 : 1)).slice(0, parBatiment).map((x) => x.p));
  return out;
}

/** Le centre du village (moyenne des centres des batiments) et le rayon de recherche qui couvre tous ses murs. */
export function emprise(batiments: readonly BatimentVillage[]): { centre: PtBrut; rayonM: number } {
  const centres = batiments.filter((b) => b.pts.length >= 3).map((b) => centroid(b.pts));
  const centre = centres.length ? { x: centres.reduce((s, c) => s + c.x, 0) / centres.length, y: centres.reduce((s, c) => s + c.y, 0) / centres.length } : { x: 0, y: 0 };
  const loin = Math.max(0, ...centres.map((c) => Math.hypot(c.x - centre.x, c.y - centre.y)));
  return { centre, rayonM: Math.min(RAYON_MAX_M, loin + MARGE_RECHERCHE_M) };
}

/* ------------------------------------------------------------------------------------------------
 * La requete d'un batiment
 * --------------------------------------------------------------------------------------------- */

export interface ImageTelechargee { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }

const pourcent = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);
/** Un cap arrondi au degre, 359,6 compris : 0, pas 360. */
const capArrondi = (c: number) => Math.round(c) % 360;

/** L'etiquette d'une photo : la prise, et ou se trouve le batiment vise dans l'image (le reste est le voisinage). */
export function etiquettePhoto(rang: number, p: PhotoDuBatiment): string {
  const ph = p.vue.photo;
  const quand = ph.date ? ', prise le ' + ph.date.slice(0, 10) : '';
  return 'Image ' + rang + ' : photo de rue Panoramax' + (ph.panoramique ? ' (panoramique à 360°)' : '') + quand + ', à ' + Math.round(p.distanceM) + ' m du bâtiment visé, qui est vers ' + capArrondi(p.capDeg) + '° ; '
    + 'le bâtiment visé est à ' + pourcent(p.partLargeur) + ' % de la largeur de l’image depuis la gauche. Les autres bâtiments de l’image sont ses voisins : ne décrivez que le bâtiment visé.';
}

/** Le texte qui suit les images : ce qu'on cherche, les indices chiffres, le modele actuel. */
export function texteDuBatiment(b: BatimentVillage, indices: IndicesLidar | null): string {
  const modele = { contour: contourCompact(b.pts), hauteurEgoutM: egoutDe(b), toit: b.toit ? { forme: b.toit.forme } : null, corps: (b.corps ?? []).length };
  return [
    'Bâtiment visé : ' + b.key + '. Cas candidat pour le corpus : décrivez son toit (forme, profil, bouts, lucarnes, cheminées) tel que les photos de rue le montrent.',
    'Façades à décrire (étiquettes) : aucune ; laissez `facades` vide.',
    'Indices LiDAR chiffrés : ' + (indices ? JSON.stringify(indices) : 'aucune mesure LiDAR pour ce bâtiment') + '.',
    'Modèle actuel de Plan (JSON compact, mètres) : ' + JSON.stringify(modele),
  ].join('\n');
}

/** Le contenu d'un batiment : chaque photo avec son etiquette, puis le texte ; null si aucune photo ne s'est telechargee. */
export async function contenuDuBatiment(b: BatimentVillage, photos: readonly PhotoDuBatiment[], indices: IndicesLidar | null, telecharger: (url: string) => Promise<ImageTelechargee | null>): Promise<{ contenu: BlocAnalyse[]; gardees: PhotoDuBatiment[] } | null> {
  const contenu: BlocAnalyse[] = [];
  const gardees: PhotoDuBatiment[] = [];
  for (const p of photos) {
    const img = await telecharger(p.vue.photo.sd ?? p.vue.photo.hd).catch(() => null);
    if (!img) continue;
    gardees.push(p);
    contenu.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
    contenu.push({ type: 'text', text: etiquettePhoto(gardees.length, p) });
  }
  if (!gardees.length) return null;
  contenu.push({ type: 'text', text: texteDuBatiment(b, indices) });
  return { contenu, gardees };
}

export const idRequeteCandidat = (rang: number, passe: number): string => 'c' + rang + '-p' + passe;

/* ------------------------------------------------------------------------------------------------
 * L'analyse d'un village
 * --------------------------------------------------------------------------------------------- */

export interface OptionsCandidats {
  village: string;
  client: ClientAnalyse;
  /** La recherche Panoramax (reseau, ou reponse figee) et le telechargement d'une photo. */
  lireJson: (url: string) => Promise<unknown>;
  telecharger: (url: string) => Promise<ImageTelechargee | null>;
  visees?: readonly ViseeCandidat[];
  /** Les batiments analyses au plus, les plus proches du centre de la parcelle d'abord. */
  maxBatiments?: number;
  /** Les cles deja triees : leurs batiments ne sont pas renvoyes a Claude. */
  ignorer?: ReadonlySet<string>;
  /** L'appel immediat (trois passes par batiment, tarif normal) plutot que le batch (moitie prix, differe). */
  immediat?: boolean;
  /** Attendre entre deux lectures de l'etat d'un batch ; et l'intervalle, en ms. */
  attendre?: (ms: number) => Promise<void>;
  intervalleMs?: number;
  maintenant?: () => Date;
  journal?: (ligne: string) => void;
}

export interface BilanCandidats {
  batiments: number;
  avecPhotos: number;
  analyses: number;
  echecs: number;
  photos: number;
  /** Le cout reel des appels, en dollars, tel que le serveur le calcule avec sa table des tarifs. */
  cout: number;
  modele: string | null;
}

/** Un batiment pret a partir : ses indices chiffres, le contenu de sa requete, les photos telechargees. */
export interface APreparer { b: BatimentVillage; indices: IndicesLidar | null; contenu: BlocAnalyse[]; photos: PhotoDuBatiment[] }

export type OptionsPreparation = Pick<OptionsCandidats, 'lireJson' | 'telecharger' | 'maxBatiments' | 'ignorer' | 'journal'>;

const bilanVide = (): BilanCandidats => ({ batiments: 0, avecPhotos: 0, analyses: 0, echecs: 0, photos: 0, cout: 0, modele: null });

function projecteurDu(v: VillageJson): ProjecteurLocal {
  if (!v.origine) throw new Error('Le fichier du village n’a pas d’origine (lat, lon) : relancez village.mjs, ou donnez --origine.');
  return projecteurLocal(v.origine.lat, v.origine.lon);
}

/**
 * Les batiments a envoyer, sans appeler Claude : ceux qui ont une photo de leur toit, les plus
 * proches d'abord. Le script s'en sert seul pour un essai a blanc (`--essai`), gratuit.
 */
export async function preparerVillage(v: VillageJson, o: OptionsPreparation, bilan: BilanCandidats = bilanVide()): Promise<{ lots: APreparer[]; bilan: BilanCandidats }> {
  const lots = await preparer(v, projecteurDu(v), o, bilan);
  bilan.photos = lots.reduce((n, x) => n + x.photos.length, 0);
  return { lots, bilan };
}

async function preparer(v: VillageJson, proj: ProjecteurLocal, o: OptionsPreparation, bilan: BilanCandidats): Promise<APreparer[]> {
  const batiments = v.batiments.filter((b) => b.pts.length >= 3 && !o.ignorer?.has(b.key)).sort((a, b) => (a.d ?? 0) - (b.d ?? 0) || (a.key < b.key ? -1 : 1));
  bilan.batiments = batiments.length;
  const { centre, rayonM } = emprise(v.batiments);
  const g = proj.versDegres(centre.x, centre.y);
  const trouvees: PhotoRue[] = await chercherPhotosRue(g.lat, g.lon, rayonM, o.lireJson, LIMITE_RECHERCHE);
  const vues: VueRue[] = trouvees.map((photo) => ({ photo, ...proj.versMetres(photo.lon, photo.lat) }));
  const indices = new Map(batiments.map((b) => [b.key, indicesDuBatiment(b)]));
  const faites = new Map(batiments.map((b) => [b.key, faiteDe(b, indices.get(b.key) ?? null)]));
  const parBatiment = photosParBatiment(v.batiments, vues, faites);
  o.journal?.(trouvees.length + ' photos Panoramax dans un rayon de ' + Math.round(rayonM) + ' m');
  const out: APreparer[] = [];
  for (const b of batiments) {
    if (o.maxBatiments !== undefined && out.length >= o.maxBatiments) break;
    const photos = parBatiment.get(b.key) ?? [];
    if (!photos.length) continue;
    bilan.avecPhotos++;
    const x = await contenuDuBatiment(b, photos, indices.get(b.key) ?? null, o.telecharger);
    if (x) out.push({ b, indices: indices.get(b.key) ?? null, contenu: x.contenu, photos: x.gardees });
  }
  return out;
}

const requetesDe = (rang: number, contenu: BlocAnalyse[]): RequeteAnalyse[] =>
  Array.from({ length: PASSES_ANALYSE }, (_, i) => ({ id: idRequeteCandidat(rang, i + 1), passe: (i + 1) as 1 | 2 | 3, facades: 0, contenu }));

/** Envoie les requetes (batches de vingt batiments, ou appels immediats) et rend les resultats par identifiant. */
async function envoyer(lots: APreparer[], o: OptionsCandidats, identite: Omit<DemandeAnalyse, 'requetes'>, bilan: BilanCandidats): Promise<Map<string, ResultatBatch>> {
  const out = new Map<string, ResultatBatch>();
  const garder = (rs: ResultatBatch[], modele: string) => {
    bilan.modele = modele;
    for (const r of rs) {
      out.set(r.id, r);
      const cout = (r as { cout?: unknown }).cout;
      if (typeof cout === 'number') bilan.cout += cout;
    }
  };
  const toutes = lots.flatMap((x, rang) => requetesDe(rang, x.contenu));
  if (o.immediat) {
    for (let i = 0; i < toutes.length; i += PASSES_ANALYSE) {
      const lu = await o.client.immediat({ ...identite, requetes: toutes.slice(i, i + PASSES_ANALYSE) });
      garder(lu.resultats, lu.modele);
      o.journal?.('batiment ' + (i / PASSES_ANALYSE + 1) + '/' + lots.length + ' analysé');
    }
    return out;
  }
  const attendre = o.attendre ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  for (let i = 0; i < toutes.length; i += REQUETES_PAR_BATCH) {
    const cree = await o.client.creerBatch({ ...identite, requetes: toutes.slice(i, i + REQUETES_PAR_BATCH) });
    o.journal?.('batch ' + cree.batch.id + ' envoyé (' + Math.min(REQUETES_PAR_BATCH, toutes.length - i) + ' requêtes)');
    let etat = cree.batch.etat;
    while (etat !== 'ended') {
      await attendre(o.intervalleMs ?? 60000);
      etat = (await o.client.etatBatch(cree.batch.id)).etat;
    }
    const lu = await o.client.resultats(cree.batch.id);
    garder(lu.resultats, lu.modele);
  }
  return out;
}

/** Ce que les passes d'un batiment ont rendu, lisible ; vide si toutes ont echoue. */
function reponsesDe(rang: number, resultats: ReadonlyMap<string, ResultatBatch>): ReponseAnalyse[] {
  return Array.from({ length: PASSES_ANALYSE }, (_, i) => resultats.get(idRequeteCandidat(rang, i + 1)))
    .filter((r): r is ResultatBatch => r?.statut === 'reussi').map((r) => r.sortie).filter((x): x is ReponseAnalyse => estReponseAnalyse(x));
}

const photoCandidat = (p: PhotoDuBatiment): PhotoCandidat => ({
  id: p.vue.photo.id, url: p.vue.photo.hd, date: p.vue.photo.date, auteur: p.vue.photo.auteur, licence: p.vue.photo.licence,
  distanceM: Math.round(p.distanceM * 10) / 10, capDeg: capArrondi(p.capDeg),
});

/**
 * Analyse un village : photos, trois passes de Claude par batiment, vote, candidats. Rend les
 * candidats (au statut `propose`, les plus surs d'abord), les cles des batiments analyses (pour la
 * fusion avec le fichier existant) et le bilan.
 */
export async function analyserVillage(v: VillageJson, o: OptionsCandidats): Promise<{ candidats: CasCandidat[]; analyses: Set<string>; bilan: BilanCandidats }> {
  const { lots, bilan } = await preparerVillage(v, o);
  const analyses = new Set<string>();
  if (!lots.length) return { candidats: [], analyses, bilan };
  const identite = { projet: null, idu: v.parcelle ?? null, adresse: 'cas candidats : ' + o.village, audit: ('candidats-' + o.village).slice(0, 64), usage: 'candidats' as const };
  const etat = await o.client.etat();
  if (!etat.actif) throw new Error('Le serveur de Plan n’a pas de clé Anthropic (anthropicCle dans plan-admin-config.php).');
  const resultats = await envoyer(lots, o, identite, bilan);
  const le = (o.maintenant?.() ?? new Date()).toISOString().slice(0, 10);
  const source: SourceCandidat = { par: 'claude', usage: 'candidats', modele: bilan.modele ?? 'inconnu', prompt: etat.prompt, schema: etat.schema, le };
  const candidats: CasCandidat[] = [];
  lots.forEach((x, rang) => {
    const reponses = reponsesDe(rang, resultats);
    if (reponses.length < PASSES_MIN) { bilan.echecs++; return; }
    bilan.analyses++;
    analyses.add(x.b.key);
    const vote = voter(reponses);
    const c = candidatDepuisVote({
      cle: x.b.key, cleabs: x.b.bdtopo?.cleabs ?? null, vote, typesLucarnes: reponses.flatMap((r) => r.lucarnes.types),
      contradictions: contradictionsLidar(vote, x.indices), photos: x.photos.map(photoCandidat), source,
    }, o.visees ?? VISEES_PAR_DEFAUT);
    if (c) candidats.push(c);
  });
  return { candidats, analyses, bilan };
}
