import { describe, it, expect } from 'vitest';
import { computeTerrasseLayers } from '../../../src/engine/layers.js';
import { computeBOM } from '../../../src/engine/bom.js';
import { calculerPergola, chiffrerPergola } from '../../../src/engine/pergola.js';
import { calculerPiscine, chiffrerPiscine } from '../../../src/engine/piscine.js';
import { solDuRelief } from '../../../src/engine/sol.js';
import { achatPlotsParHauteur } from '../../../src/engine/prix.js';
import { ensureConstruction } from '../../../src/engine/construction.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// Les quantites sur un sol en pente (MD/spec-relief.md §6) : les plots s'achetent par gamme, les
// poteaux d'aval sont plus longs, la fouille se compte sur le sol reel. Et sans relief, tout est
// identique a avant : c'est l'oracle du moteur qui le garantit, ici on verifie seulement l'egalite.

/** Une grille plane z = a·x + b·y + 100 (NGF), zRef = 100 : le zero du plan est le sol en (0, 0). */
function plane(a: number, b: number, nx = 100, ny = 100, pas = 0.5): Relief {
  const x0 = -19.75, y0 = 29.75;
  const z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((a * (x0 + i * pas) + b * (y0 - j * pas) + 100) * 100) / 100);
  return { source: 'lidar-hd', couche: 't', dateLecture: '2026-10-06', origine: 'LiDAR HD', precision: '10 cm', systemeAltimetrique: 'NGF-IGN69', pas, x0, y0, nx, ny, z, zRef: 100 };
}
const parcelleAvec = (r: Relief | null): ObjetPlan => ({ key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: [{ x: -15, y: -15 }, { x: 25, y: -15 }, { x: 25, y: 25 }, { x: -15, y: 25 }], ...(r ? { relief: r } : {}) } as ObjetPlan);

describe('les plots par hauteur', () => {
  it('range chaque hauteur dans la gamme la moins chere qui la couvre', () => {
    const c = ensureConstruction({ construction: { typePose: 'plots' } });
    const a = achatPlotsParHauteur(c, [100, 120, 300, 480, 950]);
    expect(a.lots.map(l => l.modele.cle + ':' + l.unites)).toEqual(['r60-100:1', 'r100-170:1', 'r170-300:3']);
    expect(a.unites).toBe(5);
    expect(a.horsGamme).toBe(2);
    expect(a.cout).toBeCloseTo(5.5 + 7.5 + 3 * 11, 9);
    expect(a.label).toBe('1 × Reglable 60-100 mm, 1 × Reglable 100-170 mm, 3 × Reglable 170-300 mm');
  });

  it('garde un modele impose pour tous les plots', () => {
    const c = ensureConstruction({ construction: { typePose: 'plots', plotModele: 'r100-170' } });
    const a = achatPlotsParHauteur(c, [50, 400]);
    expect(a.lots).toHaveLength(1);
    expect(a.lots[0]!.modele.cle).toBe('r100-170');
    expect(a.horsGamme).toBe(0);
  });
});

describe('la nomenclature d une terrasse sur plots en pente', () => {
  const terrasse: ObjetPlan = { key: 't', name: 'T', type: 'polygon', fonction: 'terrasse', pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }], construction: { typePose: 'plots', hauteurPlot: 6 } } as ObjetPlan;

  it('compte les plots par gamme et dit l etendue des hauteurs ; sans sol, rien ne change', () => {
    const layers = computeTerrasseLayers(terrasse, [terrasse]);
    const plat = computeBOM(terrasse, layers);
    const sol = solDuRelief(plane(-0.08, 0));   // descend vers l'est : 48 cm sur 6 m
    const pente = computeBOM(terrasse, layers, sol);
    expect(computeBOM(terrasse, layers, null)).toEqual(plat);
    const lp = plat.find(l => l.poste === 'vis')!, lpe = pente.find(l => l.poste === 'vis')!;
    expect(lp.label).toMatch(/^Plots — Reglable 40-70 mm$/);
    expect(lpe.label).toMatch(/sol en pente : de 6 à 5\d cm/);
    expect(lpe.label).toMatch(/Reglable 40-70 mm.*Reglable 170-300 mm/);
    expect(lpe.qte).toBe(lp.qte);
    expect(lpe.prixReel!).toBeGreaterThan(lp.prixReel!);
    // Les autres postes ne bougent pas : la pente ne change que les appuis.
    expect(pente.filter(l => l.poste !== 'vis')).toEqual(plat.filter(l => l.poste !== 'vis'));
  });

  it('dit jusqu ou sortent les tetes de vis', () => {
    const vis = { ...terrasse, construction: { typePose: 'vis-fondation', depassementVis: 2 } } as ObjetPlan;
    const layers = computeTerrasseLayers(vis, [vis]);
    const l = computeBOM(vis, layers, solDuRelief(plane(-0.08, 0))).find(x => x.poste === 'vis')!;
    expect(l.label).toMatch(/têtes de 2 à 5\d cm hors sol/);
    expect(l.qte).toBe(computeBOM(vis, layers).find(x => x.poste === 'vis')!.qte);
  });
});

