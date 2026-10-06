// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as lib from 'pdf-lib';
import { construireSVG } from '../../../src/export/svgPlan.js';
import { importSVGString } from '../../../src/io/importSvg.js';
import { decouperPolyligne, exagerationProfil, pagePlanDeMasse, pageProfil } from '../../../src/export/piecesDP.js';
import { assemblerDossierMairie } from '../../../src/export/dossierMairie.js';
import { construireDossierPiscine, profilTerrainCoupe } from '../../../src/export/dossierPiscine.js';
import { calculerPiscine } from '../../../src/engine/piscine.js';
import { nouvellePiscine } from '../../../src/model/creation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { altitudeNGF } from '../../../src/model/relief.js';
import { centroid } from '../../../src/geometry/basic.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// Le relief dans les exports (MD/spec-relief.md §5.3, §5.4) : les courbes de niveau dans plan.svg
// et le plan de masse, la piece DP3 du dossier mairie, le terrain naturel de la coupe piscine. Un
// projet sans relief ecrit exactement ce qu'il ecrivait : c'est ce que les temoins dores verifient
// (tests/unit/export/regeneration.test.ts), et ce que l'on reverifie ici sur le SVG.

/** Une grille plane z = a·x + b·y + c sur une emprise, au pas donne. */
function plane(a: number, b: number, c: number, e: { xMin: number; xMax: number; yMin: number; yMax: number }, pas: number, zRef: number): Relief {
  const nx = Math.ceil((e.xMax - e.xMin) / pas), ny = Math.ceil((e.yMax - e.yMin) / pas);
  const x0 = e.xMin + pas / 2, y0 = e.yMax - pas / 2;
  const z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((a * (x0 + i * pas) + b * (y0 - j * pas) + c) * 100) / 100);
  return { source: 'lidar-hd', couche: 'test', dateLecture: '2026-10-06', dateDonnees: '2021-06-01', origine: 'LiDAR HD', precision: 'de l ordre de 10 cm (IGN)', systemeAltimetrique: 'NGF-IGN69', pas, x0, y0, nx, ny, z, zRef };
}
const rect = (x: number, y: number, L: number, l: number) => [{ x, y }, { x: x + L, y }, { x: x + L, y: y + l }, { x, y: y + l }];

/** Une parcelle de 30 x 20 m qui descend vers l'ouest de 5 % (zRef au centre de la terrasse), une maison, une terrasse, une pergola. */
function projet(relief: Relief | null): ObjetPlan[] {
  return normalizeObjects([
    {
      key: 'parcelle', name: 'Parcelle AB 123', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 30, 20), fill: '#eee', stroke: '#333', fillOpacity: 0.2,
      cadastre: { idu: '78650000AB0123', section: 'AB', numero: '0123', contenanceM2: 612, commune: 'Le Vesinet', adresse: '12 bis Rue des Lilas 78110 Le Vesinet' },
      relief
    } as ObjetPlan,
    { key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', elevation: 6, pts: rect(10, 10, 10, 8), fill: '#ddd', stroke: '#333', fillOpacity: 1 } as ObjetPlan,
    { key: 't', name: 'Terrasse 1', type: 'polygon', fonction: 'terrasse', pts: rect(4, 3, 6, 4), fill: '#c96', stroke: '#630', fillOpacity: 0.8 } as ObjetPlan,
    { key: 'p', name: 'Pergola 1', type: 'polygon', fonction: 'pergola', pts: rect(22, 2, 4, 3), pergola: { debord: 0.2 }, fill: '#ccc', stroke: '#333', fillOpacity: 0.5 } as ObjetPlan
  ]) as ObjetPlan[];
}
const EMPRISE = { xMin: -10, xMax: 40, yMin: -10, yMax: 30 };
const reliefPente = () => plane(0.05, 0, 100, EMPRISE, 1, 100 + 0.05 * 7);
const texteDe = (pdf: string) => pdf.replace(/\\\(/g, '(').replace(/\\\)/g, ')');

