// Le releve de facade (zones/Releve.tsx) et l'audit (par l'orchestrateur, facade/releve/enchainement.ts) : analyser une serie et
// ecrire le releve d'un mur. Sans React : testable seul.

import { au } from '../../util/tableaux.js';
import { type Facade } from '../../geometry/cotesVusDeDehors.js';
import { type ResultatAnalyse } from '../analyse.js';
import { type ResultatFusion } from '../fusion.js';
import { analyserLeMur, type AssemblageDuMur } from '../analyseMur.js';
import type { MesureDistance } from './prise.js';
import { pxParMetre, pxParMetreDesCoins, precisionCm } from '../calage/calage.js';
import { avecGrille, versOuvertureFacade } from '../detection/verification.js';
import type { ObjetPolygone, OuvertureFacade, Toit, ReleveFacade, CalageReleve, CorrectionOuverture, TextureCalee } from '../../model/types.js';
import type { SilhouetteFacade } from '../../model/silhouetteFacade.js';
import { silhouetteDeEstimation } from '../regles/toits/silhouettes.js';
import { chiffreFr as fr } from '../../util/format.js';
import { type Assemblage, type Morceau, type Resultat, capCorrige, focaleDePrise } from './serie.js';
import { surchargesCalibrees } from '../regles/facades/surcharges.js';

/** La focale d'une prise, en pixels : exacte quand la photo la donne, sinon d'apres le champ de l'objectif. */
const focaleDe = (m: Morceau): number => focaleDePrise(m.prise);

/**
 * Ce que la hauteur mesuree a d'etonnant : loin de l'estimation (cadastre, ou releve precedent), c'est
 * le plus souvent un coin mal place (ou une focale mal reglee) ; non mesuree, l'estimation reste.
 */
function avisHauteur(r: ResultatAnalyse, hauteurEstimee: number): string | null {
  if (!r.hauteurMesuree) return `La hauteur n'a pas pu se mesurer sur la photo : celle du bâtiment (${fr(hauteurEstimee)} m) est gardée.`;
  if (hauteurEstimee > 0 && Math.abs(r.hauteur - hauteurEstimee) / hauteurEstimee > 0.25)
    return `Hauteur mesurée : ${fr(r.hauteur)} m, pour ${fr(hauteurEstimee)} m jusqu'ici. Si l'écart vous étonne, vérifiez les coins du haut et du bas, et le champ de l'objectif.`;
  return null;
}

/**
 * Ce que la fusion de plusieurs vues trouve a redire : une vue qui ne se recale sur aucune autre (elle reste independante, son motif est
 * dit, ses coins sont sans doute mal places), ou une part du mur cachee sur toutes les vues.
 */
export function avisFusion(r: Pick<ResultatFusion, 'vues' | 'masque' | 'statut'>): string | null {
  const hors = r.vues.findIndex((v) => !v.fusionnee);
  if (r.statut !== 'seule' && hors >= 0) return `La vue ${hors + 1} n’est pas fusionnée : ${r.vues[hors]?.motif ?? 'elle ne se recale sur aucune autre'}. Vérifiez ses coins, ou prenez-en une autre en gardant un tiers de mur en commun.`;
  if (r.masque >= 0.02)
    return `Une partie du mur (${Math.round(r.masque * 100)} %) reste cachée sur toutes les vues : aucune ouverture n'y est cherchée. Une vue prise d'un autre endroit la dégagerait.`;
  return null;
}

/**
 * Analyse une serie : une photo, c'est le mur entier entre ses coins ; plusieurs, ce sont des
 * morceaux a assembler, ou des vues du mur entier a fondre (`assemblage`). Dans les deux cas la hauteur se mesure (la largeur du plan donne l'echelle) ;
 * `hauteurEstimee` (le cadastre) ne sert que de depart et de repli. L'analyse dit ce qu'elle a trouve
 * a redire : deux photos voisines qui se ressemblent mal sur leur partie commune, une hauteur loin de
 * celle du cadastre.
 */
