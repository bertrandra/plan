import { describe, it, expect } from 'vitest';
import { analyserReleve, coinsProposes } from '../../../src/facade/analyse.js';
import { homographie, appliquer } from '../../../src/facade/homographie.js';
import { focale35mm, champDepuisFocale35 } from '../../../src/facade/exif.js';
import { focalePx, distanceParCadrage } from '../../../src/facade/cadrage.js';

const p = (x: number, y: number) => ({ x, y });

/**
 * Une maison vue du sud : mur de 8 x 4 m, pignon de 3 m au-dessus, ciel bleu. L'elevation fait
 * 8 x 8 m a 50 px/m, l'egout a mi-hauteur. Deux fenetres et une porte.
 */
function scene() {
  const px = 50,
    L = 8 * px,
    H = 8 * px;
  const d = new Uint8ClampedArray(L * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      const xm = (x + 0.5) / px,
        ym = 8 - (y + 0.5) / px; // hauteur depuis le sol
      let c = [140, 185, 235]; // ciel
      const pignon = 4 + 3 * (1 - Math.abs((2 * xm) / 8 - 1));
      if (ym <= 4 || ym <= pignon) c = [222, 205, 176]; // enduit
      if ((xm >= 1 && xm < 2.2 && ym >= 0.9 && ym < 2.25) || (xm >= 5.6 && xm < 6.8 && ym >= 0.9 && ym < 2.25)) c = [55, 62, 70];
      if (xm >= 3.5 && xm < 4.4 && ym < 2.15) c = [120, 70, 40];
      const o = (y * L + x) * 4;
      d[o] = c[0]!;
      d[o + 1] = c[1]!;
      d[o + 2] = c[2]!;
      d[o + 3] = 255;
    }
  return { largeur: L, hauteur: H, donnees: d, px };
}

/** Photographie l'elevation : le mur (sol -> egout) tombe sur les coins donnes. */
function photographier(coinsMur: { x: number; y: number }[]) {
  const e = scene();
  // Elevation en metres (x, y depuis l'egout vers le bas) -> photo.
  const versPhoto = homographie([p(0, 0), p(8, 0), p(8, 4), p(0, 4)], coinsMur)!;
  const versElev = homographie(
    [p(0, 0), p(8, 0), p(8, 4), p(0, 4)].map((q) => appliquer(versPhoto, q)),
    [p(0, 0), p(8, 0), p(8, 4), p(0, 4)],
  )!;
  const W = 1000,
    Hp = 1100;
  const d = new Uint8ClampedArray(W * Hp * 4);
  for (let y = 0; y < Hp; y++)
    for (let x = 0; x < W; x++) {
      const m = appliquer(versElev, p(x + 0.5, y + 0.5)); // metres, y = 0 a l'egout
      const xi = Math.floor(m.x * e.px),
        yi = Math.floor((m.y + 4) * e.px);
      const o = (y * W + x) * 4;
      if (xi >= 0 && xi < e.largeur && yi >= 0 && yi < e.hauteur) {
        const s = (yi * e.largeur + xi) * 4;
        d[o] = e.donnees[s]!;
        d[o + 1] = e.donnees[s + 1]!;
        d[o + 2] = e.donnees[s + 2]!;
      } else if (m.y > 4) {
        d[o] = 110;
        d[o + 1] = 160;
        d[o + 2] = 80; // pelouse
      } else {
        d[o] = 140;
        d[o + 1] = 185;
        d[o + 2] = 235; // ciel
      }
      d[o + 3] = 255;
    }
  return { largeur: W, hauteur: Hp, donnees: d };
}

