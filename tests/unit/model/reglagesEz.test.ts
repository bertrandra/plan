import { describe, it, expect } from 'vitest';
import { ecrireChemin, lireChemin, GROUPES_EZ, hexEnTeinte, teinteEnHex, niveauActif } from '../../../src/model/reglagesEz.js';

const reglages = { seed: 3, bark: { tint: 0xffffff, type: 'oak' }, branch: { levels: 2, length: { 0: 20, 1: 10 } } };

describe('les reglages d\'EZ-tree', () => {
  it('se lisent par chemin, `undefined` hors de l\'arbre', () => {
    expect(lireChemin(reglages, 'branch.length.0')).toBe(20);
    expect(lireChemin(reglages, 'bark.type')).toBe('oak');
    expect(lireChemin(reglages, 'leaves.size')).toBeUndefined();
    expect(lireChemin(reglages, 'seed.x')).toBeUndefined();
  });

  it('s\'ecrivent dans une copie, en creant les niveaux manquants', () => {
    const neuf = ecrireChemin(reglages, 'leaves.size', 4);
    expect(neuf).toMatchObject({ leaves: { size: 4 }, seed: 3 });
    expect(reglages).not.toHaveProperty('leaves');
    expect(lireChemin(ecrireChemin(reglages, 'branch.length.1', 7), 'branch.length.1')).toBe(7);
  });

  it('passent une teinte entiere en #rrggbb et inversement, blanc quand c\'est illisible', () => {
    expect(teinteEnHex(0x4a7c3a)).toBe('#4a7c3a');
    expect(hexEnTeinte('#4a7c3a')).toBe(0x4a7c3a);
    expect(teinteEnHex(undefined)).toBe('#ffffff');
    expect(hexEnTeinte('rouge')).toBe(0xffffff);
  });

  it('cachent les niveaux de branches au-dela de `levels`', () => {
    expect(niveauActif('branch.length.1', reglages)).toBe(true);
    expect(niveauActif('branch.length.3', reglages)).toBe(false);
    expect(niveauActif('bark.type', reglages)).toBe(true);
  });

  it('ont des chemins uniques et des bornes saines', () => {
    const champs = GROUPES_EZ.flatMap((g) => g.champs);
    expect(new Set(champs.map((c) => c.chemin)).size).toBe(champs.length);
    for (const c of champs) if (c.type === 'nombre') expect(c.min).toBeLessThan(c.max);
  });
});
