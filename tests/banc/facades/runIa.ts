// Le run d'une facade (lot F2, MD/spec-facade-calage-audit.md §8) sur les scenes du banc : l'image que Claude recoit (l'assemblage
// des vues redressees, comme la calibration le compose), la verite sur elle (le mur en pixels, les ouvertures en metres, les
// pointes, les carreaux), des reponses SYNTHETIQUES tirees de cette verite, et la mesure d'une reponse contre elle.
//
// Les reponses synthetiques ne sont PAS Claude : elles imitent ses erreurs typiques, de facon deterministe (des angles a 1 % pres,
// des boites a 3 % pres, une baie qu'une passe oublie, une fenetre inventee dans une passe sur trois, des carreaux parfois mal
// comptes), pour faire tourner le rejeu, les tests et la mesure x1 contre x3 sans reseau ni cle. Elles portent `synthetique`. La
// vraie mesure se fait avec la cle (.claude/skills/facades/scripts/ia-x1-x3.ts, workflow « Vérifier l'API Claude »).

import { hache, coinsVrais, formePignon, photographier, type PriseCamera, type SceneFacade } from './synthese.js';
import { appliquer, type Image, type P2 } from '../../../src/facade/vision/homographie.js';
import { inverser } from '../../../src/facade/vision/redressementFuites.js';
import { mosaiqueDeLaSerie, vuesDeFace } from '../../../src/facade/releve/coinsAuto.js';
import { appliquerSimilitude } from '../../../src/facade/vision/ransac.js';
import { type ObservationsFacade } from '../../../src/regles/facades/observations.js';
import { ecartDesPoses, ouvertureDeLIa, poseDeLIa } from '../../../src/facade/regles/facades/ia.js';
import { juger } from '../../../src/facade/corpusReel.js';
import type { TypeOuverture } from '../../../src/model/types.js';

