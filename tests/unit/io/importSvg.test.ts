// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importSVGString } from '../../../src/io/importSvg.js';
import type { EtatApp } from '../../../src/core/state.js';

// L'import d'un SVG exporte par l'application restaure ses cotes depuis le noeud `measures-data`.
// Le fichier dore `plan.svg` en porte onze, toutes valides : il sert de base, et une copie abimee
// de ses cotes montre ce que l'import refuse desormais — et ce qu'il laissait passer avant le
// 20 septembre 2026 (seule l'existence des deux objets etait verifiee).

const svgDore = readFileSync(resolve(__dirname, '../../fixtures/golden/plan.svg'), 'utf8');

function etatVide(): EtatApp {
  return { objects: [], measures: [], selectedKey: null, newObjCounter: 1 } as unknown as EtatApp;
}
const ctx = {
  pushHistory: () => {}, createObjectDOM: () => {}, rebuildHandles: () => {},
  reapplyStackingOrder: () => {}, rebuildSelector: () => {}, render: () => {}
};

/** Reecrit le noeud `measures-data` du SVG dore avec les cotes donnees, telles quelles. */
function svgAvecCotes(cotes: unknown[]): string {
  const doc = new DOMParser().parseFromString(svgDore, 'image/svg+xml');
  doc.getElementById('measures-data')!.setAttribute('data-measures', JSON.stringify(cotes));
  return new XMLSerializer().serializeToString(doc);
}

function cotesDuFichier(): Record<string, unknown>[] {
  const doc = new DOMParser().parseFromString(svgDore, 'image/svg+xml');
  return JSON.parse(doc.getElementById('measures-data')!.getAttribute('data-measures')!);
}

describe('importSVGString — restauration des cotes', () => {
  it('restaure les onze cotes du fichier dore, references intactes', () => {
    const etat = etatVide();
    // Le mode « remplacement » (option du menu Fichier) : sans lui, les cotes du fichier sont ignorees.
    importSVGString(svgDore, etat, ctx, true);
    expect(etat.objects).toHaveLength(35);
    expect(etat.measures).toHaveLength(11);
    const attendues = cotesDuFichier();
    etat.measures.forEach((m, i) => {
      const a = attendues[i]!;
      expect([m.refObjKey, m.refSegIndex, m.startEnd, m.targetObjKey, m.targetPtIndex])
        .toEqual([a.refObjKey, a.refSegIndex, a.startEnd, a.targetObjKey, a.targetPtIndex]);
    });
  });

  it('ecarte les cotes abimees et garde les autres', () => {
    const [premiere, seconde] = cotesDuFichier();
    const abimees = [
      premiere,                                                     // intacte
      { ...seconde, refSegIndex: 999 },                             // cote hors du polygone
      { ...seconde, targetPtIndex: -1 },                            // sommet negatif
      { ...seconde, refObjKey: 'objet-inconnu' },                   // objet absent
      { ...seconde, refSegIndex: undefined },                       // indice manquant
      'pas une cote',                                               // pas un objet
      { ...seconde, startEnd: 'nimporte' }                          // intacte, startEnd normalise
    ];
    const etat = etatVide();
    importSVGString(svgAvecCotes(abimees), etat, ctx, true);
    expect(etat.measures).toHaveLength(2);
    expect(etat.measures[0]!.refSegIndex).toBe(premiere!.refSegIndex);
    expect(etat.measures[1]!.startEnd).toBe('A');
    expect(etat.measures.every((m) => typeof m.refSegIndex === 'number' && typeof m.targetPtIndex === 'number')).toBe(true);
  });

  it('survit a un noeud measures-data qui ne contient pas un tableau', () => {
    const doc = new DOMParser().parseFromString(svgDore, 'image/svg+xml');
    doc.getElementById('measures-data')!.setAttribute('data-measures', '{"pas":"un tableau"}');
    const etat = etatVide();
    importSVGString(new XMLSerializer().serializeToString(doc), etat, ctx, true);
    expect(etat.objects).toHaveLength(35);
    expect(etat.measures).toHaveLength(0);
  });
});

describe('importSVGString — attributs absents d un SVG etranger (D-6)', () => {
  it('ecarte les points illisibles au lieu de poser des coordonnees undefined', () => {
    const etat = etatVide();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<polygon points="0,0 4,0 4 4,3 0,3" />' +
      '<circle cx="1" cy="1" />' +
      '<circle cx="1" cy="1" r="2" />' +
      '</svg>';
    importSVGString(svg, etat, ctx, false);
    const [poly, cercle, ...reste] = etat.objects;
    expect(reste).toHaveLength(0);
    // « 4 » seul n'a pas de y : ce jeton est ecarte, les quatre coins restent.
    expect(poly && 'pts' in poly && poly.pts).toEqual([{ x: 0, y: -0 }, { x: 4, y: -0 }, { x: 4, y: -3 }, { x: 0, y: -3 }]);
    // Sans rayon, le premier cercle n'est pas importe ; le second l'est, avec l'opacite par defaut.
    expect(cercle && 'r' in cercle && cercle.r).toBe(2);
    expect(cercle?.fillOpacity).toBe(0.9);
  });
});