describe('la pergola sur un sol en pente', () => {
  const pergola: ObjetPlan = { key: 'p', name: 'Pergola', type: 'polygon', fonction: 'pergola', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], pergola: {} } as ObjetPlan;

  it('garde les poutres de niveau sur le point haut et allonge les poteaux d aval', () => {
    // 8 % vers l'est : des cotes exactes au centimetre sur chaque cellule, 32 cm sur 4 m.
    const sol = solDuRelief(plane(-0.08, 0));
    const plat = calculerPergola(pergola)!, pente = calculerPergola(pergola, sol)!;
    expect(plat.sol).toBeNull();
    expect(pente.sol!.zHaut).toBeCloseTo(0, 6);
    expect(pente.sol!.zBas).toBeCloseTo(-0.32, 6);
    const poteaux = (c: typeof plat) => c.pieces.filter(p => p.role === 'poteau');
    expect(poteaux(plat).every(p => Math.abs(p.a.z) < 1e-9)).toBe(true);
    // Les poutres sont a la meme hauteur : zero plus la hauteur reglee.
    const poutres = pente.pieces.filter(p => p.role === 'poutre');
    poutres.forEach(p => { expect(p.a.z).toBeCloseTo(plat.pieces.find(q => q.role === 'poutre')!.a.z, 6); });
    // Les poteaux de l'est partent plus bas et sont plus longs d'environ 40 cm (l'axe est rentre d'une demi-section).
    const est = poteaux(pente).filter(p => p.a.x > 3), ouest = poteaux(pente).filter(p => p.a.x < 1);
    expect(est.length).toBeGreaterThan(0);
    est.forEach(p => { expect(p.a.z).toBeLessThan(-0.28); expect(p.longueur - ouest[0]!.longueur).toBeCloseTo(-p.a.z + ouest[0]!.a.z, 6); });
    expect(pente.hauteurReglementaire).toBeCloseTo(plat.hauteurReglementaire + 0.32, 6);
    // Le chiffrage suit les longueurs : plus de bois de poteau.
    expect(chiffrerPergola(pente).total).toBeGreaterThanOrEqual(chiffrerPergola(plat).total);
  });

  it('ne change rien sans sol', () => {
    expect(calculerPergola(pergola, null)).toEqual(calculerPergola(pergola));
  });
});

describe('la piscine sur un sol en pente', () => {
  const piscine: ObjetPlan = { key: 'b', name: 'Bassin', type: 'polygon', fonction: 'piscine', pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 0, y: 4 }], piscine: { plage: 'terrasse-bois', largeurPlage: 2 } } as ObjetPlan;

  it('compte la fouille sur le sol reel et un remblai de nivellement des abords', () => {
    const plat = calculerPiscine(piscine, [parcelleAvec(null), piscine])!;
    const pente = calculerPiscine(piscine, [parcelleAvec(plane(-0.1, 0)), piscine])!;
    expect(plat.sol).toBeNull();
    expect(plat.fouille.nivellement).toBe(0);
    expect(pente.sol!.zHaut).toBeCloseTo(0, 1);
    // Le sol descend sous le bassin : la fouille comptee depuis le sol reel est moins profonde a l'est.
    expect(pente.fouille.volume).toBeLessThan(plat.fouille.volume);
    expect(pente.fouille.volume).toBeGreaterThan(plat.fouille.volume * 0.5);
    expect(pente.fouille.nivellement).toBeGreaterThan(0);
    const lignes = chiffrerPiscine(pente).lignes;
    expect(lignes.find(l => l.poste === 'nivellement')).toBeTruthy();
    expect(chiffrerPiscine(plat).lignes.find(l => l.poste === 'nivellement')).toBeUndefined();
  });

  it('allonge les poteaux d une plage haute vers l aval, et ne change rien sans relief', () => {
    const haute = { ...piscine, piscine: { ...piscine.piscine, implantation: 'hors-sol', hauteurHorsSol: 1.2 } } as ObjetPlan;
    const plat = calculerPiscine(haute, [parcelleAvec(null), haute])!, pente = calculerPiscine(haute, [parcelleAvec(plane(-0.1, 0)), haute])!;
    expect(plat.plageBois!.mode).toBe('poteaux');
    expect(Math.abs(plat.plageBois!.hauteurPoteauMax - plat.plageBois!.hauteurPoteau)).toBeLessThan(0.006);
    expect(pente.plageBois!.hauteurPoteauMax).toBeGreaterThan(pente.plageBois!.hauteurPoteau + 0.5);
    expect(pente.plageBois!.hauteursPoteaux).toHaveLength(pente.plageBois!.poteaux);
    expect(chiffrerPiscine(pente).lignes.find(l => l.poste === 'plagePoteaux')!.label).toMatch(/sol en pente/);
    expect(calculerPiscine(haute, [parcelleAvec(null), haute])).toEqual(plat);
  });
});
