import { describe, it, expect } from 'vitest';
import { barresDesCarreaux, vitreLue, MENEAU_M, PETITS_BOIS_LUS_M } from '../../../src/three/carreaux3d.js';
import type { CarreauxOuverture } from '../../../src/model/types.js';

// Les carreaux d'une ouverture de la facade objet (lot F8) : les barres se comptent d'apres le vocabulaire lu, et lui seul.
const baie = { x: 1, y: 1, l: 1.2, h: 1.4 };
const compte = (c: Omit<CarreauxOuverture, 'source'>) => {
  const b = barresDesCarreaux(baie, { source: 'ia', ...c });
  return { meneau: b.filter((x) => x.sorte === 'meneau').length, traverse: b.filter((x) => x.sorte === 'traverse').length, petitBois: b.filter((x) => x.sorte === 'petitBois').length };
};

describe('barresDesCarreaux', () => {
  it('la fenetre d AE 101 sud : deux vantaux d un carreau sur trois, une imposte a quatre carreaux', () => {
    // Le cas du run enregistre (tests/fixtures/facades-ia/ae101-sud-synthetique.json), l'imposte au quart de la baie.
    const c = { vantaux: 2 as const, grille: { colonnes: 1, rangees: 3 }, petitsBois: 'fins' as const, imposte: { hauteurM: 0.35, grille: { colonnes: 4, rangees: 1 } } };
    expect(compte(c)).toEqual({ meneau: 1, traverse: 1, petitBois: 3 + 2 * 2 });
    const b = barresDesCarreaux(baie, { source: 'ia', ...c });
    // La traverse sous l'imposte, sur toute la largeur ; le meneau au milieu, du bas jusqu'a elle.
    const t = b.find((x) => x.sorte === 'traverse')!, m = b.find((x) => x.sorte === 'meneau')!;
    expect(t.y0 + MENEAU_M / 2).toBeCloseTo(1 + 1.4 - 0.35);
    expect([t.x0, t.x1]).toEqual([1, 2.2]);
    expect((m.x0 + m.x1) / 2).toBeCloseTo(1.6);
    expect([m.y0, m.y1]).toEqual([1, t.y0]);
    // Toutes les barres restent dans la baie ; les petits bois sont fins.
    expect(b.every((x) => x.x0 >= 1 - 1e-9 && x.x1 <= 2.2 + 1e-9 && x.y0 >= 1 - 1e-9 && x.y1 <= 2.4 + 1e-9)).toBe(true);
    const pb = b.filter((x) => x.sorte === 'petitBois');
    expect(pb.every((x) => Math.abs(Math.min(x.x1 - x.x0, x.y1 - x.y0) - PETITS_BOIS_LUS_M.fins) < 1e-9)).toBe(true);
  });

  it('une grille par vantail : trois vantaux de 2 x 2 font un meneau de moins que de vantaux et deux petits bois par vantail', () => {
    expect(compte({ vantaux: 3, grille: { colonnes: 2, rangees: 2 } })).toEqual({ meneau: 2, traverse: 0, petitBois: 6 });
    // Les petits bois epais sont plus larges.
    const b = barresDesCarreaux(baie, { source: 'doigt', vantaux: 1, grille: { colonnes: 2, rangees: 1 }, petitsBois: 'epais' });
    expect(b).toHaveLength(1);
    expect(b[0]!.x1 - b[0]!.x0).toBeCloseTo(PETITS_BOIS_LUS_M.epais);
  });

  it('ne dessine que ce qui est dit : un verre d un seul tenant, des petits bois « aucun », une imposte trop basse', () => {
    expect(barresDesCarreaux(baie, { source: 'ia', vantaux: 1, grille: { colonnes: 1, rangees: 1 } })).toEqual([]);
    expect(barresDesCarreaux(baie, { source: 'ia', vitrage: 'clair' })).toEqual([]);
    // Sans petits bois, seuls les meneaux et la traverse de l'imposte.
    expect(compte({ vantaux: 2, grille: { colonnes: 3, rangees: 2 }, petitsBois: 'aucun', imposte: { hauteurM: 0.3, grille: { colonnes: 4, rangees: 1 } } })).toEqual({ meneau: 1, traverse: 1, petitBois: 0 });
    // Une imposte de 5 cm, ou qui mange la baie, ne se lirait pas : la grille couvre alors toute la hauteur.
    expect(compte({ grille: { colonnes: 1, rangees: 2 }, imposte: { hauteurM: 0.05 } })).toEqual({ meneau: 0, traverse: 0, petitBois: 1 });
    expect(compte({ grille: { colonnes: 1, rangees: 2 }, imposte: { hauteurM: 1.35 } })).toEqual({ meneau: 0, traverse: 0, petitBois: 1 });
    // Une baie vide ne porte rien.
    expect(barresDesCarreaux({ ...baie, l: 0 }, { source: 'ia', vantaux: 2 })).toEqual([]);
  });
});

describe('vitreLue', () => {
  it('garde la vitre d avant quand le vitrage est clair ou absent, la change sinon', () => {
    const clair = { color: 0x33414d, roughness: 0.15, metalness: 0.3 };
    expect(vitreLue(undefined, clair)).toBe(clair);
    expect(vitreLue('clair', clair)).toBe(clair);
    expect(vitreLue('depoli', clair).roughness).toBeGreaterThan(clair.roughness);
    expect(vitreLue('teinte', clair).color).not.toBe(clair.color);
  });
});
