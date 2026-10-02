// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerDomObjet, reconstruirePoignees, positionnerObjet, OPACITE_ISOLEMENT, type ObjetRendu, type ContextePositionnement } from '../../../src/render/objects.js';
import { vue, detruireVue } from '../../../src/render/vues.js';
import type { EtatScene } from '../../../src/geometry/vue.js';

// Le rendu d'un objet du plan (render/objects.ts) : la forme et son etiquette, les poignees, puis
// leur placement a l'ecran selon la selection, le masquage, le fond et l'isolement.

const scene = { scale: 10, origine: { x: 100, y: 200 } } as unknown as EtatScene;
const base = { fill: '#aaa', fillOpacity: 0.6, stroke: '#333', showName: true, showDims: true, showSegNames: false, showVertNames: false, showAngles: false };
const carre = (key = 'terrasse', plus: Partial<ObjetRendu> = {}) => ({
  ...base, key, name: 'Terrasse', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
  segmentNames: ['A', 'B', 'C', 'D'], vertexNames: ['1', '2', '3', '4'], frozenVertices: [false, true, false, false], ...plus
}) as unknown as ObjetRendu;
const chemin = (fonction?: string) => ({ ...base, key: 'chemin', name: 'Allée', type: 'path', width: 1.2, fonction, pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }] }) as unknown as ObjetRendu;
const rond = () => ({ ...base, key: 'arbre', name: 'Chêne', type: 'circle', center: { x: 2, y: 2 }, r: 1.5 }) as unknown as ObjetRendu;

let racine: SVGElement;
beforeEach(() => {
  document.body.innerHTML = '<svg></svg>';
  racine = document.querySelector('svg') as unknown as SVGElement;
  for (const k of ['terrasse', 'parcelle', 'chemin', 'arbre']) detruireVue({ key: k });
});

function ctx(plus: Partial<ContextePositionnement> = {}): ContextePositionnement {
  return {
    scene, selectionnee: false, masque: false, ortho: { actif: false, parcelleOpacite: 0.15 },
    estTerrain: (o) => o.key === 'parcelle', pointageSommets: false, pointageCotes: false,
    reconstruirePoignees: (o) => reconstruirePoignees(o, { racine }), ...plus
  };
}

describe('creerDomObjet', () => {
  it('cree la forme de chaque type, reperable par sa cle, et son etiquette', () => {
    for (const o of [carre(), chemin(), rond()]) creerDomObjet(racine, o, scene);
    expect([...racine.querySelectorAll('[data-role="obj"]')].map((e) => e.tagName + ':' + (e as HTMLElement).dataset.key))
      .toEqual(['polygon:terrasse', 'path:chemin', 'circle:arbre']);
    expect(racine.querySelectorAll('text')).toHaveLength(3);
    // Un chemin a l'epaisseur de sa largeur a l'echelle, et pas de remplissage.
    expect(vue(chemin()).el?.getAttribute('stroke-width')).toBe('12');
    expect(vue(chemin()).el?.getAttribute('fill')).toBe('none');
  });

  it('donne une fleche et un repere a un point de vue, des tirets a une limite', () => {
    creerDomObjet(racine, chemin('camera'), scene);
    expect(vue(chemin()).el?.getAttribute('marker-end')).toBe('url(#flecheVue)');
    expect(vue(chemin()).camMarkerEl).toBeTruthy();
    detruireVue({ key: 'chemin' });
    creerDomObjet(racine, chemin('limite'), scene);
    expect(vue(chemin()).el?.getAttribute('stroke-dasharray')).toBe('10 7');
  });
});

