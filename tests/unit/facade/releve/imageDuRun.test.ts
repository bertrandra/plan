import { describe, it, expect } from 'vitest';
import { hautDeLImage, imageDuRunAvecLaBande } from '../../../../src/facade/releve/imageDuRun.js';
import type { Image } from '../../../../src/facade/vision/homographie.js';
import type { Morceau } from '../../../../src/facade/releve/serie.js';

// L'image du run de Claude dans l'audit (lot F7) : la photo du releve redressee dans le plan du mur, du sol jusqu'au haut de la facade,
// pour que Claude y lise les pointes, la forme et les elements du toit ; ce qu'aucune photo ne montre est gris.

/** Une photo de face de 400 x 400 px : le ciel bleu en haut, un mur clair de x 100 a 300 et de y 200 (l'egout) a 360 (le sol), une souche sombre au-dessus de l'egout. */
function photo(): Image {
  const L = 400, H = 400, d = new Uint8ClampedArray(L * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const mur = x >= 100 && x < 300 && y >= 200 && y < 360, souche = x >= 150 && x < 165 && y >= 150 && y < 200;
    const c = souche ? [60, 40, 40] : mur ? [220, 210, 190] : y < 200 ? [120, 170, 230] : [80, 140, 70];
    d.set([c[0]!, c[1]!, c[2]!, 255], (y * L + x) * 4);
  }
  return { largeur: L, hauteur: H, donnees: d };
}
const morceau = (): Morceau => ({ prise: { photo: { image: photo() } }, coins: [{ x: 100, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 360 }, { x: 100, y: 360 }] }) as unknown as Morceau;

describe('l image du run avec la bande au-dessus de l egout', () => {
  it('monte du sol jusqu au haut de la facade (le gabarit ou le faitage), plus une marge, jamais plus de deux hauteurs de mur au-dessus', () => {
    expect(hautDeLImage(5, 1, null)).toBe(6);
    expect(hautDeLImage(5, 1.6, 7)).toBe(9);
    expect(hautDeLImage(4, 1, 30)).toBe(12);
  });

  it('redresse la photo dans le plan du mur, la souche au-dessus de l egout comprise, et peint en gris ce que la photo ne montre pas', () => {
    let encodee: Image | null = null;
    const r = imageDuRunAvecLaBande(morceau(), 10, 8, 20, (img) => { encodee = img; return 'data:image/jpeg;base64,X'; })!;
    expect(r.egoutPart).toBe(0.4);
    expect(r.hauteur / r.largeur).toBeCloseTo(2, 1);
    const img = encodee as unknown as Image;
    const px = (u: number, h: number) => { const x = Math.floor(u * img.largeur), y = Math.floor((1 - h / 20) * img.hauteur); const k = (y * img.largeur + x) * 4; return [img.donnees[k], img.donnees[k + 1], img.donnees[k + 2]]; };
    expect(px(0.5, 4)).toEqual([220, 210, 190]);
    // La souche, a 2,5 m du bout gauche, 1 m au-dessus de l'egout (8 m) : sur l'image du run, plus dans le releve coupe a l'egout.
    expect(px(0.28, 9)).toEqual([60, 40, 40]);
    // Au-dessus du cadre de la photo (la bande monte a 20 m, la photo s'arrete a 12,5 m environ) : gris.
    expect(px(0.5, 19.5)).toEqual([128, 128, 128]);
  });
});
