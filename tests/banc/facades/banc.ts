// Le banc de facades : rejoue le corpus sur la detection et l'analyse telles qu'elles sont, et ecrit
// le tableau (MD/spec-facades-calage-detection.md §14, lot L5 du plan de mise en oeuvre).
//
// Pour chaque scene :
// - **elevation** : `detecterOuvertures` sur l'elevation parfaite (vue de face, a l'echelle) - ce que
//   vaut la detection seule, sans erreur de calage ;
// - **photo** : `analyserReleve` sur la photo, avec les coins vrais - la chaine du releve : mesure de
//   la hauteur, redressement, detection ;
// - **calage** : les coins que propose le releve (`calage.ts::coinsDuReleve`, ou le cadre a 12 %
//   sans distance) compares aux coins vrais, et la hauteur retenue par l'analyse comparee a la
//   vraie ; puis le calage grossier de l'audit (`calage.ts::calageGrossier`) depuis la prise de vue,
//   avec des capteurs exacts, puis avec les erreurs typiques d'un telephone (`CAPTEURS_BANC`), et la
//   part des coins vrais qui tombent dans leur zone de recherche.
// Rien n'est modifie dans la detection : le banc mesure, il ne regle pas.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detecterOuvertures, type OuvertureDetectee } from '../../../src/facade/detection.js';
import { analyserReleve, coinsProposes } from '../../../src/facade/analyse.js';
import { coinsDuReleve, biaisDepuisCap, calageGrossier, type PriseDeVue, type ZoneRecherche } from '../../../src/facade/calage.js';
import { focalePx as focaleParDefaut } from '../../../src/facade/cadrage.js';
import type { Image, P2 } from '../../../src/facade/homographie.js';
import { peindreElevation, murSeul, photographier, stenope, type SceneFacade, type PriseCamera } from './synthese.js';
import { mesurerDetection, mediane, erreurCoinsCm, type MesureDetection } from './mesure.js';

export const DOSSIER_CORPUS = fileURLToPath(new URL('../../fixtures/facades', import.meta.url));

/** Les scenes du corpus, dans l'ordre des noms de fichiers. */
export function chargerCorpus(dossier = DOSSIER_CORPUS): SceneFacade[] {
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')) as SceneFacade);
}

export interface ResultatScene {
  nom: string;
  difficultes: string[];
  elevation: MesureDetection;
  photo: MesureDetection | null;
  /** Hauteur retenue par l'analyse moins la vraie, en cm. */
  hauteurCm: number | null;
  /** La hauteur a-t-elle ete mesuree sur la photo (sinon : l'estimation d'entree) ? */
  hauteurMesuree: boolean | null;
  /** Erreur des quatre coins proposes par le releve, en cm sur le mur. */
  coinsCm: number[] | null;
  /** Erreur des coins predits par le calage grossier, capteurs exacts. */
  coinsExactsCm: number[] | null;
  /** Erreur des coins predits par le calage grossier, capteurs typiques (`CAPTEURS_BANC`). */
  coinsBruitesCm: number[] | null;
  /** Coins vrais dans leur zone de recherche (capteurs typiques), sur quatre. */
  coinsDansZone: number | null;
  ms: number;
  /** Ce qui a ete detecte, pour les images de controle du script. */
  detail: { elevation: OuvertureDetectee[]; photo: OuvertureDetectee[] | null; image: Image | null; redressee: Image | null; coinsProposes: P2[] | null; coinsPredits: P2[] | null; zones: ZoneRecherche[] | null };
}

/**
 * Les erreurs typiques des capteurs d'un telephone, appliquees a chaque scene : la boussole se trompe
 * de 5 degres, le GPS de 2 m (et annonce 5 m), l'accelerometre d'un degre. Le signe et la direction
 * changent d'une scene a l'autre (par la graine), sans tirage : le banc reste reproductible. Les
 * bornes des zones de recherche (15 degres, la precision annoncee, 3 degres) les couvrent.
 */
export const CAPTEURS_BANC = { azimutDeg: 5, positionM: 2, precisionM: 5, attitudeDeg: 1 };

