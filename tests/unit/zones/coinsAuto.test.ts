import { describe, it, expect } from 'vitest';
import { coinsAuto, reporterCoins } from '../../../src/zones/releve/coinsAuto.js';
import type { Image, P2 } from '../../../src/facade/homographie.js';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { photographier, coinsVrais, type PriseCamera } from '../../banc/facades/synthese.js';

// Les coins d'une photo importee, trouves sans capteurs : sur une scene du banc de face, ils tombent sur les angles du mur ; sur une
// photo sans mur, ils restent devines et la photo n'est pas perdue.

describe('les coins automatiques d une photo', () => {
  it('trouve les quatre angles du mur d une scene de face', () => {
    const s = chargerCorpus().find((c) => c.nom.startsWith('02-'));
    if (!s) throw new Error('scene absente');
    const prise = s.synthese.prise as PriseCamera;
    const ph = photographier(s, 100, prise), vrais = coinsVrais(s, prise);
    if (!ph || !vrais) throw new Error('scene impossible');
    const r = coinsAuto(ph.image, s.verite.largeur, s.verite.hauteur, ph.focalePx);
    expect(r.coins).toHaveLength(4);
    expect(r.sources).toHaveLength(4);
    // Les coins sont a quelques pixels du vrai : la chaine du releve (calage fin) les trouve ou les predit juste.
    const px = ph.image.largeur / 40;
    r.coins.forEach((c, k) => expect(Math.hypot(c.x - (vrais[k] as { x: number }).x, c.y - (vrais[k] as { y: number }).y)).toBeLessThan(px));
  });

  it('garde des coins devines, sans rejeter, quand la photo ne montre pas de mur', () => {
    const L = 640, H = 480;
    const donnees = new Uint8ClampedArray(L * H * 4).fill(128);
    const r = coinsAuto({ largeur: L, hauteur: H, donnees }, 9, 5);
    expect(r.coins).toHaveLength(4);
    expect(r.trouves).toBe(false);
    expect(r.sources.every((x) => x !== 'trouve')).toBe(true);
  });
});

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
