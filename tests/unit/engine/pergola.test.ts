import { describe, it, expect } from 'vitest';
import { calculerPergola, dimsPergola, metrageParSection, pergolaDe } from '../../../src/engine/pergola.js';
import type { ObjetPlan, Pergola } from '../../../src/model/types.js';

/** Une pergola rectangulaire de L x l metres, coin bas gauche a l'origine. */
function pergola(L: number, l: number, reglages: Pergola = {}): ObjetPlan {
  return {
    key: 'p', name: 'Pergola', type: 'polygon', fonction: 'pergola',
    pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: l }, { x: 0, y: l }],
    pergola: reglages
  };
}

const compter = (calc: ReturnType<typeof calculerPergola>, role: string) => calc!.pieces.filter(p => p.role === role).length;

describe('reglages d\'une pergola', () => {
  it('comble les manques sans rien ecrire dans l\'objet', () => {
    const o = pergola(4, 3);
    const r = pergolaDe(o);
    expect(r).toMatchObject({ toit: 'toile', hauteur: 2.4, sectionPoteau: '120x120', avecContrefiches: true, entraxeChevrons: 0.6 });
    expect(o.pergola).toEqual({});
  });

  it('prend le plus long cote pour reference, et une pente propre a chaque toit', () => {
    expect(pergolaDe(pergola(3, 5)).coteReference).toBe(1);
    expect(pergolaDe(pergola(4, 3, { toit: 'appentis' })).pente).toBe(10);
    expect(pergolaDe(pergola(4, 3, { toit: 'quatre-pans' })).pente).toBe(30);
  });

  it('lit une section en metres', () => {
    expect(dimsPergola('75x200')).toEqual({ b: 0.075, h: 0.2 });
  });
});

describe('cadre', () => {
  it('pose un poteau par coin, une poutre par cote, deux contrefiches par poteau', () => {
    const calc = calculerPergola(pergola(3, 3));
    expect(compter(calc, 'poteau')).toBe(4);
    expect(compter(calc, 'poutre')).toBe(4);
    expect(compter(calc, 'contrefiche')).toBe(8);
  });

  it('ajoute des poteaux intermediaires au-dela de l\'entraxe maximal', () => {
    // 6 m a 4 m au plus : deux travees sur les grands cotes, un poteau de plus sur chacun.
    const calc = calculerPergola(pergola(6, 3));
    expect(compter(calc, 'poteau')).toBe(6);
    expect(compter(calc, 'contrefiche')).toBe(12);
  });

  it('affleure les poteaux au contour et allonge les poutres d\'une largeur de poteau', () => {
    const calc = calculerPergola(pergola(4, 3))!;
    const pot = calc.pieces.find(p => p.role === 'poteau')!;
    expect(pot.a.x).toBeCloseTo(0.06);
    expect(pot.a.y).toBeCloseTo(0.06);
    expect(pot.longueur).toBeCloseTo(2.4);
    const poutre = calc.pieces.find(p => p.role === 'poutre')!;
    expect(poutre.longueur).toBeCloseTo(4 - 0.12 + 0.12);
  });

  it('renonce aux contrefiches si elles touchent presque le sol', () => {
    const calc = calculerPergola(pergola(3, 3, { hauteur: 1.8, longueurContrefiche: 1.5 }))!;
    expect(compter(calc, 'contrefiche')).toBe(0);
    expect(calc.avertissements.join(' ')).toMatch(/Contrefiches trop longues/);
  });

  it('refuse un contour sans surface', () => {
    const o = pergola(3, 3);
    if (o.type === 'polygon') o.pts = o.pts.slice(0, 2);
    expect(calculerPergola(o)).toBeNull();
  });
});

describe('toits', () => {
  it('chevrons et toile : chevrons a l\'entraxe, perpendiculaires au cote de reference, toile a plat', () => {
    const calc = calculerPergola(pergola(4, 3))!;
    const chevrons = calc.pieces.filter(p => p.role === 'chevron');
    // 4 m moins une largeur de chevron, a 60 cm au plus : 7 intervalles, 8 chevrons.
    expect(chevrons).toHaveLength(8);
    chevrons.forEach(c => { expect(c.a.x).toBeCloseTo(c.b.x); expect(c.longueur).toBeCloseTo(3); });
    expect(calc.surfaceCouverture).toBeCloseTo(12);
    expect(calc.pans).toHaveLength(1);
  });

  it('appentis : le cadre suit la pente depuis le cote bas', () => {
    const calc = calculerPergola(pergola(4, 3, { toit: 'appentis', pente: 10 }))!;
    const poteaux = calc.pieces.filter(p => p.role === 'poteau').map(p => p.longueur).sort((a, b) => a - b);
    const tan = Math.tan(10 * Math.PI / 180);
    expect(poteaux[0]).toBeCloseTo(2.4 + 0.06 * tan);
    expect(poteaux[3]).toBeCloseTo(2.4 + (3 - 0.06) * tan);
    const chevron = calc.pieces.find(p => p.role === 'chevron')!;
    expect(chevron.longueur).toBeCloseTo(3 / Math.cos(10 * Math.PI / 180));
    expect(calc.surfaceCouverture).toBeCloseTo(12 / Math.cos(10 * Math.PI / 180));
  });

  it('quatre pans : un faitage, quatre aretiers, quatre pans de couverture', () => {
    const calc = calculerPergola(pergola(5, 3, { toit: 'quatre-pans', pente: 30 }))!;
    expect(compter(calc, 'faitage')).toBe(1);
    expect(compter(calc, 'aretier')).toBe(4);
    expect(calc.pans).toHaveLength(4);
    const faitage = calc.pieces.find(p => p.role === 'faitage')!;
    expect(faitage.longueur).toBeCloseTo(5 - 3);
    expect(calc.surfaceCouverture).toBeCloseTo(15 / Math.cos(Math.PI / 6));
    expect(calc.avertissements).toEqual([]);
  });

  it('quatre pans sur un contour non rectangulaire : calcule sur le rectangle englobant, et le dit', () => {
    const o: ObjetPlan = { key: 'p', name: 'P', type: 'polygon', fonction: 'pergola', pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], pergola: { toit: 'quatre-pans' } };
    expect(calculerPergola(o)!.avertissements.join(' ')).toMatch(/rectangle qui englobe/);
  });
});

describe('metrage par section', () => {
  it('regroupe les pieces par section et les debite dans les longueurs achetables', () => {
    // Poteaux et contrefiches de meme section : un seul produit.
    const calc = calculerPergola(pergola(4, 3, { sectionContrefiche: '120x120', entraxePoteaux: 4, longueursBois: '3, 4' }))!;
    const m = metrageParSection(calc);
    expect(m.map(g => g.section)).toEqual(['120x120', '75x200', '45x145']);
    const poteaux = m[0]!;
    expect(poteaux.roles).toEqual({ poteau: 4, contrefiche: 8 });
    expect(poteaux.ml).toBeCloseTo(4 * 2.4 + 8 * 0.7);
    // Chaque poteau de 2,40 m dans une barre de 3 m ; les contrefiches dans les chutes et le reste.
    expect(poteaux.debit.achatMl).toBeGreaterThanOrEqual(poteaux.ml);
    const poutres = m[1]!;
    expect(poutres.debit.achats).toEqual({ 4: 2, 3: 2 });
  });
});
