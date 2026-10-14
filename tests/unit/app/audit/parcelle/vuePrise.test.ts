import { describe, it, expect, vi } from 'vitest';
import { capDeLaVue, facadeTouchee, posePieton, suiviPieton, OEIL_M, PAUSE_GESTE_MS, RECUL_PIETON_M, REGARD_HAUT_DEG } from '../../../../../src/app/audit/parcelle/vuePrise.js';
import type { Facade } from '../../../../../src/facade/geometrie.js';

// La Vue 3D de « Photographier en marchant » (app/audit/parcelle/vuePrise.ts) : a hauteur d'homme,
// un peu vers le haut, derriere vous, et qui suit votre position et votre cap.

const facade = (gauche: { x: number; y: number }, droite: { x: number; y: number }): Facade =>
  ({ cote: 0, gauche, droite, largeur: Math.hypot(droite.x - gauche.x, droite.y - gauche.y), hauteur: 6, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' } as Facade);

describe('la pose a hauteur d\'homme', () => {
  it('se tient derriere vous dans l\'axe du cap, a hauteur des yeux, et regarde un peu vers le haut', () => {
    const p = posePieton({ x: 10, y: 3 }, 0);
    expect(p.oeil.x).toBeCloseTo(10);
    expect(p.oeil.y).toBeCloseTo(3 - RECUL_PIETON_M);
    expect(p.hauteurOeil).toBe(OEIL_M);
    expect(p.vise.y).toBeGreaterThan(3);
    const montee = Math.atan2(p.hauteurVise - p.hauteurOeil, p.vise.y - p.oeil.y) * 180 / Math.PI;
    expect(montee).toBeCloseTo(REGARD_HAUT_DEG, 5);
  });

  it('tourne avec le cap : vers l\'est, la camera est a l\'ouest de vous', () => {
    const p = posePieton({ x: 0, y: 0 }, 90);
    expect(p.oeil.x).toBeCloseTo(-RECUL_PIETON_M);
    expect(p.oeil.y).toBeCloseTo(0);
    expect(p.vise.x).toBeGreaterThan(0);
  });
});

describe('le cap de la vue', () => {
  const sud = facade({ x: 5, y: 10 }, { x: 15, y: 10 });
  it('suit les capteurs quand ils en donnent un', () => {
    expect(capDeLaVue({ x: 10, y: 3 }, 45, sud)).toBe(45);
  });
  it('sans boussole ni marche, regarde la facade visee', () => {
    expect(capDeLaVue({ x: 10, y: 3 }, null, sud)).toBeCloseTo(0);
    expect(capDeLaVue({ x: 10, y: 20 }, null, sud)).toBeCloseTo(180);
  });
  it('sans rien, regarde le nord', () => {
    expect(capDeLaVue({ x: 10, y: 3 }, null, null)).toBe(0);
  });
});

describe('la facade touchee', () => {
  const lignes = [
    { cote: 0, statut: 'aPhotographier', facade: facade({ x: 5, y: 10 }, { x: 15, y: 10 }) },
    { cote: 1, statut: 'aPhotographier', facade: facade({ x: 15, y: 10 }, { x: 15, y: 20 }) },
    { cote: 2, statut: 'mitoyenne', facade: facade({ x: 15, y: 20 }, { x: 5, y: 20 }) },
  ];
  it('est celle dont le mur passe le plus pres du doigt', () => {
    expect(facadeTouchee(lignes, { x: 14.5, y: 16 })?.cote).toBe(1);
    expect(facadeTouchee(lignes, { x: 8, y: 10.2 })?.cote).toBe(0);
  });
  it('n\'est jamais une facade mitoyenne', () => {
    expect(facadeTouchee(lignes, { x: 9, y: 19.9 })?.cote).not.toBe(2);
    expect(facadeTouchee([lignes[2]!], { x: 9, y: 19.9 })).toBeNull();
  });
});

describe('le suivi pendant la prise', () => {
  it('pose la camera a chaque position tant que l\'ecran est ouvert, et pas apres', () => {
    const poser = vi.fn(() => true);
    const s = suiviPieton({ poser }, () => 0);
    expect(s.suivre({ x: 0, y: 0 }, 0, null)).toBe(false);
    s.activer(true);
    expect(s.suivre({ x: 0, y: 0 }, 0, null)).toBe(true);
    expect(s.suivre({ x: 0, y: 1 }, 30, null)).toBe(true);
    expect(poser).toHaveBeenCalledTimes(2);
    s.activer(false);
    expect(s.suivre({ x: 0, y: 2 }, 30, null)).toBe(false);
  });

  it('attend apres un geste du doigt, puis reprend tout seul', () => {
    let t = 1000;
    const poser = vi.fn(() => true);
    const s = suiviPieton({ poser }, () => t);
    s.activer(true);
    s.lacher();
    expect(s.suivre({ x: 0, y: 0 }, 0, null)).toBe(false);
    expect(s.suivre({ x: 0, y: 0 }, 0, null, true)).toBe(true);
    t += PAUSE_GESTE_MS + 1;
    expect(s.suivre({ x: 0, y: 0 }, 0, null)).toBe(true);
  });
});
