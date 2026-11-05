// Les etalons de synthese : les scenes du banc des facades (tests/fixtures/facades/, rendues par synthese.ts) montrees dans Admin ›
// Calibration comme des cas, a cote des cas reels, pour juger a l'oeil si elles ressemblent a la realite.
//
// Un etalon est un cas de calibration fabrique a la demande depuis sa scene : ses photos rendues (la prise principale, puis ses autres
// vues), la verite (dimensions, ouvertures, gabarit vrai), et ce que l'audit aurait eu sous la main : le mur au sud d'un batiment de
// 10 m de profondeur, et pour une prise par camera, le GPS a 1 m, la boussole vers le mur et la focale de l'EXIF (quand la scene la dit
// connue), comme .claude/skills/facades/scripts/calage-e5.ts. Les coins vrais sont gardes avec chaque photo pour memoire : ils ne sont
// pas une entree, la chaine cherche le mur comme dans l'audit.
//
// Un etalon ne s'ecrit nulle part : ni sur le serveur (admin/calibration-cas), ni dans les reglages calibres. Il ne compte pas dans
// « Mesurer et calibrer » : un seuil regle sur le corpus qui a servi a l'ecrire ne prouverait rien sur le terrain.

import { FORMAT_CAS_REEL, type CalageVrai, type CasReel } from '../corpusReel.js';
import { appliquer, type Image, type P2 } from '../vision/homographie.js';
import { inverser } from '../vision/redressementFuites.js';
import { appliquerSimilitude } from '../vision/ransac.js';
import { VERSION_CHAINE_FACADES } from '../releve/chaine.js';
import type { AssemblageDuMur } from '../analyseMur.js';
import type { PrisePhoto } from '../../model/audit.js';
import type { Facade } from '../../geometry/cotesVusDeDehors.js';
import type { TypeOuverture } from '../../model/types.js';
import type { IdEtape } from '../../model/etapeFacade.js';
import { aUnProjet } from './projetEtalon.js';
import type { Obstacle } from './synthese.js';
import { coinsVrais, gabaritVrai, partiesBassesSynthese, photographier, type PriseCamera, type PriseCoins, type SceneFacade } from './synthese.js';

/** L'identifiant d'un etalon : son nom de scene, precede de ce prefixe (jamais celui d'un cas du serveur, `cas-…`). */
export const PREFIXE_ETALON = 'etalon-';

/**
 * La fiche d'un etalon dans le catalogue : ce qu'il couvre, lu de sa scene (jamais ecrit a la main, il ne peut pas s'en ecarter). C'est
 * elle qu'on lit pour choisir un etalon existant au lieu de fabriquer une scene ou un projet de test (skill facades, « Catalogue des
 * etalons »).
 */
export interface FicheEtalon {
  /** Le nom de la scene, qui est aussi le nom de son fichier (sans `.json`) : l'identifiant stable de l'etalon. */
  nom: string;
  description: string;
  difficultes: string[];
  prise: 'camera' | 'coins' | null;
  /** Le nombre de photos : la prise principale et ses autres vues du mur entier. */
  photos: number;
  /** Le plus fort biais des prises, en degres (0 : de face). */
  biaisDeg: number;
  focaleConnue: boolean;
  distorsion: boolean;
  largeurM: number;
  hauteurM: number;
  parement: 'enduit' | 'brique' | 'pierre';
  soubassement: boolean;
  /** La hauteur du pignon au-dessus de l'egout, en metres (0 : mur gouttereau), et ou tombe son sommet (0,5 : au milieu). */
  pignonM: number;
  pignonSommet: number;
  /** Les parties basses du mur (un mur en L : une ; une partie haute au milieu : deux). */
  partiesBasses: number;
  obstacles: Obstacle['type'][];
  ombres: ('debord' | 'quad' | 'arbre')[];
  balcons: number;
  /** Les ouvertures de la verite par type, et ce que leur rendu a de particulier (volets, cintre, ebrasement…). */
  ouvertures: Partial<Record<TypeOuverture, number>>;
  details: string[];
  /** Les etapes de la facade (model/etapeFacade.ts) que l'etalon met surtout a l'epreuve. */
  etapes: IdEtape[];
}

/** Ce que la liste montre d'un etalon, sans rien rendre : son identifiant d'ecran et sa fiche. */
export interface ResumeEtalon extends FicheEtalon {
  id: string;
  /** Le nombre d'ouvertures de la verite. */
  nbOuvertures: number;
  /** L'etalon a un projet de demonstration (projetEtalon.ts) : « Créer le projet de démonstration » est propose. */
  projet: boolean;
}

