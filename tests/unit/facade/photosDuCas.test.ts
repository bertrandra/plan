import { describe, it, expect } from 'vitest';
import { avecLesPhotos, nomLibre, photoDeplacee, photoImportee, PHOTOS_PAR_CAS_MAX, sansLaPhoto, suivreLesRangs, suivreListe } from '../../../src/facade/photosDuCas.js';
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