describe('analyserReleve', () => {
  const coins = [p(150, 520), p(860, 560), p(850, 900), p(140, 930)];
  const photo = photographier(coins);
  const r = analyserReleve({ photo, coins, largeur: 8, hauteur: 4, contour: [p(0, 0), p(8, 0), p(8, 6), p(0, 6)], cote: 0, distance: 6 })!;

  it('redresse le mur a l echelle', () => {
    expect(r.elevation.largeur).toBe(800);
    expect(r.elevation.hauteur).toBe(400);
    expect(r.couverture).toBeGreaterThan(0.99);
  });

  it('retrouve les ouvertures', () => {
    expect(r.ouvertures.map((o) => o.type)).toEqual(['fenetre', 'porte', 'fenetre']);
    expect(r.ouvertures[0]!.l).toBeCloseTo(1.2, 1);
    expect(r.ouvertures[0]!.y).toBeCloseTo(0.9, 1);
    expect(r.ouvertures[1]!.h).toBeCloseTo(2.15, 1);
  });

  it('etend la texture au-dessus de l egout et y repeint le ciel a la teinte du mur', () => {
    expect(r.hauteurTexture).toBeCloseTo(4 + 4.8, 1);
    expect(r.texture.hauteur).toBeGreaterThan(r.elevation.hauteur);
    // Coin haut gauche de la texture : du ciel sur la photo (a cote du pignon), du mur ici.
    const d = r.texture.donnees;
    expect(Math.abs(d[0]! - 222)).toBeLessThan(12);
    expect(Math.abs(d[2]! - 176)).toBeLessThan(12);
    // Le pignon lui-meme reste la photo : au milieu, juste sous le faite (2,5 m au-dessus de
    // l'egout), c'est l'enduit ; la toiture n'y est pas repeinte.
    const L = r.texture.largeur;
    const y = Math.round((r.hauteurTexture - 4 - 2.5) * r.pxParM);
    const o = (y * L + Math.round(L / 2)) * 4;
    expect(Math.abs(d[o]! - 222)).toBeLessThan(12);
  });

  it('reconnait le pignon et oriente le faitage perpendiculairement au mur', () => {
    expect(r.toitEstime!.forme).toBe('deux-pans');
    expect(r.toitEstime!.faitage).toBe('perpendiculaire');
    expect(r.toitPropose!.angleFaitage).toBe(90);
    expect(r.toitPropose!.hauteur).toBeCloseTo(3, 0);
  });
});

describe('coinsProposes', () => {
  it('place le mur a la bonne taille quand la distance est connue', () => {
    const f = focalePx(3024, 4032);
    const c = coinsProposes(3024, 4032, f, 3, 4, 2.5);
    // Largeur du mur sur l'image = 4 f / 3 ; et la distance qu'on en deduit redonne 3 m.
    expect(distanceParCadrage(4, c[1]!.x - c[0]!.x, f)).toBeCloseTo(3, 9);
    // Le sol est sous l'horizon (milieu de l'image), l'egout au-dessus.
    expect(c[3]!.y).toBeGreaterThan(2016);
    expect(c[0]!.y).toBeLessThan(2016);
  });

  it('propose un cadre sans distance', () => {
    const c = coinsProposes(1000, 800, null, null, 8, 4);
    expect(c[0]).toEqual({ x: 120, y: 96 });
  });
});

describe('exif', () => {
  /** Un JPEG minimal : SOI, APP1 Exif avec IFD0 -> sous-IFD Exif -> FocalLengthIn35mmFilm. */
  function jpeg(f35: number, petitBoutiste: boolean) {
    const tiff = new DataView(new ArrayBuffer(8 + 2 + 12 + 4 + 2 + 12 + 4));
    const le = petitBoutiste;
    tiff.setUint16(0, le ? 0x4949 : 0x4d4d);
    tiff.setUint16(2, 42, le);
    tiff.setUint32(4, 8, le);
    tiff.setUint16(8, 1, le); // IFD0 : une entree
    tiff.setUint16(10, 0x8769, le);
    tiff.setUint16(12, 4, le);
    tiff.setUint32(14, 1, le);
    tiff.setUint32(18, 26, le); // sous-IFD Exif a 26
    tiff.setUint32(22, 0, le);
    tiff.setUint16(26, 1, le);
    tiff.setUint16(28, 0xa405, le);
    tiff.setUint16(30, 3, le);
    tiff.setUint32(32, 1, le);
    tiff.setUint16(36, f35, le);
    const app1 = new Uint8Array(2 + 2 + 6 + tiff.byteLength);
    const v = new DataView(app1.buffer);
    v.setUint16(0, 0xffe1);
    v.setUint16(2, 2 + 6 + tiff.byteLength);
    v.setUint32(4, 0x45786966);
    app1.set(new Uint8Array(tiff.buffer), 10);
    const tout = new Uint8Array(2 + app1.length + 2);
    tout.set([0xff, 0xd8]);
    tout.set(app1, 2);
    tout.set([0xff, 0xd9], 2 + app1.length);
    return tout.buffer;
  }

  it('lit la focale 24x36 dans les deux boutismes', () => {
    expect(focale35mm(jpeg(26, true))).toBe(26);
    expect(focale35mm(jpeg(28, false))).toBe(28);
  });

  it('renvoie null sur autre chose qu un JPEG', () => {
    expect(focale35mm(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
  });

  it('convertit une focale en champ', () => {
    expect(champDepuisFocale35(18)).toBeCloseTo(90, 9);
  });
});
