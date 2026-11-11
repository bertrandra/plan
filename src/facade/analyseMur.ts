// L'analyse d'un mur depuis ses photos calees : la seule entree des trois chaines (une photo, des morceaux cote a cote, des vues
// du mur entier). Le releve de facade (facade/releve/analyseSerie.ts), l'audit de la parcelle (app/audit/parcelle/mesures.ts) et la
// calibration (facade/corpusReel.ts) passent tous par elle : ce que l'un redresse, fusionne et cote, les autres le redressent,
// le fusionnent et le cotent de meme.

import { analyserReleve, cadreDeLaSilhouette, etendreAuCadre, finaliserReleve, mesurerHauteur, silhouetteEnPartsDuMur, type EntreeAnalyse, type ResultatAnalyse } from './analyse.js';
import { mosaiqueDesVues, vuesDeFace, type ResultatMosaique as ResultatMosaiqueFuites } from './vision/mosaiqueFuites.js';
import { inverser, redresserParReperes, type RedressementFuites } from './vision/redressementFuites.js';
import { appliquerSimilitude, inverse, IDENTITE as SIMILITUDE_IDENTITE, type Similitude } from './vision/ransac.js';
import { appliquer, homographie, redresser, resolutionTexture, type Homographie } from './vision/homographie.js';
import { echelleDuGabarit, gabaritALEchelle, rectDesCoins, type GabaritMur } from './gabaritMur.js';
import { analyserMosaique, type ResultatMosaique } from './vision/mosaique.js';
import { analyserVues, type ResultatFusion } from './fusion.js';
import { CHAMP_GRAND_COTE_DEFAUT, focalePx } from './vision/cadrage.js';
import { partiesBassesDuGabarit } from './profil.js';
import type { Image, P2 } from './vision/homographie.js';

/** Comment plusieurs photos d'un mur se combinent : des morceaux cote a cote, ou des vues du mur entier a fondre. */
export type AssemblageMur = 'morceaux' | 'vues';

/** Une photo calee : l'image, les quatre coins du mur (hg, hd, bd, bg) et la focale quand on la connait. */
export interface PhotoDuMur {
  photo: Image;
  coins: P2[];
  focalePx: number | null;
  /** La silhouette du haut du mur sur la photo (ajustee a la main, ou lue entre ses coins) : elle dit le toit quand elle a une forme. */
  silhouette?: P2[] | null;
  /** Quatre reperes poses a la main (un rectangle du mur) : ils redressent la photo entiere avant l'assemblage. */
  reperes?: P2[] | null;
  /** Le mur vient des pignons lus sur l'assemblage : le gabarit se tend entre son egout et son sol (serie.ts::Morceau). */
  gabaritTendu?: boolean;
}

/** Ce que le mur donne a toutes les photos : sa largeur (le plan), sa hauteur estimee, le batiment et la distance. */
export type MurAnalyse = Pick<EntreeAnalyse, 'largeur' | 'hauteur' | 'contour' | 'cote' | 'distance'>;

/** L'analyse, et selon l'assemblage, ce que la fusion ou la mosaique en disent. */
export interface AnalyseMur {
  r: ResultatAnalyse;
  /** L'assemblage d'ou vient l'analyse (une photo seule, ou des vues du mur entier) ; absent : la fusion, les morceaux. */
  assemblage?: AssemblageDuMur;
  fusion?: ResultatFusion;
  mosaique?: ResultatMosaique;
}

/**
 * Analyse un mur : une photo, c'est le mur entier entre ses coins ; plusieurs, des vues a fondre (`vues`) ou des morceaux a
 * assembler (`morceaux`). Null quand rien ne se redresse.
 */