/** Ce que les capteurs disent d'une prise camera : position, cap, attitude, avec ou sans erreur. */
export interface CapteursSimules {
  x: number;
  y: number;
  capDeg: number;
  inclinaisonDeg: number;
  roulisDeg: number;
}

const DEG = 180 / Math.PI;

/**
 * Les capteurs d'une prise camera, dans le repere du generateur : le mur de (0, 0) a (largeur, 0), la
 * rue vers -Y (la facade regarde au sud, azimut 180). Exacts, ou avec les erreurs de `CAPTEURS_BANC`.
 */
export function capteursSimules(s: SceneFacade, p: PriseCamera, bruites: boolean): CapteursSimules {
  const st = stenope(p, s.verite.largeur);
  const vrais = {
    x: st.C[0],
    y: st.C[1],
    capDeg: (Math.atan2(st.avant[0], st.avant[1]) * DEG + 360) % 360,
    inclinaisonDeg: p.tangage ?? 0,
    roulisDeg: p.roulis ?? 0,
  };
  if (!bruites) return vrais;
  const signe = s.synthese.graine % 2 ? -1 : 1;
  const dir = (s.synthese.graine * 77 * Math.PI) / 180;
  const k = CAPTEURS_BANC;
  return {
    x: vrais.x + k.positionM * Math.cos(dir),
    y: vrais.y + k.positionM * Math.sin(dir),
    capDeg: vrais.capDeg + signe * k.azimutDeg,
    // L'attitude se lit au degre : arrondie comme `shell/boussole.ts::attitudeDepuisOrientation`.
    inclinaisonDeg: Math.round(vrais.inclinaisonDeg + signe * k.attitudeDeg),
    roulisDeg: Math.round(vrais.roulisDeg - signe * k.attitudeDeg),
  };
}

const dansZone = (q: P2, z: ZoneRecherche) => q.x >= z.x0 && q.x <= z.x1 && q.y >= z.y0 && q.y <= z.y1;
const QUATRE_INFINIS = [Infinity, Infinity, Infinity, Infinity];

