// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { dessinerCalquePlu, ecartsSurLePlan } from '../../../src/render/pluOverlay.js';
import { SVG_ECART_PLU } from '../../../src/render/theme.js';
import { creerScene, versEcran } from '../../../src/geometry/vue.js';
import type { VerdictPlu } from '../../../src/engine/regles/plu/conformite.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les ecarts au PLU sur le plan (render/pluOverlay.ts) : un marqueur sur l'ouvrage, et le recul mesure jusqu'a la limite.

const scene = () => ({ ...creerScene(), W: 800, H: 600 });
const rect = (x: number, y: number, L: number, l: number) => [{ x, y }, { x: x + L, y }, { x: x + L, y: y + l }, { x, y: y + l }];
const abri = (plus: Record<string, unknown> = {}) => ({ key: 'abri', name: 'Abri', type: 'polygon', fonction: 'annexe', pts: rect(17.5, 5, 2, 3), ...plus }) as unknown as ObjetPlan;
const maison = { key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 10, 8) } as unknown as ObjetPlan;
const verdict = (plus: Partial<VerdictPlu>): VerdictPlu => ({ fait: 'f1', objet: 'abri', etat: 'ecart', mesure: 0.5, message: 'Abri : recul 0,5 m n’atteint pas 4 m (UL 7).', ...plus });
const recul = verdict({ trace: { de: { x: 19.5, y: 6 }, vers: { x: 20, y: 6 } } });
const groupe = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');

describe('ecartsSurLePlan', () => {
  it('ne garde que les ecarts qui visent un objet visible, ranges par objet', () => {
    const verdicts = [recul, verdict({ fait: 'f2', message: 'Abri : trop haut.', mesure: 3 }), verdict({ objet: 'maison', etat: 'conforme' }),
      verdict({ objet: null, message: 'Emprise.' }), verdict({ objet: 'maison', etat: 'a-verifier' })];
    const e = ecartsSurLePlan([maison, abri()], verdicts);
    expect(e.map((x) => x.objet.key)).toEqual(['abri']);
    expect(e[0]!.messages).toEqual(['Abri : recul 0,5 m n’atteint pas 4 m (UL 7).', 'Abri : trop haut.']);
    expect(e[0]!.reculs).toEqual([{ de: { x: 19.5, y: 6 }, vers: { x: 20, y: 6 }, mesure: 0.5 }]);
    expect(ecartsSurLePlan([abri({ hidden: true })], verdicts)).toEqual([]);
    expect(ecartsSurLePlan([maison, abri()], verdicts, 'maison')).toEqual([]);
    expect(ecartsSurLePlan([maison, abri()], verdicts, 'abri')).toHaveLength(1);
  });
});

describe('dessinerCalquePlu', () => {
  it('pose un marqueur nomme sur l’ouvrage : un triangle, un point d’exclamation et le mot PLU, pas seulement une couleur', () => {
    const g = groupe(), s = scene();
    dessinerCalquePlu(g, s, ecartsSurLePlan([abri()], [verdict({})]));
    const m = g.querySelector('g.ecartPlu')!;
    expect(m.getAttribute('data-objet')).toBe('abri');
    expect(m.getAttribute('role')).toBe('img');
    expect(m.getAttribute('aria-label')).toBe('Écart au PLU — Abri : recul 0,5 m n’atteint pas 4 m (UL 7).');
    expect(m.querySelector('title')!.textContent).toBe(m.getAttribute('aria-label'));
    expect(m.querySelector('path.ecartPluMarqueur')!.getAttribute('fill')).toBe(SVG_ECART_PLU);
    expect([...m.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['!', 'PLU']);
    // Au-dessus du sommet le plus haut a l'ecran : il ne couvre pas le nom, pose au milieu de l'objet.
    const haut = Math.min(...(abri() as { pts: { x: number; y: number }[] }).pts.map((p) => versEcran(s, p).y));
    const y = Number(/L[-\d.]+,([-\d.]+) /.exec(m.querySelector('path')!.getAttribute('d')!)![1]);
    expect(y).toBeLessThan(haut);
    // Sans recul mesure, pas de trait.
    expect(m.querySelector('line')).toBeNull();
  });

  it('dessine le recul mesure, de l’ouvrage a la limite, avec sa longueur a la francaise', () => {
    const g = groupe(), s = scene();
    dessinerCalquePlu(g, s, ecartsSurLePlan([abri()], [recul]));
    const trait = g.querySelector('line.ecartPluRecul')!;
    const a = versEcran(s, { x: 19.5, y: 6 }), b = versEcran(s, { x: 20, y: 6 });
    expect(Number(trait.getAttribute('x1'))).toBeCloseTo(a.x, 1);
    expect(Number(trait.getAttribute('x2'))).toBeCloseTo(b.x, 1);
    expect(Number(trait.getAttribute('y1'))).toBeCloseTo(a.y, 1);
    expect(trait.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(g.querySelector('text.ecartPluCote')!.textContent).toBe('0,50 m');
    expect(g.querySelectorAll('line')).toHaveLength(3);
  });

  it('se vide quand il n’y a plus d’ecart', () => {
    const g = groupe();
    dessinerCalquePlu(g, scene(), ecartsSurLePlan([abri()], [recul]));
    expect(g.childNodes.length).toBe(1);
    dessinerCalquePlu(g, scene(), []);
    expect(g.childNodes.length).toBe(0);
  });
});
