import { describe, it, expect } from 'vitest';
import { facettesToit, formesAuChoix, hauteurPignon, LIBELLES_FORME_TOIT, penteDeg, plansDuToit, type Toit } from '../../../../src/facade/toits/toit.js';
import { FORME_DESSINEE, FORMES_TOIT_CATALOGUE, FORMES_TOIT_SIMPLES } from '../../../../src/model/formeToit.js';
import { penteDuToit } from '../../../../src/model/volumesToit.js';

// Les formes du catalogue (MD/spec-regles-toits.md §3.1, lot G1) : nommees, jamais choisies dans un
// menu, et dessinees en leur forme simple la plus proche tant que la 3D ne les sait pas.

const p = (x: number, y: number) => ({ x, y });
const maison = [p(0, 0), p(10, 0), p(10, 6), p(0, 6)];

describe('formes du catalogue dans la geometrie du toit', () => {
  it('chaque forme se dessine comme sa forme simple : plans, facettes, pente, pignons', () => {
    for (const f of FORMES_TOIT_CATALOGUE) {
      const t: Toit = { forme: f, hauteur: 3, angleFaitage: 0 };
      const s: Toit = { ...t, forme: FORME_DESSINEE[f] };
      expect(plansDuToit(maison, t), f).toEqual(plansDuToit(maison, s));
      expect(facettesToit(maison, t), f).toEqual(facettesToit(maison, s));
      expect(penteDeg(maison, t), f).toBe(penteDeg(maison, s));
      expect(penteDuToit(maison, t), f).toBe(penteDuToit(maison, s));
      expect(hauteurPignon(maison, t, 1), f).toBe(hauteurPignon(maison, s, 1));
    }
  });

  it('chaque forme a son nom ; les menus ne proposent que les formes simples, et la forme en place', () => {
    for (const f of [...FORMES_TOIT_SIMPLES, ...FORMES_TOIT_CATALOGUE]) expect(LIBELLES_FORME_TOIT[f]).toBeTruthy();
    expect(LIBELLES_FORME_TOIT.mansart).toBe('Toit à la Mansart');
    expect(formesAuChoix()).toEqual([...FORMES_TOIT_SIMPLES]);
    expect(formesAuChoix('croupes')).toEqual([...FORMES_TOIT_SIMPLES]);
    expect(formesAuChoix('mansart')).toEqual([...FORMES_TOIT_SIMPLES, 'mansart']);
  });
});