/** Rejoue une scene. */
export function rejouerScene(s: SceneFacade): ResultatScene {
  const t0 = performance.now();
  const px = s.synthese.pxParM ?? 100;
  const v = s.verite;
  const elev = murSeul(s, peindreElevation(s, px, true), px);
  const detElev = detecterOuvertures(elev, px);
  const res: ResultatScene = {
    nom: s.nom,
    difficultes: s.difficultes,
    elevation: mesurerDetection(v.ouvertures, detElev),
    photo: null,
    hauteurCm: null,
    hauteurMesuree: null,
    coinsCm: null,
    coinsExactsCm: null,
    coinsBruitesCm: null,
    coinsDansZone: null,
    ms: 0,
    detail: { elevation: detElev, photo: null, image: null, redressee: null, coinsProposes: null, coinsPredits: null, zones: null },
  };
  const p = s.synthese.prise;
  const photo = photographier(s, px);
  if (p && photo && v.coins) {
    const W = photo.image.largeur,
      H = photo.image.hauteur;
    const hauteurEstimee = p.hauteurEstimee ?? v.hauteur;
    // La focale que l'application connaitrait : celle de l'EXIF, ou ses 67 degres par defaut.
    const focale = p.type === 'camera' ? (p.focaleConnue === false ? focaleParDefaut(W, H) : photo.focalePx) : null;
    const distance = p.type === 'camera' ? (p.distanceConnue === false ? null : p.distance) : (p.distance ?? null);
    const r = analyserReleve({
      photo: photo.image,
      coins: v.coins,
      largeur: v.largeur,
      hauteur: hauteurEstimee,
      focalePx: focale,
      contour: [
        { x: 0, y: 0 },
        { x: v.largeur, y: 0 },
        { x: v.largeur, y: 6 },
        { x: 0, y: 6 },
      ],
      cote: 0,
      distance,
    });
    res.detail.image = photo.image;
    if (r) {
      res.photo = mesurerDetection(v.ouvertures, r.ouvertures);
      res.hauteurCm = Math.round((r.hauteur - v.hauteur) * 100);
      res.hauteurMesuree = r.hauteurMesuree;
      res.detail.photo = r.ouvertures;
      res.detail.redressee = r.elevation;
    } else {
      res.photo = mesurerDetection(v.ouvertures, []);
    }
    if (p.type === 'camera' && focale) {
      // Le releve : la distance mesuree, le cap et l'attitude au declenchement (capteurs typiques),
      // comme `zones/releve/serie.ts::coinsDePrise` ; sans distance, le cadre a 12 %.
      const lu = capteursSimules(s, p, true);
      const proposes = distance
        ? coinsDuReleve(v.largeur, hauteurEstimee, { largeurPx: W, hauteurPx: H, focalePx: focale, distance, biaisDeg: biaisDepuisCap(lu.capDeg, 180), inclinaisonDeg: lu.inclinaisonDeg, roulisDeg: lu.roulisDeg })
        : coinsProposes(W, H, focale, distance, v.largeur, hauteurEstimee);
      res.detail.coinsProposes = proposes;
      res.coinsCm = erreurCoinsCm(proposes, v.coins, v.largeur, v.hauteur);
      // L'audit : la prise de vue situee projette le mur (calage grossier).
      const mur = { gauche: { x: 0, y: 0 }, droite: { x: v.largeur, y: 0 }, hauteur: hauteurEstimee };
      const prise = (c: CapteursSimules, precisionM: number | null): PriseDeVue => ({
        x: c.x,
        y: c.y,
        precisionM,
        azimutDeg: c.capDeg,
        sourceAzimut: 'boussole',
        inclinaisonDeg: c.inclinaisonDeg,
        roulisDeg: c.roulisDeg,
        focalePx: focale,
        largeurPx: W,
        hauteurPx: H,
        sourceFocale: p.focaleConnue === false ? 'defaut' : 'exif',
      });
      const exact = calageGrossier(mur, prise(capteursSimules(s, p, false), 0));
      res.coinsExactsCm = exact.coins ? erreurCoinsCm(exact.coins, v.coins, v.largeur, v.hauteur) : QUATRE_INFINIS;
      const bruite = calageGrossier(mur, prise(lu, CAPTEURS_BANC.precisionM));
      res.coinsBruitesCm = bruite.coins ? erreurCoinsCm(bruite.coins, v.coins, v.largeur, v.hauteur) : QUATRE_INFINIS;
      res.coinsDansZone = v.coins.filter((q, i) => {
        const z = bruite.zones[i];
        return !!z && dansZone(q, z);
      }).length;
      res.detail.coinsPredits = bruite.coins;
      res.detail.zones = bruite.zones;
    }
  }
  res.ms = Math.round(performance.now() - t0);
  return res;
}

export interface SyntheseMode {
  facades: number;
  vraies: number;
  trouvees: number;
  vp: number;
  precision: number | null;
  rappel: number | null;
  cotesMedianeCm: number | null;
  typesJustes: number;
  correctionsParFacade: number;
}

function synthetiser(mesures: MesureDetection[]): SyntheseMode {
  const vraies = mesures.reduce((s, m) => s + m.vraies, 0),
    trouvees = mesures.reduce((s, m) => s + m.trouvees, 0),
    vp = mesures.reduce((s, m) => s + m.vp, 0);
  return {
    facades: mesures.length,
    vraies,
    trouvees,
    vp,
    precision: trouvees ? vp / trouvees : null,
    rappel: vraies ? vp / vraies : null,
    cotesMedianeCm: mediane(mesures.flatMap((m) => m.cotes)),
    typesJustes: mesures.reduce((s, m) => s + m.typesJustes, 0),
    correctionsParFacade: mesures.length ? mesures.reduce((s, m) => s + m.corrections, 0) / mesures.length : 0,
  };
}

/** Un coin propose a moins de 10 cm de sa place n'a pas besoin du doigt (spec §14 : « trouve sans geste »). */
export const COIN_JUSTE_CM = 10;

