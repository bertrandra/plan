import { describe, it, expect } from 'vitest';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { casDeLEtalon, photosDeLEtalon } from '../../../../src/facade/banc/etalons.js';
import { derouler, entreesDuCas } from '../../../../src/facade/releve/enchainement.js';
import { priseDeLaPhoto, prisesDeLaFacade } from '../../../../src/facade/releve/prisesFacade.js';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { lireCasReel, type CasReel } from '../../../../src/facade/corpusReel.js';
import { casDepuisFacade } from '../../../../src/app/audit/parcelle/casDeCalibration.js';
import { photoPreparee, optiqueRangee, empreinteJpeg } from '../../../../src/app/audit/photo.js';
import { facadesDuContour, type Facade } from '../../../../src/geometry/cotesVusDeDehors.js';
import type { ExifPhoto, OptiquePhoto, PrisePhoto } from '../../../../src/model/audit.js';

// L'optique d'une photo (audit de la calibration, lot A) : rangee toujours, qu'il y ait une position du telephone ou non, et lue
// par la chaine quand la prise manque. Une photo sans GPS se redresse avec la focale de son EXIF, la meme qu'avec GPS ; le GPS de
// l'EXIF est garde, il ne situe pas la photo.

const EXIF: ExifPhoto = {
  focale35: 26, modele: 'iPhone 13', focaleMm: 5.1, zoomNumerique: 1, objectif: 'iPhone 13 back dual wide camera 5.1mm f/1.6', marque: 'Apple',
  orientation: 6, datePrise: '2026:11:07 10:12:31', decalageHoraire: '+01:00', gps: { lat: 48.89012, lon: 2.16523, altitudeM: 45.5, capDeg: 245.25, nordCap: 'T' },
};
const RETENUE = { focale35: 26, champDeg: 69.4, sourceFocale: 'exif' as const, modeleAppareil: 'iPhone 13' };
const OPTIQUE: OptiquePhoto = optiqueRangee(EXIF, RETENUE, { largeurPx: 3024, hauteurPx: 4032 }, { largeurPx: 960, hauteurPx: 1280 }, 'sha256:00');
const PRISE: PrisePhoto = { t: '2026-11-07T09:12:31Z', x: 10, y: 2, lat: 48.89, lon: 2.16, precisionM: 3, azimutDeg: 0, sourceAzimut: 'boussole', inclinaisonDeg: 5, roulisDeg: 0 };
const IMG = { largeur: 640, hauteur: 480, donnees: new Uint8ClampedArray(4) };
const sud = (): Facade => facadesDuContour([{ x: 5, y: 10 }, { x: 15, y: 10 }, { x: 15, y: 18 }, { x: 5, y: 18 }], 6).find((f) => f.orientation === 'Sud') as Facade;

describe('la photo rangee, avec ou sans position du telephone', () => {
  it('garde l optique dans les deux cas ; la prise porte la meme focale et la taille de la source, comme avant', () => {
    const avec = photoPreparee({ type: 'image/jpeg', base64: 'AAAA' }, PRISE, OPTIQUE);
    const sans = photoPreparee({ type: 'image/jpeg', base64: 'AAAA' }, null, OPTIQUE);
    expect(avec.optique).toEqual(OPTIQUE);
    expect(sans.optique).toEqual(OPTIQUE);
    expect(sans.prise).toBeUndefined();
    expect(avec.prise).toEqual({ ...PRISE, ...RETENUE, largeurSourcePx: 3024, hauteurSourcePx: 4032 });
    // Le GPS de l'EXIF reste dans l'optique : il ne devient pas une prise de vue.
    expect(sans.optique?.exif.gps).toEqual(EXIF.gps);
  });

  it('l empreinte est le SHA-256 des octets du JPEG reduit', async () => {
    // « abc » : la valeur de reference du SHA-256.
    expect(await empreinteJpeg(btoa('abc'))).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await empreinteJpeg('pas du base64 !')).toBeNull();
  });
});

