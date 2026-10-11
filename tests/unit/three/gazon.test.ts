import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import { pixelsGazon, maillesDuPolygone, geometrieGazon, teinteGazon, materiauGazon } from '../../../src/three/gazon.js';
import { versLocalDepuis } from '../../../src/three/primitives.js';
import { signedArea } from '../../../src/geometry/basic.js';
import type { PtBrut } from '../../../src/model/types.js';

// Le gazon de la parcelle en 3D (three/gazon.ts) : une texture verte qui se raccorde a elle-meme,
// un maillage qui couvre exactement la parcelle et suit le sol, une teinte lente qui casse la repetition.

beforeAll(() => { Object.assign(globalThis, { THREE: THREE_NS }); });

const aire = (t: PtBrut[]) => Math.abs(signedArea(t));

describe('la texture du gazon', () => {
  const cote = 128;
  const px = pixelsGazon(cote);
  const rgb = (x: number, y: number) => { const k = (y * cote + x) * 4; return [px[k]!, px[k + 1]!, px[k + 2]!]; };

  it('est verte, nuancee, et reproductible', () => {
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < cote * cote; k++) { r += px[4 * k]!; g += px[4 * k + 1]!; b += px[4 * k + 2]!; }
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b * 1.5);
    const verts = new Set<number>();
    for (let k = 0; k < cote * cote; k += 7) verts.add(px[4 * k + 1]!);
    expect(verts.size).toBeGreaterThan(40);
    expect(pixelsGazon(cote)).toEqual(px);
  });

  it('se raccorde a elle-meme : les bords opposes se ressemblent autant que deux colonnes voisines', () => {
    const ecart = (a: number[], b: number[]) => Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!) + Math.abs(a[2]! - b[2]!);
    let bord = 0, interieur = 0;
    for (let y = 0; y < cote; y++) { bord += ecart(rgb(cote - 1, y), rgb(0, y)); interieur += ecart(rgb(63, y), rgb(64, y)); }
    expect(bord).toBeLessThan(interieur * 1.5);
  });
});

describe('les mailles du gazon', () => {
  const L = [{ x: 0.3, y: 0.2 }, { x: 12.7, y: 0.2 }, { x: 12.7, y: 5.4 }, { x: 6.1, y: 5.4 }, { x: 6.1, y: 9.8 }, { x: 0.3, y: 9.8 }];

  it('couvrent exactement un polygone concave, mailles du bord coupees au contour', () => {
    const t = maillesDuPolygone(L);
    expect(t.reduce((s, x) => s + aire(x), 0)).toBeCloseTo(aire(L), 6);
    expect(t.length).toBeGreaterThan(2 * 60);
  });

  it('suivent la grille du sol quand on la leur donne', () => {
    const t = maillesDuPolygone(L, 0.5, { x: 0.25, y: 0.75 });
    expect(t.reduce((s, x) => s + aire(x), 0)).toBeCloseTo(aire(L), 6);
    // Les sommets des mailles entieres tombent sur les noeuds de la grille.
    const interieurs = t.flat().filter(p => p.x > 1 && p.x < 5 && p.y > 1 && p.y < 5);
    expect(interieurs.length).toBeGreaterThan(0);
    interieurs.forEach(p => { expect(((p.x - 0.25) / 0.5) % 1).toBeCloseTo(0, 6); expect(Math.abs(((p.y - 0.75) / 0.5) % 1)).toBeCloseTo(0, 6); });
  });
});

describe('la geometrie et le materiau du gazon', () => {
  const carre = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

  it('pose chaque sommet sur le sol, normales vers le ciel, texture en metres, teinte dans les couleurs', () => {
    const sol = (p: PtBrut) => 0.1 * p.x;
    const geo = geometrieGazon(carre, versLocalDepuis({ x: 5, y: 5 }), sol, 0.004);
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), uv = geo.getAttribute('uv'), col = geo.getAttribute('color');
    expect(pos.count).toBe(100 * 6);
    for (let k = 0; k < pos.count; k++) {
      expect(nor.getY(k)).toBeGreaterThan(0.9);
      expect(pos.getY(k)).toBeCloseTo(0.1 * uv.getX(k) + 0.004, 6);
    }
    expect(col.count).toBe(pos.count);
    const t = teinteGazon({ x: uv.getX(0), y: uv.getY(0) });
    [col.getX(0), col.getY(0), col.getZ(0)].forEach((v, i) => expect(v).toBeCloseTo(t[i]!, 5));
  });

  it('varie lentement de teinte, sans s ecarter de plus d un quart', () => {
    const a = teinteGazon({ x: 3, y: 4 }), b = teinteGazon({ x: 3.2, y: 4 }), loin = [0, 20, 40, 60].map(x => teinteGazon({ x, y: 7 })[1]);
    a.forEach((v, i) => { expect(Math.abs(v - b[i]!)).toBeLessThan(0.03); expect(v).toBeGreaterThan(0.75); expect(v).toBeLessThan(1.25); });
    expect(Math.max(...loin) - Math.min(...loin)).toBeGreaterThan(0.02);
  });

  it('sans canevas, reste un vert mat teinte par les sommets', () => {
    const m = materiauGazon();
    expect(m.vertexColors).toBe(true);
    expect(m.map).toBeNull();
    expect(m.roughness).toBeGreaterThan(0.9);
  });
});