/** Ce qu'une scene donne au run : l'image envoyee, et la verite sur elle. */
export interface CasIa {
  nom: string;
  /** Les photos de la scene (toutes ses vues), dans l'ordre de la calibration. */
  photos: Image[];
  /** L'assemblage des vues redressees : l'image que Claude recoit ; `vu` ce qu'il montre (le reste part en gris, comme la page l'envoie). */
  image: Image;
  vu?: Uint8Array;
  verite: {
    /** Le mur vrai sur l'assemblage, en pixels. */
    mur: { x0: number; x1: number; y0: number; y1: number };
    largeurM: number;
    hauteurM: number;
    ouvertures: { type: TypeOuverture; x: number; y: number; l: number; h: number; carreaux: [number, number] | null }[];
    /** Les pointes du haut (le sommet du pignon), en part du mur et en hauteurs d'egout. */
    pointes: { u: number; v: number }[];
  };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Le cas d'une scene a prise par camera : ses vues redressees par leurs points de fuite et assemblees ; null sans assemblage. */
export function casIaDeScene(s: SceneFacade): CasIa | null {
  if (s.synthese.prise?.type !== 'camera') return null;
  const prises = [s.synthese.prise, ...(s.synthese.vues ?? [])] as PriseCamera[];
  const photos = prises.map((p) => photographier(s, 100, p)?.image ?? null);
  const vrais = coinsVrais(s, prises[0] as PriseCamera);
  if (photos.some((p) => !p) || !vrais) return null;
  const vues = vuesDeFace(photos as Image[], []);
  // La premiere vue redressee est la premiere de l'assemblage : sa place est la premiere.
  const m = vues[0] ? mosaiqueDeLaSerie(vues) : null;
  const place = m?.places[0], versVue = vues[0] ? inverser(vues[0].versPhoto) : null;
  if (!m || !place || !versVue) return null;
  const v = vrais.map((c) => appliquerSimilitude(place, appliquer(versVue, c)));
  const [hg, hd, bd, bg] = v as [P2, P2, P2, P2];
  const L = s.verite.largeur, H = s.verite.hauteur, pg = s.synthese.mur.pignon ?? 0, sommet = s.synthese.mur.pignonSommet ?? 0.5;
  // Une pointe vue : le sommet d'un pignon, sauf une rampe (le sommet au bout du mur).
  const pointes = pg > 0 && sommet > 0.02 && sommet < 0.98 ? [{ u: sommet, v: r3(1 + (pg * formePignon(sommet, sommet)) / H) }] : [];
  return {
    nom: s.nom, photos: photos as Image[], image: m.image, vu: m.vu,
    verite: {
      mur: { x0: (hg.x + bg.x) / 2, x1: (hd.x + bd.x) / 2, y0: (hg.y + hd.y) / 2, y1: (bg.y + bd.y) / 2 }, largeurM: L, hauteurM: H, pointes,
      ouvertures: s.verite.ouvertures.map((o) => ({ type: o.type, x: o.x, y: o.y, l: o.l, h: o.h, carreaux: o.rendu?.carreaux ?? null })),
    },
  };
}

/** Un ecart deterministe de plus ou moins `amplitude`, tire de la scene, de la passe et d'un rang. */
const ecart = (amplitude: number, a: number, b: number, c: number) => (hache(a, b, c) * 2 - 1) * amplitude;

/**
 * Une sortie SYNTHETIQUE du run pour une passe (0, 1 ou 2), dans la forme du schema (deploy/schema-facade.json) : de quoi rejouer sans
 * Claude. `graine` distingue les scenes.
 */
export function sortieSynthetique(c: CasIa, passe: number, graine: number): object {
  const { mur, largeurM: L, hauteurM: H } = c.verite, W = c.image.largeur, Hi = c.image.hauteur;
  const angle = (x: number, k: number) => ({ x: r3(x / W + ecart(0.01, graine, passe, k)), egout: r3(mur.y0 / Hi + ecart(0.01, graine, passe, k + 1)), sol: r3(mur.y1 / Hi + ecart(0.01, graine, passe, k + 2)), confiance: 'moyenne' });
  const ouvertures = c.verite.ouvertures.flatMap((o, i) => {
    // Une passe oublie parfois une baie ; les deux autres la voient.
    if (hache(graine, i, 50 + passe) < 0.12) return [];
    const e = (k: number) => ecart(0.03, graine, i * 10 + passe, k);
    const carreaux = o.carreaux && hache(graine, i, 70 + passe) > 0.2
      ? { vantaux: o.carreaux[0] % 2 === 0 ? 2 : 1, colonnes: o.carreaux[0] % 2 === 0 ? o.carreaux[0] / 2 : o.carreaux[0], rangees: o.carreaux[1], petitsBois: 'fins', imposte: 'aucune', vitrage: 'clair' }
      : { vantaux: 'indetermine', colonnes: 1, rangees: 1, petitsBois: 'aucun', imposte: 'indetermine', vitrage: 'clair' };
    return [{ type: o.type, u0: r3(o.x / L + e(1)), u1: r3((o.x + o.l) / L + e(2)), v0: r3(Math.max(0, o.y / H + e(3))), v1: r3((o.y + o.h) / H + e(4)),
      niveau: 'indetermine', travee: 'indetermine', confiance: 'moyenne', details: { volets: 'indetermine', allege: 'indetermine', forme: 'rect' }, carreaux }];
  });
  // Une fenetre inventee, dans une passe sur trois : celle que le vote ecarte, et que l'accord avec la detection laisse decochee.
  if (passe === graine % 3) ouvertures.push({ type: 'fenetre', u0: 0.005, u1: 0.06, v0: 0.03, v1: 0.2, niveau: 'indetermine', travee: 'indetermine', confiance: 'faible', details: { volets: 'indetermine', allege: 'indetermine', forme: 'rect' }, carreaux: { vantaux: 'indetermine', colonnes: 1, rangees: 1, petitsBois: 'aucun', imposte: 'indetermine', vitrage: 'clair' } });
  return {
    calage: {
      angles: { gauche: angle(mur.x0, 1), droite: angle(mur.x1, 4) },
      pointes: c.verite.pointes.map((p, k) => ({ u: r3(p.u + ecart(0.02, graine, passe, 20 + k)), v: r3(p.v * (1 + ecart(0.08, graine, passe, 30 + k))), confiance: 'moyenne' })),
      appentis: [], corps: [], cache: [],
    },
    forme: { silhouette: c.verite.pointes.length ? 'triangle' : 'ligne-droite', bout: c.verite.pointes.length ? 'pignon' : 'sans-objet' },
    surface: { principale: 'enduit', zones: [], confiance: 'moyenne' },
    elements: [], ouvertures, confiance: 'moyenne',
  };
}

/** Ce que vaut une reponse contre la verite du cas : sa pose, ses pointes, ses boites, ses carreaux. */
export interface MesureIa {
  /** Le pire bord de la pose de ses angles, en part de la largeur vraie ; null sans ses deux angles. */
  pose: number | null;
  pointes: { vues: number; justes: number; attendues: number };
  boites: { vraies: number; trouvees: number; vp: number; cotesCm: number | null };
  carreaux: { lus: number; justes: number };
}

/** La mesure d'une reponse (une passe, ou le vote de trois). */
export function mesurerReponse(c: CasIa, r: ObservationsFacade | null): MesureIa {
  const v = c.verite, vraies = v.ouvertures;
  if (!r) return { pose: null, pointes: { vues: 0, justes: 0, attendues: v.pointes.length }, boites: { vraies: vraies.length, trouvees: 0, vp: 0, cotesCm: null }, carreaux: { lus: 0, justes: 0 } };
  const pose = poseDeLIa(r, c.image);
  const boites = r.ouvertures.map((o) => ({ ...ouvertureDeLIa(o, v.largeurM, v.hauteurM), confiance: 1 }));
  const j = juger(vraies, boites);
  const cotes = [...j.cotes].sort((a, b) => a - b);
  let lus = 0, justes = 0;
  r.ouvertures.forEach((o, k) => {
    const b = boites[k];
    const vraie = b ? vraies.find((x) => x.carreaux && Math.min(x.x + x.l, b.x + b.l) - Math.max(x.x, b.x) > 0.5 * x.l && Math.min(x.y + x.h, b.y + b.h) - Math.max(x.y, b.y) > 0.5 * x.h) : undefined;
    if (!vraie?.carreaux || !o.carreaux || o.carreaux.colonnes === null || o.carreaux.rangees === null) return;
    lus++;
    if ((o.carreaux.vantaux ?? 1) * o.carreaux.colonnes === vraie.carreaux[0] && o.carreaux.rangees === vraie.carreaux[1]) justes++;
  });
  return {
    pose: pose ? ecartDesPoses(pose, v.mur) : null,
    pointes: { vues: r.calage.pointes.length, justes: r.calage.pointes.filter((p) => v.pointes.some((q) => Math.abs(q.u - p.u) <= 0.08 && Math.abs(q.v - p.v) <= 0.1 * q.v)).length, attendues: v.pointes.length },
    boites: { vraies: vraies.length, trouvees: boites.length, vp: j.vp, cotesCm: cotes.length ? (cotes[Math.floor(cotes.length / 2)] as number) : null },
    carreaux: { lus, justes },
  };
}
