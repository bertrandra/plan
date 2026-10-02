// Le releve de facade (zones/Releve.tsx) : analyser une serie et ecrire le releve d'un mur. Sans React : testable seul.

import { au } from '../../util/tableaux.js';
import { type Facade } from '../../facade/geometrie.js';
import { focalePx } from '../../facade/cadrage.js';
import { analyserReleve, type ResultatAnalyse } from '../../facade/analyse.js';
import { analyserMosaique } from '../../facade/mosaique.js';
import { type MesureDistance } from '../../ui/releve/profondeur.js';
import type { ObjetPolygone, OuvertureFacade, Toit, ReleveFacade } from '../../model/types.js';
import { fr } from './commun.js';
import { type Morceau, type Resultat } from './serie.js';

/** La focale d'une prise, en pixels : exacte quand la photo la donne, sinon d'apres le champ de l'objectif. */
function focaleDe(m: Morceau): number {
  const img = m.prise.photo.image;
  return m.prise.photo.focalePx ?? focalePx(img.largeur, img.hauteur, m.prise.photo.champ ?? m.prise.champ);
}

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
 * Analyse une serie : une photo, c'est le mur entier entre ses coins ; plusieurs, ce sont des
 * morceaux a assembler. Dans les deux cas la hauteur se mesure (la largeur du plan donne l'echelle) ;
 * `hauteurEstimee` (le cadastre) ne sert que de depart et de repli. L'analyse dit ce qu'elle a trouve
 * a redire : deux photos voisines qui se ressemblent mal sur leur partie commune, une hauteur loin de
 * celle du cadastre.
 */
export function analyserSerie(morceaux: Morceau[], facade: Facade, hauteurEstimee: number, bat: ObjetPolygone): { r: ResultatAnalyse; avis: string | null } | null {
  const commun = { largeur: facade.largeur, hauteur: hauteurEstimee, contour: bat.pts, cote: facade.cote, distance: au(morceaux, 0).prise.mesure?.distance ?? null };
  if (morceaux.length === 1) {
    const m = au(morceaux, 0);
    const r = analyserReleve({ ...commun, photo: m.prise.photo.image, coins: m.coins, focalePx: focaleDe(m), decrochement: m.decrochement ?? null });
    return r ? { r, avis: avisHauteur(r, hauteurEstimee) } : null;
  }
  const r = analyserMosaique({
    ...commun,
    morceaux: morceaux.map((m) => ({ photo: m.prise.photo.image, coins: m.coins, focalePx: focaleDe(m) })),
  });
  if (!r) return null;
  const mauvaise = r.jointures.findIndex((s) => s < 0.5);
  let avis: string | null = null;
  if (mauvaise >= 0) avis = `Les photos ${mauvaise + 1} et ${mauvaise + 2} se raccordent mal : reprenez-en une en gardant un tiers de mur en commun.`;
  else if (Math.abs(r.rapportLargeur - 1) > 0.06) avis = "Les photos s'assemblent mal : vérifiez les coins, surtout ceux des extrémités.";
  else avis = avisHauteur(r, hauteurEstimee);
  return { r, avis };
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

/** Ce qui s'ecrit pour le mur : sa hauteur mesuree (ou corrigee), sa photo, ses ouvertures. */
export function releveDuMur(facade: Facade, r: Resultat, ouvertures: OuvertureFacade[], hauteur: number, mesure: MesureDistance | null): ReleveFacade {
  const cm = (v: number) => Math.round(v * 100) / 100;
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
  };
}