describe('reconstruirePoignees', () => {
  it('un coin et un cote par sommet d un polygone, un cote de moins pour un chemin ouvert', () => {
    const p = carre(), c = chemin();
    creerDomObjet(racine, p, scene); creerDomObjet(racine, c, scene);
    reconstruirePoignees(p, { racine }); reconstruirePoignees(c, { racine });
    expect([vue(p).pointEls.length, vue(p).edgeEls.length]).toEqual([4, 4]);
    expect([vue(c).pointEls.length, vue(c).edgeEls.length]).toEqual([3, 2]);
    // Refaire les poignees ne les double pas.
    reconstruirePoignees(p, { racine });
    expect(racine.querySelectorAll('[data-role="point"][data-key="terrasse"]')).toHaveLength(4);
  });

  it('delegue le double-clic d un cote a l appelant', () => {
    const p = carre(), surDoubleClicCote = vi.fn();
    creerDomObjet(racine, p, scene);
    reconstruirePoignees(p, { racine, surDoubleClicCote });
    vue(p).edgeEls[2]?.dispatchEvent(new MouseEvent('dblclick'));
    expect(surDoubleClicCote).toHaveBeenCalledWith(p, 2, expect.any(MouseEvent));
  });
});

describe('positionnerObjet', () => {
  it('place le contour a l echelle et l etiquette au centre', () => {
    const p = carre();
    creerDomObjet(racine, p, scene);
    positionnerObjet(p, ctx());
    expect(vue(p).el?.getAttribute('points')).toBe('100,200 140,200 140,160 100,160');
    expect([vue(p).nameEl?.getAttribute('x'), vue(p).nameEl?.getAttribute('y'), vue(p).nameEl?.textContent]).toEqual(['120', '180', 'Terrasse']);
  });

  it('montre poignees et cotes a la selection seulement, un coin fige plus gros', () => {
    const p = carre();
    creerDomObjet(racine, p, scene);
    positionnerObjet(p, ctx());
    expect(vue(p).pointEls.every((e) => e.style.display === 'none')).toBe(true);
    expect(vue(p).el?.getAttribute('stroke-width')).toBe('1.8');
    positionnerObjet(p, ctx({ selectionnee: true }));
    expect(vue(p).pointEls.every((e) => e.style.display === '')).toBe(true);
    expect(vue(p).el?.getAttribute('stroke-width')).toBe('3');
    expect(vue(p).pointEls.map((e) => e.getAttribute('r'))).toEqual(['6.5', '7.5', '6.5', '6.5']);
    // La cote du cote 1 : son nom n'est pas demande, sa longueur si.
    expect(vue(p).segLabelEls[0]?.textContent).toBe('4,00 m');
  });

  it('montre les poignees des autres objets pendant un pointage', () => {
    const p = carre();
    creerDomObjet(racine, p, scene);
    positionnerObjet(p, ctx({ pointageSommets: true, pointageCotes: true }));
    expect(vue(p).pointEls[0]?.style.display).toBe('');
    expect(vue(p).edgeEls[0]?.style.pointerEvents).toBe('all');
  });

  it('cache tout d un objet masque', () => {
    const p = carre();
    creerDomObjet(racine, p, scene);
    positionnerObjet(p, ctx({ selectionnee: true }));
    positionnerObjet(p, ctx({ masque: true }));
    expect([vue(p).el?.style.display, vue(p).nameEl?.style.display]).toEqual(['none', 'none']);
    expect(vue(p).pointEls.every((e) => e.style.display === 'none')).toBe(true);
  });

  it('applique la transparence du terrain sous le fond, et celle de la terrasse isolee', () => {
    const terrain = carre('parcelle');
    creerDomObjet(racine, terrain, scene);
    positionnerObjet(terrain, ctx({ ortho: { actif: true, parcelleOpacite: 0.15 } }));
    expect(vue(terrain).el?.getAttribute('fill-opacity')).toBe('0.15');
    positionnerObjet(terrain, ctx());
    expect(vue(terrain).el?.getAttribute('fill-opacity')).toBe('0.6');
    const p = carre();
    creerDomObjet(racine, p, scene);
    positionnerObjet(p, ctx({ transparent: true }));
    expect(vue(p).el?.getAttribute('fill-opacity')).toBe(String(OPACITE_ISOLEMENT));
  });

  it('place la poignee de rayon d un cercle, visible a la selection', () => {
    const c = rond();
    creerDomObjet(racine, c, scene);
    reconstruirePoignees(c, { racine });
    positionnerObjet(c, ctx({ selectionnee: true }));
    expect([vue(c).radiusHandle?.getAttribute('cx'), vue(c).radiusHandle?.getAttribute('cy')]).toEqual(['135', '180']);
    expect(vue(c).el?.style.cursor).toBe('move');
  });
});
