import { describe, it, expect } from 'vitest';
import { facadesDuContour, nomOrientation, stationDevant } from '../../../src/facade/geometrie.js';
import { focalePx, distanceParCadrage, distancePourToutCadrer, etalonnerChamp, consigneAplomb, planDePrise, consignePrise } from '../../../src/facade/cadrage.js';
import { homographie, appliquer, redresser, resolutionTexture, type Image } from '../../../src/facade/homographie.js';
import { detecterOuvertures, aligner, classer } from '../../../src/facade/detection.js';

const p = (x: number, y: number) => ({ x, y });
// Une maison de 10 x 6 m, contour trigonometrique : le cote 0 va d'ouest en est au sud.
const maison = [p(0, 0), p(10, 0), p(10, 6), p(0, 6)];

describe('facadesDuContour', () => {
  it('donne une facade par cote, orientee vers l exterieur', () => {
    const f = facadesDuContour(maison, 5.5);
    expect(f.map((x) => x.orientation)).toEqual(['Sud', 'Est', 'Nord', 'Ouest']);
    expect(f[0]!.azimut).toBeCloseTo(180, 9);
    expect(f[0]!.largeur).toBeCloseTo(10, 9);
    // Vue de dehors, au sud, face au mur : l'ouest est a gauche.
    expect(f[0]!.gauche).toEqual(p(0, 0));
    expect(f[0]!.droite).toEqual(p(10, 0));
  });

  it('ne depend pas du sens de saisie', () => {
    const horaire = [...maison].reverse();
    const f = facadesDuContour(horaire, 5.5);
    const sud = f.find((x) => x.orientation === 'Sud')!;
    expect(sud.gauche).toEqual(p(0, 0));
    expect(sud.droite).toEqual(p(10, 0));
  });

  it('ecarte les cotes de moins de 10 cm sans renumeroter', () => {
    const f = facadesDuContour([p(0, 0), p(10, 0), p(10, 0.05), p(10, 6), p(0, 6)], 3);
    expect(f.map((x) => x.cote)).toEqual([0, 2, 3, 4]);
  });

  it('place la station de prise de vue devant le mur', () => {
    const sud = facadesDuContour(maison, 5)[0]!;
    const s = stationDevant(sud, 3);
    expect(s.x).toBeCloseTo(5, 9);
    expect(s.y).toBeCloseTo(-3, 9);
  });

  it('nomme les huit vents', () => {
    expect(nomOrientation(44)).toBe('Nord-Est');
    expect(nomOrientation(359)).toBe('Nord');
    expect(nomOrientation(-90)).toBe('Ouest');
  });
});

describe('cadrage', () => {
  const f = focalePx(4032, 3024, 67);

  it('retrouve la distance d un mur de largeur connue', () => {
    // Un mur de 4 m a 3 m : il occupe 4 f / 3 pixels.
    const px = (4 * f) / 3;
    expect(distanceParCadrage(4, px, f)).toBeCloseTo(3, 9);
  });

  it('refuse une mesure de quelques pixels', () => {
    expect(distanceParCadrage(4, 2, f)).toBeNull();
  });

  it('calcule la distance pour tout cadrer', () => {
    const d = distancePourToutCadrer(10, 6, 3024, 4032, f);
    // En portrait, la largeur du mur commande : 10 m x 1,2 sur 3024 px.
    expect(d).toBeCloseTo((12 * f) / 3024, 6);
  });

  it('etalonne le champ depuis une mesure', () => {
    const px = (2 * f) / 5;
    expect(etalonnerChamp(5, 2, px, 4032)).toBeCloseTo(67, 6);
  });

  it('guide l aplomb', () => {
    expect(consigneAplomb(92).bon).toBe(true);
    expect(consigneAplomb(70).message).toMatch(/vers le mur/);
    expect(consigneAplomb(null).bon).toBe(true);
  });
});