export function analyserLeMur(murSeul: MurAnalyse, photos: readonly PhotoDuMur[], assemblage: AssemblageMur = 'morceaux', vuesFaites: VuesAssemblees | null = null): AnalyseMur | null {
  // Une photo seule, ou des vues du mur entier : l'assemblage des photos redressees entieres est l'image prise pour la suite
  // (decision de l'utilisateur, 21 octobre 2026). Un mur en L aussi : sa marche est dans le gabarit. `vuesFaites` : les vues de face et
  // leur mosaique deja faites (l'E5 et l'E6 de l'orchestrateur, facade/releve/enchainement.ts), les memes que celles qu'on referait ici.
  const asm = photos.length && (photos.length === 1 || assemblage === 'vues') ? assemblerLeMur(photos, vuesFaites) : null;
  // La silhouette du haut du mur, en parts du mur, depuis la premiere photo qui en a une : chaque photo ramene le meme mur au meme
  // rectangle, la silhouette vaut pour la fusion comme pour la photo seule. Elle se pose sur le mur trouve par son sol et a l'echelle de
  // sa largeur (gabaritMur.ts::echelleDuGabarit, decision du proprietaire, 4 novembre 2026), lue sur l'assemblage, la vue de face ou le
  // mur a ete trouve (une photo de biais ne dit pas ses proportions) ; sans assemblage, entre l'egout et le sol, comme avant.
  const avec = photos.find((p) => p.silhouette && p.silhouette.length >= 2);
  const enParts = avec ? silhouetteEnPartsDuMur(avec.coins, avec.silhouette) : null;
  // Un mur pose par les pignons (calagePignons.ts) : l'egout et le sol y viennent de deux niveaux lus sur la photo, a son echelle des
  // hauteurs ; le gabarit se tend entre eux, ses pointes tombent alors sur les pignons de la photo.
  const k = asm && !photos.some((p) => p.gabaritTendu) ? echelleDuGabarit(murSeul.hauteur / murSeul.largeur, rectDesCoins(asm.coins)) : 1;
  const silhouette = enParts ? gabaritALEchelle(enParts, k) : null;
  const a = analyserLeMurSansMarche(murSeul, photos, assemblage, asm, silhouette ? [...silhouette] : null);
  if (!a || a.r.partiesBasses.length) return a;
  // Un mur a plusieurs hauteurs d'egout (une partie basse dans l'alignement, garage ou extension, a un bout ou a chacun) : ses marches
  // sont dans le gabarit, la silhouette du plan et du LiDAR posee sur la photo (facade/profil.ts::partiesBassesDuGabarit), a la hauteur
  // mesuree du mur. La detection et le calage les ont deja suivies (ils lisent la silhouette) ; elles s'ecrivent ici sur le releve, les
  // memes pour l'audit, le releve et la calibration. Les marches se lisent sur le gabarit lui-meme (sous son egout), leurs hauteurs a la
  // pose (`k` fois celle du mur trouve).
  const parties = enParts ? partiesBassesDuGabarit(enParts, murSeul.largeur, a.r.hauteur * k) : [];
  return parties.length ? { ...a, r: { ...a.r, partiesBasses: parties } } : a;
}

function analyserLeMurSansMarche(murSeul: MurAnalyse, photos: readonly PhotoDuMur[], assemblage: AssemblageMur, asm: AssemblageDuMur | null, silhouette: { u: number; v: number }[] | null): AnalyseMur | null {
  const p0 = photos[0];
  if (!p0) return null;
  const mur = { ...murSeul, silhouette };
  if (photos.length === 1 || assemblage === 'vues') {
    const a = asm;
    // La hauteur se mesure sur la premiere photo dont la focale le permet ; l'estimation du plan sert de repli.
    const mesuree = photos.map((p) => (p.focalePx ? mesurerHauteur(p.coins, mur.largeur, p.focalePx, p.photo.largeur, p.photo.hauteur) : null)).find((h) => h !== null) ?? null;
    // Une photo seule : son assemblage et la photo elle-meme sont le meme plan, le mur pose par les memes coins. L'analyse la
    // redresse en une passe depuis la photo d'origine, plutot que depuis l'assemblage deja reechantillonne (une de moins, la
    // nettete des baies vues de biais) ; l'assemblage reste ce qui est montre et rendu.
    const source = a && photos.length === 1 ? photoCommeAssemblage(p0) : a;
    const r = source ? analyserLAssemblage({ ...mur, hauteur: mesuree ?? mur.hauteur }, source, mur.silhouette, mesuree !== null) : null;
    if (r && a) {
      const fusion = fondreLesVues(mur, photos, a, mur.silhouette);
      return fusion ? { r: fusion, assemblage: a, fusion } : { r, assemblage: a };
    }
  }
  if (photos.length > 1 && assemblage === 'vues') {
    const r = analyserVues({ ...mur, vues: photos.map((p) => ({ photo: p.photo, coins: p.coins, focalePx: p.focalePx })) });
    return r ? { r, fusion: r } : null;
  }
  if (photos.length === 1) {
    const r = analyserReleve({ ...mur, photo: p0.photo, coins: p0.coins, focalePx: p0.focalePx });
    return r ? { r } : null;
  }
  // Des morceaux se mettent a l'echelle par leur focale : inconnue, celle du champ d'un telephone.
  const r = analyserMosaique({ ...mur, morceaux: photos.map((p) => ({ photo: p.photo, coins: p.coins, focalePx: p.focalePx ?? focalePx(p.photo.largeur, p.photo.hauteur, CHAMP_GRAND_COTE_DEFAUT) })) });
  return r ? { r, mosaique: r } : null;
}

