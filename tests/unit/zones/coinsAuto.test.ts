import { describe, it, expect } from 'vitest';
import { reporterCoins } from '../../../src/zones/releve/coinsAuto.js';
import type { Image, P2 } from '../../../src/facade/homographie.js';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { photographier, coinsVrais } from '../../banc/facades/synthese.js';

// Le report des coins poses sur une photo vers les autres photos du meme mur (les coins d'une photo seule : tests/unit/zones/chaine.test.ts).

describe('le report des coins poses sur une photo', () => {
  it('porte le mur d une vue sur les deux autres photos du meme mur, a 2 % de sa largeur pres', () => {
    const s = chargerCorpus().find((c) => c.nom.startsWith('16-'));
    if (!s) throw new Error('scene absente');
    const prises = [s.synthese.prise, ...(s.synthese.vues ?? [])];
    const images = prises.map((p) => photographier(s, 100, p)?.image);
    const vrais = prises.map((p) => coinsVrais(s, p));
    if (images.some((i) => !i) || vrais.some((c) => !c)) throw new Error('prise impossible');
    const portes = reporterCoins(images as Image[], 0, vrais[0] as P2[]);
    for (let i = 1; i < prises.length; i++) {
      const v = vrais[i] as P2[], q = portes[i];
      expect(q).not.toBeNull();
      const largeur = Math.hypot((v[1] as P2).x - (v[0] as P2).x, (v[1] as P2).y - (v[0] as P2).y);
      for (let k = 0; k < 4; k++) expect(Math.hypot((q?.[k] as P2).x - (v[k] as P2).x, (q?.[k] as P2).y - (v[k] as P2).y) / largeur).toBeLessThan(0.02);
    }
  });
});