export function analyserSerie(morceaux: Morceau[], facade: Facade, hauteurEstimee: number, bat: ObjetPolygone, assemblage: Assemblage = 'morceaux'): { r: ResultatAnalyse; avis: string | null; fusion?: ResultatFusion; assemblage?: AssemblageDuMur } | null {
  const mur = { largeur: facade.largeur, hauteur: hauteurEstimee, contour: bat.pts, cote: facade.cote, distance: au(morceaux, 0).prise.mesure?.distance ?? null };
  const a = analyserLeMur(mur, morceaux.map((m) => ({ photo: m.prise.photo.image, coins: m.coins, focalePx: focaleDe(m), decrochement: m.decrochement ?? null, silhouette: m.silhouette ?? null, reperes: m.reperes ?? null })), assemblage);
  if (!a) return null;
  // L'assemblage des photos redressees entieres : une photo restee a part se dit.
  if (a.assemblage) {
    const k = a.assemblage.vues.findIndex((v) => !v.assemblee);
    const avis = k >= 0 && morceaux.length > 1 ? `La vue ${k + 1} reste hors de l’assemblage : ${a.assemblage.vues[k]?.motif ?? 'elle ne se recale sur aucune autre'}. Vérifiez ses coins, ou prenez-en une autre en gardant un tiers de mur en commun.` : null;
    // Plusieurs vues fondues : la fusion garde son masque d'occlusion, que la verification hachure.
    return { r: a.r, avis: avis ?? (a.fusion ? avisFusion(a.fusion) : null) ?? avisHauteur(a.r, hauteurEstimee), assemblage: a.assemblage, ...(a.fusion ? { fusion: a.fusion } : {}) };
  }
  // La fusion garde son masque d'occlusion et sa vue de reference : la verification hachure l'un et montre l'autre a Claude (lot G20).
  if (a.fusion) return { r: a.r, avis: avisFusion(a.fusion) ?? avisHauteur(a.r, hauteurEstimee), fusion: a.fusion };
  if (!a.mosaique) return { r: a.r, avis: avisHauteur(a.r, hauteurEstimee) };
  const mauvaise = a.mosaique.jointures.findIndex((s) => s < 0.5);
  let avis: string | null = null;
  if (mauvaise >= 0) avis = `Les photos ${mauvaise + 1} et ${mauvaise + 2} se raccordent mal : reprenez-en une en gardant un tiers de mur en commun.`;
  else if (Math.abs(a.mosaique.rapportLargeur - 1) > 0.06) avis = "Les photos s'assemblent mal : vérifiez les coins, surtout ceux des extrémités.";
  else avis = avisHauteur(a.r, hauteurEstimee);
  return { r: a.r, avis };
}

/**
 * Corrige la hauteur mesuree d'un facteur `k`. La largeur est celle du plan : c'est la hauteur seule
 * qui etait fausse, donc la facade s'etire en hauteur - ouvertures, partie basse, bande du pignon et
 * toit lu dessus, tous du meme facteur.
 */
export function etirerEnHauteur(r: Resultat, ouvertures: OuvertureFacade[], toit: Toit | null, k: number): { resultat: Resultat; ouvertures: OuvertureFacade[]; toit: Toit | null } {
  const cm = (x: number) => Math.round(x * k * 100) / 100;
  return {
    resultat: { ...r, hauteurTexture: r.hauteurTexture * k, partieBasse: r.partieBasse ? { ...r.partieBasse, hauteur: cm(r.partieBasse.hauteur) } : null },
    ouvertures: ouvertures.map((o) => ({ ...o, y: cm(o.y), h: cm(o.h) })),
    toit: toit ? { ...toit, hauteur: cm(toit.hauteur) } : null,
  };
}

/**
 * Le calage de la serie : les coins poses sur chaque photo et leur source, et les pixels par metre au
 * mur sur la photo source (MD/spec-facades-calage-detection.md §4) - par la focale et la distance
 * mesuree, sinon, pour une photo seule, par ses coins rapportes a la taille du mur. Depuis le lot L7,
 * le calage fin de la premiere photo y ajoute l'azimut lu sur les points de fuite et sa note. L'ecart de
 * la largeur vue a celle du plan n'y est plus (lot F5) : il va dans les dimensions de la Facade
 * (`ecartDeLargeur`, `dimensions.ecartPhoto`), ecrites a la validation.
 */
