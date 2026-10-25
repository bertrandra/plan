import { describe, it, expect, vi, afterEach } from 'vitest';
import { toitsDepuisLidar, toitLu, marqueDeLecture, MARQUE_ESSAI_FAITS, VERSION_LECTURE_TOITS, type ObjetAToit } from '../../../src/app/toitsLidar.js';
import { essayerFaitsToits, lireFaitsToits } from '../../../src/regles/toits/faits.js';
import { hauteurToitEn, plansDuToit } from '../../../src/facade/toits/toit.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { PtBrut, Toit } from '../../../src/model/types.js';

// Les faits dans la lecture des toits (MD/spec-regles-toits.md §5, §9) : un remplacement sans rien
// lire, une contrainte sur la forme lue, et le mode d'essai qui ne laisse rien derriere lui.

const proj = projecteurLocal(48.9, 2.13);
const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const bdtopoToit: Toit = { forme: 'croupes', hauteur: 2, angleFaitage: 0, source: 'bdtopo', couleur: '#aa4433', origineCouleur: 'orthophoto' };
const CLE = 'BATIMENT0000000000000042';
const batiment = (): ObjetAToit => ({ key: 'a', fonction: 'batiment', pts: rect(0, 0, 12, 8), toit: { ...bdtopoToit }, elevation: 5, bdtopo: { cleabs: CLE } });
const essai = (fait: Record<string, unknown>) => essayerFaitsToits(lireFaitsToits({ format: 'plan-faits-toits', faits: { [CLE]: fait } }));

/** Un lecteur qui mesure un deux-pans de 3 m sur un egout de 6 m, faitage est-ouest. */
function lecteurDeuxPans(egout = 6, hauteur = 3) {
  return vi.fn(async (pts: readonly PtBrut[]) => {
    const plans = plansDuToit(pts, { forme: 'deux-pans', hauteur, angleFaitage: 0 });
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const out = [];
    for (let x = Math.min(...xs) + 0.75; x < Math.max(...xs) - 0.7; x += 0.5) for (let y = Math.min(...ys) + 0.75; y < Math.max(...ys) - 0.7; y += 0.5) out.push({ x, y, z: egout + hauteurToitEn(plans, { x, y }) });
    return out;
  });
}

afterEach(() => essayerFaitsToits(null));

describe('un fait en remplacement', () => {
  it('donne le toit sans rien lire, meme sans dalle LiDAR, et garde la couleur', async () => {
    essai({ observation: { forme: 'deux-pans', faitage: { par: 'azimut', azimutDeg: 0 } }, application: 'remplacement', dimensions: { egoutM: 4, faitageM: 8 } });
    const objets = [{ key: 'parcelle', fonction: 'terrain', pts: rect(-5, -5, 30, 30) }, batiment()];
    const lire = lecteurDeuxPans();
    await toitsDepuisLidar(objets, proj, { lire, dalles: async () => false });
    const a = objets[1]!;
    expect(lire).not.toHaveBeenCalled();
    expect(a.toit).toMatchObject({ forme: 'deux-pans', hauteur: 4, angleFaitage: 90, source: 'lidar', couleur: '#aa4433', origineCouleur: 'orthophoto' });
    expect(a.elevation).toBe(4);
    expect(a.corpsToit).toHaveLength(1);
    expect(a.corpsToit![0]).toMatchObject({ faitage: 8, egouts: [4, 4], posFaitage: 6 });
  });
});

describe('un fait en contrainte', () => {
  it('restreint la forme simple lue : un deux-pans observe en croupes est relu en croupes', async () => {
    const objets = [batiment()];
    await toitsDepuisLidar(objets, proj, { lire: lecteurDeuxPans(), dalles: async () => true });
    expect(objets[0]!.toit!.forme).toBe('deux-pans');
    essai({ observation: { forme: ['croupes', 'quatre-pans'] } });
    const avecFait = [batiment()];
    await toitsDepuisLidar(avecFait, proj, { lire: lecteurDeuxPans(), dalles: async () => true });
    expect(['croupes', 'quatre-pans']).toContain(avecFait[0]!.toit!.forme);
    expect(avecFait[0]!.toit!.couleur).toBe('#aa4433');
  });

  it('laisse le toit lu quand il dit deja ce que l on a vu', async () => {
    const sans = [batiment()];
    await toitsDepuisLidar(sans, proj, { lire: lecteurDeuxPans(), dalles: async () => true });
    essai({ observation: { forme: 'deux-pans', faitage: { par: 'long', sens: 'parallele' } } });
    const avec = [batiment()];
    await toitsDepuisLidar(avec, proj, { lire: lecteurDeuxPans(), dalles: async () => true });
    expect(avec[0]!.toit).toEqual(sans[0]!.toit);
    expect(avec[0]!.elevation).toBe(sans[0]!.elevation);
  });
});

describe('le mode d essai', () => {
  it('marque les batiments qu il touche comme lus pour la seance seulement', async () => {
    const autre: ObjetAToit = { ...batiment(), key: 'b', pts: rect(20, 0, 12, 8), bdtopo: { cleabs: 'BATIMENT0000000000000043' } };
    expect(marqueDeLecture(batiment())).toBe(VERSION_LECTURE_TOITS);
    essai({ observation: { forme: 'deux-pans' } });
    const objets = [batiment(), autre];
    await toitsDepuisLidar(objets, proj, { lire: lecteurDeuxPans(), dalles: async () => true });
    expect(objets[0]!.toitLidarLu).toBe(MARQUE_ESSAI_FAITS);
    expect(objets[1]!.toitLidarLu).toBe(VERSION_LECTURE_TOITS);
    expect(toitLu(objets[0]!)).toBe(true);
    // L'essai fini (la page rechargee), le batiment touche est a relire avec les faits du depot.
    essayerFaitsToits(null);
    expect(toitLu(objets[0]!)).toBe(false);
    expect(toitLu(objets[1]!)).toBe(true);
  });
});
