// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { brancherPointeur, type ContextePointeur } from '../../../src/interaction/pointeur.js';
import { creerGestes } from '../../../src/app/assemblage/gestes.js';
import { avecAccordDeRetouche, MESSAGE_RETOUCHE_PERMISE } from '../../../src/interaction/retoucheTerrain.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetBrut, ObjetPlan, ObjetPolygone } from '../../../src/model/types.js';

// Retoucher la forme d'un objet de l'IGN : la question d'abord (interaction/retoucheTerrain.ts). « Annuler » : rien, aucun pas
// d'annulation ; « Confirmer » : le marque, puis le geste. Une fois marque, plus de question.

const maison = (marque = false): ObjetPolygone => normalizeObjects([{
  key: 'maison', type: 'polygon', name: 'Maison', fonction: 'batiment', pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }],
  bdtopo: { couche: 'BDTOPO_V3:batiment', id: 'BAT1' }, ...(marque ? { retoucheMain: { date: '2026-10-01' } } : {})
}] as unknown as ObjetBrut[])[0] as ObjetPolygone;

const etatAvec = (obj: ObjetPlan): EtatApp => ({
  objects: [obj], measures: [], selectedKey: obj.key, highlight: { type: null, index: null }, lectureSeule: false,
  scene: { origine: { x: 0, y: 0 }, echelle: 1 }
} as unknown as EtatApp);

/** Une question qu'on retient, pour y repondre dans le test. */
function question() {
  const q = { message: '', oui: null as null | (() => void) };
  return { q, confirmer: vi.fn((message: string, oui: () => void) => { q.message = message; q.oui = oui; }) };
}

/** Le plan : un svg et une poignee de sommet (render/objects.ts pose `data-role`, `data-key`, `data-index`). */
function planAvecPointeur(etat: EtatApp, confirmer: (message: string, oui: () => void) => void) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const stage = document.createElement('div');
  stage.appendChild(svg);
  document.body.appendChild(stage);
  const poignee = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  poignee.dataset.role = 'point'; poignee.dataset.key = 'maison'; poignee.dataset.index = '1';
  svg.appendChild(poignee);
  const ctx = {
    toWorld: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }), render: vi.fn(), rebuildSelector: vi.fn(), pushHistory: vi.fn(),
    sendObjectBackward: vi.fn(), insertPointOnSegment: vi.fn(), markDirty: vi.fn(), apresAcces: vi.fn(), signaler: vi.fn(), confirmer
  } satisfies ContextePointeur;
  brancherPointeur(svg as unknown as SVGElement, stage, etat, ctx);
  const evenement = (type: string, x: number, y: number) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), { clientX: x, clientY: y, pointerType: 'mouse' });
  return {
    ctx,
    appuyer: () => poignee.dispatchEvent(evenement('pointerdown', 8, 0)),
    tirer: (x: number, y: number) => { window.dispatchEvent(evenement('pointermove', x, y)); window.dispatchEvent(evenement('pointerup', x, y)); }
  };
}

describe('tirer un sommet d un objet de l IGN', () => {
  it('demande d abord, a l appui ; « Annuler » : rien ne bouge, aucun pas d annulation', () => {
    const obj = maison(), etat = etatAvec(obj);
    const { q, confirmer } = question();
    const plan = planAvecPointeur(etat, confirmer);
    plan.appuyer();
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(q.message).toMatch(/^« Maison » vient de l’IGN\./);
    plan.tirer(12, 0);
    expect(obj.pts[1]).toEqual({ x: 8, y: 0 });
    expect(plan.ctx.pushHistory).not.toHaveBeenCalled();
    expect(plan.ctx.markDirty).not.toHaveBeenCalled();
    expect(obj.retoucheMain).toBeUndefined();
  });

  it('« Confirmer » pose le marque ; la personne tire de nouveau, sans autre question', () => {
    const obj = maison(), etat = etatAvec(obj);
    const { q, confirmer } = question();
    const plan = planAvecPointeur(etat, confirmer);
    plan.appuyer();
    q.oui?.();
    expect(obj.retoucheMain?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(plan.ctx.markDirty).toHaveBeenCalledTimes(1);
    expect(plan.ctx.signaler).toHaveBeenCalledWith(MESSAGE_RETOUCHE_PERMISE);
    expect(plan.ctx.pushHistory).not.toHaveBeenCalled();
    plan.appuyer();
    plan.tirer(12, 0);
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(plan.ctx.pushHistory).toHaveBeenCalledTimes(1);
    expect(obj.pts[1]).toEqual({ x: 12, y: 0 });
  });

  it('un objet deja retouche ne demande plus rien', () => {
    const obj = maison(true), etat = etatAvec(obj);
    const { confirmer } = question();
    const plan = planAvecPointeur(etat, confirmer);
    plan.appuyer();
    plan.tirer(12, 0);
    expect(confirmer).not.toHaveBeenCalled();
    expect(obj.pts[1]).toEqual({ x: 12, y: 0 });
  });
});

describe('retirer un sommet d un objet de l IGN', () => {
  const gestes = (etat: EtatApp, confirmer: (m: string, oui: () => void) => void) => {
    const d = { pushHistory: vi.fn(), markDirty: vi.fn(), render: vi.fn(), rebuildSelector: vi.fn(), rebuildHandles: vi.fn(), createObjectDOM: vi.fn(), reapplyStackingOrder: vi.fn(), confirmer, mesures: {} as never };
    return { d, g: creerGestes(etat, d) };
  };

  it('« Annuler » : le sommet reste, aucun pas d annulation, pas de marque', () => {
    const obj = maison(), etat = etatAvec(obj);
    const { confirmer } = question();
    const { d, g } = gestes(etat, confirmer);
    g.deleteVertex(obj, 1);
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(obj.pts).toHaveLength(4);
    expect(d.pushHistory).not.toHaveBeenCalled();
    expect(obj.retoucheMain).toBeUndefined();
  });

  it('« Confirmer » : le marque, puis le sommet part, avec son pas d annulation', () => {
    const obj = maison(), etat = etatAvec(obj);
    const { q, confirmer } = question();
    const { d, g } = gestes(etat, confirmer);
    g.deleteVertex(obj, 1);
    q.oui?.();
    expect(obj.pts).toHaveLength(3);
    expect(obj.retoucheMain).toBeTruthy();
    expect(d.markDirty).toHaveBeenCalledTimes(1);
    expect(d.pushHistory).toHaveBeenCalledTimes(1);
    // Marque : la suivante se fait sans question.
    g.insertPointOnSegment(obj, 0, { x: 4, y: 0 });
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(obj.pts).toHaveLength(4);
  });

  it('un objet dessine a la main ne demande rien', () => {
    const terrasse = { ...maison(), key: 't', bdtopo: undefined } as unknown as ObjetPlan;
    delete (terrasse as { bdtopo?: unknown }).bdtopo;
    const confirmer = vi.fn();
    expect(avecAccordDeRetouche(terrasse, { markDirty: vi.fn(), confirmer }, () => {})).toBe(true);
    expect(confirmer).not.toHaveBeenCalled();
  });
});