/**
 * Chaque photo vue de face, entiere, comme l'assemblage la prend (l'E5) : ses reperes, sinon ses points de fuite ; une photo sans
 * reperes qui ne se redresse pas par ses points de fuite se redresse par ses coins, un rectangle du mur eux aussi. Null sinon.
 */
export function vuesDeLAssemblage(photos: readonly { photo: Image; coins: readonly P2[]; reperes?: readonly P2[] | null }[]): (RedressementFuites | null)[] {
  return vuesDeLAssemblageDites(photos).vues;
}

/**
 * Les vues de face (vuesDeLAssemblage), et pour chacune si elle vient des coins du mur (`parCoins`) : ni reperes ni points de fuite. Une
 * telle vue change avec le mur ; les autres non (facade/releve/chaine.ts::reporterLeMurTire).
 */
export function vuesDeLAssemblageDites(photos: readonly { photo: Image; coins: readonly P2[]; reperes?: readonly P2[] | null }[]): { vues: (RedressementFuites | null)[]; parCoins: boolean[] } {
  const parCoins = photos.map(() => false);
  const vues = vuesDeFace(photos.map((p) => p.photo), photos.map((p) => p.reperes ?? null)).map((v, i) => {
    if (v) return v;
    const p = photos[i];
    if (p?.coins.length !== 4) return null;
    parCoins[i] = true;
    return redresserParReperes(p.photo, p.coins);
  });
  return { vues, parCoins };
}

/** L'assemblage des photos d'un mur, redressees entieres, et le mur pose dessus (ses coins, en pixels de l'assemblage). */
export interface AssemblageDuMur {
  image: Image;
  /** Les pixels que montre au moins une photo (1), le reste hors champ (0). */
  vu: Uint8Array;
  /** Les coins du mur sur l'assemblage : haut gauche, haut droit, bas droit, bas gauche (l'egout en haut). */
  coins: P2[];
  /** Par photo : est-elle dans l'assemblage, et sinon pourquoi. */
  vues: { assemblee: boolean; motif: string | null }[];
  /** Par photo : le chemin de l'assemblage a la photo (null : hors de l'assemblage). Un mur tire sur l'assemblage revient par lui. */
  retours: (RetourVersLaPhoto | null)[];
}

/** De l'assemblage a une photo : sa place dans l'assemblage (vue de face -> assemblage), puis sa vue de face ramenee sur la photo. */
export interface RetourVersLaPhoto { place: Similitude; versPhoto: Homographie }

/**
 * Le mur tire sur l'assemblage (ses quatre coins), ramene sur chaque photo assemblee (assemblage -> vue de face -> photo), au dixieme
 * de pixel : les coins d'un mur pose a la main (facade/releve/chaine.ts), le meme pour toutes. Null pour une photo hors de
 * l'assemblage : elle garde ses coins.
 */
export function murSurLesPhotos(retours: readonly (RetourVersLaPhoto | null)[], coins: readonly P2[]): (P2[] | null)[] {
  return retours.map((r) => {
    const inv = r ? inverse(r.place) : null;
    return r && inv ? coins.map((q) => { const p = appliquer(r.versPhoto, appliquerSimilitude(inv, q)); return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; }) : null;
  });
}

