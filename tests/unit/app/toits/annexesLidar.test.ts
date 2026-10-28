import { describe, it, expect, vi } from 'vitest';
import { toitsDepuisLidar, toitAAjuster, batimentsMitoyens, type ObjetAToit } from '../../../../src/app/toits/toitsLidar.js';
import { batimentsEnDoute } from '../../../../src/app/toits/toitsACheval.js';
import { hauteurToitEn, plansDuToit } from '../../../../src/facade/toits/toit.js';
import { projecteurLocal } from '../../../../src/geo/projection.js';
import { estBatiment, toitLuAuLidar } from '../../../../src/model/fonctions.js';
import { OUVRAGES } from '../../../../src/model/ouvrages/index.js';
import { hauteurAuPointLePlusHaut } from '../../../../src/model/volumesToit.js';
import type { GrilleRelief } from '../../../../src/model/relief.js';
import type { ObjetPlan, PtBrut, Toit } from '../../../../src/model/types.js';

// Les annexes lues au LiDAR comme les batiments (decision du 28 octobre 2026, version 4.0.0 ; MD/spec-ouvrages.md, « Le flux de
// construction d'un batiment », point 9) : le toit, la hauteur a l'egout et le recalage du contour au niveau 4, sous les memes
// marques (model/protections.ts).

const proj = projecteurLocal(48.9, 2.13);
const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const bdtopo: Toit = { forme: 'croupes', hauteur: 2, angleFaitage: 0, source: 'bdtopo' };

/** Un lecteur qui mesure un deux-pans sur un egout donne, quel que soit le contour. */
function lecteurDeuxPans(egout: number, hauteur: number) {
  return vi.fn(async (pts: readonly PtBrut[]) => {
    const plans = plansDuToit(pts, { forme: 'deux-pans', hauteur, angleFaitage: 0 });
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const out = [];
    for (let x = Math.min(...xs) + 0.75; x < Math.max(...xs) - 0.7; x += 0.5) for (let y = Math.min(...ys) + 0.75; y < Math.max(...ys) - 0.7; y += 0.5) out.push({ x, y, z: egout + hauteurToitEn(plans, { x, y }) });
    return out;
  });
}

describe('les ouvrages dont le toit se lit au LiDAR', () => {
  it('sont le batiment et l annexe, et eux seuls', () => {
    expect(OUVRAGES.filter((o) => o.toitLuAuLidar).map((o) => o.fonction).sort()).toEqual(['annexe', 'batiment']);
    expect(toitLuAuLidar({ fonction: 'annexe' })).toBe(true);
    expect(toitLuAuLidar({ fonction: 'pergola' })).toBe(false);
    expect(toitLuAuLidar({})).toBe(false);
  });

  it('une annexe est a ajuster comme un batiment, et protegee par les memes marques', () => {
    expect(toitAAjuster({ fonction: 'annexe', pts: rect(0, 0, 4, 3) })).toBe(true);
    expect(toitAAjuster({ fonction: 'annexe', pts: rect(0, 0, 4, 3), batiment: { toit: bdtopo } })).toBe(true);
    expect(toitAAjuster({ fonction: 'annexe', pts: rect(0, 0, 4, 3), batiment: { toit: { ...bdtopo, source: 'saisie' } } })).toBe(false);
    expect(toitAAjuster({ fonction: 'annexe', pts: rect(0, 0, 4, 3), batiment: { toit: { ...bdtopo, source: 'photo' } } })).toBe(false);
    expect(toitAAjuster({ fonction: 'annexe', pts: rect(0, 0, 4, 3), batiment: { toitFige: true } })).toBe(false);
    expect(toitAAjuster({ fonction: 'chemin', pts: rect(0, 0, 4, 3) })).toBe(false);
  });
});

