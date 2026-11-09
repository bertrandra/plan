import { describe, it, expect } from 'vitest';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { calageVraiDuRejeu, casDeLEtalon, coinsVraisDesPhotos, photosDeLEtalon } from '../../../../src/facade/banc/etalons.js';
import { derouler, entreesDuCas } from '../../../../src/facade/releve/enchainement.js';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { avecLesPhotos, photoDeplacee, sansLaPhoto, veriteSuivie, veriteSurLAssemblage, veriteSurLesPhotos, type SuiteDesPhotos } from '../../../../src/facade/photosDuCas.js';
import type { CalageVrai, CasStocke } from '../../../../src/facade/corpusReel.js';
import type { Image } from '../../../../src/facade/vision/homographie.js';

// La verite de l'E7 d'un cas reporte quand sa sequence de photos change (reponse du proprietaire, 9 novembre 2026, question 2), sur les
// vrais assemblages des etalons a plusieurs vues : la verite posee sur l'ancien assemblage, ramenee sur les photos, puis posee sur le
// nouveau, tombe ou la poseraient les coins vrais de l'etalon sur ce nouvel assemblage (etalons.ts::calageVraiDuRejeu, a la precision de
// l'assemblage pres : une photo s'y place a quelques pixels de sa voisine).

const o = { vue: 'calibration' as const, chercherCoins: async (e: Parameters<typeof rechercher>[0]) => rechercher(e) };

function etalon(prefixe: string) {
  const s = chargerCorpus().find((x) => x.nom.startsWith(prefixe))!;
  const ph = photosDeLEtalon(s);
  const cas: CasStocke = { ...casDeLEtalon(s, ph, ph.map((_, k) => 'p' + k)), images: ph.map((_, k) => 'p' + k) };
  return { cas, images: ph.map((p) => p.image), vrais: coinsVraisDesPhotos(s) };
}

/** Le report de la verite d'un cas pour une suite de sa sequence, et ce que diraient les coins vrais sur le nouvel assemblage. */
async function reporter(depart: { cas: CasStocke; images: Image[]; vrais: ReturnType<typeof coinsVraisDesPhotos> }, suite: (c: CasStocke) => SuiteDesPhotos, ajoutees: Image[] = [], vraisAjoutes: ReturnType<typeof coinsVraisDesPhotos> = []) {
  const r = await derouler(entreesDuCas(depart.cas, depart.images), o);
  const vrai = calageVraiDuRejeu(r.sorties.calage?.pose, depart.vrais) as CalageVrai;
  const surPhotos = veriteSurLesPhotos(vrai, r.sorties.calage?.pose, depart.images.map((i) => ({ l: i.largeur, h: i.hauteur })))!;
  const s = suite({ ...depart.cas, calageVrai: vrai });
  expect(s.cas.calageVrai).toBeUndefined();
  let a = 0;
  const images = s.ordre.map((k) => (k === null ? ajoutees[a++] as Image : depart.images[k] as Image));
  const r2 = await derouler(entreesDuCas(s.cas, images), o);
  const report = veriteSurLAssemblage(veriteSuivie(surPhotos, s.ordre), r2.sorties.calage?.pose);
  let b = 0;
  const attendu = calageVraiDuRejeu(r2.sorties.calage?.pose, s.ordre.map((k) => (k === null ? vraisAjoutes[b++] ?? null : depart.vrais[k] ?? null))) as CalageVrai;
  return { report, attendu };
}

/** A 1,5 % de la largeur du mur pres, sur les bouts, l'egout et le sol. */
function procheDe(v: CalageVrai | null, attendu: CalageVrai) {
  expect(v).not.toBeNull();
  const tol = 0.015 * (attendu.x1 - attendu.x0);
  for (const k of ['x0', 'x1', 'egout', 'sol'] as const) expect(Math.abs((v as CalageVrai)[k]! - attendu[k]!)).toBeLessThan(tol);
  expect(v?.versionChaine).toBe(attendu.versionChaine);
}

describe('la verite de l E7 reportee sur le nouvel assemblage (etalons a plusieurs vues)', () => {
  it('etalon 18 : l ordre inverse, puis la premiere photo retiree', async () => {
    const e = etalon('18');
    const inverse = await reporter(e, (c) => photoDeplacee(c, 1, 0));
    expect(inverse.report.perdus).toEqual([]);
    procheDe(inverse.report.vrai, inverse.attendu);
    const retire = await reporter(e, (c) => sansLaPhoto(c, 0));
    expect(retire.report.perdus).toEqual([]);
    procheDe(retire.report.vrai, retire.attendu);
  }, 120000);

  it('etalon 17 : la verite posee sur deux vues, la troisieme ajoutee a la fin', async () => {
    const e = etalon('17');
    const deux = { cas: { ...e.cas, photos: e.cas.photos.slice(0, 2), images: e.cas.images.slice(0, 2) }, images: e.images.slice(0, 2), vrais: e.vrais.slice(0, 2) };
    const ajoute = await reporter(deux, (c) => avecLesPhotos(c, [{ image: 'p2', photo: e.cas.photos[2]! }]), [e.images[2]!], [e.vrais[2] ?? null]);
    expect(ajoute.report.perdus).toEqual([]);
    procheDe(ajoute.report.vrai, ajoute.attendu);
  }, 120000);
});
