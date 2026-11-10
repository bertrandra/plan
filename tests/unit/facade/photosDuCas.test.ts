import { describe, it, expect } from 'vitest';
import {
  avecLesPhotos, casDepuisLesPhotos, issueDeLaVerite, nomLibre, photoDeplacee, photoImportee, PHOTOS_PAR_CAS_MAX, sansLaPhoto, suivreLesRangs, suivreListe, texteDuReport,
  veriteSuivie, veriteSurLAssemblage, veriteSurLesPhotos, VERITE_SANS_ASSEMBLAGE,
} from '../../../src/facade/photosDuCas.js';
import { entreesDuCas } from '../../../src/facade/releve/enchainement.js';
import { GABARIT_RECTANGLE } from '../../../src/facade/gabaritMur.js';
import type { AssemblageDuMur } from '../../../src/facade/analyseMur.js';
import type { Homographie } from '../../../src/facade/vision/homographie.js';
import { FORMAT_CAS_REEL, type CasStocke, type PhotoReelle } from '../../../src/facade/corpusReel.js';
import type { OptiquePhoto, PhotoCas } from '../../../src/model/audit.js';

// La sequence des photos d'un cas de calibration (demande du proprietaire, 9 novembre 2026) : chaque photo emporte ce qui est a elle, ce
// qui designe les photos par leur rang suit ou ne vaut plus, comme dans l'audit.

const coins = (d: number) => [{ x: d, y: d }, { x: 100 + d, y: d }, { x: 100 + d, y: 80 + d }, { x: d, y: 80 + d }];
const photo = (k: number, plus: Partial<PhotoReelle> = {}): PhotoReelle => ({ fichier: 'photo-' + k, coins: coins(k), ...plus });
const cas = (n: number): CasStocke => ({
  format: FORMAT_CAS_REEL, version: 1, nom: 'Cas', statut: 'brouillon', largeurM: 9, hauteurM: 5, ouvertures: [],
  photos: Array.from({ length: n }, (_, k) => photo(k + 1, k === 1 ? { reperes: coins(50), murALaMain: true } : {})),
  images: Array.from({ length: n }, (_, k) => 'data:image/jpeg;base64,P' + (k + 1)),
  murConfirme: { le: '2026-11-09T10:00:00Z', coins: Array.from({ length: n }, (_, k) => ({ rang: k, coins: coins(k + 1) })) },
  ouverturesRelues: { le: '2026-11-09T10:00:00Z', detectees: [], ouvertures: [] },
  calageVrai: { x0: 10, x1: 900, versionChaine: 14 },
  ia: [],
});

const optique: OptiquePhoto = { focale35: 26, champDeg: 69.4, sourceFocale: 'exif', modeleAppareil: 'Pixel 8', exif: { focale35: 26, modele: 'Pixel 8' }, source: { largeurPx: 4000, hauteurPx: 3000 }, reduite: { largeurPx: 1280, hauteurPx: 960 }, empreinte: 'sha256:00' };

