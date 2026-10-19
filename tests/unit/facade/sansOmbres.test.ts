import { describe, it, expect } from 'vitest';
import { sansOmbres } from '../../../src/facade/sansOmbres.js';
import { analyserReleve } from '../../../src/facade/analyse.js';
import type { Image } from '../../../src/facade/homographie.js';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { photographier, coinsVrais, type SceneFacade } from '../../banc/facades/synthese.js';

// Les facades sans ombres (Vue 3D) : sur les scenes du banc, la texture corrigee se rapproche de celle du meme mur sans ombres,
// et un mur sans ombre (soubassement en pierre, meuliere) ne change presque pas.

const scene = (prefixe: string): SceneFacade => {
  const s = chargerCorpus().find((c) => c.nom.startsWith(prefixe));
  if (!s) throw new Error('scene absente');
  return s;
};
/** La texture du releve de la scene, et celle du meme mur sans ombre ni degrade. */
function textures(s: SceneFacade) {
  const clair = JSON.parse(JSON.stringify(s)) as SceneFacade;
  clair.synthese.ombres = [];
  (clair.synthese.balcons ?? []).forEach((b) => { delete b.ombre; });
  delete clair.synthese.mur.degrade;
  const prise = s.synthese.prise, coins = coinsVrais(s, prise);
  const e = { largeur: s.verite.largeur, hauteur: s.verite.hauteur, contour: [{ x: 0, y: 0 }, { x: s.verite.largeur, y: 0 }, { x: s.verite.largeur, y: 6 }], cote: 0, distance: null };
  const a = photographier(s, 100, prise), b = photographier(clair, 100, prise);
  if (!a || !b || !coins) throw new Error('prise impossible');
  const ra = analyserReleve({ ...e, photo: a.image, coins, focalePx: a.focalePx }), rb = analyserReleve({ ...e, photo: b.image, coins, focalePx: b.focalePx });
  if (!ra || !rb) throw new Error('analyse impossible');
  return { brute: ra.texture, vraie: rb.texture, pxParM: ra.pxParM };
}
/** L'ecart moyen de luminosite (relatif) entre deux textures, sur le mur hors des baies. */
function ecart(s: SceneFacade, t: Image, ref: Image, pxParM: number): number {
  const L = (d: Uint8ClampedArray, i: number) => ((d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0)) / 3;
  let e = 0, n = 0;
  for (let y = 0; y < t.hauteur; y++) {
    const Z = (t.hauteur - y - 0.5) / pxParM;
    if (Z > s.verite.hauteur) continue;
    for (let x = 0; x < t.largeur; x++) {
      const X = (x + 0.5) / pxParM;
      if (s.verite.ouvertures.some((o) => X >= o.x - 0.1 && X <= o.x + o.l + 0.1 && Z >= o.y - 0.1 && Z <= o.y + o.h + 0.1)) continue;
      const i = (y * t.largeur + x) * 4, r = L(ref.donnees, i);
      if (r < 5) continue;
      e += Math.abs(L(t.donnees, i) - r) / r; n++;
    }
  }
  return e / n;
}
const corrigee = (s: SceneFacade, t: { brute: Image; pxParM: number }) => sansOmbres(t.brute, t.pxParM, s.verite.ouvertures, s.verite.hauteur);

describe('les facades sans ombres', () => {
  it('estompe les ombres du debord et du balcon, et celle d un arbre', () => {
    for (const p of ['05-', '11-']) {
      const s = scene(p), t = textures(s);
      const avant = ecart(s, t.brute, t.vraie, t.pxParM), apres = ecart(s, corrigee(s, t), t.vraie, t.pxParM);
      expect(apres, p).toBeLessThan(avant * 0.6);
    }
  }, 60000);

  it('laisse presque tel quel un mur sans ombre, soubassement en pierre et meuliere compris', () => {
    for (const p of ['04-', '10-', '03-']) {
      const s = scene(p), t = textures(s);
      expect(ecart(s, corrigee(s, t), t.brute, t.pxParM), p).toBeLessThan(0.01);
    }
  }, 60000);

  it('rend une copie, sans toucher la texture d origine, et n assombrit jamais', () => {
    const s = scene('05-'), t = textures(s);
    const avant = new Uint8ClampedArray(t.brute.donnees);
    const c = corrigee(s, t);
    expect(t.brute.donnees).toEqual(avant);
    for (let i = 0; i < c.donnees.length; i += 4) expect(c.donnees[i] ?? 0).toBeGreaterThanOrEqual(avant[i] ?? 0);
  }, 60000);
});