describe('toitsDepuisLidar sur une annexe', () => {
  it('lit son toit et corrige son egout comme ceux d un batiment', async () => {
    const objets: ObjetAToit[] = [
      { key: 'parcelle', fonction: 'terrain', pts: rect(-5, -5, 30, 30) },
      { key: 'b', fonction: 'batiment', pts: rect(0, 0, 12, 8), batiment: { toit: { ...bdtopo } }, elevation: 5, bdtopo: {} },
      { key: 'a', fonction: 'annexe', pts: rect(0, 0, 12, 8).map((q) => ({ x: q.x + 15, y: q.y })), batiment: { toit: { ...bdtopo } }, elevation: 5, bdtopo: {} },
    ];
    const bilan = await toitsDepuisLidar(objets, proj, { lire: lecteurDeuxPans(6, 3), dalles: async () => true });
    expect(bilan.ajustes).toBe(2);
    const b = objets[1]!, a = objets[2]!;
    expect(a.batiment?.toit).toMatchObject({ forme: 'deux-pans', source: 'lidar' });
    expect(a.batiment?.toit?.forme).toBe(b.batiment?.toit?.forme);
    expect(a.batiment?.toit?.hauteur).toBe(b.batiment?.toit?.hauteur);
    expect(a.elevation).toBe(6);
    expect(a.batiment?.toitLidarLu).toBe(b.batiment?.toitLidarLu);
  });

  it('une annexe dessinee garde sa hauteur posee (niveau 1) ; son toit se lit', async () => {
    const annexe: ObjetAToit = { key: 'abri', fonction: 'annexe', pts: rect(0, 0, 6, 4), elevation: 2.5 };
    await toitsDepuisLidar([{ key: 'parcelle', fonction: 'terrain', pts: rect(-5, -5, 30, 30) }, annexe], proj, { lire: lecteurDeuxPans(3, 1.5), dalles: async () => true });
    expect(annexe.batiment?.toit).toMatchObject({ forme: 'deux-pans', source: 'lidar' });
    expect(annexe.elevation).toBe(2.5);
  });

  it('une annexe aux « Règles » coupees, a l egout saisi ou au toit saisi n est pas reecrite', async () => {
    const figee: ObjetAToit = { key: 'f', fonction: 'annexe', pts: rect(0, 0, 6, 4), elevation: 2.5, bdtopo: {}, batiment: { toit: { ...bdtopo }, toitFige: true } };
    const egout: ObjetAToit = { key: 'e', fonction: 'annexe', pts: rect(10, 0, 6, 4), elevation: 2.5, bdtopo: {}, batiment: { toit: { ...bdtopo }, egoutChoisi: 'saisie' } };
    const saisi: ObjetAToit = { key: 's', fonction: 'annexe', pts: rect(20, 0, 6, 4), elevation: 2.5, bdtopo: {}, batiment: { toit: { ...bdtopo, source: 'saisie' } } };
    await toitsDepuisLidar([{ key: 'parcelle', fonction: 'terrain', pts: rect(-5, -5, 40, 30) }, figee, egout, saisi], proj, { lire: lecteurDeuxPans(4, 1.5), dalles: async () => true });
    expect(figee.batiment?.toit?.source).toBe('bdtopo');
    expect(figee.batiment?.toitLidarLu).toBeUndefined();
    expect(egout.batiment?.toit?.source).toBe('lidar');
    expect(egout.elevation).toBe(2.5);
    expect(saisi.batiment?.toit?.source).toBe('saisie');
  });

  it('recale d un bloc une annexe de la parcelle du projet tracee a cote, sauf retouchee a la main', async () => {
    // Le LiDAR voit l'annexe de 6 x 4 en y = -2..2 ; la BD TOPO la trace en y = 0..4.
    const plans = plansDuToit(rect(0, -2, 6, 4), { forme: 'deux-pans', hauteur: 1.5, angleFaitage: 0 });
    const lireGrille = vi.fn(async (pts: readonly PtBrut[]): Promise<GrilleRelief> => {
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      const pas = 0.5, x0 = Math.min(...xs) - 1, y0 = Math.max(...ys) + 1;
      const nx = Math.round((Math.max(...xs) + 1 - x0) / pas) + 1, ny = Math.round((y0 - Math.min(...ys) + 1) / pas) + 1;
      const zs: number[] = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = x0 + i * pas, y = y0 - j * pas;
        zs.push(x > 0 && x < 6 && y > -2 && y < 2 ? 3 + hauteurToitEn(plans, { x, y }) : 0);
      }
      return { pas, x0, y0, nx, ny, z: zs };
    });
    const lire = (o: ObjetAToit) => toitsDepuisLidar([{ key: 'parcelle', fonction: 'terrain', pts: rect(-5, -5, 20, 20) }, o], proj, { lire: lecteurDeuxPans(3, 1.5), lireGrille, dalles: async () => true });
    const annexe: ObjetAToit = { key: 'a', fonction: 'annexe', pts: rect(0, 0, 6, 4), batiment: { toit: { ...bdtopo } }, elevation: 3, bdtopo: { surParcellePrincipale: true } };
    expect((await lire(annexe)).recales).toBe(1);
    expect(Math.abs(annexe.pts![0]!.y + 2)).toBeLessThanOrEqual(0.25);
    const retouchee: ObjetAToit = { ...annexe, pts: rect(0, 0, 6, 4), batiment: { toit: { ...bdtopo } }, retoucheMain: { date: '2026-10-28' } };
    expect((await lire(retouchee)).recales).toBe(0);
    expect(retouchee.pts).toEqual(rect(0, 0, 6, 4));
  });

  it('une annexe d une parcelle mitoyenne est mitoyenne, comme une maison', () => {
    const objets: ObjetAToit[] = [
      { key: 'parcelle', fonction: 'terrain', pts: rect(0, 0, 20, 20) },
      { key: 'p-est', fonction: 'terrain', pts: rect(20, 0, 20, 20) },
      { key: 'abri-est', fonction: 'annexe', pts: rect(24, 4, 4, 3), bdtopo: {} },
    ];
    expect([...batimentsMitoyens(objets)].map((o) => o.key)).toEqual(['abri-est']);
  });

  it('une annexe a cheval dont la toiture attend une reponse pose la question', () => {
    const annexe = { key: 'a', fonction: 'annexe', type: 'polygon', pts: rect(0, 0, 6, 4), batiment: { toitACheval: { parcelles: ['parcelle', 'p2'] }, corpsToit: [{}] } } as unknown as ObjetPlan;
    expect(batimentsEnDoute([annexe])).toEqual([annexe]);
  });
});

describe('le toit lu d une annexe dans ce qui la dessine', () => {
  it('la DP2 et la 3D la lisent comme un batiment : la hauteur au point le plus haut est celle de ses corps', () => {
    const annexe = { key: 'a', fonction: 'annexe', type: 'polygon', pts: rect(0, 0, 6, 4), elevation: 2.5,
      batiment: { corpsToit: [{ pts: rect(0, 0, 6, 4), posFaitage: 2, faitage: 4.1, egouts: [2.6, 2.6], pignons: [] }] } } as unknown as ObjetPlan;
    // three/ouvrages/bati.ts et export/piecesDP.ts filtrent par estBatiment : l'annexe en est.
    expect(estBatiment(annexe)).toBe(true);
    expect(hauteurAuPointLePlusHaut(annexe)).toBe(4.1);
  });
});
