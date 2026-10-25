import { describe, it, expect } from 'vitest';
import { detecterOrb, apparier, hamming, BITS } from '../../../../src/facade/vision/orb.js';
import { ransacSimilitude, ajuster, appliquerSimilitude, composer, inverse, echelleDe, rotationDeg, type Paire, type Similitude } from '../../../../src/facade/vision/ransac.js';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { peindreElevation, type SceneFacade } from '../../../banc/facades/synthese.js';
import type { Image } from '../../../../src/facade/vision/homographie.js';

// ORB et RANSAC : des points d'interet decrits, apparies d'une elevation a l'autre, et la similitude qui les explique.
// On decoupe deux fenetres qui se recouvrent dans la meme elevation de facade peinte (brique, joints, baies) : la vraie
// translation entre elles est connue, ORB + RANSAC doivent la retrouver au pixel.

const corpus = chargerCorpus();
const scene = (debut: string): SceneFacade => corpus.find((c) => c.nom.startsWith(debut)) as SceneFacade;

/** Une fenetre de l'image : le rectangle (x, y, l, h), copie a part. */
function fenetre(img: Image, x: number, y: number, l: number, h: number): Image {
  const donnees = new Uint8ClampedArray(l * h * 4);
  for (let j = 0; j < h; j++) donnees.set(img.donnees.subarray(((y + j) * img.largeur + x) * 4, ((y + j) * img.largeur + x + l) * 4), j * l * 4);
  return { largeur: l, hauteur: h, donnees };
}

/** L'image mise a l'echelle `k` par plus proche voisin. */
function echelle(img: Image, k: number): Image {
  const l = Math.round(img.largeur * k), h = Math.round(img.hauteur * k);
  const donnees = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
    const sx = Math.min(img.largeur - 1, Math.floor(x / k)), sy = Math.min(img.hauteur - 1, Math.floor(y / k));
    donnees.set(img.donnees.subarray((sy * img.largeur + sx) * 4, (sy * img.largeur + sx) * 4 + 4), (y * l + x) * 4);
  }
  return { largeur: l, hauteur: h, donnees };
}

const elevation = peindreElevation(scene('03-'), 100, false);