describe('plan.svg', () => {
  const meta = { appVersion: '2.3.0', schemaVersion: 4 };

  it('porte un groupe de courbes sans data-*, et reste identique a l ancien sans relief', () => {
    const sans = construireSVG(projet(null), [], meta);
    const avec = construireSVG(projet(reliefPente()), [], meta);
    expect(sans).not.toContain('relief-courbes');
    expect(avec).toContain('<g class="relief-courbes"');
    expect(avec).toMatch(/<polyline points="[-\d., ]+" stroke-width="0\.0(35|6)"\/>/);
    // Les etiquettes des maitresses, en NGF a la francaise.
    expect(avec).toMatch(/<text [^>]*>\d{3},\d0<\/text>/);
    const groupe = avec.slice(avec.indexOf('<g class="relief-courbes"'), avec.indexOf('</g>'));
    expect(groupe).not.toContain('data-');
    // Hors du groupe, le fichier est celui d'avant.
    expect(avec.replace(groupe + '</g>\n', '')).toBe(sans);
    // La preference fermee : plus de groupe du tout.
    const ferme = reliefPente();
    ferme.affichage = { courbes: false };
    expect(construireSVG(projet(ferme), [], meta)).toBe(sans);
  });

  it('se reimporte sans erreur : les courbes sont ignorees', () => {
    const ctx = { pushHistory: () => {}, createObjectDOM: () => {}, rebuildHandles: () => {}, reapplyStackingOrder: () => {}, rebuildSelector: () => {}, render: () => {} };
    const importer = (svg: string) => {
      const etat = { objects: [], measures: [], selectedKey: null, newObjCounter: 1 } as unknown as EtatApp;
      importSVGString(svg, etat, ctx, true);
      return etat.objects;
    };
    const sans = importer(construireSVG(projet(null), [], meta));
    const avec = importer(construireSVG(projet(reliefPente()), [], meta));
    expect(sans).toHaveLength(4);
    expect(avec.map(o => [o.key, o.name, o.type])).toEqual(sans.map(o => [o.key, o.name, o.type]));
  });
});

describe('DP2 : le plan de masse', () => {
  it('porte les courbes en gris et leur legende quand un relief existe, meme la preference fermee', () => {
    const sans = pagePlanDeMasse(projet(null), {});
    const r = reliefPente();
    r.affichage = { courbes: false };
    const avec = pagePlanDeMasse(projet(r), {});
    if (!sans || !avec) throw new Error('page attendue');
    expect(sans.contenu).not.toContain('Courbes de niveau');
    // Parcelle de 30 m en x, 5 % : 1,5 m de denivele, equidistance 25 cm.
    expect(texteDe(avec.contenu)).toContain('Courbes de niveau tous les 0,25 m (IGN, LiDAR HD, 1 m)');
    // Des polylignes grises, fines, en plus de ce que la page sans relief dessinait.
    expect((avec.contenu.match(/0\.550 0\.520 0\.480 RG 0\.35 w/g) || []).length).toBeGreaterThan(2);
    expect(avec.contenu.length).toBeGreaterThan(sans.contenu.length);
  });

  it('coupe une polyligne au cadre', () => {
    const e = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };
    expect(decouperPolyligne([{ x: -5, y: 5 }, { x: 15, y: 5 }], e)).toEqual([[{ x: 0, y: 5 }, { x: 10, y: 5 }]]);
    expect(decouperPolyligne([{ x: 2, y: 2 }, { x: 4, y: 4 }, { x: 20, y: 20 }, { x: 30, y: 5 }], e)).toEqual([[{ x: 2, y: 2 }, { x: 4, y: 4 }, { x: 10, y: 10 }]]);
    expect(decouperPolyligne([{ x: -5, y: -5 }, { x: -1, y: -1 }], e)).toEqual([]);
  });
});

describe('DP3 : le plan en coupe du terrain', () => {
  it('rend null sans relief, une page avec', () => {
    expect(pageProfil(projet(null), {})).toBeNull();
    const page = pageProfil(projet(reliefPente()), { adresse: '12 bis Rue des Lilas' });
    if (!page) throw new Error('page attendue');
    const t = texteDe(page.contenu);
    expect(t).toContain('(DP3)');
    expect(t).toContain('Plan en coupe du terrain et de la construction');
    expect(t).toContain('Terrain naturel : IGN, LiDAR HD, 1 m . acquis en 2021 . de l ordre de 10 cm (IGN).');
    // La terrasse, traversee par la coupe (pente est-ouest par son centre), et le zero du plan.
    expect(t).toContain('Terrasse 1 - H ');
    expect(t).toContain('Reference (zero du plan) : NGF 100,35 m');
    expect(t).toMatch(/NGF \d{2,3},\d\d m/);
    // La coupe fait 36 m (la parcelle et 3 m de part et d'autre) pour 1,8 m de denivele (5 %) : hauteurs x 2, dit dans le cartouche.
    expect(t).toContain('sur 36,00 m.');
    expect(page.l).toBeGreaterThan(page.h);
    expect(t).toContain('(hauteurs x 2)');
    expect(t).toContain('hauteurs x 2 ; cotes en metres.');
  });

  it('exagere les hauteurs quand le denivele est faible, pas quand il se voit', () => {
    expect(exagerationProfil(5, 30)).toBe(1);
    expect(exagerationProfil(2, 30)).toBe(2);
    expect(exagerationProfil(0.3, 30)).toBe(5);
    expect(exagerationProfil(0, 30)).toBe(5);
  });
});

