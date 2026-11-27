// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { brancherPointeur, type ContextePointeur } from '../../../src/interaction/pointeur.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetBrut, ObjetPolygone } from '../../../src/model/types.js';

// Le cablage de la regle des gestes (interaction/choixGeste.ts) : un glisser sur un objet qui n'est pas choisi deplace la vue sans
// rien choisir ; un toucher choisit ; l'objet choisi se deplace ; la parcelle deplace la vue, meme choisie.

const carre = (x: number) => [{ x, y: 0 }, { x: x + 4, y: 0 }, { x: x + 4, y: 4 }, { x, y: 4 }];

function plan(selectedKey: string | null = null, lectureSeule = false) {
  const objets = normalizeObjects([
    { key: 'parcelle', type: 'polygon', name: 'Parcelle', fonction: 'terrain', pts: [{ x: -100, y: -100 }, { x: 100, y: -100 }, { x: 100, y: 100 }, { x: -100, y: 100 }] },
    { key: 'terrasse', type: 'polygon', name: 'Terrasse', fonction: 'terrasse', pts: carre(0) }
  ] as unknown as ObjetBrut[]);
  const etat = {
    objects: objets, measures: [], selectedKey, highlight: { type: null, index: null }, lectureSeule,
    scene: { origine: { x: 0, y: 0 }, scale: 1 }
  } as unknown as EtatApp;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const stage = document.createElement('div');
  stage.appendChild(svg);
  document.body.appendChild(stage);
  const corps = (key: string) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    el.dataset.role = 'obj'; el.dataset.key = key;
    svg.appendChild(el);
    return el;
  };
  const elements = { parcelle: corps('parcelle'), terrasse: corps('terrasse') };
  const ctx = {
    toWorld: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }), render: vi.fn(), rebuildSelector: vi.fn(), pushHistory: vi.fn(),
    sendObjectBackward: vi.fn(), insertPointOnSegment: vi.fn(), markDirty: vi.fn(), apresAcces: vi.fn(), signaler: vi.fn(), vueChangee: vi.fn()
  } satisfies ContextePointeur;
  brancherPointeur(svg as unknown as SVGElement, stage, etat, ctx);
  let id = 0;
  const ev = (type: string, x: number, y: number, pointerType: string, button = 0, pointerId = 1) =>
    Object.assign(new Event(type, { bubbles: true, cancelable: true }), { clientX: x, clientY: y, pointerType, button, pointerId });
  /** Un appui sur `el`, des mouvements, puis le lacher. */
  const geste = (el: Element, chemin: [number, number][], pointerType = 'mouse', button = 0) => {
    const pid = ++id;
    const [x0, y0] = chemin[0] ?? [0, 0];
    el.dispatchEvent(ev('pointerdown', x0, y0, pointerType, button, pid));
    for (const [x, y] of chemin.slice(1)) window.dispatchEvent(ev('pointermove', x, y, pointerType, button, pid));
    const [xf, yf] = chemin[chemin.length - 1] ?? [0, 0];
    window.dispatchEvent(ev('pointerup', xf, yf, pointerType, button, pid));
  };
  const terrasse = objets.find((o) => o.key === 'terrasse') as ObjetPolygone;
  return { etat, ctx, elements, geste, terrasse, stage };
}