/** Une image unie, avec des rectangles peints. */
function peindre(l: number, h: number, fond: [number, number, number], rects: { x: number; y: number; l: number; h: number; c: [number, number, number] }[], bruit = 6): Image {
  const d = new Uint8ClampedArray(l * h * 4);
  let graine = 7;
  const alea = () => ((graine = (graine * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * bruit;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      let c = fond;
      for (const r of rects) if (x >= r.x && x < r.x + r.l && y >= r.y && y < r.y + r.h) c = r.c;
      const o = (y * l + x) * 4;
      d[o] = c[0] + alea();
      d[o + 1] = c[1] + alea();
      d[o + 2] = c[2] + alea();
      d[o + 3] = 255;
    }
  return { largeur: l, hauteur: h, donnees: d };
}

describe('homographie', () => {
  it('envoie les quatre points ou il faut, et interpole le reste', () => {
    const de = [p(0, 0), p(100, 0), p(100, 50), p(0, 50)];
    const vers = [p(10, 5), p(90, 12), p(95, 70), p(3, 60)];
    const H = homographie(de, vers)!;
    de.forEach((q, i) => {
      const r = appliquer(H, q);
      expect(r.x).toBeCloseTo(vers[i]!.x, 6);
      expect(r.y).toBeCloseTo(vers[i]!.y, 6);
    });
  });

  it('refuse trois points alignes', () => {
    expect(homographie([p(0, 0), p(1, 0), p(2, 0), p(0, 1)], [p(0, 0), p(1, 0), p(1, 1), p(0, 1)])).toBeNull();
  });

  it('borne la resolution de la texture', () => {
    expect(resolutionTexture(4, 3)).toBe(100);
    expect(resolutionTexture(20, 6)).toBeCloseTo(1024 / 20, 9);
  });
});

// Une facade de 8 x 5 m a 100 px/m : enduit beige, deux fenetres et une porte.
const ENDUIT: [number, number, number] = [222, 205, 176];
const VITRE: [number, number, number] = [55, 62, 70];
const elevation = peindre(800, 500, ENDUIT, [
  { x: 100, y: 500 - 90 - 135, l: 120, h: 135, c: VITRE }, // fenetre 1,20 x 1,35, appui 0,90
  { x: 560, y: 500 - 90 - 135, l: 120, h: 135, c: VITRE },
  { x: 350, y: 500 - 215, l: 90, h: 215, c: [120, 70, 40] }, // porte 0,90 x 2,15
]);

describe('detecterOuvertures', () => {
  it('retrouve fenetres et porte a quelques centimetres pres', () => {
    const o = detecterOuvertures(elevation, 100);
    expect(o).toHaveLength(3);
    const [f1, porte, f2] = o;
    expect(f1!.type).toBe('fenetre');
    expect(f1!.x).toBeCloseTo(1, 2);
    expect(f1!.y).toBeCloseTo(0.9, 2);
    expect(f1!.l).toBeCloseTo(1.2, 2);
    expect(f1!.h).toBeCloseTo(1.35, 2);
    expect(porte!.type).toBe('porte');
    expect(porte!.y).toBe(0);
    expect(porte!.h).toBeCloseTo(2.15, 2);
    expect(f2!.x).toBeCloseTo(5.6, 2);
    // Meme niveau : linteaux alignes au centimetre.
    expect(f1!.y + f1!.h).toBeCloseTo(f2!.y + f2!.h, 6);
  });

  it('ne voit rien sur un mur nu', () => {
    expect(detecterOuvertures(peindre(400, 300, ENDUIT, []), 100)).toEqual([]);
  });

  it('ignore un soubassement qui court tout le long', () => {
    const img = peindre(800, 500, ENDUIT, [{ x: 0, y: 440, l: 800, h: 60, c: [90, 90, 90] }]);
    expect(detecterOuvertures(img, 100)).toEqual([]);
  });

  it('aligne les cotes voisines', () => {
    expect(aligner([2.2, 2.25, 4.9], 0.12)).toEqual([2.225, 2.225, 4.9]);
  });

  it('classe selon la taille et l appui', () => {
    expect(classer(0, 2.4, 2)).toBe('garage');
    expect(classer(0, 1.4, 2.15)).toBe('porte-fenetre');
    expect(classer(0, 0.9, 2.15)).toBe('porte');
    expect(classer(1, 1, 1.2)).toBe('fenetre');
  });
});

describe('redresser puis detecter', () => {
  it('redresse une photo prise de biais et retrouve les ouvertures a l echelle', () => {
    // On "photographie" l'elevation : on la projette par une homographie dans une photo 900 x 700.
    const coinsPhoto = [p(120, 90), p(800, 140), p(780, 610), p(90, 640)];
    const H = homographie(coinsPhoto, [p(0, 0), p(800, 0), p(800, 500), p(0, 500)])!;
    const photo = new Uint8ClampedArray(900 * 700 * 4);
    for (let y = 0; y < 700; y++)
      for (let x = 0; x < 900; x++) {
        const q = appliquer(H, p(x + 0.5, y + 0.5));
        const o = (y * 900 + x) * 4;
        const xi = Math.floor(q.x),
          yi = Math.floor(q.y);
        if (xi >= 0 && yi >= 0 && xi < 800 && yi < 500) {
          const s = (yi * 800 + xi) * 4;
          photo[o] = elevation.donnees[s]!;
          photo[o + 1] = elevation.donnees[s + 1]!;
          photo[o + 2] = elevation.donnees[s + 2]!;
        } else {
          photo[o] = 120;
          photo[o + 1] = 170;
          photo[o + 2] = 90; // pelouse
        }
        photo[o + 3] = 255;
      }
    const r = redresser({ largeur: 900, hauteur: 700, donnees: photo }, coinsPhoto, 8, 5, 50)!;
    expect(r.image.largeur).toBe(400);
    expect(r.image.hauteur).toBe(250);
    expect(r.couverture).toBeGreaterThan(0.99);
    const o = detecterOuvertures(r.image, r.pxParM, r.vu);
    expect(o.map((x) => x.type)).toEqual(['fenetre', 'porte', 'fenetre']);
    expect(o[0]!.l).toBeCloseTo(1.2, 1);
    expect(o[1]!.h).toBeCloseTo(2.15, 1);
  });

  it('complete ce que la photo n a pas vu avec la teinte du mur', () => {
    const img = peindre(100, 100, ENDUIT, [], 0);
    // Coins debordant a droite : la moitie droite du mur est hors photo.
    const r = redresser(img, [p(0, 0), p(200, 0), p(200, 100), p(0, 100)], 2, 1, 50)!;
    expect(r.couverture).toBeCloseTo(0.5, 1);
    const o = (10 * r.image.largeur + 90) * 4;
    expect(r.image.donnees[o]).toBeCloseTo(ENDUIT[0], -1);
  });
});

describe('plan de prise', () => {
  // Telephone en portrait, 3024 x 4032, objectif principal : a 3 m, ~3 m de large et ~4 m de haut.
  const f = focalePx(3024, 4032, 67);

  it('une photo quand tout tient', () => {
    const pl = planDePrise(2.5, 3, 3, 3024, 4032, f);
    expect(pl.photos).toBe(1);
    expect(pl.hauteurTient).toBe(true);
    expect(consignePrise(pl, 0, false).ton).toBe('bon');
  });

  it('plusieurs photos quand la largeur ne tient pas, avec le pas le long du mur', () => {
    const pl = planDePrise(8, 3, 3, 3024, 4032, f);
    expect(pl.photos).toBe(4);
    expect(pl.pas).toBeGreaterThan(1.5);
    expect(pl.pas).toBeLessThan(pl.couvre.largeur);
    expect(consignePrise(pl, 0, false).message).toMatch(/4 photos/);
    expect(consignePrise(pl, 3, false).message).toMatch(/coin droit/);
  });

  it('alerte quand la hauteur ne tient pas, et dit a quelle distance reculer', () => {
    const pl = planDePrise(8, 6, 3, 3024, 4032, f);
    expect(pl.hauteurTient).toBe(false);
    const c = consignePrise(pl, 0, true);
    expect(c.ton).toBe('alerte');
    expect(c.message).toMatch(/grand-angle/);
    expect(pl.reculPourHauteur).toBeGreaterThan(3);
    expect(planDePrise(8, 6, pl.reculPourHauteur + 0.01, 3024, 4032, f).hauteurTient).toBe(true);
  });
});