describe('le dossier mairie', () => {
  const cerfa = new Uint8Array(readFileSync(resolve(__dirname, '../../../public/cerfa/cerfa_13703-12.pdf')));

  it('gagne la piece DP3 avec un relief, et garde ses pages sans', async () => {
    const sans = await assemblerDossierMairie(lib, cerfa, projet(null), { date: new Date(2026, 9, 6), meta: {} });
    const avec = await assemblerDossierMairie(lib, cerfa, projet(reliefPente()), { date: new Date(2026, 9, 6), meta: {} });
    expect(sans.pieces).toEqual(['DP1', 'DP2', 'DP4']);
    expect(avec.pieces).toEqual(['DP1', 'DP2', 'DP3', 'DP4']);
    expect(avec.remplissage.cases).toContain('P3GE1');
    expect(sans.remplissage.cases).not.toContain('P3GE1');
    const pagesSans = (await lib.PDFDocument.load(sans.pdf)).getPageCount();
    expect((await lib.PDFDocument.load(avec.pdf)).getPageCount()).toBe(pagesSans + 1);
  });
});

describe('la coupe de la piscine', () => {
  const parcelle = (relief: Relief | null): ObjetPlan => ({
    key: 'parcelle', name: 'Parcelle AE 101', type: 'polygon', fonction: 'terrain', nomLieu: 'Le Vesinet', latitude: 48.89, longitude: 2.13,
    pts: rect(0, 0, 30, 25), segmentNames: ['Sud', 'Est', 'Nord', 'Ouest'], cadastre: { section: 'AE', numero: '0101', commune: 'Le Vesinet', contenance: 750 }, relief
  } as ObjetPlan);
  const meta = { appVersion: '2.3.0', nomProjet: 'Essai', dateDuJour: () => '06/10/2026' };

  it('suit la grille : le terrain naturel passe a la hauteur lue dans le relief', () => {
    const piscine = nouvellePiscine('rectangle', { x: 15, y: 8 }, 'p', 1).obj;
    const c = centroid(piscine.type === 'polygon' ? piscine.pts : []);
    // Descend vers l'ouest de 5 %, zero du plan au centre du bassin.
    const r = plane(0.05, 0, 100, { xMin: -10, xMax: 40, yMin: -10, yMax: 35 }, 1, Math.round((100 + 0.05 * c.x) * 100) / 100);
    const calc = calculerPiscine(piscine, [parcelle(r), piscine]);
    if (!calc) throw new Error('bassin attendu');
    const terrain = profilTerrainCoupe(r, piscine.type === 'polygon' ? piscine.pts : [], calc.axe, -2, calc.axe.L + 2);
    expect(terrain.length).toBeGreaterThan(10);
    // Au centre du bassin, le sol est au zero du plan ; ailleurs, a `altitudeNGF - zRef` au point de l'axe.
    const sC = (c.x - calc.axe.origine.x) * calc.axe.v.x + (c.y - calc.axe.origine.y) * calc.axe.v.y;
    terrain.forEach(t => {
      const p = { x: c.x + calc.axe.v.x * (t.s - sC), y: c.y + calc.axe.v.y * (t.s - sC) };
      expect(t.z).toBeCloseTo((altitudeNGF(r, p.x, p.y) ?? 0) - r.zRef, 9);
    });
    const auCentre = terrain.reduce((m, t) => Math.abs(t.s - sC) < Math.abs(m.s - sC) ? t : m);
    expect(Math.abs(auCentre.z)).toBeLessThan(0.03);
    // Le long de l'axe (nord-sud ou est-ouest selon le petit bain), le sol n'est pas plat s'il court en x.
    const zs = terrain.map(t => t.z);
    if (Math.abs(calc.axe.v.x) > 0.5) expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.3);
  });

  it('dit d ou vient le terrain naturel dans l en-tete de la coupe, et rien sans relief', () => {
    const piscine = nouvellePiscine('rectangle', { x: 15, y: 8 }, 'p', 1).obj;
    const r = plane(0.05, 0, 100, { xMin: -10, xMax: 40, yMin: -10, yMax: 35 }, 1, 100.75);
    const avec = texteDe(construireDossierPiscine([parcelle(r), piscine], null, meta).pdf);
    const sans = texteDe(construireDossierPiscine([parcelle(null), piscine], null, meta).pdf);
    expect(avec).toContain('(DP3 - Plan en coupe)');
    expect(avec).toContain('Terrain naturel : IGN, LiDAR HD, 1 m . acquis en 2021');
    expect(avec).toContain('NGF 100,75 m');
    expect(sans).not.toContain('Terrain naturel : IGN');
  });
});
