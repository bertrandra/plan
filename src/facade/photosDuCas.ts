// La sequence des photos d'un cas de calibration : en ajouter (importees), en retirer, les ordonner (demande du proprietaire, 9 novembre
// 2026 : « Dans calibration je peux uploader des photos. Supprimer, ajouter, ordonner la séquence des photos. »). Pur, sans DOM.
//
// L'ordre compte pour la chaine : la premiere photo dont la focale le permet mesure la hauteur, la mosaique et l'assemblage prennent les
// photos dans cet ordre (facade/analyseMur.ts). Chaque photo emporte avec elle ce qui est a elle (son image, ses coins, ses reperes, son
// mur pose a la main, sa prise de vue, son optique) ; ce qui designe les photos par leur rang suit, ou ne vaut plus :
// - le mur confirme (V1) suit un deplacement ; une photo retiree le rend a confirmer de nouveau, comme dans l'audit
//   (app/audit/parcelle/capture.ts::retirerPhotoFacade), qui retire aussi les ouvertures relues (V3) ;
// - la verite de l'E7 (`calageVrai`) est posee en pixels de l'assemblage, que toute retouche de la sequence change : le geste la retire
//   du cas, et l'editeur la reporte (reponse du proprietaire, 9 novembre 2026 : « ne pas seulement l'effacer ») : ses coins ramenes de
//   l'ancien assemblage sur les photos qui les voient (`veriteSurLesPhotos`), qui suivent leur rang (`veriteSuivie`), puis poses sur le
//   nouvel assemblage (`veriteSurLAssemblage`). Un coin que seules des photos retirees voyaient part seul, et l'ecran le dit. Celle d'un
//   etalon se recalcule a chaque rejeu, depuis ses coins vrais, qui suivent les photos (`suivreListe`).
// Les reponses de Claude restent : celle lue sur un autre assemblage le dit d'elle-meme au rejeu (enchainement.ts, sa taille).

import { FORMAT_CAS_REEL, type CalageVrai, type CasStocke, type PhotoReelle } from './corpusReel.js';
import type { AssemblageDuMur } from './analyseMur.js';
import { appliquer, type P2 } from './vision/homographie.js';
import { inverser } from './vision/redressementFuites.js';
import { appliquerSimilitude, inverse } from './vision/ransac.js';
import type { PhotoCas } from '../model/audit.js';
import { PHOTOS_PAR_FACADE_MAX } from '../model/auditParcelle.js';
import { etapeFacade } from '../model/etapeFacade.js';

/** Le nombre de photos d'un cas : celui d'une facade de l'audit, et ce que le serveur garde (deploy/admin.php, 1 a 8). */
export const PHOTOS_PAR_CAS_MAX = PHOTOS_PAR_FACADE_MAX;

/** Le cas apres un geste sur ses photos, et, pour chaque rang nouveau, le rang qu'avait la photo (null : une photo ajoutee). */
export interface SuiteDesPhotos { cas: CasStocke; ordre: (number | null)[] }

/** Le cas aux photos prises dans cet ordre (des rangs d'avant) : images et photos ensemble, le mur confirme renumerote. */
function reordonner(cas: CasStocke, ordre: readonly number[]): CasStocke {
  const suite: CasStocke = { ...cas, images: ordre.map((k) => cas.images[k] as string), photos: ordre.map((k) => cas.photos[k] as PhotoReelle) };
  delete suite.calageVrai;
  if (cas.murConfirme) {
    const coins = cas.murConfirme.coins.flatMap((c) => { const r = ordre.indexOf(c.rang); return r < 0 ? [] : [{ ...c, rang: r }]; }).sort((a, b) => a.rang - b.rang);
    suite.murConfirme = { ...cas.murConfirme, coins };
  }
  return suite;
}

/** Retirer la photo de rang `k` : le mur confirme et les ouvertures relues sont a refaire, comme dans l'audit. */
export function sansLaPhoto(cas: CasStocke, k: number): SuiteDesPhotos {
  if (k < 0 || k >= cas.photos.length) return { cas, ordre: cas.photos.map((_, i) => i) };
  const ordre = cas.photos.map((_, i) => i).filter((i) => i !== k);
  const suite = reordonner(cas, ordre);
  delete suite.murConfirme; delete suite.ouverturesRelues;
  return { cas: suite, ordre };
}

/** Deplacer la photo de rang `de` au rang `vers` (les autres glissent d'un cran) : la meme sequence, dans un autre ordre. */
export function photoDeplacee(cas: CasStocke, de: number, vers: number): SuiteDesPhotos {
  const n = cas.photos.length, identite = cas.photos.map((_, i) => i);
  if (de < 0 || de >= n || vers < 0 || vers >= n || de === vers) return { cas, ordre: identite };
  const ordre = identite.filter((i) => i !== de);
  ordre.splice(vers, 0, de);
  return { cas: reordonner(cas, ordre), ordre };
}