export function calageDeSerie(morceaux: readonly Morceau[], largeur: number, hauteur: number, azimutFacade: number | null = null, assemblage: Assemblage = 'morceaux'): CalageReleve {
  // Une photo seule, ou chaque vue d'une fusion, montre le mur entier entre ses coins.
  const seul = morceaux.length === 1 || assemblage === 'vues';
  const c: CalageReleve = {
    photos: morceaux.map((m) => {
      const d = m.prise.mesure?.distance ?? null;
      const px = d && d > 0 ? pxParMetre(focaleDe(m), d) : seul ? pxParMetreDesCoins(m.coins, largeur, hauteur) : null;
      return {
        coins: m.coins.map((c) => ({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 })),
        pxParMSource: px === null ? null : Math.round(px * 10) / 10,
        ...(m.sources ? { sourceCoins: [...m.sources] } : {}),
      };
    }),
  };
  const fin = morceaux[0]?.fin;
  if (fin?.trouve) {
    c.confiance = Math.round(fin.note * 100) / 100;
    const cap = azimutFacade === null ? null : capCorrige(fin, azimutFacade);
    if (cap !== null) c.azimutCorrigeDeg = cap;
  }
  return c;
}

/**
 * L'ecart de la largeur vue sur la premiere photo a celle du plan, en part de celle-ci (0 : elle confirme), quand le calage fin l'a
 * lue ; null sinon. Une alerte au-dela de 0,10, jamais une correction : la largeur est celle du plan (decision 1).
 */
function ecartDeLargeur(morceaux: readonly Morceau[], largeur: number): number | null {
  const c = morceaux[0]?.fin?.trouve ? morceaux[0].fin.contour : null;
  return c && largeur > 0 ? Math.round(Math.abs(c.ecartM) / largeur * 100) / 100 : null;
}

/** La resolution qui borne la precision d'une serie : celle de la photo la moins bien definie. */
export function pxParMDuCalage(c: CalageReleve | null | undefined): number | null {
  const v = (c?.photos ?? []).map((p) => p.pxParMSource).filter((x): x is number => x !== null && x > 0);
  return v.length ? Math.min(...v) : null;
}

/**
 * La precision annoncee des cotes : un pixel de la photo source au mur. Les cotes restent arrondies
 * au centimetre, mais une photo qui ne voyait le mur qu'a 40 pixels par metre ne le vaut pas (§7).
 */
export function textePrecision(pxParM: number | null): string | null {
  if (pxParM === null || !(pxParM > 0)) return null;
  const p = precisionCm(pxParM);
  const px = Math.round(pxParM);
  if (p <= 1) return `Cotes précises au centimètre : la photo voyait le mur à ${px} pixels par mètre.`;
  return `Cotes précises à environ ${fr(Math.round(p * 2) / 2, p < 10 ? 1 : 0)} cm : la photo ne voyait le mur qu'à ${px} pixels par mètre.`;
}

/**
 * Ce qui s'ecrit pour le mur : sa hauteur mesuree (ou corrigee), sa photo, ses ouvertures, leur grille
 * (spec facades §10, recalculee sur les ouvertures retenues) et les corrections de l'utilisateur (§12).
 */
export function releveDuMur(facade: Facade, r: Resultat, retenues: OuvertureFacade[], hauteur: number, mesure: MesureDistance | null, corrections: CorrectionOuverture[] = []): ReleveFacade {
  const cm = (v: number) => Math.round(v * 100) / 100;
  const { ouvertures, grille } = avecGrille(retenues, facade.largeur);
  return {
    cote: facade.cote,
    largeur: cm(facade.largeur),
    hauteur,
    texture: r.texture,
    hauteurTexture: cm(r.hauteurTexture),
    ouvertures,
    distance: mesure ? cm(mesure.distance) : null,
    sourceDistance: mesure?.source ?? null,
    releveLe: new Date().toISOString(),
    partieBasse: r.partieBasse,
    ...(r.calage ? { calage: r.calage } : {}),
    // Les seuils de la detection qui ont produit ce releve : un rejeu repartira des memes (MD/roadmap-architecture.md, etape 1.4).
    calibration: { ...surchargesCalibrees() },
    ...(grille ? { grille } : {}),
    ...(corrections.length ? { corrections } : {}),
  };
}