export interface ResultatBanc {
  scenes: ResultatScene[];
  elevation: SyntheseMode;
  photo: SyntheseMode;
  calage: {
    coins: number;
    coinsJustes: number;
    coinsMedianeCm: number | null;
    hauteurMedianeCm: number | null;
    exactsJustes: number;
    exactsMedianeCm: number | null;
    bruitesJustes: number;
    bruitesMedianeCm: number | null;
    dansZone: number;
  };
}

const medianeCoins = (c: number[]) => mediane(c.map((e) => (Number.isFinite(e) ? e : 1e6)));

export function rejouerCorpus(scenes: SceneFacade[]): ResultatBanc {
  const res = scenes.map(rejouerScene);
  const coins = res.flatMap((r) => r.coinsCm ?? []);
  const exacts = res.flatMap((r) => r.coinsExactsCm ?? []);
  const bruites = res.flatMap((r) => r.coinsBruitesCm ?? []);
  return {
    scenes: res,
    elevation: synthetiser(res.map((r) => r.elevation)),
    photo: synthetiser(res.flatMap((r) => (r.photo ? [r.photo] : []))),
    calage: {
      coins: coins.length,
      coinsJustes: coins.filter((c) => c <= COIN_JUSTE_CM).length,
      coinsMedianeCm: medianeCoins(coins),
      hauteurMedianeCm: mediane(res.flatMap((r) => (r.hauteurCm === null ? [] : [Math.abs(r.hauteurCm)]))),
      exactsJustes: exacts.filter((c) => c <= COIN_JUSTE_CM).length,
      exactsMedianeCm: medianeCoins(exacts),
      bruitesJustes: bruites.filter((c) => c <= COIN_JUSTE_CM).length,
      bruitesMedianeCm: medianeCoins(bruites),
      dansZone: res.reduce((n, r) => n + (r.coinsDansZone ?? 0), 0),
    },
  };
}

/* ---------------------------------------------------------------------------------------------
 * Le tableau
 * ------------------------------------------------------------------------------------------- */

const pc = (v: number | null) => (v === null ? '—' : Math.round(v * 100) + ' %');
const cm = (v: number | null) => (v === null ? '—' : (Math.round(v * 10) / 10).toLocaleString('fr-FR'));
const coinCm = (v: number) => (Number.isFinite(v) ? String(Math.round(v)) : '∞');

function ligneDetection(nom: string, m: MesureDetection): string {
  return `| ${nom} | ${m.vraies} | ${m.trouvees} | ${m.vp} | ${m.fp} | ${m.fn} | ${pc(m.precision)} | ${pc(m.rappel)} | ${cm(mediane(m.cotes))} | ${m.vp ? m.typesJustes + '/' + m.vp : '—'} | ${m.corrections} |`;
}

const ENTETE_DETECTION = ['| Façade | Vraies | Trouvées | VP | FP | FN | Précision | Rappel | Cotes méd. (cm) | Types justes | Corrections |', '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|'];

function ligneSynthese(s: SyntheseMode): string {
  return `| **Ensemble** (${s.facades}) | ${s.vraies} | ${s.trouvees} | ${s.vp} | ${s.trouvees - s.vp} | ${s.vraies - s.vp} | **${pc(s.precision)}** | **${pc(s.rappel)}** | **${cm(s.cotesMedianeCm)}** | ${s.vp ? s.typesJustes + '/' + s.vp : '—'} | **${cm(s.correctionsParFacade)}** / façade |`;
}

const justes = (c: number[] | null) => (c ? c.filter((e) => e <= COIN_JUSTE_CM).length + '/4' : '—');

const atteint = (ok: boolean) => (ok ? 'atteint' : 'non atteint');

