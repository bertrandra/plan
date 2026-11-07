import { describe, it, expect } from 'vitest';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { casDeLEtalon, photosDeLEtalon } from '../../../../src/facade/banc/etalons.js';
import { derouler, entreesDuCas } from '../../../../src/facade/releve/enchainement.js';
import { priseDeLaPhoto, prisesDeLaFacade, texteDesPositions } from '../../../../src/facade/releve/prisesFacade.js';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { lireCasReel, type CasReel } from '../../../../src/facade/corpusReel.js';
import { casDepuisFacade } from '../../../../src/app/audit/parcelle/casDeCalibration.js';
import { optiqueRangee } from '../../../../src/app/audit/photo.js';
import { projecteurLocal } from '../../../../src/geo/projection.js';
import { objectifsEnchainement } from '../../../../src/facade/regles/facades/enchainement.js';
import type { Facade } from '../../../../src/geometry/cotesVusDeDehors.js';
import type { GpsExif, OptiquePhoto, PrisePhoto } from '../../../../src/model/audit.js';

// Le GPS de l'EXIF, position de secours d'une photo sans position du telephone (decision du proprietaire, 7 novembre 2026) : une
// seule regle (prisesFacade.ts::positionDeLaPhoto), pour l'audit et la calibration ; une photo qui a la position du telephone ne
// change en rien.

