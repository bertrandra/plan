// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { construireSVG } from '../../../src/export/svgPlan.js';
import { construireDXF } from '../../../src/export/dxfPlan.js';
import { construirePDF } from '../../../src/export/pdfPlan.js';
import { construireDossierPDF } from '../../../src/export/dossierPdf.js';
import { importSVGString } from '../../../src/io/importSvg.js';
import type { EtatApp } from '../../../src/core/state.js';
import { pdfPolygone } from '../../../src/export/pdf/writer.js';
import { trousDeTerrasse, surfaceNetteTerrasse } from '../../../src/engine/structure.js';
import { shoelace } from '../../../src/geometry/basic.js';
import { calculerPiscine } from '../../../src/engine/piscine.js';
import { constructionTerrasseNeuve } from '../../../src/engine/construction.js';
import { creerDomObjet, positionnerObjet, reconstruirePoignees, type ObjetRendu } from '../../../src/render/objects.js';
import { vue, detruireVue } from '../../../src/render/vues.js';
import type { EtatScene } from '../../../src/geometry/vue.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Une terrasse autour d'un bassin a le trou du bassin : dans sa surface, sur le plan et dans
// chacun des exports. Une terrasse sans trou s'ecrit comme avant (les temoins le verifient).

const style = { segmentNames: ['', '', '', ''], vertexNames: ['', '', '', ''], fill: '#c8a27a', fillOpacity: 0.7, stroke: '#6b4f2a', showName: true, showDims: true, showSegNames: false, showVertNames: false, showAngles: false };
const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const bassin = { ...style, key: 'p', name: 'Piscine 1', type: 'polygon', fonction: 'piscine', pts: rect(0, 0, 8, 4), piscine: { plage: 'terrasse', terrasseKey: 't' } } as unknown as ObjetPlan;
const plage = { ...style, key: 't', name: 'Terrasse de Piscine 1', type: 'polygon', fonction: 'terrasse', pts: rect(-3, -3, 11, 7), construction: constructionTerrasseNeuve() } as unknown as ObjetPlan;
const objets = [bassin, plage];

describe('les trous d\'une terrasse', () => {
  it('sont le bord exterieur des margelles du bassin, et la surface les retire', () => {
    const trous = trousDeTerrasse(plage, objets);
    expect(trous).toEqual([calculerPiscine(bassin)!.margelleExt]);
    expect(surfaceNetteTerrasse(rect(-3, -3, 11, 7), objets)).toBeCloseTo(14 * 10 - shoelace(trous[0]!), 1);
    expect(shoelace(trous[0]!)).toBeGreaterThan(8 * 4);
  });

  it('ne concernent ni le bassin, ni une terrasse que rien ne perce', () => {
    expect(trousDeTerrasse(bassin, objets)).toEqual([]);
    expect(trousDeTerrasse(plage, [plage])).toEqual([]);
    // Un bassin a cheval sur le bord : la surface le retire, le dessin ne le perce pas.
    const aCheval = { ...bassin, pts: rect(8, 0, 16, 4) } as ObjetPlan;
    expect(trousDeTerrasse(plage, [aCheval, plage])).toEqual([]);
  });
});

describe('les exports d\'une terrasse percee', () => {
  it('SVG : un gabarit pair-impair decoupe la terrasse, et l\'import l\'ignore', () => {
    const svg = construireSVG(objets, [], { appVersion: 't', schemaVersion: 1 });
    expect(svg).toContain('<clipPath id="trous-t"><path clip-rule="evenodd"');
    expect(svg).toMatch(/<polygon points="[^"]*" clip-path="url\(#trous-t\)"[^>]*data-objkey="t"/);
    // Le bassin, lui, n'est pas decoupe.
    expect(svg).not.toMatch(/clip-path="url\(#trous-t\)"[^>]*data-objkey="p"/);
    expect(construireSVG([plage], [], { appVersion: 't', schemaVersion: 1 })).not.toContain('clipPath');
    // Relu, le fichier rend ses deux objets, pas un chemin de plus pour le gabarit.
    const etat = { objects: [], measures: [], selectedKey: null, newObjCounter: 1 } as unknown as EtatApp;
    const rien = () => {};
    importSVGString(svg, etat, { pushHistory: rien, createObjectDOM: rien, rebuildHandles: rien, reapplyStackingOrder: rien, rebuildSelector: rien, render: rien }, true);
    expect(etat.objects.map(o => o.key).sort()).toEqual(['p', 't']);
  });

  it('DXF : le trou est une polyligne fermee sur le calque de la terrasse', () => {
    const dxf = construireDXF(objets, [], 'test');
    const calque = dxf.match(/LWPOLYLINE\n8\nTerrasse_de_Piscine_1\n90\n\d+\n70\n1\n/g) ?? [];
    expect(calque).toHaveLength(2);
    expect(construireDXF([plage], [], 'test').match(/LWPOLYLINE/g)).toHaveLength(1);
  });

  it('PDF : le trou est un sous-chemin, rempli en pair-impair', () => {
    expect(pdfPolygone([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], [1, 0, 0], [0, 0, 0])).toMatch(/h B\n$/);
    const perce = pdfPolygone([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], [1, 0, 0], [0, 0, 0], 1, 1, [[{ x: 4, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 4 }]]);
    expect(perce).toMatch(/l\nh\n4\.00 2\.00 m\n[\s\S]*h B\*\n$/);
    expect(construirePDF(objets, [], 200, { appVersion: 't', buildAt: 'b', montrerNord: false })).toContain('h B*');
    expect(construirePDF([plage], [], 200, { appVersion: 't', buildAt: 'b', montrerNord: false })).not.toContain('B*');
    expect(construireDossierPDF(objets, ['t'], true, { appVersion: 't', nomProjet: 'P' }).pdf).toContain('h B*');
  });
});

describe('le plan d\'une terrasse percee', () => {
  const scene = { scale: 10, origine: { x: 100, y: 200 } } as unknown as EtatScene;
  let racine: SVGElement;
  beforeEach(() => {
    document.body.innerHTML = '<svg></svg>';
    racine = document.querySelector('svg') as unknown as SVGElement;
    detruireVue({ key: 't' });
  });
  const ctx = (trous: { x: number; y: number }[][]) => ({
    scene, selectionnee: false, masque: false, trous, ortho: { actif: false, parcelleOpacite: 0.15 },
    estTerrain: () => false, pointageSommets: false, pointageCotes: false,
    reconstruirePoignees: (o: ObjetRendu) => reconstruirePoignees(o, { racine })
  });

  it('decoupe la terrasse par un gabarit, et le retire quand le trou disparait', () => {
    const t = plage as unknown as ObjetRendu;
    creerDomObjet(racine, t, scene);
    positionnerObjet(t, ctx(trousDeTerrasse(plage, objets)));
    const clip = racine.querySelector('clipPath#trous-t');
    expect(clip?.firstElementChild?.getAttribute('clip-rule')).toBe('evenodd');
    expect(vue(t).el?.getAttribute('clip-path')).toBe('url(#trous-t)');
    positionnerObjet(t, ctx([]));
    expect(racine.querySelector('clipPath')).toBeNull();
    expect(vue(t).el?.hasAttribute('clip-path')).toBe(false);
    // Detruire la vue emporte le gabarit avec elle.
    positionnerObjet(t, ctx(trousDeTerrasse(plage, objets)));
    detruireVue(t);
    expect(racine.querySelector('clipPath')).toBeNull();
  });
});
