import { describe, it, expect } from 'vitest';
import { synchroniserContexteTerrasse, terrasseCourante, terrasseSelectionnee, type EtatContexteTerrasse } from '../../../src/core/contexteTerrasse.js';
import type { ObjetPlan } from '../../../src/model/types.js';

const objets = (): ObjetPlan[] => [
  { key: 'parcelle', name: 'Parcelle', fonction: 'terrain', type: 'polygon', pts: [] },
  { key: 't1', name: 'Terrasse 1', fonction: 'terrasse', type: 'polygon', pts: [] },
  { key: 't2', name: 'Terrasse 2', fonction: 'terrasse', type: 'polygon', pts: [] },
  { key: 'parasol', name: 'Parasol', fonction: 'parasol', type: 'circle', center: { x: 0, y: 0 }, r: 1 }
];

describe('synchroniserContexteTerrasse', () => {
  it('prend la premiere terrasse quand aucune n est courante', () => {
    const etat = { objects: objets(), selectedKey: 'parcelle', terrasseSelectedKey: null };
    expect(synchroniserContexteTerrasse(etat)).toBe(true);
    expect(etat.terrasseSelectedKey).toBe('t1');
  });

  it('suit la selection quand c est une terrasse', () => {
    const etat = { objects: objets(), selectedKey: 't2', terrasseSelectedKey: 't1' };
    expect(synchroniserContexteTerrasse(etat)).toBe(true);
    expect(etat.terrasseSelectedKey).toBe('t2');
  });

  it('garde le contexte quand on selectionne autre chose', () => {
    const etat = { objects: objets(), selectedKey: 'parasol', terrasseSelectedKey: 't2' };
    expect(synchroniserContexteTerrasse(etat)).toBe(false);
    expect(etat.terrasseSelectedKey).toBe('t2');
  });

  it('repare une terrasse courante disparue', () => {
    const etat = { objects: objets().filter(o => o.key !== 't2'), selectedKey: null, terrasseSelectedKey: 't2' };
    expect(synchroniserContexteTerrasse(etat)).toBe(true);
    expect(etat.terrasseSelectedKey).toBe('t1');
  });

  it('n a pas de contexte sans terrasse', () => {
    const etat = { objects: objets().filter(o => o.fonction !== 'terrasse'), selectedKey: 'parcelle', terrasseSelectedKey: 't1' };
    expect(synchroniserContexteTerrasse(etat)).toBe(true);
    expect(etat.terrasseSelectedKey).toBeNull();
    expect(terrasseCourante(etat)).toBeUndefined();
  });

  it('distingue la terrasse selectionnee de la terrasse courante', () => {
    // Un parasol selectionne : la terrasse courante reste t2, mais rien n'est selectionne qui soit
    // une terrasse — ce que les resultats lisent, pour n'apparaitre que pour une terrasse.
    const etat: EtatContexteTerrasse = { objects: objets(), selectedKey: 'parasol', terrasseSelectedKey: 't2' };
    synchroniserContexteTerrasse(etat);
    expect(terrasseCourante(etat)?.key).toBe('t2');
    expect(terrasseSelectionnee(etat)).toBeUndefined();

    etat.selectedKey = 't1';
    synchroniserContexteTerrasse(etat);
    expect(terrasseSelectionnee(etat)?.key).toBe('t1');

    etat.selectedKey = null;
    expect(terrasseSelectionnee(etat)).toBeUndefined();
  });

  it('ignore une cle courante qui n est plus une terrasse', () => {
    const objs = objets();
    objs[1]!.fonction = 'batiment';
    const etat = { objects: objs, selectedKey: null, terrasseSelectedKey: 't1' };
    synchroniserContexteTerrasse(etat);
    expect(etat.terrasseSelectedKey).toBe('t2');
    expect(terrasseCourante(etat)?.key).toBe('t2');
  });
});
