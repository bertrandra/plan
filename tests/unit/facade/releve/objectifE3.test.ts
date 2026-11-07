import { describe, it, expect } from 'vitest';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { casDeLEtalon, coinsVraisDesPhotos, photosDeLEtalon } from '../../../../src/facade/banc/etalons.js';
import { derouler, entreesDuCas, objectifDeLaPhoto } from '../../../../src/facade/releve/enchainement.js';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import type { CasReel } from '../../../../src/facade/corpusReel.js';

// L'E3 (Objectif, son etape depuis le 7 novembre 2026 ; avant, une mention de l'ancienne E3, le redressement) dit l'objectif de chaque photo, tel que la chaine l'a pris (demande du proprietaire, 4 novembre 2026) : l'EXIF, ou faute d'EXIF la
// focale supposee, avec un avertissement (le redressement par les points de fuite peut etre faux) ; pas pour une photo que ses reperes
// redressent. La donnee vient du bilan du redressement, l'ecran ne calcule rien.

const o = { vue: 'calibration' as const, chercherCoins: async (e: Parameters<typeof rechercher>[0]) => rechercher(e) };
const scene = (n: string) => chargerCorpus().find((x) => x.nom.startsWith(n))!;

async function e3(cas: CasReel, images: Parameters<typeof entreesDuCas>[1]) {
  const r = await derouler(entreesDuCas(cas, images), o);
  return { etape: r.etapes.find((e) => e.id === 'objectif')!, redressement: r.etapes.find((e) => e.id === 'redressement')!, bilans: r.sorties.audit!.redressement.photos };
}

describe('l objectif de chaque photo, a l E3', () => {
  it('etalon 02, pris avec l EXIF : « avec EXIF », et la focale equivalente', async () => {
    const s = scene('02'), ph = photosDeLEtalon(s);
    const { etape, bilans } = await e3(casDeLEtalon(s, ph, ['p']), ph.map((p) => p.image));
    expect(bilans[0]?.objectif?.source).toBe('exif');
    expect(objectifDeLaPhoto(bilans[0]!, false)).toEqual({ court: 'Avec EXIF', texte: 'Avec EXIF (focale 26 mm éq.).', alerte: false });
    expect(etape).toMatchObject({ etat: 'ok', resume: 'Photo 1 : avec EXIF (focale 26 mm éq.).' });
    expect(etape.actions[0]).toMatchObject({ id: 'champ', type: 'code', apres: { valeurs: { exif: 1, suppose: 0 } } });
  }, 60000);

  it('etalons 00 et 09, sans EXIF : la focale supposee, et l avertissement', async () => {
    for (const n of ['00', '09']) {
      const s = scene(n), ph = photosDeLEtalon(s);
      const { etape, redressement, bilans } = await e3(casDeLEtalon(s, ph, ['p']), ph.map((p) => p.image));
      expect(bilans[0]?.objectif?.source).not.toBe('exif');
      const d = objectifDeLaPhoto(bilans[0]!, false)!;
      expect(d.alerte).toBe(true);
      expect(d.court).toBe('Sans EXIF');
      expect(d.texte).toMatch(/^Sans EXIF : .*\. Le redressement par les points de fuite peut être faux ; posez quatre repères\.$/);
      expect(etape.resume).toMatch(/^Photo 1 : sans EXIF : /);
      // Sans EXIF mais bien redressee, l'etape ne demande rien (comme avant qu'elle ait la sienne) : l'audit la cache.
      expect(etape.etat).toBe(redressement.etat === 'ok' ? 'ok' : 'a-confirmer');
    }
  }, 60000);

  it('montre l optique rangee avec la photo (lot A) : sa focale, sa source, l appareil', async () => {
    const s = scene('02'), ph = photosDeLEtalon(s);
    const cas = casDeLEtalon(s, ph, ['p']);
    const optique = { focale35: 26, champDeg: 69.4, sourceFocale: 'exif' as const, modeleAppareil: 'iPhone 13', source: { largeurPx: 4032, hauteurPx: 3024 }, reduite: { largeurPx: 1280, hauteurPx: 960 }, empreinte: null,
      exif: { focale35: 26, modele: 'iPhone 13', focaleMm: 5.1, gps: null } };
    const avec = { ...cas, photos: cas.photos.map((p) => ({ ...p, optique })) } as CasReel;
    const r = await derouler(entreesDuCas(avec, ph.map((p) => p.image)), o);
    const e3 = r.etapes.find((e) => e.id === 'objectif')!;
    expect(e3.resume).toMatch(/Optique rangée : 26 mm éq\. \(EXIF\), iPhone 13\./);
    expect(e3.actions[0]?.elements?.[0]).toMatchObject({ genre: 'optique', statut: 'lu', type: 'exif', details: { photo: 1, focale35: 26, appareil: 'iPhone 13' } });
  }, 60000);

  it('sans EXIF mais redressee par ses reperes : l information seule, pas d avertissement', async () => {
    const s = scene('00'), ph = photosDeLEtalon(s);
    const cas = casDeLEtalon(s, ph, ['p']);
    const avec = { ...cas, photos: cas.photos.map((p, k) => ({ ...p, reperes: coinsVraisDesPhotos(s)[k]! })) };
    const { bilans } = await e3(avec, ph.map((p) => p.image));
    const d = objectifDeLaPhoto(bilans[0]!, true)!;
    expect(d.alerte).toBe(false);
    expect(d.texte).toMatch(/^Sans EXIF : .* ; redressée par vos repères, qui ne dépendent pas de la focale\.$/);
  }, 60000);

  it('une E3 qui n atteint pas son objectif le dit d une photo sans EXIF : la focale supposee peut en etre la cause', async () => {
    // La photo de l'etalon 00 (sans EXIF) et une seconde photo qui ne se lit pas : une sur deux redressee, l'E3 n'est pas faite.
    const s = scene('00'), ph = photosDeLEtalon(s);
    const cas = casDeLEtalon(s, ph, ['p']);
    const deux = { ...cas, photos: [...cas.photos, { ...cas.photos[0]!, fichier: 'illisible' }] };
    const { etape, redressement, bilans } = await e3(deux, [ph[0]!.image, null]);
    expect(redressement.etat).not.toBe('ok');
    expect(etape.etat).toBe('a-confirmer');
    expect(bilans[0]?.objectif?.source).not.toBe('exif');
    expect(etape.resume).toMatch(/^Photo 1 : sans EXIF : .*\. Le redressement par les points de fuite peut être faux ; posez quatre repères\./);
  }, 60000);
});
