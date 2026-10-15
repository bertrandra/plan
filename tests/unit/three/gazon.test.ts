import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import { pixelsGazon, maillesDuPolygone, geometrieGazon, teinteGazon, materiauGazon, empreintesAuSol, RETRAIT_EMPREINTE_M } from '../../../src/three/gazon.js';
import { versLocalDepuis } from '../../../src/three/primitives.js';
import { signedArea, pointInPolygon } from '../../../src/geometry/basic.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

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

describe('l herbe s arrete la ou un objet occupe le sol', () => {
  const carre = (x0: number, y0: number, c: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + c, y: y0 }, { x: x0 + c, y: y0 + c }, { x: x0, y: y0 + c }];
  const parcelle = carre(0, 0, 20);
  const somme = (tris: PtBrut[][]) => tris.reduce((s, t) => s + aire(t), 0);
  const centre = (t: PtBrut[]) => ({ x: (t[0]!.x + t[1]!.x + t[2]!.x) / 3, y: (t[0]!.y + t[1]!.y + t[2]!.y) / 3 });

  it('perce le maillage de chaque empreinte, au centimetre pres, meme a cheval sur plusieurs mailles', () => {
    // Un bassin de 4 x 2,5 m pose de biais sur les mailles, et un massif qui deborde de la parcelle.
    const bassin = [{ x: 3.3, y: 4.1 }, { x: 7.3, y: 4.4 }, { x: 7.1, y: 6.9 }, { x: 3.1, y: 6.6 }];
    const bord = carre(18, 18, 4);
    const tris = maillesDuPolygone(parcelle, 1, { x: 0, y: 0 }, [bassin, bord]);
    expect(somme(tris)).toBeCloseTo(400 - aire(bassin) - 4, 1);
    tris.forEach((t) => { expect(pointInPolygon(centre(t), bassin)).toBe(false); expect(pointInPolygon(centre(t), bord)).toBe(false); });
    // Sans empreinte, rien ne change.
    expect(maillesDuPolygone(parcelle, 1, { x: 0, y: 0 }, [])).toEqual(maillesDuPolygone(parcelle, 1));
  });

  it('une seule regle pour tous les objets : piscine (bassin et plage), terrasse, chemin, batiment, annexe, pas l arbre ni le parasol', () => {
    const objets = [
      { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: parcelle },
      { key: 'piscine', type: 'polygon', fonction: 'piscine', pts: carre(2, 2, 4), piscine: { plage: 'dallage', largeurPlage: 1 } },
      { key: 'terrasse', type: 'polygon', fonction: 'terrasse', pts: carre(10, 2, 4) },
      { key: 'maison', type: 'polygon', fonction: 'batiment', pts: carre(10, 10, 6) },
      { key: 'abri', type: 'polygon', fonction: 'annexe', pts: carre(2, 14, 2) },
      { key: 'chemin', type: 'path', fonction: 'chemin', pts: [{ x: 1, y: 10 }, { x: 8, y: 10 }], width: 1 },
      { key: 'spa', type: 'circle', fonction: 'equipement', center: { x: 17, y: 3 }, r: 1 },
      { key: 'chene', type: 'circle', fonction: 'arbre', center: { x: 5, y: 18 }, r: 2 },
      { key: 'parasol', type: 'circle', fonction: 'parasol', center: { x: 12, y: 4 }, r: 1.5 },
      { key: 'vue', type: 'path', fonction: 'camera', pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
      { key: 'cache', type: 'polygon', fonction: 'dalle', pts: carre(14, 14, 2), hidden: true }
    ] as unknown as ObjetPlan[];
    const e = empreintesAuSol(objets);
    expect(e).toHaveLength(6);
    // La piscine couvre sa plage, pas seulement son bassin ; chaque empreinte est rentree de quelques centimetres.
    const piscine = e[0]!;
    expect(aire(piscine)).toBeGreaterThan(16);
    expect(pointInPolygon({ x: 1.2, y: 4 }, piscine)).toBe(true);
    expect(aire(e[1]!)).toBeCloseTo((4 - 2 * RETRAIT_EMPREINTE_M) ** 2, 3);
    // Le chemin : son ruban, a sa largeur.
    expect(pointInPolygon({ x: 4, y: 10.4 }, e[4]!)).toBe(true);
    expect(pointInPolygon({ x: 4, y: 10.6 }, e[4]!)).toBe(false);
  });

  it('la geometrie du gazon d une parcelle avec piscine n a plus un triangle dans le bassin', () => {
    const bassin = carre(5, 5, 4);
    const geo = geometrieGazon(parcelle, versLocalDepuis({ x: 0, y: 0 }), undefined, 0.004, undefined, [bassin]);
    const pos = geo.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
    for (let k = 0; k < pos.count; k += 3) {
      const c = { x: (pos.getX(k) + pos.getX(k + 1) + pos.getX(k + 2)) / 3, y: -(pos.getZ(k) + pos.getZ(k + 1) + pos.getZ(k + 2)) / 3 };
      expect(pointInPolygon(c, bassin)).toBe(false);
    }
  });
});
