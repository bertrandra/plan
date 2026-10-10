import { describe, it, expect, vi } from 'vitest';
import { toitsDepuisLidar, toitAAjuster, texteBilanToitsLidar, batimentsMitoyens, MAX_BATIMENTS_LIDAR, type ObjetAToit } from '../../../src/app/toitsLidar.js';
import { hauteurToitEn, plansDuToit } from '../../../src/facade/toit.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { GrilleRelief } from '../../../src/model/relief.js';
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
    expect(bilan).toEqual({ ajustes: 2, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: false });
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
    expect(bilan).toEqual({ ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 1, sansLidar: false });
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

  it('sur la parcelle du projet, garde le toit tel que mesure et donne a chaque corps son egout', async () => {
    // Un L : un corps a deux pans sur 6 m d'egout, une aile plate a 3,5 m.
    const corps = rect(0, 0, 12, 8), aile = rect(0, 8, 6, 5);
    const L = [p(0, 0), p(12, 0), p(12, 8), p(6, 8), p(6, 13), p(0, 13)];
    const plans = plansDuToit(corps, { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 });
    const dedans = (x: number, y: number, r: PtBrut[]) => x > r[0]!.x && x < r[2]!.x && y > r[0]!.y && y < r[2]!.y;
    // Et le voisin, plus loin : un deux-pans de 12 x 8 sur 5 m d'egout.
    const voisin = rect(20, 0, 12, 8), plansVoisin = plansDuToit(voisin, { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0 });
    const z = (x: number, y: number) => (dedans(x, y, corps) ? 6 + hauteurToitEn(plans, { x, y }) : dedans(x, y, aile) ? 3.5 : dedans(x, y, voisin) ? 5 + hauteurToitEn(plansVoisin, { x, y }) : 0);
    // La grille sous l'emprise demandee, a 1 m de marge, comme le service.
    const lireGrille = vi.fn(async (pts: readonly PtBrut[]): Promise<GrilleRelief> => {
      const pas = 0.5, x0 = Math.min(...pts.map((q) => q.x)) - 1, y0 = Math.max(...pts.map((q) => q.y)) + 1;
      const nx = Math.round((Math.max(...pts.map((q) => q.x)) + 1 - x0) / pas) + 1, ny = Math.round((y0 - Math.min(...pts.map((q) => q.y)) + 1) / pas) + 1;
      const zs: number[] = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) zs.push(z(x0 + i * pas, y0 - j * pas));
      return { pas, x0, y0, nx, ny, z: zs };
    });
    const objets: ObjetAToit[] = [
      { key: 'parcelle', fonction: 'terrain', pts: rect(-5, -5, 30, 30) },
      { key: 'm', fonction: 'batiment', pts: L, toit: { ...bdtopo }, elevation: 5, bdtopo: { surParcellePrincipale: true } },
      { key: 'v', fonction: 'batiment', pts: rect(20, 0, 12, 8), toit: { ...bdtopo }, elevation: 5 },
    ];
    const lire = lecteurDeuxPans();
    const bilan = await toitsDepuisLidar(objets, proj, { lire, lireGrille, dalles: async () => true });
    // La grille est lue pour la maison du projet et, l'option du voisinage etant cochee par defaut, pour le voisin.
    expect(lireGrille).toHaveBeenCalledTimes(2);
    expect(lire).toHaveBeenCalledTimes(0);
    const m = objets[1]!;
    expect(m.toitMesure).toMatchObject({ source: 'lidar', egout: 3.5, pas: 0.5 });
    // Et ses corps reconstruits sur la mesure (facade/toitCorps.ts) : le corps haut et l'aile basse.
    expect(m.corpsToit?.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...m.corpsToit!.map((c) => c.faitage))).toBeGreaterThan(8.5);
    expect(Math.min(...m.corpsToit!.map((c) => c.faitage))).toBeCloseTo(3.5, 0);
    expect(m.toitMesure!.faite).toBeGreaterThan(8.5);
    // Chaque corps a son egout, lu dans la surface mesuree : 3,5 m pour l'aile, l'egout du deux-pans pour le corps.
    expect(m.volumesToit).toHaveLength(2);
    const egouts = m.volumesToit!.map((v) => v.egout!).sort((a, b) => a - b);
    expect(egouts[0]).toBe(3.5);
    expect(egouts[1]).toBeGreaterThan(6);
    expect(egouts[1]).toBeLessThan(6.7);
    // L'egout du toit entier (le plus bas) devient la hauteur du prisme.
    expect(m.elevation).toBe(3.5);
    // Le voisin : ses corps et pignons, sans la grille gardee.
    expect(objets[2]!.toitMesure).toBeUndefined();
    expect(objets[2]!.corpsToit?.length).toBeGreaterThanOrEqual(1);
    expect(bilan).toEqual({ ajustes: 2, mesures: 1, corpsVoisins: 1, recales: 0, gardes: 0, sansLidar: false });
    expect(texteBilanToitsLidar(bilan)).toBe('2 toit(s) ajuste(s) sur le LiDAR HD, 1 toit(s) de la parcelle garde(s) tel(s) que mesure(s), 1 toit(s) du voisinage en corps et pignons');
    // Decochee dans « Voisinage (3D) » : le voisin n'est lu que pour sa forme simple.
    const sans: ObjetAToit[] = [
      { key: 'parcelle', fonction: 'terrain', pts: rect(-5, -5, 30, 30), voisinage3d: { toits: { corps: false } } } as ObjetAToit,
      { key: 'v', fonction: 'batiment', pts: rect(20, 0, 12, 8), toit: { ...bdtopo }, elevation: 5 },
    ];
    const lireGrille2 = vi.fn(lireGrille);
    const b2 = await toitsDepuisLidar(sans, proj, { lire: lecteurDeuxPans(), lireGrille: lireGrille2, dalles: async () => true });
    expect(lireGrille2).not.toHaveBeenCalled();
    expect(sans[1]!.corpsToit).toBeUndefined();
    expect(b2.corpsVoisins).toBe(0);
  });

  it('coupe une maison rectangulaire a la marche de sa couverture, chaque bloc avec ses murs mesures', async () => {
    // 14 x 6 : deux niveaux a gauche de x = 8 (toit plat a 7 m), un seul a droite (3,5 m).
    const maison = rect(0, 0, 14, 6);
    const dedans = (x: number, y: number, r: PtBrut[]) => x > r[0]!.x && x < r[2]!.x && y > r[0]!.y && y < r[2]!.y;
    const lireGrille = vi.fn(async (): Promise<GrilleRelief> => {
      const pas = 0.5, x0 = -0.75, y0 = 6.75, nx = 32, ny = 16;
      const zs: number[] = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * pas, y = y0 - j * pas; zs.push(dedans(x, y, maison) ? (x < 8 ? 7 : 3.5) : 0); }
      return { pas, x0, y0, nx, ny, z: zs };
    });
    const objets: ObjetAToit[] = [
      { key: 'parcelle', fonction: 'terrain', pts: rect(-5, -5, 30, 30) },
      { key: 'm', fonction: 'batiment', pts: maison, toit: { ...bdtopo }, elevation: 5, bdtopo: { surParcellePrincipale: true } },
    ];
    await toitsDepuisLidar(objets, proj, { lire: lecteurDeuxPans(), lireGrille, dalles: async () => true });
    const m = objets[1]!;
    expect(m.volumesToit).toHaveLength(2);
    const [haut, basV] = m.volumesToit!;
    expect(haut!.egout).toBe(7);
    expect(basV!.egout).toBe(3.5);
    expect(haut!.hauteursMurs).toEqual([7, 7, 7, 7]);
    expect(basV!.hauteursMurs).toEqual([3.5, 3.5, 3.5, 3.5]);
    expect(haut!.toit.forme).toBe('plat');
  });

  it('les maisons des parcelles mitoyennes ont le calcul entier, toit mesure garde ; les autres, la version allegee', async () => {
    // La parcelle du projet (0..20), une mitoyenne a l'est (20..40) qui porte une maison, une parcelle eloignee (60..80).
    const projet: ObjetAToit = { key: 'parcelle', fonction: 'terrain', pts: rect(0, 0, 20, 20) };
    const mitoyenne: ObjetAToit = { key: 'p-est', fonction: 'terrain', pts: rect(20, 0, 20, 20) };
    const loin: ObjetAToit = { key: 'p-loin', fonction: 'terrain', pts: rect(60, 0, 20, 20) };
    const voisine: ObjetAToit = { key: 'm-est', fonction: 'batiment', pts: rect(24, 4, 12, 8), toit: { ...bdtopo }, elevation: 5 };
    const lointaine: ObjetAToit = { key: 'm-loin', fonction: 'batiment', pts: rect(64, 4, 12, 8), toit: { ...bdtopo }, elevation: 5 };
    const objets = [projet, mitoyenne, loin, voisine, lointaine];
    expect([...batimentsMitoyens(objets)]).toEqual([voisine]);
    const lireGrille = vi.fn(async (pts: readonly PtBrut[]): Promise<GrilleRelief> => {
      const r = { x0: Math.min(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)) };
      const plans = plansDuToit(pts, { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0 });
      const pas = 0.5, x0 = r.x0 - 1, y0 = Math.max(...pts.map((q) => q.y)) + 1, nx = 29, ny = 21;
      const zs: number[] = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = x0 + i * pas, y = y0 - j * pas;
        zs.push(x > r.x0 && x < r.x0 + 12 && y > r.y0 && y < r.y0 + 8 ? 5 + hauteurToitEn(plans, { x, y }) : 0);
      }
      return { pas, x0, y0, nx, ny, z: zs };
    });
    const bilan = await toitsDepuisLidar(objets, proj, { lire: lecteurDeuxPans(), lireGrille, dalles: async () => true });
    expect(voisine.toitMesure).toMatchObject({ source: 'lidar' });
    expect(voisine.corpsToit?.length).toBeGreaterThanOrEqual(1);
    expect(lointaine.toitMesure).toBeUndefined();
    expect(lointaine.corpsToit?.length).toBeGreaterThanOrEqual(1);
    expect(bilan.corpsVoisins).toBe(2);
  });

  it('recale d un bloc sur le LiDAR un batiment trace deux metres a cote, et seulement celui-la', async () => {
    // La BD TOPO trace la maison de 10 x 7 en y = 0..7 ; le LiDAR la voit en y = -2..5.
    const vrai = rect(0, -2, 10, 7);
    const plans = plansDuToit(vrai, { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 });
    const lireGrille = vi.fn(async (pts: readonly PtBrut[]): Promise<GrilleRelief> => {
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      const pas = 0.5, x0 = Math.min(...xs) - 1, y0 = Math.max(...ys) + 1;
      const nx = Math.round((Math.max(...xs) + 1 - x0) / pas) + 1, ny = Math.round((y0 - Math.min(...ys) + 1) / pas) + 1;
      const zs: number[] = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = x0 + i * pas, y = y0 - j * pas;
        zs.push(x > 0 && x < 10 && y > -2 && y < 5 ? 6 + hauteurToitEn(plans, { x, y }) : 0);
      }
      return { pas, x0, y0, nx, ny, z: zs };
    });
    const maison: ObjetAToit = { key: 'm', fonction: 'batiment', pts: rect(0, 0, 10, 7), toit: { ...bdtopo }, elevation: 5, bdtopo: { surParcellePrincipale: true } };
    const bilan = await toitsDepuisLidar([{ key: 'parcelle', fonction: 'terrain', pts: rect(-5, -5, 20, 20) }, maison], proj, { lire: lecteurDeuxPans(), lireGrille, dalles: async () => true });
    // La grille sous le contour, puis une plus large pour le recalage.
    expect(lireGrille).toHaveBeenCalledTimes(2);
    expect(bilan.recales).toBe(1);
    expect(texteBilanToitsLidar(bilan)).toContain('1 batiment(s) recale(s) sur le LiDAR');
    // Le batiment entier, d'un bloc : son contour garde sa forme, deux metres plus au sud.
    const attendu = rect(0, -2, 10, 7);
    maison.pts!.forEach((q, i) => { expect(Math.abs(q.x - attendu[i]!.x)).toBeLessThanOrEqual(0.25); expect(Math.abs(q.y - attendu[i]!.y)).toBeLessThanOrEqual(0.25); });
    // Sa forme ne change pas : 10 x 7.
    expect(maison.pts![1]!.x - maison.pts![0]!.x).toBeCloseTo(10, 9);
    expect(maison.pts![3]!.y - maison.pts![0]!.y).toBeCloseTo(7, 9);
    const ys = maison.corpsToit!.flatMap((c) => c.pts.map((q) => q.y));
    expect(Math.abs(Math.min(...ys) + 2)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(Math.max(...ys) - 5)).toBeLessThanOrEqual(0.3);
    expect(Math.max(...maison.corpsToit!.map((c) => c.faitage))).toBeGreaterThan(8.5);
    // Bien pose, le contour ne declenche pas de seconde lecture.
    lireGrille.mockClear();
    const posee: ObjetAToit = { key: 'm2', fonction: 'batiment', pts: vrai.map((q) => ({ ...q })), toit: { ...bdtopo }, elevation: 5, bdtopo: { surParcellePrincipale: true } };
    await toitsDepuisLidar([{ key: 'parcelle', fonction: 'terrain', pts: rect(-5, -5, 20, 20) }, posee], proj, { lire: lecteurDeuxPans(), lireGrille, dalles: async () => true });
    expect(lireGrille).toHaveBeenCalledTimes(1);
  });
});