describe('la sequence des photos d un cas', () => {
  it('deplacer une photo : images et photos ensemble, leurs gestes avec elles, le mur confirme renumerote, la verite de l E7 ecartee', () => {
    const { cas: c, ordre } = photoDeplacee(cas(3), 2, 0);
    expect(ordre).toEqual([2, 0, 1]);
    expect(c.images).toEqual(['data:image/jpeg;base64,P3', 'data:image/jpeg;base64,P1', 'data:image/jpeg;base64,P2']);
    expect(c.photos.map((p) => p.fichier)).toEqual(['photo-3', 'photo-1', 'photo-2']);
    // Les reperes et le mur pose a la main de la photo 2 la suivent au rang 2.
    expect(c.photos[2]).toMatchObject({ fichier: 'photo-2', murALaMain: true, reperes: coins(50) });
    expect(c.murConfirme?.coins.map((x) => [x.rang, x.coins[0]?.x])).toEqual([[0, 3], [1, 1], [2, 2]]);
    expect(c.ouverturesRelues).toBeDefined();
    expect(c.calageVrai).toBeUndefined();
    // Un deplacement sur place ou hors de la sequence ne change rien.
    const meme = cas(3);
    expect(photoDeplacee(meme, 1, 1).cas).toBe(meme);
    expect(photoDeplacee(meme, 0, 3).cas).toBe(meme);
  });

  it('retirer une photo : les suivantes reculent d un rang ; le mur confirme et les ouvertures relues sont a refaire, comme dans l audit', () => {
    const { cas: c, ordre } = sansLaPhoto(cas(3), 0);
    expect(ordre).toEqual([1, 2]);
    expect(c.photos.map((p) => p.fichier)).toEqual(['photo-2', 'photo-3']);
    expect(c.images).toEqual(['data:image/jpeg;base64,P2', 'data:image/jpeg;base64,P3']);
    expect(c.murConfirme).toBeUndefined();
    expect(c.ouverturesRelues).toBeUndefined();
    expect(c.calageVrai).toBeUndefined();
    expect(c.ia).toEqual([]);
  });

  it('une photo importee garde son optique (l EXIF) et sa prise ; ses coins sont provisoires, pas a la main', () => {
    const p: PhotoCas = { type: 'image/jpeg', base64: 'QUJD', optique };
    const { image, photo: q } = photoImportee(p, 'import-1');
    expect(image).toBe('data:image/jpeg;base64,QUJD');
    expect(q.optique).toEqual(optique);
    expect(q.optique).not.toBe(optique);
    expect(q.prise).toBeUndefined();
    expect(q.murALaMain).toBeUndefined();
    expect(q.coins).toHaveLength(4);
    expect(q.coins[2]).toEqual({ x: 1280 * 0.88, y: 960 * 0.88 });
  });

  it('ajouter des photos : a la fin, dans la limite du cas, sous des noms libres ; le mur confirme reste', () => {
    const depart = cas(PHOTOS_PAR_CAS_MAX - 1);
    expect(nomLibre(depart)).toBe('import-1');
    const a = photoImportee({ type: 'image/jpeg', base64: 'QQ', optique }, nomLibre(depart));
    const b = photoImportee({ type: 'image/jpeg', base64: 'Qg', optique }, nomLibre(depart, ['import-1']));
    expect(b.photo.fichier).toBe('import-2');
    const { cas: c, ordre, refusees } = avecLesPhotos(depart, [a, b]);
    expect(refusees).toBe(1);
    expect(c.photos).toHaveLength(PHOTOS_PAR_CAS_MAX);
    expect(c.images.at(-1)).toBe('data:image/jpeg;base64,QQ');
    expect(ordre.at(-1)).toBeNull();
    expect(c.murConfirme).toEqual(depart.murConfirme);
    expect(c.calageVrai).toBeUndefined();
    expect(avecLesPhotos(c, [b])).toMatchObject({ cas: c, refusees: 1 });
  });

  it('ce qui est range par rang suit les photos ; une photo ajoutee n a rien', () => {
    expect(suivreLesRangs({ 0: 'a', 2: 'c' }, [2, 0, 1, null])).toEqual({ 0: 'c', 1: 'a' });
    expect(suivreListe(['a', 'b', 'c'], [2, 0, null], null)).toEqual(['c', 'a', null]);
  });
});

// La verite de l'E7 reportee quand la sequence change (reponse du proprietaire, 9 novembre 2026, question 2) : ramenee de l'ancien
// assemblage sur les photos qui la voient, puis posee sur le nouveau. Ici, des assemblages ecrits a la main : des photos de 100 x 100 px
// redressees telles quelles (vue de face = photo) et placees par une translation ; le report par les vrais assemblages des etalons est
// dans tests/unit/facade/releve/reportVerite.test.ts.