/** Une photo importee, prete a entrer dans un cas : son image (l'adresse du JPEG reduit) et sa photo (son optique, sa prise s'il y en a). */
export interface PhotoImportee { image: string; photo: PhotoReelle }

/**
 * Une photo preparee comme dans l'audit (app/audit/photo.ts::preparerPhoto : reduite a 1 280 px, l'EXIF lu avant la reduction et range
 * dans l'optique, toujours) devient une photo de cas : son optique et sa prise gardees, des coins provisoires (le cadre a 12 % des
 * bords, comme les reperes par defaut) que le rejeu remplace par ceux qu'il trouve ; ils ne sont pas une entree (pas a la main).
 */
export function photoImportee(p: PhotoCas, fichier: string): PhotoImportee {
  const l = p.optique?.reduite.largeurPx ?? 1000, h = p.optique?.reduite.hauteurPx ?? 1000;
  const coins = [{ x: l * 0.12, y: h * 0.12 }, { x: l * 0.88, y: h * 0.12 }, { x: l * 0.88, y: h * 0.88 }, { x: l * 0.12, y: h * 0.88 }];
  return {
    image: 'data:' + p.type + ';base64,' + p.base64,
    photo: {
      fichier, coins,
      ...(p.prise ? { prise: JSON.parse(JSON.stringify(p.prise)) as NonNullable<PhotoCas['prise']> } : {}),
      ...(p.optique ? { optique: JSON.parse(JSON.stringify(p.optique)) as NonNullable<PhotoCas['optique']> } : {}),
    },
  };
}

/** Un nom de fichier libre dans le cas pour une photo importee (`import-1`, `import-2`…) : les noms restent uniques. */
export function nomLibre(cas: Pick<CasStocke, 'photos'>, deja: readonly string[] = []): string {
  const pris = new Set([...cas.photos.map((p) => p.fichier), ...deja]);
  let k = 1;
  while (pris.has('import-' + k)) k++;
  return 'import-' + k;
}

/** Ajouter des photos importees a la fin de la sequence, dans la limite du cas ; rend aussi celles qui n'y entrent pas. */
export function avecLesPhotos(cas: CasStocke, ajouts: readonly PhotoImportee[]): SuiteDesPhotos & { refusees: number } {
  const place = Math.max(0, PHOTOS_PAR_CAS_MAX - cas.photos.length), pris = ajouts.slice(0, place);
  const ordre = [...cas.photos.map((_, i): number | null => i), ...pris.map(() => null)];
  if (!pris.length) return { cas, ordre, refusees: ajouts.length };
  const suite: CasStocke = { ...cas, images: [...cas.images, ...pris.map((a) => a.image)], photos: [...cas.photos, ...pris.map((a) => a.photo)] };
  delete suite.calageVrai;
  return { cas: suite, ordre, refusees: ajouts.length - pris.length };
}

/** Ce qui est range par rang (dimensions, origine des coins) suit les photos ; une photo ajoutee n'a rien. */
export function suivreLesRangs<T>(r: Readonly<Record<number, T>>, ordre: readonly (number | null)[]): Record<number, T> {
  return Object.fromEntries(ordre.flatMap((avant, k): [number, T][] => (avant !== null && r[avant] !== undefined ? [[k, r[avant] as T]] : [])));
}

/** Une liste par photo (les coins vrais d'un etalon) suit les photos ; une photo ajoutee prend `defaut`. */
export function suivreListe<T>(l: readonly T[], ordre: readonly (number | null)[], defaut: T): T[] {
  return ordre.map((avant) => (avant !== null && avant < l.length ? l[avant] as T : defaut));
}

/**
 * Un cas neuf, tire de photos importees (reponse du proprietaire, 9 novembre 2026 : « Nouveau cas depuis des photos ») : sans contexte
 * du plan (ni gabarit, ni corps du toit, ni cote du contour, ni origine du repere), ce que `entreesDuCas` sait deja rejouer, comme un cas
 * d'avant : un mur rectangulaire face au sud, l'E10 sautee, le GPS de l'EXIF non projete. La largeur et la hauteur du mur se donnent a la
 * main (celles d'un cas neuf d'avant le lot F6 par defaut) ; un audit les tirerait du cadastre et du LiDAR.
 */