const ORIGINE = { lat: 48.89, lon: 2.16 };
const proj = projecteurLocal(ORIGINE.lat, ORIGINE.lon);
// Le mur de (0, 0) a (10, 0), la rue vers -Y : la facade regarde au sud.
const MUR: Facade = { cote: 0, gauche: { x: 0, y: 0 }, droite: { x: 10, y: 0 }, largeur: 10, hauteur: 5.8, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' };
const IMG = { largeur: 640, hauteur: 480, donnees: new Uint8ClampedArray(4) };
const gpsEn = (x: number, y: number, capDeg: number | null = 0, nordCap: GpsExif['nordCap'] = 'T'): GpsExif => { const d = proj.versDegres(x, y); return { lat: d.lat, lon: d.lon, altitudeM: null, capDeg, nordCap }; };
const optique = (gps: GpsExif | null): OptiquePhoto => optiqueRangee({ focale35: 26, modele: 'iPhone 13', gps }, { focale35: 26, champDeg: 69.4, sourceFocale: 'exif', modeleAppareil: 'iPhone 13' }, { largeurPx: 3024, hauteurPx: 4032 }, { largeurPx: 960, hauteurPx: 1280 }, null);
const PRISE: PrisePhoto = { t: '2026-11-07T09:12:31Z', x: 5, y: -20, lat: 48.8898, lon: 2.1601, precisionM: 3, azimutDeg: 10, sourceAzimut: 'boussole' };
const PRECISION = objectifsEnchainement()['facades.enchainement.precisionExifM'];

// Une photo seule, lue par les entrees de la facade : la prise de vue qu'en tire la chaine, et ce que l'E2 en dit.
function lue(photo: { prise?: PrisePhoto; optique?: OptiquePhoto }, origine: { lat: number; lon: number } | null = ORIGINE) {
  const p = prisesDeLaFacade({ facade: MUR, contour: [], corrections: {}, jpeg: () => '', origine, photos: [{ rang: 0, image: IMG, prise: photo.prise ?? null, optique: photo.optique ?? null }] });
  return { prise: p.photos[0]!.prise(null), dit: p.positions?.[0] ?? null };
}

describe('la position d une photo : le telephone, sinon le GPS de l EXIF', () => {
  it('avec la position du telephone, elle seule, telle quelle, meme si l EXIF en dit une autre', () => {
    const photo = { prise: PRISE, optique: optique(gpsEn(5, -30)) };
    const l = lue(photo);
    expect(l.dit).toBeNull();
    // La prise de vue est celle d'avant le GPS de l'EXIF, au bit pres (sans origine, la chaine ne le lit pas).
    expect(l.prise).toEqual(priseDeLaPhoto(photo, IMG, MUR));
    expect(l.prise).toEqual(lue(photo, null).prise);
    expect(l.prise.mesure).toEqual({ distance: 20, source: 'gps' });
    expect(l.prise.cap).toBe(10);
  });

  it('sans position du telephone, le GPS de l EXIF projete dans le plan, a la precision supposee, son cap au nord vrai', () => {
    const l = lue({ optique: optique(gpsEn(4, -20, 365)) });
    expect(l.dit).toEqual({ rang: 0, provenance: 'exif', note: null });
    // 20 m du mur, plus de deux fois la precision supposee : la distance sert ; le cap aussi.
    expect(l.prise.mesure).toEqual({ distance: 20, source: 'gps' });
    expect(l.prise.cap).toBe(5);
    // Comme une prise du telephone au meme point, a la precision supposee, cap a la boussole.
    const tel: PrisePhoto = { t: '', x: 4, y: -20, lat: null, lon: null, precisionM: PRECISION, azimutDeg: 5, sourceAzimut: 'boussole' };
    expect(l.prise).toEqual(lue({ prise: tel, optique: optique(gpsEn(4, -20, 365)) }).prise);
    // A 12 m, sous deux fois la precision supposee : la distance est supposee par le cadrage, comme pour un GPS de telephone imprecis.
    expect(lue({ optique: optique(gpsEn(5, -12)) }).prise.mesure).toBeNull();
  });

  it('un cap magnetique, ou un nord non dit, est ignore et dit ; la position sert quand meme', () => {
    const m = lue({ optique: optique(gpsEn(5, -20, 200, 'M')) });
    expect(m.prise.cap).toBeNull();
    expect(m.prise.mesure).toEqual({ distance: 20, source: 'gps' });
    expect(m.dit).toEqual({ rang: 0, provenance: 'exif', note: 'cap de l’EXIF ignoré (nord magnétique)' });
    expect(lue({ optique: optique(gpsEn(5, -20, 200, null)) }).dit?.note).toBe('cap de l’EXIF ignoré (nord non dit)');
    expect(lue({ optique: optique(gpsEn(5, -20, null, null)) }).dit).toEqual({ rang: 0, provenance: 'exif', note: null });
  });

  it('ignore et dit : derriere le mur, au-dela de la distance permise, sans origine du plan', () => {
    expect(lue({ optique: optique(gpsEn(5, 3)) }).dit).toEqual({ rang: 0, provenance: null, note: 'GPS de l’EXIF ignoré : derrière le mur' });
    expect(lue({ optique: optique(gpsEn(5, -52)) }).dit).toEqual({ rang: 0, provenance: null, note: 'GPS de l’EXIF ignoré : à 52 m du mur (au-delà de 40 m)' });
    // Au bout du mur, la distance est celle du segment : 30 m de cote, 30 m devant, 42 m du coin.
    expect(lue({ optique: optique(gpsEn(40, -30)) }).dit?.provenance).toBeNull();
    expect(lue({ optique: optique(gpsEn(5, -20)) }, null).dit).toEqual({ rang: 0, provenance: null, note: 'GPS de l’EXIF non utilisé : le plan n’est pas calé sur le cadastre' });
    // Ignoree, la position ne sert a rien : ni distance ni cap.
    expect(lue({ optique: optique(gpsEn(5, -52)) }).prise.mesure).toBeNull();
    expect(lue({ optique: optique(gpsEn(5, -52)) }).prise.cap).toBeNull();
  });

  it('sans GPS dans l EXIF, ni optique : rien, comme avant', () => {
    expect(lue({ optique: optique(null) }).dit).toBeNull();
    expect(lue({}).dit).toBeNull();
    expect(lue({ optique: optique(null) }).prise).toEqual(lue({ optique: optique(null) }, null).prise);
  });
});

describe('les entrees de la facade', () => {
  it('une photo situee par l EXIF passe avant une photo sans position ; l E2 dit la provenance', () => {
    const p = prisesDeLaFacade({ facade: MUR, contour: [], corrections: {}, jpeg: () => '', origine: ORIGINE,
      photos: [{ rang: 0, image: IMG, prise: null, optique: optique(null) }, { rang: 1, image: IMG, prise: null, optique: optique(gpsEn(5, -20, 90, 'M')) }, { rang: 2, image: IMG, prise: null, optique: optique(gpsEn(5, -90)) }] });
    expect(p.photos.map((x) => x.rang)).toEqual([1, 0, 2]);
    expect(p.positions).toEqual([{ rang: 1, provenance: 'exif', note: 'cap de l’EXIF ignoré (nord magnétique)' }, { rang: 2, provenance: null, note: 'GPS de l’EXIF ignoré : à 90 m du mur (au-delà de 40 m)' }]);
    expect(texteDesPositions(p)).toBe('Photo 2 : position tirée de l’EXIF, à 8 m près ; cap de l’EXIF ignoré (nord magnétique). Photo 3 : GPS de l’EXIF ignoré : à 90 m du mur (au-delà de 40 m).');
    expect(p.photos[0]?.prise(null).mesure).toEqual({ distance: 20, source: 'gps' });
  });

  it('des photos qui ont toutes la position du telephone : le meme ordre, les memes prises, rien a dire, avec ou sans origine', () => {
    const photos = [{ rang: 0, image: IMG, prise: null }, { rang: 1, image: IMG, prise: PRISE, optique: optique(gpsEn(5, -30)) }];
    const avec = prisesDeLaFacade({ facade: MUR, contour: [], corrections: {}, jpeg: () => '', origine: ORIGINE, photos });
    const sans = prisesDeLaFacade({ facade: MUR, contour: [], corrections: {}, jpeg: () => '', photos });
    expect(avec.photos.map((x) => x.rang)).toEqual(sans.photos.map((x) => x.rang));
    expect(avec.photos.map((x) => x.prise(80))).toEqual(sans.photos.map((x) => x.prise(80)));
    expect(avec.positions).toBeUndefined();
    expect(texteDesPositions(avec)).toBe('');
  });
});

describe('un cas de calibration garde l origine du plan et rejoue le GPS de l EXIF', () => {
  const o = { vue: 'calibration' as const, chercherCoins: async (e: Parameters<typeof rechercher>[0]) => rechercher(e) };

  it('le cas tire d un audit recopie l origine ; la relecture la garde, et laisse une origine illisible', () => {
    const photos = [{ type: 'image/jpeg' as const, base64: 'AAAA', optique: optique(gpsEn(5, -20)) }];
    const cas = casDepuisFacade({ cle: 'b', nom: 'Maison', cote: 0, orientation: 'Sud', largeurM: 10, hauteurM: 5.8, sourceHauteur: 'fichier', photos, corrections: {}, bilans: [], gabarit: [], toit: null, parement: null, facade: MUR, contour: null, origine: ORIGINE } as never);
    expect(cas.origine).toEqual(ORIGINE);
    expect(lireCasReel(JSON.parse(JSON.stringify(cas))).origine).toEqual(ORIGINE);
    expect(lireCasReel({ ...JSON.parse(JSON.stringify(cas)), origine: { lat: 'x', lon: 2 } }).origine).toBeUndefined();
    expect(lireCasReel({ ...JSON.parse(JSON.stringify(cas)), origine: { lat: 120, lon: 2 } }).origine).toBeUndefined();
    // Un cas d'avant l'origine : son EXIF ne situe rien, et l'E2 le dit.
    const avant = lireCasReel({ ...JSON.parse(JSON.stringify(cas)), origine: undefined });
    expect(entreesDuCas(avant, []).prises.positions).toEqual([{ rang: 0, provenance: null, note: 'GPS de l’EXIF non utilisé : le plan n’est pas calé sur le cadastre' }]);
    expect(entreesDuCas(lireCasReel(JSON.parse(JSON.stringify(cas))), []).prises.positions).toEqual([{ rang: 0, provenance: 'exif', note: null }]);
  });

  it('etalon 02 sans sa prise, son GPS dans l EXIF : il se rejoue comme une prise du telephone au meme point, a la precision supposee', async () => {
    const s = chargerCorpus().find((x) => x.nom.startsWith('02'))!, ph = photosDeLEtalon(s);
    const cas = casDeLEtalon(s, ph, ['p']);
    const prise = cas.photos[0]!.prise!;
    const o0 = optiqueRangee({ focale35: prise.focale35 ?? null, modele: null, gps: gpsEn(prise.x, prise.y, prise.azimutDeg, 'T') }, { focale35: prise.focale35!, champDeg: prise.champDeg!, sourceFocale: 'exif', modeleAppareil: null }, { largeurPx: ph[0]!.image.largeur, hauteurPx: ph[0]!.image.hauteur }, { largeurPx: ph[0]!.image.largeur, hauteurPx: ph[0]!.image.hauteur }, null);
    const parExif: CasReel = { ...cas, origine: ORIGINE, photos: cas.photos.map((p) => { const q = { ...p, optique: o0 }; delete q.prise; delete q.focalePx; return q; }) };
    const parTelephone: CasReel = { ...cas, photos: cas.photos.map((p) => ({ ...p, prise: { ...prise, precisionM: PRECISION } })) };
    const images = ph.map((p) => p.image);
    const a = entreesDuCas(parExif, images).prises.photos[0]!.prise(null), b = entreesDuCas(parTelephone, images).prises.photos[0]!.prise(null);
    expect(a).toEqual(b);
    expect(a.cap).toBe(prise.azimutDeg);
    const r = await derouler(entreesDuCas(parExif, images), o);
    const t = await derouler(entreesDuCas(parTelephone, images), o);
    expect(r.etapes.find((e) => e.id === 'prises')?.resume).toBe('1 photo du mur. Photo 1 : position tirée de l’EXIF, à 8 m près.');
    expect(r.sorties.calage?.photos[0]?.coins).toEqual(t.sorties.calage?.photos[0]?.coins);
  }, 60000);
});