/** Ce que l'analyse d'une serie donne pour le mur de l'audit : son releve, et ce qui dit d'ou viennent ses coins et sa hauteur. */
export interface ReleveDeLaSerie {
  releve: ReleveFacade;
  /** Les quatre coins ont-ils ete trouves sur la photo (et non seulement predits) ? */
  coinsTrouves: boolean;
  /** Les baies devinees par la structure, laissees en pointille : Claude peut les confirmer. */
  devinees: OuvertureFacade[];
  /** La ligne du haut du mur lue sur la photo (jamais le gabarit) ; `indetermine` quand le toit est hors cadre. */
  silhouette: SilhouetteFacade;
  /** Le haut du mur lu a la matiere du mur (u de 0 a 1, v en hauteurs d'egout), que le diagnostic de forme compare au gabarit (F4). */
  hautLu: { u: number; v: number }[] | null;
  /** La note du calage fin, de 0 a 1 ; null sans calage fin. */
  confiance: number | null;
  /** La hauteur a l'egout mesuree, quand les coins ont ete trouves ; des coins predits d'apres la hauteur connue la rendraient. */
  hauteurM: number | null;
  /** L'ecart de la largeur vue sur la photo a celle du plan, en part (`ecartDeLargeur`) ; null quand il ne s'est pas lu. */
  ecartLargeur: number | null;
  /** La pose de la texture : sa precision, et le mur sur elle (du sol a l'egout, la bande au-dessus de l'egout en plus). */
  textureCalee: TextureCalee | null;
}

/**
 * La pose de la texture d'un releve (lot F5) : l'elevation couvre le mur sur sa largeur, du sol a `hauteurTexture` ; le mur y est du
 * sol a l'egout (`hauteur`), le reste est la bande au-dessus de l'egout que la 3D plaque sur le pignon.
 */
function poseDeLaTexture(t: { largeur: number; hauteur: number }, largeurM: number, hauteurM: number, hauteurTextureM: number): TextureCalee | null {
  if (!(t.largeur > 0) || !(t.hauteur > 0) || !(largeurM > 0) || !(hauteurTextureM > 0)) return null;
  const egout = Math.round(t.hauteur * Math.max(0, 1 - hauteurM / hauteurTextureM));
  return { pxParM: Math.round(t.largeur / largeurM * 10) / 10, cadre: { x0: 0, y0: egout, x1: t.largeur, y1: t.hauteur } };
}

/**
 * Le releve du mur d'apres l'analyse d'une serie (une photo, ou la fusion de ses vues), tel que l'audit l'ecrit : son calage, sa
 * texture en JPEG (`jpeg`, le canevas du navigateur), ses ouvertures et leur grille. Une fonction d'etape : seul l'orchestrateur
 * l'appelle (MD/spec-facade-calage-audit.md §8 bis.2, lot F3).
 */
export function releveDeLaSerie(a: NonNullable<ReturnType<typeof analyserSerie>>, morceaux: readonly Morceau[], f: Facade, jpeg: (img: ResultatAnalyse['texture']) => string, assemblage: Assemblage): ReleveDeLaSerie {
  const calage = calageDeSerie(morceaux, f.largeur, a.r.hauteur, f.azimut, assemblage);
  const resultat: Resultat = {
    texture: jpeg(a.r.texture), hauteurTexture: a.r.hauteurTexture, hauteurMesuree: a.r.hauteurMesuree, couverture: a.r.couverture,
    toitPropose: a.r.toitPropose, avis: a.avis, partieBasse: a.r.partieBasse, calage,
  };
  const ouvertures = a.r.ouvertures.map(versOuvertureFacade);
  const coinsTrouves = morceaux.some((m) => !!m.sources?.includes('trouve'));
  return {
    releve: releveDuMur(f, resultat, ouvertures, Math.round(a.r.hauteur * 100) / 100, au(morceaux, 0).prise.mesure),
    coinsTrouves,
    devinees: a.r.devinees.map(versOuvertureFacade),
    silhouette: silhouetteDeEstimation(a.r.toitLu),
    hautLu: a.r.hautLu ?? null,
    confiance: calage.confiance ?? null,
    hauteurM: coinsTrouves && a.r.hauteurMesuree ? Math.round(a.r.hauteur * 100) / 100 : null,
    ecartLargeur: ecartDeLargeur(morceaux, f.largeur),
    textureCalee: poseDeLaTexture(a.r.texture, f.largeur, a.r.hauteur, a.r.hauteurTexture),
  };
}