export function casDepuisLesPhotos(ajouts: readonly PhotoImportee[], nom = ''): CasStocke {
  const pris = ajouts.slice(0, PHOTOS_PAR_CAS_MAX);
  return {
    format: FORMAT_CAS_REEL, version: 1, nom, statut: 'brouillon', source: 'admin (photos importées)', largeurM: 9, hauteurM: 5,
    photos: pris.map((a) => a.photo), images: pris.map((a) => a.image), ouvertures: [],
  };
}

/** Un coin du mur vrai : haut gauche, haut droit, bas droit, bas gauche. */
export type CoinVrai = 'hg' | 'hd' | 'bd' | 'bg';
const COINS_VRAIS: readonly CoinVrai[] = ['hg', 'hd', 'bd', 'bg'];

/** Un coin du mur vrai sur une photo : son rang, ses pixels sur elle, et s'il tombe dans son cadre (la photo le voit). */
export interface CoinSurUnePhoto { rang: number; p: P2; vu: boolean }

/**
 * La verite de l'E7 attachee aux photos, et non plus a un assemblage : chaque coin du mur vrai, sur chaque photo de l'assemblage d'ou il
 * vient. Les pixels d'une photo ne bougent pas quand la sequence change ; l'assemblage, si. `egout` et `sol` : la verite les portait
 * (sinon les coins prennent la hauteur du mur pose, et seuls les bouts se reportent).
 */
export interface VeriteSurLesPhotos { versionChaine: number; egout: boolean; sol: boolean; coins: Record<CoinVrai, CoinSurUnePhoto[]> }

const moyenne = (l: readonly number[]) => l.reduce((a, b) => a + b, 0) / l.length;
/** Une tolerance d'un pixel au bord du cadre : un coin pose sur le bord de la photo est vu. */
const dansLeCadre = (p: P2, t: { l: number; h: number } | null | undefined) => !!t && p.x >= -1 && p.y >= -1 && p.x <= t.l + 1 && p.y <= t.h + 1;

/**
 * La verite de l'E7 (en pixels de l'assemblage `pose`) ramenee sur les photos de cet assemblage (assemblage -> vue de face -> photo), le
 * chemin meme d'un mur tire (analyseMur.ts::murSurLesPhotos). `tailles` : la taille de chaque photo, par rang, pour savoir laquelle voit
 * chaque coin. Null sans assemblage ou sans photo assemblee.
 */
export function veriteSurLesPhotos(vrai: CalageVrai, pose: AssemblageDuMur | null | undefined, tailles: readonly ({ l: number; h: number } | null)[]): VeriteSurLesPhotos | null {
  if (!pose || pose.coins.length !== 4 || !pose.retours.some(Boolean)) return null;
  const [hgm, hdm, bdm, bgm] = pose.coins as [P2, P2, P2, P2];
  const haut = vrai.egout ?? (hgm.y + hdm.y) / 2, bas = vrai.sol ?? (bdm.y + bgm.y) / 2;
  const dans: Record<CoinVrai, P2> = { hg: { x: vrai.x0, y: haut }, hd: { x: vrai.x1, y: haut }, bd: { x: vrai.x1, y: bas }, bg: { x: vrai.x0, y: bas } };
  const coins = { hg: [], hd: [], bd: [], bg: [] } as Record<CoinVrai, CoinSurUnePhoto[]>;
  pose.retours.forEach((r, rang) => {
    const inv = r ? inverse(r.place) : null;
    if (!r || !inv) return;
    for (const c of COINS_VRAIS) { const p = appliquer(r.versPhoto, appliquerSimilitude(inv, dans[c])); if (Number.isFinite(p.x) && Number.isFinite(p.y)) coins[c].push({ rang, p, vu: dansLeCadre(p, tailles[rang]) }); }
  });
  return { versionChaine: vrai.versionChaine, egout: vrai.egout !== undefined, sol: vrai.sol !== undefined, coins };
}

/**
 * La verite attachee aux photos apres un geste sur la sequence (`ordre` : pour chaque rang nouveau, le rang d'avant ; null, une photo
 * ajoutee) : chaque coin suit ses photos. Un coin que des photos voyaient ne garde que celles qui restent : s'il ne tombait que sur des
 * photos retirees, il part (une photo ajoutee ne l'a jamais vu). Un coin qu'aucune ne voyait (hors de tous les cadres) garde toutes celles
 * qui restent : il se prolonge par elles, comme sur l'ancien assemblage.
 */
export function veriteSuivie(v: VeriteSurLesPhotos, ordre: readonly (number | null)[]): VeriteSurLesPhotos {
  const suivre = (l: readonly CoinSurUnePhoto[]) => {
    const portee = l.some((x) => x.vu) ? l.filter((x) => x.vu) : l;
    return portee.flatMap((x) => { const k = ordre.indexOf(x.rang); return k < 0 ? [] : [{ ...x, rang: k }]; });
  };
  return { ...v, coins: { hg: suivre(v.coins.hg), hd: suivre(v.coins.hd), bd: suivre(v.coins.bd), bg: suivre(v.coins.bg) } };
}

