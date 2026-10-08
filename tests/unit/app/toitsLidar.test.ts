import { describe, it, expect, vi } from 'vitest';
import { toitsDepuisLidar, toitAAjuster, texteBilanToitsLidar, MAX_BATIMENTS_LIDAR, type ObjetAToit } from '../../../src/app/toitsLidar.js';
import { hauteurToitEn, plansDuToit } from '../../../src/facade/toit.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { PtBrut, Toit } from '../../../src/model/types.js';

// L'etape « toits sur le LiDAR » d'un import ou d'une actualisation (MD/spec-toit-ign.md §10) :
// quels batiments, dans quel ordre, ce qui est garde, ce qui est ecrit.

const proj = projecteurLocal(48.9, 2.13);
const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const bdtopo: Toit = { forme: 'croupes', hauteur: 2, angleFaitage: 0, source: 'bdtopo', couleur: '#aa4433', origineCouleur: 'orthophoto' };

/** Un lecteur qui mesure un deux-pans de 3 m sur un egout de 6 m, quel que soit le contour. */
function lecteurDeuxPans(egout = 6, hauteur = 3) {
  return vi.fn(async (pts: readonly PtBrut[]) => {
    const plans = plansDuToit(pts, { forme: 'deux-pans', hauteur, angleFaitage: 0 });
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const out = [];
    for (let x = Math.min(...xs) + 0.75; x < Math.max(...xs) - 0.7; x += 0.5) for (let y = Math.min(...ys) + 0.75; y < Math.max(...ys) - 0.7; y += 0.5) out.push({ x, y, z: egout + hauteurToitEn(plans, { x, y }) });
    return out;
  });
}

describe('toitAAjuster', () => {
  it('ne retient que les batiments dont le toit vient de la BD TOPO ou du LiDAR, ou manque', () => {
    expect(toitAAjuster({ fonction: 'batiment', pts: rect(0, 0, 10, 8), toit: bdtopo })).toBe(true);
    expect(toitAAjuster({ fonction: 'batiment', pts: rect(0, 0, 10, 8), toit: { ...bdtopo, source: 'lidar' } })).toBe(true);
    expect(toitAAjuster({ fonction: 'batiment', pts: rect(0, 0, 10, 8) })).toBe(true);
    expect(toitAAjuster({ fonction: 'batiment', pts: rect(0, 0, 10, 8), toit: { ...bdtopo, source: 'photo' } })).toBe(false);
    expect(toitAAjuster({ fonction: 'batiment', pts: rect(0, 0, 10, 8), toit: { ...bdtopo, source: 'saisie' } })).toBe(false);
    expect(toitAAjuster({ fonction: 'terrain', pts: rect(0, 0, 10, 8), toit: bdtopo })).toBe(false);
    expect(toitAAjuster({ fonction: 'batiment', pts: [p(0, 0)], toit: bdtopo })).toBe(false);
  });
});

