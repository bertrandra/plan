// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { construireSVG } from '../../../src/export/svgPlan.js';
import { construireDXF } from '../../../src/export/dxfPlan.js';
import { construirePDF } from '../../../src/export/pdfPlan.js';
import { construireDossierPDF } from '../../../src/export/dossierPdf.js';
import { importSVGString } from '../../../src/io/importSvg.js';
import type { EtatApp } from '../../../src/core/state.js';
import { pdfPolygone } from '../../../src/export/pdf/writer.js';
import { formeDeTerrasse, trousDeTerrasse, surfaceNetteTerrasse } from '../../../src/engine/structure.js';
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
  });

  it('un bassin a cheval sur le bord encoche la terrasse, dans sa forme comme dans sa surface', () => {
    const aCheval = { ...bassin, pts: rect(8, 0, 16, 4) } as ObjetPlan;
    const tous = [aCheval, plage];
    expect(trousDeTerrasse(plage, tous)).toHaveLength(1);
    // Tout entier dedans, le bassin n'a pas besoin de forme : le contour et son anneau suffisent.
    expect(formeDeTerrasse(plage, objets)).toBeNull();
    const forme = formeDeTerrasse(plage, tous)!;
    expect(forme).toHaveLength(1);
    expect(forme[0]!.trous).toEqual([]);
    expect(shoelace(forme[0]!.contour)).toBeCloseTo(surfaceNetteTerrasse(rect(-3, -3, 11, 7), tous), 1);
    expect(shoelace(forme[0]!.contour)).toBeLessThan(140);
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

  it('DXF : le trou est une polyligne fermee sur le calque de la terrasse ; a cheval, il l\'encoche', () => {
    const dxf = construireDXF(objets, [], 'test');
    const calque = dxf.match(/LWPOLYLINE\n8\nTerrasse_de_Piscine_1\n90\n\d+\n70\n1\n/g) ?? [];
    expect(calque).toHaveLength(2);
    expect(construireDXF([plage], [], 'test').match(/LWPOLYLINE/g)).toHaveLength(1);
    // Le bassin deborde a l'est : un seul contour, encoche (8 sommets au lieu de 4).
    const aCheval = { ...bassin, pts: rect(8, 0, 16, 4) } as ObjetPlan;
    const encoche = construireDXF([aCheval, plage], [], 'test').match(/LWPOLYLINE\n8\nTerrasse_de_Piscine_1\n90\n(\d+)\n/g) ?? [];
    expect(encoche).toEqual(['LWPOLYLINE\n8\nTerrasse_de_Piscine_1\n90\n8\n']);
  });

  it('PDF : un gabarit pair-impair decoupe le trou, leve apres le trace', () => {
    const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(pdfPolygone(tri, [1, 0, 0], [0, 0, 0])).toMatch(/^1\.000 0\.000 0\.000 rg\n[\s\S]*h B\n$/);
    const perce = pdfPolygone(tri, [1, 0, 0], [0, 0, 0], 1, 1, [[{ x: 4, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 4 }]]);
    expect(perce).toMatch(/^q\n-100000 [\s\S]*h\n4\.00 2\.00 m\n[\s\S]*W\* n\n[\s\S]*h B\nQ\n$/);
    const plan = (o: ObjetPlan[]) => construirePDF(o, [], 200, { appVersion: 't', buildAt: 'b', montrerNord: false });
    expect(plan(objets)).toContain('W* n');
    expect(plan([plage])).not.toContain('W*');
    // A cheval sur le bord aussi : le gabarit ne peint rien hors de la terrasse.
    expect(plan([{ ...bassin, pts: rect(8, 0, 16, 4) } as ObjetPlan, plage])).toContain('W* n');
    expect(construireDossierPDF(objets, ['t'], true, { appVersion: 't', nomProjet: 'P' }).pdf).toContain('W* n');
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