/** Ce qu'une verite reportee a garde : le mur vrai sur le nouvel assemblage (null : ses bouts ne se reportent pas), et ce qui en est parti. */
export interface VeriteReportee { vrai: CalageVrai | null; perdus: ('bout gauche' | 'bout droit' | 'égout' | 'sol')[] }

/**
 * La verite attachee aux photos posee sur le nouvel assemblage (photo -> vue de face -> assemblage) : chaque coin a la moyenne de ce que
 * donnent les photos assemblees qui le portent, puis chaque bout, l'egout et le sol a la moyenne de ses deux coins (un seul suffit : le
 * mur est de face sur l'assemblage). Les bouts sont la verite meme (`x0 < x1`) : sans l'un d'eux, il n'y a plus de mur vrai. La version
 * de la chaine reste celle ou la verite a ete posee.
 */
export function veriteSurLAssemblage(v: VeriteSurLesPhotos, pose: AssemblageDuMur | null | undefined): VeriteReportee {
  const surLAssemblage = (c: CoinVrai): P2 | null => {
    const l = v.coins[c].flatMap((x) => {
      const r = pose?.retours[x.rang], versVue = r ? inverser(r.versPhoto) : null;
      const q = r && versVue ? appliquerSimilitude(r.place, appliquer(versVue, x.p)) : null;
      return q && Number.isFinite(q.x) && Number.isFinite(q.y) ? [q] : [];
    });
    return l.length ? { x: moyenne(l.map((q) => q.x)), y: moyenne(l.map((q) => q.y)) } : null;
  };
  const p = Object.fromEntries(COINS_VRAIS.map((c) => [c, surLAssemblage(c)])) as Record<CoinVrai, P2 | null>;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const deux = (a: number | undefined, b: number | undefined) => { const l = [a, b].filter((x): x is number => x !== undefined); return l.length ? r1(moyenne(l)) : null; };
  const x0 = deux(p.hg?.x, p.bg?.x), x1 = deux(p.hd?.x, p.bd?.x);
  const egout = v.egout ? deux(p.hg?.y, p.hd?.y) : null, sol = v.sol ? deux(p.bg?.y, p.bd?.y) : null;
  const perdus: VeriteReportee['perdus'] = [];
  if (x0 === null) perdus.push('bout gauche');
  if (x1 === null) perdus.push('bout droit');
  if (v.egout && egout === null) perdus.push('égout');
  if (v.sol && sol === null) perdus.push('sol');
  if (x0 === null || x1 === null || !(x1 > x0)) return { vrai: null, perdus };
  return { vrai: { x0, x1, ...(egout !== null ? { egout } : {}), ...(sol !== null ? { sol } : {}), versionChaine: v.versionChaine }, perdus };
}

/** Ce que l'ecran dit d'une verite que rien ne reporte : l'assemblage ou elle etait posee ne se refait pas (aucune photo ne s'y assemble). */
export const VERITE_SANS_ASSEMBLAGE = 'La vérité de l’' + etapeFacade('calage').numero + ' (le mur vrai) est retirée : l’assemblage où elle était posée ne se refait pas. Posez-la de nouveau sur le nouvel assemblage.';

/** Ce que l'ecran dit d'une verite reportee (null : il n'y avait rien a reporter). */
export function texteDuReport(r: VeriteReportee | null): string | null {
  if (!r) return null;
  const liste = (l: readonly string[]) => (l.length > 1 ? l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1] : l[0] ?? '');
  const art = (m: string) => (m === 'égout' ? 'l’égout' : 'le ' + m);
  const e7 = 'La vérité de l’' + etapeFacade('calage').numero + ' (le mur vrai)';
  const pourquoi = (n: number) => (n > 1 ? ' ne se voyaient' : ' ne se voyait') + ' que sur des photos retirées, ou que le nouvel assemblage ne prend pas';
  if (!r.vrai) return e7 + ' est retirée : ' + liste(r.perdus.map(art)) + pourquoi(r.perdus.length) + ', et sans ses deux bouts il n’y a plus de mur vrai. Posez-la de nouveau sur le nouvel assemblage.';
  if (!r.perdus.length) return e7 + ' est reportée sur le nouvel assemblage, par les photos qui la voient.';
  return e7 + ' est reportée sur le nouvel assemblage, sans ' + liste(r.perdus.map(art)) + ' : ' + (r.perdus.length > 1 ? 'ils' : 'il') + pourquoi(r.perdus.length) + '.';
}
