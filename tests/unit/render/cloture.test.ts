// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { dessinerCloture } from '../../../src/render/cloture.js';
import { clotureDe, nouveauPortail, reglerCote } from '../../../src/model/cloture.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// La cloture sur le plan a l'ecran (render/cloture.ts, MD/spec-cloture.md §5) : un trait par
// troncon, la coupure d'un acces, ses piliers, ses arcs ou sa course.

const parcelle = (plus: Partial<ObjetPlan> = {}): ObjetPlan => ({
  key: 'parcelle', type: 'polygon', name: 'Parcelle', fonction: 'terrain',
  pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
  clotureActive: true, clotureHauteur: 1.8,
  ...plus,
} as ObjetPlan);

function dessiner(p: ObjetPlan | null) {
  const groupe = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  dessinerCloture(groupe, { scene: { scale: 10 } }, (q) => ({ x: q.x * 10, y: -q.y * 10 }), p);
  const de = (role: string) => [...groupe.querySelectorAll(`[data-cloture="${role}"]`)];
  return { groupe, traits: de('trait'), arcs: de('arc'), piliers: de('pilier') };
}

describe('dessinerCloture', () => {
  it('ne dessine rien sans cloture active', () => {
    expect(dessiner(parcelle({ clotureActive: false })).groupe.childNodes).toHaveLength(0);
    expect(dessiner(null).groupe.childNodes).toHaveLength(0);
  });

  it('un trait par troncon, dans le motif du type', () => {
    const p = parcelle();
    const cl = clotureDe(p, true);
    cl.defaut = { type: 'mur', hauteur: 1.8, couleur: '#aaa' };
    Object.assign(reglerCote(cl, 1), { type: 'haie' });
    Object.assign(reglerCote(cl, 2), { type: 'aucune' });
    const { traits } = dessiner(p);
    expect(traits).toHaveLength(3);
    expect(traits[0]?.getAttribute('stroke')).toBe('#aaa');
    expect(traits[0]?.getAttribute('stroke-width')).toBe('2.2');
    expect(traits[1]?.getAttribute('stroke-linecap')).toBe('round');
    // Le trait court a l'interieur de la limite : y > 0 sur le cote sud, dans le repere du plan.
    expect(Number(traits[0]?.getAttribute('y1'))).toBeLessThan(0);
  });

  it('un portail coupe le trait, pose ses piliers et deux arcs de debattement', () => {
    const p = parcelle();
    const cl = clotureDe(p, true);
    cl.portails.push({ ...nouveauPortail('portail', 0, 20), x: 5 });
    const { traits, arcs, piliers } = dessiner(p);
    expect(piliers).toHaveLength(2);
    expect(arcs).toHaveLength(2);
    // Cote 0 : deux troncons, puis 3 autres cotes, plus la coupure, les poteaux de la palissade et les vantaux.
    expect(traits.length).toBeGreaterThan(5);
    const coupure = traits.find(t => t.getAttribute('stroke-width') === '3.4');
    expect(coupure).toBeDefined();
    // Les vantaux s'ouvrent vers l'interieur : leur bout est au nord de la limite sud (y du plan > 0,
    // donc y d'ecran < 0), a 1,75 m du gond.
    const vantaux = traits.filter(t => t.getAttribute('stroke-width') === '1' && t.getAttribute('stroke') !== '#aaa');
    expect(vantaux).toHaveLength(2);
    for (const v of vantaux) expect(Number(v.getAttribute('y2'))).toBeCloseTo(-17.5, 6);
  });

  it('un coulissant a une course de rangement et pas d arc ; un portail en retrait a ses retours', () => {
    const p = parcelle();
    const cl = clotureDe(p, true);
    cl.portails.push({ ...nouveauPortail('portail', 0, 20), x: 5, ouverture: 'coulissant', retrait: 5 });
    const { traits, arcs } = dessiner(p);
    expect(arcs).toHaveLength(0);
    expect(traits.filter(t => t.getAttribute('stroke-dasharray') === '4 2')).toHaveLength(1);
    // Les deux retours de 5 m : des traits verticaux dans le repere du plan.
    expect(traits.filter(t => t.getAttribute('x1') === t.getAttribute('x2') && Math.abs(Number(t.getAttribute('y1')) - Number(t.getAttribute('y2'))) === 50)).toHaveLength(2);
  });
});

describe('poignee d\'un acces', () => {
  it('chaque acces porte une poignee qui capte le pointeur, dans un groupe inerte', () => {
    const p = parcelle();
    const cl = clotureDe(p, true);
    cl.portails.push({ ...nouveauPortail('portail', 0, 20), x: 5, largeur: 3 }, { ...nouveauPortail('portillon', 2, 20), x: 2, largeur: 1 });
    const { groupe } = dessiner(p);
    const poignees = [...groupe.querySelectorAll('[data-role="acces"]')];
    expect(poignees.map(x => x.getAttribute('data-index'))).toEqual(['0', '1']);
    expect(poignees[0]?.getAttribute('pointer-events')).toBe('all');
    expect(poignees[1]?.querySelector('title')?.textContent).toMatch(/^Portillon : glisser/);
  });
});