const sansDoublon = <T,>(l: readonly T[]): T[] => [...new Set(l)];

/** La fiche d'une scene : ce qu'elle couvre. */
export function ficheEtalon(s: SceneFacade): FicheEtalon {
  const y = s.synthese, m = y.mur, prises = prisesDeLaScene(s);
  const cameras = prises.filter((p): p is PriseCamera => p.type === 'camera');
  const ouvertures: Partial<Record<TypeOuverture, number>> = {};
  for (const o of s.verite.ouvertures) ouvertures[o.type] = (ouvertures[o.type] ?? 0) + 1;
  const details = sansDoublon(s.verite.ouvertures.flatMap((o) => {
    const r = o.rendu;
    return [r?.volets ? 'volets ' + r.volets.type : null, r?.forme ?? null, r?.ebrasement ? 'ebrasement' : null, r?.carreaux ? 'petits bois' : null].filter((x): x is string => !!x);
  }).concat(y.balcons?.some((b) => b.gardeCorps) ? ['garde-corps'] : [], m.bandeaux?.length ? ['bandeau'] : [], m.toit ? ['bande de toit'] : [], m.degrade ? ['eclairage en degrade'] : [], m.pignonCoupe ? ['cul de geai (demi-croupe)' + (m.pignonCoupe.debordFaitageM ? ', faitage debordant' : '')] : []));
  const pignonM = m.pignon ?? 0, partiesBasses = partiesBassesSynthese(s).length, distorsion = cameras.some((p) => !!p.distorsion);
  const biaisDeg = Math.max(0, ...cameras.map((p) => Math.abs(p.biais ?? 0)));
  const etapes: IdEtape[] = ['redressement'];
  if (prises.length > 1) etapes.push('assemblage');
  etapes.push('calage');
  if (pignonM > 0 || partiesBasses > 0) etapes.push('silhouette', 'diagnostic');
  etapes.push('texture', 'ouvertures');
  return {
    nom: s.nom, description: s.description, difficultes: [...s.difficultes], prise: y.prise?.type ?? null, photos: prises.length, biaisDeg,
    focaleConnue: cameras.every((p) => p.focaleConnue !== false), distorsion, largeurM: s.verite.largeur, hauteurM: s.verite.hauteur,
    parement: m.parement.type, soubassement: !!m.soubassement, pignonM, pignonSommet: m.pignonSommet ?? 0.5, partiesBasses,
    obstacles: sansDoublon((y.devant ?? []).map((o) => o.type)), ombres: sansDoublon((y.ombres ?? []).map((o) => o.type)), balcons: y.balcons?.length ?? 0,
    ouvertures, details, etapes,
  };
}

/** Les prises d'une scene : la principale, puis ses autres vues. */
export function prisesDeLaScene(s: SceneFacade): (PriseCamera | PriseCoins)[] {
  return s.synthese.prise ? [s.synthese.prise, ...(s.synthese.vues ?? [])] : [];
}

export function resumeEtalon(s: SceneFacade): ResumeEtalon {
  return { ...ficheEtalon(s), id: PREFIXE_ETALON + s.nom, nbOuvertures: s.verite.ouvertures.length, projet: aUnProjet(s.nom) };
}

/**
 * La prise de vue de l'audit pour une camera du banc : le GPS a sa place (a 1 m pres), la boussole vers le mur, l'EXIF de sa focale ; la
 * meme que calage-e5.ts, sauf une focale que la scene dit inconnue (`focaleConnue: false`), qui n'a pas d'EXIF.
 */
export function priseDeLaCamera(p: PriseCamera, L: number): PrisePhoto {
  const b = ((p.biais ?? 0) * Math.PI) / 180;
  const exif = p.focaleConnue !== false;
  return {
    t: '2026-11-02T10:00:00.000Z', x: L / 2 + p.distance * Math.sin(b), y: -p.distance * Math.cos(b), lat: null, lon: null, precisionM: 1,
    azimutDeg: (360 - (p.biais ?? 0)) % 360, sourceAzimut: 'boussole',
    champDeg: exif ? (2 * Math.atan(18 / (p.focale35 ?? 26)) * 180) / Math.PI : null, sourceFocale: exif ? 'exif' : null,
  };
}

/** Une photo rendue d'un etalon : l'image (les pixels du banc, tels quels), sa focale vraie et les coins vrais du mur. */
export interface PhotoEtalon { image: Image; focalePx: number | null; coins: P2[] | null; prise: PrisePhoto | null }