/** Le tableau du banc, en Markdown : trois sections, puis les objectifs de la spec (§14). */
export function tableau(b: ResultatBanc): string {
  const l: string[] = [];
  l.push('### Détection seule (élévation parfaite, `detecterOuvertures`)', '', ...ENTETE_DETECTION);
  for (const r of b.scenes) l.push(ligneDetection(r.nom, r.elevation));
  l.push(ligneSynthese(b.elevation), '');
  l.push('### Chaîne du relevé (photo, coins vrais, `analyserReleve`)', '', ...ENTETE_DETECTION);
  for (const r of b.scenes) if (r.photo) l.push(ligneDetection(r.nom, r.photo));
  l.push(ligneSynthese(b.photo), '');
  l.push('### Calage (coins proposés par le relevé, hauteur retenue par `analyserReleve`)', '');
  l.push('`coinsDuReleve` : distance mesurée, cap et attitude au déclenchement (capteurs typiques). Erreur en cm sur le mur : HG, HD, BD, BG.', '');
  l.push('| Façade | Coins proposés (cm) | Coins justes | Hauteur (cm) | Temps (ms) |', '|---|---|--:|--:|--:|');
  for (const r of b.scenes) {
    if (!r.photo) continue;
    const c = r.coinsCm;
    const h = r.hauteurCm === null ? '—' : (r.hauteurCm > 0 ? '+' : '') + r.hauteurCm + (r.hauteurMesuree ? ' (mesurée)' : ' (estimée)');
    l.push(`| ${r.nom} | ${c ? c.map(coinCm).join(', ') : '—'} | ${justes(c)} | ${h} | ${r.ms} |`);
  }
  const k = b.calage;
  l.push(`| **Ensemble** | médiane **${cm(k.coinsMedianeCm)}** | **${k.coinsJustes}/${k.coins}** | médiane **${cm(k.hauteurMedianeCm)}** | |`, '');
  const C = CAPTEURS_BANC;
  l.push("### Calage grossier de l'audit (`calageGrossier`, depuis la prise de vue située)", '');
  l.push(`Capteurs exacts, puis typiques : boussole à ${C.azimutDeg}°, GPS à ${C.positionM} m pour ${C.precisionM} m annoncés, attitude à ${C.attitudeDeg}°. Zone : coins vrais dans leur zone de recherche.`, '');
  l.push('| Façade | Exacts (cm) | Justes | Typiques (cm) | Justes | Dans la zone |', '|---|---|--:|---|--:|--:|');
  for (const r of b.scenes) {
    if (!r.coinsExactsCm) continue;
    l.push(`| ${r.nom} | ${r.coinsExactsCm.map(coinCm).join(', ')} | ${justes(r.coinsExactsCm)} | ${(r.coinsBruitesCm ?? []).map(coinCm).join(', ')} | ${justes(r.coinsBruitesCm)} | ${r.coinsDansZone ?? '—'}/4 |`);
  }
  l.push(`| **Ensemble** | médiane **${cm(k.exactsMedianeCm)}** | **${k.exactsJustes}/${k.coins}** | médiane **${cm(k.bruitesMedianeCm)}** | **${k.bruitesJustes}/${k.coins}** | **${k.dansZone}/${k.coins}** |`, '');
  const p = b.photo;
  const partCoins = k.coins ? k.coinsJustes / k.coins : 0;
  l.push('### Objectifs de la première version (spec §14), sur la chaîne du relevé', '');
  l.push('| Critère | Objectif | Mesuré | |', '|---|---|---|---|');
  l.push(`| Coins trouvés sans geste (≤ ${COIN_JUSTE_CM} cm) | 70 % | ${pc(partCoins)} | ${atteint(partCoins >= 0.7)} |`);
  l.push(`| Rappel | ≥ 85 % | ${pc(p.rappel)} | ${atteint((p.rappel ?? 0) >= 0.85)} |`);
  l.push(`| Précision | ≥ 90 % | ${pc(p.precision)} | ${atteint((p.precision ?? 0) >= 0.9)} |`);
  l.push(`| Erreur médiane des cotes | ≤ 5 cm | ${cm(p.cotesMedianeCm)} cm | ${atteint(p.cotesMedianeCm !== null && p.cotesMedianeCm <= 5)} |`);
  l.push(`| Corrections par façade | < 3 | ${cm(p.correctionsParFacade)} | ${atteint(p.correctionsParFacade < 3)} |`);
  return l.join('\n');
}