describe('les gestes du plan 2D', () => {
  for (const pointerType of ['mouse', 'touch']) {
    it(`${pointerType} : glisser sur un objet qui n est pas choisi deplace la vue, sans le choisir ni le deplacer`, () => {
      const p = plan();
      const pts = p.terrasse.pts.map((q) => ({ ...q }));
      p.geste(p.elements.terrasse, [[10, 10], [20, 15], [40, 30]], pointerType);
      expect(p.etat.selectedKey).toBeNull();
      expect(p.etat.scene.origine).toEqual({ x: 30, y: 20 });
      expect(p.terrasse.pts).toEqual(pts);
      expect(p.ctx.pushHistory).not.toHaveBeenCalled();
    });

    it(`${pointerType} : un toucher bref, meme tremble, choisit l objet sans deplacer la vue`, () => {
      const p = plan();
      p.geste(p.elements.terrasse, [[10, 10], [12, 11]], pointerType);
      expect(p.etat.selectedKey).toBe('terrasse');
      expect(p.etat.scene.origine).toEqual({ x: 0, y: 0 });
    });

    it(`${pointerType} : glisser l objet choisi le deplace, la vue reste`, () => {
      const p = plan('terrasse');
      p.geste(p.elements.terrasse, [[1, 1], [3, 2], [6, 4]], pointerType);
      expect(p.terrasse.pts[0]).toEqual({ x: 5, y: 3 });
      expect(p.etat.scene.origine).toEqual({ x: 0, y: 0 });
      expect(p.ctx.pushHistory).toHaveBeenCalledTimes(1);
    });

    it(`${pointerType} : glisser sur la parcelle choisie deplace la vue, la parcelle reste`, () => {
      const p = plan('parcelle');
      p.geste(p.elements.parcelle, [[10, 10], [60, 10]], pointerType);
      expect(p.etat.scene.origine).toEqual({ x: 50, y: 0 });
      expect(p.etat.selectedKey).toBe('parcelle');
      expect(p.ctx.pushHistory).not.toHaveBeenCalled();
    });
  }

  it('le toucher passe le seuil plus tard au doigt qu a la souris', () => {
    const souris = plan(), doigt = plan();
    souris.geste(souris.elements.terrasse, [[0, 0], [8, 0]], 'mouse');
    doigt.geste(doigt.elements.terrasse, [[0, 0], [8, 0]], 'touch');
    expect(souris.etat.selectedKey).toBeNull();
    expect(souris.etat.scene.origine.x).toBe(8);
    expect(doigt.etat.selectedKey).toBe('terrasse');
    expect(doigt.etat.scene.origine.x).toBe(0);
  });

  it('un clic sur l objet choisi le deselectionne, comme avant', () => {
    const p = plan('terrasse');
    p.geste(p.elements.terrasse, [[1, 1]]);
    expect(p.etat.selectedKey).toBeNull();
  });

  it('le double-clic sur un objet qui n etait pas choisi le recule', () => {
    const p = plan();
    p.geste(p.elements.terrasse, [[1, 1]]);
    p.geste(p.elements.terrasse, [[1, 1]]);
    expect(p.ctx.sendObjectBackward).toHaveBeenCalledTimes(1);
  });

  it('toucher un objet puis le glisser aussitot n est pas un double-clic : la vue suit, ou l objet choisi', () => {
    const p = plan();
    p.geste(p.elements.parcelle, [[150, 150]], 'touch');
    expect(p.etat.selectedKey).toBe('parcelle');
    p.geste(p.elements.parcelle, [[152, 150], [192, 170]], 'touch');
    expect(p.ctx.sendObjectBackward).not.toHaveBeenCalled();
    expect(p.etat.scene.origine).toEqual({ x: 40, y: 20 });
    p.geste(p.elements.terrasse, [[1, 1]], 'touch');
    p.geste(p.elements.terrasse, [[1, 1], [21, 11]], 'touch');
    expect(p.ctx.sendObjectBackward).not.toHaveBeenCalled();
    expect(p.terrasse.pts[0]).toEqual({ x: 20, y: 10 });
  });

  it('le double toucher sur l objet choisi, meme tremble, le recule sans le deplacer', () => {
    const p = plan('terrasse');
    p.geste(p.elements.terrasse, [[1, 1]], 'touch');
    p.etat.selectedKey = 'terrasse';
    p.geste(p.elements.terrasse, [[1, 1], [4, 3]], 'touch');
    expect(p.ctx.sendObjectBackward).toHaveBeenCalledTimes(1);
    expect(p.terrasse.pts[0]).toEqual({ x: 0, y: 0 });
  });

  it('le bouton du milieu deplace la vue, meme sur l objet choisi', () => {
    const p = plan('terrasse');
    const pts = p.terrasse.pts.map((q) => ({ ...q }));
    p.geste(p.elements.terrasse, [[1, 1], [21, 1]], 'mouse', 1);
    expect(p.terrasse.pts).toEqual(pts);
    expect(p.etat.scene.origine).toEqual({ x: 20, y: 0 });
    expect(p.etat.selectedKey).toBe('terrasse');
  });

  it('barre d espace tenue, le plan ayant le focus : glisser l objet choisi deplace la vue', () => {
    const p = plan('terrasse');
    const pts = p.terrasse.pts.map((q) => ({ ...q }));
    // jsdom ne mesure rien : le plan se dit a l'ecran.
    p.stage.getClientRects = () => [{}] as unknown as DOMRectList;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', cancelable: true }));
    p.geste(p.elements.terrasse, [[1, 1], [11, 1]]);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    expect(p.terrasse.pts).toEqual(pts);
    expect(p.etat.scene.origine).toEqual({ x: 10, y: 0 });
  });

  it('la barre d espace dans un champ texte reste a la saisie', () => {
    const p = plan('terrasse');
    p.stage.getClientRects = () => [{}] as unknown as DOMRectList;
    const champ = document.createElement('input');
    document.body.appendChild(champ);
    champ.focus();
    const touche = new KeyboardEvent('keydown', { code: 'Space', cancelable: true, bubbles: true });
    champ.dispatchEvent(touche);
    expect(touche.defaultPrevented).toBe(false);
    p.geste(p.elements.terrasse, [[1, 1], [11, 1]]);
    champ.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    champ.remove();
    expect(p.terrasse.pts[0]).toEqual({ x: 10, y: 0 });
  });

  it('lecture seule : glisser deplace la vue, meme sur l objet choisi ; un toucher choisit', () => {
    const p = plan('terrasse', true);
    const pts = p.terrasse.pts.map((q) => ({ ...q }));
    p.geste(p.elements.terrasse, [[1, 1], [31, 1]]);
    expect(p.terrasse.pts).toEqual(pts);
    expect(p.etat.scene.origine).toEqual({ x: 30, y: 0 });
    p.geste(p.elements.parcelle, [[200, 1]]);
    expect(p.etat.selectedKey).toBe('parcelle');
  });
});