describe('toitsDepuisLidar', () => {
  it('ajuste les toits BD TOPO, garde la couleur, corrige l egout, et laisse les toits photo ou saisis', async () => {
    const objets: ObjetAToit[] = [
      { key: 'parcelle', fonction: 'terrain', pts: rect(-5, -5, 30, 30) },
      { key: 'a', fonction: 'batiment', pts: rect(0, 0, 12, 8), toit: { ...bdtopo }, elevation: 5 },
      { key: 'b', fonction: 'batiment', pts: rect(20, 0, 12, 8), toit: { ...bdtopo, source: 'saisie' }, elevation: 5 },
      { key: 'c', fonction: 'batiment', pts: rect(0, 20, 12, 8), toit: { ...bdtopo }, elevation: 5.8 },
    ];
    const lire = lecteurDeuxPans();
    const bilan = await toitsDepuisLidar(objets, proj, { lire, dalles: async () => true });
    expect(bilan).toEqual({ ajustes: 2, gardes: 0, sansLidar: false });
    expect(lire).toHaveBeenCalledTimes(2);
    const a = objets[1]!, b = objets[2]!, c = objets[3]!;
    expect(a.toit).toMatchObject({ forme: 'deux-pans', angleFaitage: 0, source: 'lidar', couleur: '#aa4433', origineCouleur: 'orthophoto' });
    expect(Math.abs(a.toit!.hauteur - 3)).toBeLessThan(0.1);
    // L'egout mesure a 6 m : la hauteur BD TOPO (5 m) est corrigee ; a 20 cm pres (5,8 m), elle reste.
    expect(a.elevation).toBe(6);
    expect(c.elevation).toBe(5.8);
    expect(b.toit!.source).toBe('saisie');
    expect(texteBilanToitsLidar(bilan)).toBe('2 toit(s) ajuste(s) sur le LiDAR HD');
  });

  it('ne lit rien sans dalle LiDAR, et le dit', async () => {
    const objets: ObjetAToit[] = [{ fonction: 'batiment', pts: rect(0, 0, 12, 8), toit: { ...bdtopo } }];
    const lire = lecteurDeuxPans();
    const bilan = await toitsDepuisLidar(objets, proj, { lire, dalles: async () => false });
    expect(bilan.sansLidar).toBe(true);
    expect(lire).not.toHaveBeenCalled();
    expect(objets[0]!.toit!.source).toBe('bdtopo');
    expect(texteBilanToitsLidar(bilan)).toBe(null);
  });

  it('garde le toit BD TOPO quand les mesures manquent ou ne s expliquent pas', async () => {
    const objets: ObjetAToit[] = [
      { key: 'a', fonction: 'batiment', pts: rect(0, 0, 12, 8), toit: { ...bdtopo } },
      { key: 'b', fonction: 'batiment', pts: rect(20, 0, 12, 8), toit: { ...bdtopo } },
    ];
    const lire = vi.fn(async (pts: readonly PtBrut[]) => {
      if (pts[0]!.x === 0) return [];
      // Deux corps a des hauteurs tres differentes : aucune forme simple.
      const out = [];
      for (let x = 20.75; x < 31.3; x += 0.5) for (let y = 0.75; y < 7.3; y += 0.5) out.push({ x, y, z: x > 26 ? 9 : 5 });
      return out;
    });
    const bilan = await toitsDepuisLidar(objets, proj, { lire, dalles: async () => true });
    expect(bilan).toEqual({ ajustes: 0, gardes: 1, sansLidar: false });
    expect(objets.every((o) => o.toit!.source === 'bdtopo')).toBe(true);
    expect(texteBilanToitsLidar(bilan)).toContain('1 garde(s)');
  });

  it('lit les plus proches de la parcelle d abord, dans la limite du nombre et du delai', async () => {
    const objets: ObjetAToit[] = [{ key: 'parcelle', fonction: 'terrain', pts: rect(0, 0, 20, 20) }];
    for (let k = 0; k < 12; k++) objets.push({ key: 'b' + k, fonction: 'batiment', pts: rect(100 - k * 8, 0, 6, 5), toit: { ...bdtopo } });
    const lus: string[] = [];
    const lire = vi.fn(async (pts: readonly PtBrut[]) => { lus.push(String(pts[0]!.x)); return []; });
    await toitsDepuisLidar(objets, proj, { lire, dalles: async () => true, maxBatiments: 5 });
    // Les cinq plus proches du centre (10, 10) : x = 12, 20, 28, 36, 44 — et les quatre premiers partent ensemble.
    expect(lus.map(Number).sort((a, b) => a - b)).toEqual([12, 20, 28, 36, 44]);
    expect(MAX_BATIMENTS_LIDAR).toBe(150);
    // Le delai ecoule, les batiments restants ne sont pas lus.
    let t = 0;
    const horloge = () => (t += 10000);
    const lire2 = vi.fn(async () => []);
    await toitsDepuisLidar(objets, proj, { lire: lire2, dalles: async () => true, delaiMs: 15000, maintenant: horloge });
    expect(lire2.mock.calls.length).toBeLessThan(12);
  });
});
