import { describe, it, expect } from 'vitest';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { calageVraiDuRejeu, casDeLEtalon, coinsVraisDesPhotos, photosDeLEtalon } from '../../../../src/facade/banc/etalons.js';
import { derouler, entreesDuCas, veriteDuCas } from '../../../../src/facade/releve/enchainement.js';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { murSousLeSol } from '../../../../src/facade/vision/mosaiqueFuites.js';

// L'É5 ne dit plus « fait » d'un sol pose dans le mur (etalon 00, 4 novembre 2026) : la photo d'origine des tests, sans EXIF et au
// teleobjectif, ou le calage fin ne trouve pas le pied et le predit sur l'appui des fenetres, a 13 % de la largeur ; le score
// d'explication passait (le sol y pese peu). Sous un vrai pied, meme cache par une haie, la matiere du mur ne continue pas.

const o = { vue: 'calibration' as const, chercherCoins: async (e: Parameters<typeof rechercher>[0]) => rechercher(e) };
const rect = (c: readonly { x: number; y: number }[]) => ({ x0: (c[0]!.x + c[3]!.x) / 2, x1: (c[1]!.x + c[2]!.x) / 2, y0: (c[0]!.y + c[1]!.y) / 2, y1: (c[2]!.y + c[3]!.y) / 2 });

async function rejouer(prefixe: string) {
  const s = chargerCorpus().find((x) => x.nom.startsWith(prefixe))!;
  const ph = photosDeLEtalon(s), cas = casDeLEtalon(s, ph, ['p']), images = ph.map((p) => p.image);
  const r = await derouler(entreesDuCas(cas, images), o);
  const vrai = calageVraiDuRejeu(r.sorties.calage?.pose, coinsVraisDesPhotos(s))!;
  const avec = { ...cas, calageVrai: vrai };
  return derouler(entreesDuCas(avec, images), { ...o, verite: veriteDuCas(avec) });
}

describe('le sol pose dans le mur', () => {
  it('etalon 00 : le mur continue sous le sol pose, l E5 est a confirmer et le dit', async () => {
    const r = await rejouer('00');
    const pose = r.sorties.calage!.pose!;
    expect(murSousLeSol(pose, rect(pose.coins))).toBeGreaterThan(0.9);
    const e5 = r.etapes.find((e) => e.id === 'calage')!;
    expect(e5.verite?.juste).toBe(false);
    expect(e5.etat).toBe('a-confirmer');
    expect(e5.resume).toMatch(/le mur continue sous le sol posé .* : le pied est plus bas, tirez le sol\./);
  }, 60000);
  it('sous un vrai pied, meme cache par une haie, rien ne continue : l E5 reste fait', async () => {
    for (const n of ['02', '12']) {
      const r = await rejouer(n);
      const pose = r.sorties.calage!.pose!;
      expect(murSousLeSol(pose, rect(pose.coins))).toBeLessThan(0.1);
      const e5 = r.etapes.find((e) => e.id === 'calage')!;
      expect(e5.etat).toBe('ok');
      expect(e5.verite?.juste).toBe(true);
    }
  }, 60000);
});