/**
 * Les vues de face des photos d'un mur (une par photo, null : elle ne se redresse pas) et leur mosaique (null : aucune ne s'assemble) :
 * l'image de l'assemblage, sans le mur. Elles ne dependent pas des coins du mur, sauf pour une photo sans reperes que ses points de fuite
 * ne redressent pas (vuesDeLAssemblage) : c'est ce qui permet de tirer le mur sans refaire l'assemblage.
 */
export interface VuesAssemblees {
  vues: (RedressementFuites | null)[];
  mosaique: ResultatMosaiqueFuites | null;
}

/** Les vues de face des photos (vuesDeLAssemblage) et leur mosaique, les deux premiers temps de l'assemblage. */
export function assemblerLesVues(vues: readonly (RedressementFuites | null)[]): VuesAssemblees {
  const rangs = vues.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  return { vues: [...vues], mosaique: rangs.length ? mosaiqueDesVues(rangs.map((i) => vues[i] as RedressementFuites)) : null };
}

/**
 * L'assemblage d'un mur (decision de l'utilisateur, 21 octobre 2026 : c'est l'image prise pour la suite) : chaque photo redressee
 * entiere (ses reperes, sinon ses points de fuite), les vues assemblees en une seule (facade/vision/mosaiqueFuites.ts), et le mur porte de
 * la premiere photo assemblee qui en a les coins. Null quand aucune photo ne s'assemble avec ses coins. `faites` : les vues et leur
 * mosaique deja faites pour ces photos (assemblerLesVues), reprises telles quelles ; seul le mur se pose alors.
 */
export function assemblerLeMur(photos: readonly { photo: Image; coins: readonly P2[]; reperes?: readonly P2[] | null }[], faites: VuesAssemblees | null = null): AssemblageDuMur | null {
  const { vues, mosaique: m } = faites ?? assemblerLesVues(vuesDeLAssemblage(photos));
  return m ? poserLeMurSurLesVues(photos, vues, m) : null;
}

/** Le mur pose sur la mosaique des vues : porte de la premiere photo assemblee qui en a les coins ; les retours vers chaque photo. */
function poserLeMurSurLesVues(photos: readonly { coins: readonly P2[] }[], vues: readonly (RedressementFuites | null)[], m: ResultatMosaiqueFuites): AssemblageDuMur | null {
  const rangs = vues.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  let coins: P2[] | null = null;
  for (const [k, i] of rangs.entries()) {
    const v = vues[i], place = m.places[k], c = photos[i]?.coins, inv = v ? inverser(v.versPhoto) : null;
    if (!place || !inv || c?.length !== 4) continue;
    coins = c.map((q) => appliquerSimilitude(place, appliquer(inv, q)));
    break;
  }
  if (!coins) return null;
  const retours: (RetourVersLaPhoto | null)[] = photos.map(() => null);
  rangs.forEach((i, k) => { const v = vues[i], place = m.places[k]; if (v && place) retours[i] = { place, versPhoto: v.versPhoto }; });
  return { image: m.image, vu: m.vu, coins, vues: vuesDansLaMosaique(vues, m), retours };
}

/** Par photo : est-elle dans la mosaique de ses vues, et sinon pourquoi (elle ne se redresse pas, ou elle est restee a part). */
export function vuesDansLaMosaique(vues: readonly (RedressementFuites | null)[], m: ResultatMosaiqueFuites): { assemblee: boolean; motif: string | null }[] {
  const rangs = vues.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const aPart = new Map(m.groupes.aPart.map((a) => [rangs[a.vue] as number, a.motif]));
  return vues.map((v, i) => (!v ? { assemblee: false, motif: 'pas assez de verticales pour redresser la photo' } : aPart.has(i) ? { assemblee: false, motif: aPart.get(i) ?? null } : { assemblee: true, motif: null }));
}

/**
 * Le releve tire de l'assemblage : le mur entre ses coins, et la bande au-dessus de l'egout, redresses a l'echelle du plan dans le
 * meme plan (un pignon y est entier), ce que l'assemblage ne montre pas laisse hors champ. Le gabarit du mur dit le toit quand il a
 * une forme. Null quand les coins ne forment pas un mur.
 */