/** Rend les photos d'une scene, a la resolution du banc (`pxParM`, 100 par defaut) : les memes pixels que banc.ts. */
export function photosDeLEtalon(s: SceneFacade): PhotoEtalon[] {
  const px = s.synthese.pxParM ?? 100;
  return prisesDeLaScene(s).flatMap((p) => {
    const ph = photographier(s, px, p);
    if (!ph) return [];
    return [{ image: ph.image, focalePx: ph.focalePx, coins: coinsVrais(s, p), prise: p.type === 'camera' ? priseDeLaCamera(p, s.verite.largeur) : null }];
  });
}

/** Le cote du mur dans le repere du plan (au sud d'un batiment de 10 m de profondeur), comme calage-e5.ts. */
function facadeDeLEtalon(L: number, H: number): { facade: Facade; contour: P2[] } {
  return {
    facade: { cote: 0, gauche: { x: 0, y: 0 }, droite: { x: L, y: 0 }, largeur: L, hauteur: H, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' },
    contour: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 10 }, { x: 0, y: 10 }],
  };
}

/** Quatre coins par defaut quand la scene n'en donne pas (une photo sans mur visible) : le cadre a 12 %, pour memoire seulement. */
const cadre = (img: Image): P2[] => {
  const mx = img.largeur * 0.12, my = img.hauteur * 0.12;
  return [{ x: mx, y: my }, { x: img.largeur - mx, y: my }, { x: img.largeur - mx, y: img.hauteur - my }, { x: mx, y: img.hauteur - my }];
};

/**
 * Le cas d'un etalon : la verite de la scene (dimensions, ouvertures sans leur rendu, gabarit vrai), ses photos rendues et ce que l'audit
 * en aurait su. `fichiers` nomme chaque photo (l'adresse que l'ecran lui donne). Toujours un brouillon : un etalon ne compte pas.
 */
export function casDeLEtalon(s: SceneFacade, photos: readonly PhotoEtalon[], fichiers: readonly string[]): CasReel {
  const L = s.verite.largeur, H = s.verite.hauteur;
  return {
    format: FORMAT_CAS_REEL, version: 1, nom: s.nom, statut: 'brouillon', source: 'étalon de synthèse (banc des façades)',
    largeurM: L, hauteurM: H,
    photos: photos.map((p, k) => ({ fichier: fichiers[k] ?? 'photo-' + (k + 1), coins: (p.coins ?? cadre(p.image)).map(({ x, y }) => ({ x, y })), focalePx: p.focalePx, ...(p.prise ? { prise: p.prise } : {}) })),
    ouvertures: s.verite.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })),
    difficultes: [...s.difficultes],
    gabarit: gabaritVrai(s).map(({ u, v }) => ({ u, v })),
    ...facadeDeLEtalon(L, H),
  };
}

/**
 * Les coins vrais du mur sur chaque photo, a garder pour la verite de l'E5 : null pour une photo d'un objectif deformant (la chaine
 * travaille sur l'image corrigee de la distorsion, ou les coins de la photo ne tombent plus, calage-e5.ts) ou sans coins.
 */
export function coinsVraisDesPhotos(s: SceneFacade): (P2[] | null)[] {
  return prisesDeLaScene(s).map((p) => (p.type === 'camera' && p.distorsion ? null : coinsVrais(s, p)));
}

/**
 * Le mur vrai sur l'image prise pour la suite par un rejeu (l'E5 de la calibration le compare a la pose retenue) : les coins vrais d'une
 * photo assemblee, portes par le meme chemin que la chaine (photo -> vue de face -> assemblage, l'inverse de `retours`), comme
 * runIa.ts et egout-sol.ts le font sur leur assemblage. Il vaut pour cet assemblage-la, a cette version de la chaine : un autre (des
 * reperes poses, un mur tire) en demande un autre. Null sans photo assemblee qui ait ses coins vrais.
 */
export function calageVraiDuRejeu(pose: AssemblageDuMur | null | undefined, coins: readonly (P2[] | null)[]): CalageVrai | null {
  if (!pose) return null;
  for (let k = 0; k < pose.retours.length; k++) {
    const r = pose.retours[k], c = coins[k];
    const versVue = r ? inverser(r.versPhoto) : null;
    if (!r || !versVue || !c || c.length !== 4) continue;
    const [hg, hd, bd, bg] = c.map((q) => appliquerSimilitude(r.place, appliquer(versVue, q))) as [P2, P2, P2, P2];
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return { x0: r1((hg.x + bg.x) / 2), x1: r1((hd.x + bd.x) / 2), egout: r1((hg.y + hd.y) / 2), sol: r1((bg.y + bd.y) / 2), versionChaine: VERSION_CHAINE_FACADES };
  }
  return null;
}