describe('ORB', () => {
  const A = fenetre(elevation, 0, 0, 640, 480);
  it('trouve des points repartis, avec 256 bits chacun, et recommence a l identique', () => {
    const p = detecterOrb(A);
    expect(p.length).toBeGreaterThan(100);
    expect(p.length).toBeLessThanOrEqual(700);
    expect(p[0]?.bits.length).toBe(BITS / 32);
    const q = detecterOrb(A);
    expect(q.map((x) => [x.x, x.y, x.angle])).toEqual(p.map((x) => [x.x, x.y, x.angle]));
    expect(hamming(p[0]!.bits, q[0]!.bits)).toBe(0);
    // Repartis : les points ne sont pas tous dans un coin.
    const quarts = new Set(p.map((x) => (x.x < 320 ? 0 : 1) + (x.y < 240 ? 0 : 2)));
    expect(quarts.size).toBeGreaterThanOrEqual(3);
  });

  it('ne trouve rien dans un aplat', () => {
    const plat: Image = { largeur: 200, hauteur: 200, donnees: new Uint8ClampedArray(200 * 200 * 4).fill(180) };
    expect(detecterOrb(plat)).toEqual([]);
  });

  it('apparie deux fenetres qui se recouvrent, et RANSAC retrouve le decalage au pixel', () => {
    // B est A decalee de (dx, dy) : un point (x, y) de A est en (x - dx, y - dy) dans B.
    const dx = 170, dy = 40;
    const B = fenetre(elevation, dx, dy, 640, 480);
    const a = detecterOrb(A), b = detecterOrb(B);
    const m = apparier(a, b);
    expect(m.length).toBeGreaterThan(20);
    const paires: Paire[] = m.map(({ i, j }) => ({ de: { x: a[i]!.x, y: a[i]!.y }, vers: { x: b[j]!.x, y: b[j]!.y } }));
    const r = ransacSimilitude(paires);
    expect(r).not.toBeNull();
    expect(r!.inliers.length).toBeGreaterThanOrEqual(15);
    expect(r!.modele.tx).toBeCloseTo(-dx, 0);
    expect(r!.modele.ty).toBeCloseTo(-dy, 0);
    expect(echelleDe(r!.modele)).toBeCloseTo(1, 2);
    expect(Math.abs(rotationDeg(r!.modele))).toBeLessThan(0.3);
    expect(r!.rms).toBeLessThan(1.5);
  });

  it('retrouve un changement d echelle de 10 %', () => {
    const B = echelle(fenetre(elevation, 100, 0, 640, 480), 1.1);
    const a = detecterOrb(A), b = detecterOrb(B);
    const paires = apparier(a, b).map(({ i, j }) => ({ de: { x: a[i]!.x, y: a[i]!.y }, vers: { x: b[j]!.x, y: b[j]!.y } }));
    const r = ransacSimilitude(paires, { seuilPx: 4 });
    expect(r).not.toBeNull();
    expect(echelleDe(r!.modele)).toBeCloseTo(1.1, 1);
  });

  it('deux fenetres qui ne se recouvrent pas ne s accordent sur rien de coherent', () => {
    const loin = fenetre(elevation, Math.max(0, elevation.largeur - 300), Math.max(0, elevation.hauteur - 250), 300, 250);
    const a = detecterOrb(fenetre(elevation, 0, 0, 300, 250)), b = detecterOrb(loin);
    const paires = apparier(a, b).map(({ i, j }) => ({ de: { x: a[i]!.x, y: a[i]!.y }, vers: { x: b[j]!.x, y: b[j]!.y } }));
    const r = ransacSimilitude(paires);
    expect(r === null || r.inliers.length < 12).toBe(true);
  });
});

describe('RANSAC', () => {
  const vraie: Similitude = { a: 0.99, b: 0.02, tx: -35, ty: 12 };
  const points = Array.from({ length: 60 }, (_, k) => ({ x: (k * 37) % 500, y: (k * 91) % 400 }));
  const paires: Paire[] = points.map((p) => ({ de: p, vers: appliquerSimilitude(vraie, p) }));

  it('retrouve une similitude exacte, et l ajustement la rend a la machine pres', () => {
    const m = ajuster(paires)!;
    for (const k of ['a', 'b', 'tx', 'ty'] as const) expect(m[k]).toBeCloseTo(vraie[k], 9);
  });

  it('ecarte 40 % de correspondances fausses, et rejoue le meme resultat', () => {
    const fausses = paires.map((p, k) => (k % 5 < 2 ? { de: p.de, vers: { x: (k * 53) % 480, y: (k * 29) % 390 } } : p));
    const r = ransacSimilitude(fausses, { seuilPx: 1 })!;
    expect(r.inliers.length).toBe(paires.filter((_, k) => k % 5 >= 2).length);
    expect(r.modele.tx).toBeCloseTo(vraie.tx, 6);
    expect(ransacSimilitude(fausses, { seuilPx: 1 })).toEqual(r);
  });

  it('refuse moins de deux paires, et compose et inverse sont justes', () => {
    expect(ransacSimilitude(paires.slice(0, 1))).toBeNull();
    const inv = inverse(vraie)!;
    const p = { x: 123, y: 45 };
    const aller = appliquerSimilitude(vraie, p), retour = appliquerSimilitude(inv, aller);
    expect(retour.x).toBeCloseTo(p.x, 9);
    expect(retour.y).toBeCloseTo(p.y, 9);
    const c = composer(vraie, vraie), d = appliquerSimilitude(vraie, appliquerSimilitude(vraie, p)), e = appliquerSimilitude(c, p);
    expect(e.x).toBeCloseTo(d.x, 9);
    expect(e.y).toBeCloseTo(d.y, 9);
  });
});