export function analyserLAssemblage(mur: MurAnalyse, a: AssemblageDuMur, gabarit: GabaritMur | null = null, hauteurMesuree = false): ResultatAnalyse | null {
  const { largeur: L, hauteur: H } = mur;
  const versAssemblage = homographie([{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: H }, { x: 0, y: H }], a.coins);
  if (!versAssemblage) return null;
  const silhouette = gabarit ? gabarit.map((p) => ({ u: p.u, v: p.v })) : null;
  // Le cadre : la boite de la silhouette entiere et sa marge (analyse.ts::cadreDeLaSilhouette), sur la grille de pixels du mur.
  const E = cadreDeLaSilhouette(L, H, silhouette, 1).E;
  const pxParM = resolutionTexture(L, H + E);
  const cadre = cadreDeLaSilhouette(L, H, silhouette, pxParM);
  const etendus = etendreAuCadre([{ x: 0, y: -E }, { x: L, y: -E }, { x: L, y: H }, { x: 0, y: H }].map((q) => appliquer(versAssemblage, q)), Math.max(1, Math.round(L * pxParM)), Math.max(1, Math.round((H + E) * pxParM)), cadre);
  const largeurCadre = (Math.max(1, Math.round(L * pxParM)) + cadre.gauchePx + cadre.droitePx) / pxParM;
  const r = redresser(a.image, etendus, largeurCadre, H + E, pxParM);
  // Ce que l'assemblage n'a pas vu reste hors champ : son masque, redresse de meme.
  const masque = { largeur: a.image.largeur, hauteur: a.image.hauteur, donnees: new Uint8ClampedArray(a.vu.length * 4) };
  a.vu.forEach((v, i) => { masque.donnees[i * 4] = v ? 255 : 0; });
  const vuR = redresser(masque, etendus, largeurCadre, H + E, pxParM);
  if (!r || !vuR) return null;
  const vu = r.vu.map((v, i) => (v && (vuR.image.donnees[i * 4] ?? 0) > 127 ? 1 : 0));
  return finaliserReleve(r.image, vu, E, pxParM, { ...mur, silhouette }, null, hauteurMesuree, cadre);
}

/** Une photo prise pour son propre assemblage : toute vue, le mur entre ses coins. */
function photoCommeAssemblage(p: PhotoDuMur): AssemblageDuMur {
  return { image: p.photo, vu: new Uint8Array(p.photo.largeur * p.photo.hauteur).fill(1), coins: p.coins, vues: [{ assemblee: true, motif: null }], retours: [{ place: SIMILITUDE_IDENTITE, versPhoto: [1, 0, 0, 0, 1, 0, 0, 0, 1] }] };
}

/**
 * Plusieurs vues du mur entier dans l'assemblage : l'assemblage pose le mur (ses coins, reportes sur chaque photo par la chaine), et
 * l'image du mur se compose par la fusion de ces memes photos (facade/fusion.ts) : la vue la mieux vue pixel par pixel, la mediane
 * a trois vues, ce qui est devant le mur ecarte par la parallaxe et masque quand il cache le mur sur toutes, les baies votees entre
 * les vues. Le cadre est celui de l'assemblage : le mur et la bande au-dessus de l'egout, a l'echelle du plan. Null avec moins de deux
 * vues assemblees, ou quand elles ne se recalent pas entre elles : l'assemblage seul fait alors l'image.
 */
export function fondreLesVues(mur: MurAnalyse, photos: readonly PhotoDuMur[], a: AssemblageDuMur, gabarit: GabaritMur | null = null): ResultatFusion | null {
  if (photos.length < 2 || a.vues.filter((v) => v.assemblee).length < 2) return null;
  const f = analyserVues({ ...mur, silhouette: gabarit ? gabarit.map((p) => ({ u: p.u, v: p.v })) : null, vues: photos.map((p) => ({ photo: p.photo, coins: p.coins, focalePx: p.focalePx })) });
  return f && (f.statut === 'fusionnee' || f.statut === 'partielle') ? f : null;
}