describe('la chaine lit l objectif de l optique quand la prise manque', () => {
  it('le meme champ et le meme « EXIF connu » avec ou sans prise', () => {
    const avec = photoPreparee({ type: 'image/jpeg', base64: 'AAAA' }, PRISE, OPTIQUE);
    const sans = photoPreparee({ type: 'image/jpeg', base64: 'AAAA' }, null, OPTIQUE);
    // Le champ lu sur les points de fuite ne prend pas la place de l'EXIF, avec ou sans prise.
    expect(priseDeLaPhoto(sans, IMG, sud(), 104).photo.champ).toBe(69.4);
    expect(priseDeLaPhoto(avec, IMG, sud(), 104).photo.champ).toBe(69.4);
    // Sans prise, ni distance ni cap : l'EXIF ne situe pas la photo.
    expect(priseDeLaPhoto(sans, IMG, sud()).mesure).toBeNull();
    expect(priseDeLaPhoto(sans, IMG, sud()).cap).toBeNull();
    const p = prisesDeLaFacade({ facade: sud(), contour: [], photos: [{ rang: 0, image: IMG, prise: null, optique: OPTIQUE }, { rang: 1, image: IMG, prise: avec.prise!, optique: OPTIQUE }], corrections: {}, jpeg: () => '' });
    expect(p.photos.map((x) => x.champConnu)).toEqual([true, true]);
    expect(p.photos.map((x) => x.prise(104).photo.champ)).toEqual([69.4, 69.4]);
  });

  it('une photo d avant l optique, sans prise, se lit comme avant : le champ des points de fuite', () => {
    expect(priseDeLaPhoto({}, IMG, sud(), 104).photo.champ).toBe(104);
    const p = prisesDeLaFacade({ facade: sud(), contour: [], photos: [{ rang: 0, image: IMG, prise: null }], corrections: {}, jpeg: () => '' });
    expect(p.photos[0]?.champConnu).toBe(false);
  });

  it('sans prise, une optique sans focale EXIF (apprise ou par defaut) laisse les points de fuite, comme avant l optique', () => {
    for (const sourceFocale of ['defaut', 'appareil'] as const) {
      const o = { ...OPTIQUE, focale35: 27.2, champDeg: 67, sourceFocale };
      expect(priseDeLaPhoto({ optique: o }, IMG, sud(), 104).photo.champ).toBe(104);
      const p = prisesDeLaFacade({ facade: sud(), contour: [], photos: [{ rang: 0, image: IMG, prise: null, optique: o }], corrections: {}, jpeg: () => '' });
      expect(p.photos[0]?.champConnu).toBe(false);
    }
  });
});

describe('un cas de calibration garde l optique et la rejoue', () => {
  const o = { vue: 'calibration' as const, chercherCoins: async (e: Parameters<typeof rechercher>[0]) => rechercher(e) };

  it('un cas tire d un audit recopie l optique, meme sans prise, et la relecture la garde ; une optique illisible est laissee', () => {
    const photos = [{ type: 'image/jpeg' as const, base64: 'AAAA', optique: OPTIQUE }, { type: 'image/jpeg' as const, base64: 'AAAA' }];
    const cas = casDepuisFacade({ cle: 'b', nom: 'Maison', cote: 0, orientation: 'Sud', largeurM: 6, hauteurM: 3, sourceHauteur: 'fichier', photos, corrections: {}, bilans: [], gabarit: [], toit: null, parement: null, facade: null, contour: null } as never);
    expect(cas.photos[0]?.optique).toEqual(OPTIQUE);
    expect(cas.photos[0]?.prise).toBeUndefined();
    expect(cas.photos[1]?.optique).toBeUndefined();
    const relu = lireCasReel(JSON.parse(JSON.stringify(cas)));
    expect(relu.photos[0]?.optique).toEqual(OPTIQUE);
    const abime = lireCasReel({ ...JSON.parse(JSON.stringify(cas)), photos: cas.photos.map((p) => ({ ...p, optique: { champDeg: 'x' } })) });
    expect(abime.photos[0]?.optique).toBeUndefined();
  });

  it('etalon 02 sans sa prise mais avec son optique : l E3 prend l objectif de l EXIF, comme avec la prise', async () => {
    const s = chargerCorpus().find((x) => x.nom.startsWith('02'))!, ph = photosDeLEtalon(s);
    const cas = casDeLEtalon(s, ph, ['p']);
    const prise = cas.photos[0]!.prise!;
    expect(prise.sourceFocale).toBe('exif');
    const optique = optiqueRangee({ focale35: prise.focale35 ?? null, modele: null }, { focale35: prise.focale35!, champDeg: prise.champDeg!, sourceFocale: 'exif', modeleAppareil: null }, { largeurPx: ph[0]!.image.largeur, hauteurPx: ph[0]!.image.hauteur }, { largeurPx: ph[0]!.image.largeur, hauteurPx: ph[0]!.image.hauteur }, null);
    const sansPrise: CasReel = { ...cas, photos: cas.photos.map((p) => { const q = { ...p, optique }; delete q.prise; delete q.focalePx; return q; }) };
    const r = await derouler(entreesDuCas(sansPrise, ph.map((p) => p.image)), o);
    const avecPrise = await derouler(entreesDuCas(cas, ph.map((p) => p.image)), o);
    expect(r.sorties.audit!.redressement.photos[0]?.objectif).toEqual(avecPrise.sorties.audit!.redressement.photos[0]?.objectif);
    expect(r.sorties.audit!.redressement.photos[0]?.objectif?.source).toBe('exif');
  }, 60000);
});