const IDENTITE: Homographie = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Un assemblage dont la photo de rang k est placee en `places[k]` (null : hors de l'assemblage). */
const assemblage = (places: readonly ({ tx: number; ty: number } | null)[], coins = [{ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 100 }, { x: 0, y: 100 }]): AssemblageDuMur => ({
  image: { largeur: 200, hauteur: 200, donnees: new Uint8ClampedArray(0) }, vu: new Uint8Array(0), coins,
  vues: places.map((p) => ({ assemblee: !!p, motif: null })),
  retours: places.map((p) => (p ? { place: { a: 1, b: 0, tx: p.tx, ty: p.ty }, versPhoto: IDENTITE } : null)),
});
const tailles = (n: number) => Array.from({ length: n }, () => ({ l: 100, h: 100 }));

describe('la verite de l E7 quand la sequence change', () => {
  it('reordonner : chaque coin suit ses photos et revient a sa place sur le nouvel assemblage', () => {
    // Deux photos cote a cote : la premiere voit le bout gauche, la seconde le bout droit.
    const vrai = { x0: 10, x1: 170, egout: 20, sol: 90, versionChaine: 14 };
    const v = veriteSurLesPhotos(vrai, assemblage([{ tx: 0, ty: 0 }, { tx: 80, ty: 0 }]), tailles(2))!;
    expect(v.coins.hg.map((x) => [x.rang, x.vu])).toEqual([[0, true], [1, false]]);
    expect(v.coins.hd.map((x) => [x.rang, x.vu])).toEqual([[0, false], [1, true]]);
    // L'ordre inverse : la photo d'avant 1 est au rang 0, posee a l'origine ; celle d'avant 0 a droite, plus loin.
    const { ordre } = photoDeplacee(cas(2), 1, 0);
    const r = veriteSurLAssemblage(veriteSuivie(v, ordre), assemblage([{ tx: 0, ty: 5 }, { tx: -70, ty: 5 }]));
    expect(r).toEqual({ vrai: { x0: -60, x1: 90, egout: 25, sol: 95, versionChaine: 14 }, perdus: [] });
    expect(texteDuReport(r)).toBe('La vérité de l’É7 (le mur vrai) est reportée sur le nouvel assemblage, par les photos qui la voient.');
  });

  it('ajouter une photo : elle n a jamais vu la verite, qui reste portee par les photos d avant', () => {
    const vrai = { x0: 10, x1: 90, egout: 20, sol: 90, versionChaine: 14 };
    const v = veriteSurLesPhotos(vrai, assemblage([{ tx: 0, ty: 0 }]), tailles(1))!;
    const { ordre } = avecLesPhotos(cas(1), [photoImportee({ type: 'image/jpeg', base64: 'QQ', optique }, 'import-1')]);
    // Le nouvel assemblage place la photo ajoutee a gauche : l'ancienne glisse de 50 px.
    const r = veriteSurLAssemblage(veriteSuivie(v, ordre), assemblage([{ tx: 50, ty: 0 }, { tx: 0, ty: 0 }]));
    expect(r.vrai).toEqual({ x0: 60, x1: 140, egout: 20, sol: 90, versionChaine: 14 });
    expect(veriteSuivie(v, ordre).coins.hg.every((x) => x.rang === 0)).toBe(true);
  });

  it('retirer une photo : un coin qu elle seule voyait part seul, et l ecran le dit ; un bout perdu emporte le mur vrai', () => {
    // La premiere photo voit le haut du mur, la seconde le bas (placee 50 px plus bas).
    const vrai = { x0: 10, x1: 90, egout: 20, sol: 120, versionChaine: 13 };
    const v = veriteSurLesPhotos(vrai, assemblage([{ tx: 0, ty: 0 }, { tx: 0, ty: 50 }]), tailles(2))!;
    const { ordre } = sansLaPhoto(cas(2), 0);
    const r = veriteSurLAssemblage(veriteSuivie(v, ordre), assemblage([{ tx: 0, ty: 50 }]));
    // L'egout ne se voyait que sur la photo retiree : il part ; les bouts se reportent par le bas, le sol aussi. La version reste.
    expect(r).toEqual({ vrai: { x0: 10, x1: 90, sol: 120, versionChaine: 13 }, perdus: ['égout'] });
    expect(texteDuReport(r)).toBe('La vérité de l’É7 (le mur vrai) est reportée sur le nouvel assemblage, sans l’égout : il ne se voyait que sur des photos retirées, ou que le nouvel assemblage ne prend pas.');
    // Cote a cote, retirer la photo qui voit le bout droit : sans ses deux bouts, plus de mur vrai.
    const w = veriteSurLesPhotos({ x0: 10, x1: 170, versionChaine: 14 }, assemblage([{ tx: 0, ty: 0 }, { tx: 80, ty: 0 }]), tailles(2))!;
    const sans = veriteSurLAssemblage(veriteSuivie(w, sansLaPhoto(cas(2), 1).ordre), assemblage([{ tx: 0, ty: 0 }]));
    expect(sans).toEqual({ vrai: null, perdus: ['bout droit'] });
    expect(texteDuReport(sans)).toMatch(/^La vérité de l’É7 \(le mur vrai\) est retirée : le bout droit ne se voyait que sur des photos retirées.*Posez-la de nouveau/);
  });

  it('un coin qu aucune photo ne voyait se prolonge par celles qui restent ; une photo hors du nouvel assemblage ne porte rien', () => {
    // Le bout gauche hors de tous les cadres (un coin cache, pose a l'estime) : sans egout ni sol, les coins prennent la hauteur du mur.
    const v = veriteSurLesPhotos({ x0: -20, x1: 90, versionChaine: 14 }, assemblage([{ tx: 0, ty: 0 }, { tx: 0, ty: 0 }]), tailles(2))!;
    expect(v.coins.hg.every((x) => !x.vu)).toBe(true);
    const r = veriteSurLAssemblage(veriteSuivie(v, sansLaPhoto(cas(2), 0).ordre), assemblage([{ tx: 10, ty: 0 }]));
    expect(r).toEqual({ vrai: { x0: -10, x1: 100, versionChaine: 14 }, perdus: [] });
    // La photo qui reste n'entre pas dans le nouvel assemblage : rien ne se reporte.
    expect(veriteSurLAssemblage(veriteSuivie(v, [1]), assemblage([null])).vrai).toBeNull();
    expect(veriteSurLesPhotos({ x0: 0, x1: 1, versionChaine: 14 }, null, [])).toBeNull();
    expect(texteDuReport(null)).toBeNull();
  });
});

// Au bout d'un rejeu, la verite en attente se pose, se perd ou attend encore (revue du 9 novembre 2026) : elle n'attendait qu'un
// assemblage, et un rejeu fini sans assemblage la laissait en attente pour toujours (« Enregistrer le cas » refuse a jamais).
describe('la verite en attente au bout d un rejeu', () => {
  const v = veriteSurLesPhotos({ x0: 10, x1: 90, egout: 20, sol: 90, versionChaine: 14 }, assemblage([{ tx: 0, ty: 0 }]), tailles(1))!;
  it('un assemblage : elle s y pose, et plus rien n attend', () => {
    expect(issueDeLaVerite(v, assemblage([{ tx: 5, ty: 0 }]), false)).toEqual({ vrai: { x0: 15, x1: 95, egout: 20, sol: 90, versionChaine: 14 }, report: 'La vérité de l’É7 (le mur vrai) est reportée sur le nouvel assemblage, par les photos qui la voient.', reste: null });
  });
  it('un rejeu mene a son terme sans assemblage : elle est perdue, et l ecran le dit', () => {
    expect(issueDeLaVerite(v, null, false)).toEqual({ vrai: null, report: VERITE_SANS_ASSEMBLAGE, reste: null });
  });
  it('un rejeu arrete par la personne avant l E7 : elle attend le suivant', () => {
    expect(issueDeLaVerite(v, null, true)).toEqual({ vrai: null, report: null, reste: v });
  });
  it('deja perdue, ou rien en attente', () => {
    expect(issueDeLaVerite('perdue', null, true)).toEqual({ vrai: null, report: VERITE_SANS_ASSEMBLAGE, reste: null });
    expect(issueDeLaVerite(null, assemblage([{ tx: 0, ty: 0 }]), false)).toEqual({ vrai: null, report: null, reste: null });
  });
});

describe('un cas neuf depuis des photos importees', () => {
  it('ses photos dans l ordre choisi, sans contexte du plan : il se rejoue comme un cas d avant (mur rectangulaire face au sud)', () => {
    const a = photoImportee({ type: 'image/jpeg', base64: 'QQ', optique }, 'import-1');
    const b = photoImportee({ type: 'image/jpeg', base64: 'Qg', optique }, 'import-2');
    const c = casDepuisLesPhotos([a, b]);
    expect(c).toMatchObject({ format: FORMAT_CAS_REEL, version: 1, nom: '', statut: 'brouillon', largeurM: 9, hauteurM: 5, ouvertures: [] });
    expect(c.images).toEqual(['data:image/jpeg;base64,QQ', 'data:image/jpeg;base64,Qg']);
    expect(c.photos.map((p) => p.fichier)).toEqual(['import-1', 'import-2']);
    expect(c.gabarit ?? c.toit ?? c.facade ?? c.contour ?? c.origine ?? c.calageVrai).toBeUndefined();
    // Les entrees du rejeu : le gabarit rectangle, aucun corps du toit, deux photos sans prise, leur optique gardee.
    const e = entreesDuCas(c, [null, null]);
    expect(e.gabarit).toBe(GABARIT_RECTANGLE);
    expect(e.toit).toBeUndefined();
    expect(e.largeurM).toBe(9);
    // Au plus huit photos, comme le serveur.
    expect(casDepuisLesPhotos(Array.from({ length: 10 }, () => a)).photos).toHaveLength(PHOTOS_PAR_CAS_MAX);
  });
});
