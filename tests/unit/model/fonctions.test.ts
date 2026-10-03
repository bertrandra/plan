import { describe, it, expect } from 'vitest';
import { aParticularite, estTerrain, fonctionAdmise } from '../../../src/model/fonctions.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le profil de chaque fonction (model/fonctions.ts) : les formes ou elle a un sens, et les sections
// qu'elle ajoute a l'inspecteur. Une seule table, lue par l'inspecteur et le releve de facade.

const objet = (fonction: string, type: ObjetPlan['type']) => ({ key: 'o', fonction, type }) as unknown as ObjetPlan;

describe('profils de fonction', () => {
  it('reserve chaque fonction a la forme que le moteur exige', () => {
    for (const f of ['terrasse', 'batiment', 'annexe', 'terrain']) {
      expect(fonctionAdmise(f, 'polygon')).toBe(true);
      expect(fonctionAdmise(f, 'path')).toBe(false);
      expect(fonctionAdmise(f, 'circle')).toBe(false);
    }
    expect(fonctionAdmise('parasol', 'circle')).toBe(true);
    expect(fonctionAdmise('parasol', 'polygon')).toBe(false);
    // Sans exigence : toutes les formes, y compris pour une fonction inconnue d'un ancien fichier.
    for (const f of ['arbre', 'massif', 'chemin', 'autre', 'inconnue']) {
      for (const t of ['polygon', 'path', 'circle'] as const) expect(fonctionAdmise(f, t)).toBe(true);
    }
  });

  it('ne donne une section propre que sur une forme admise', () => {
    expect(aParticularite(objet('terrasse', 'polygon'), 'construction')).toBe(true);
    expect(aParticularite(objet('terrasse', 'path'), 'construction')).toBe(false);
    expect(aParticularite(objet('batiment', 'polygon'), 'releve')).toBe(true);
    expect(aParticularite(objet('annexe', 'circle'), 'releve')).toBe(false);
    expect(aParticularite(objet('parasol', 'circle'), 'parasol')).toBe(true);
    expect(aParticularite(objet('parasol', 'polygon'), 'parasol')).toBe(false);
    expect(aParticularite(objet('camera', 'path'), 'pointDeVue')).toBe(true);
    expect(aParticularite(objet('arbre', 'circle'), 'arbre')).toBe(true);
    expect(aParticularite(objet('massif', 'polygon'), 'arbre')).toBe(false);
  });

  it('reconnait un terrain a sa cle ou a sa fonction', () => {
    expect(estTerrain({ key: 'parcelle', type: 'polygon' } as unknown as ObjetPlan)).toBe(true);
    expect(estTerrain(objet('terrain', 'polygon'))).toBe(true);
    expect(estTerrain(objet('massif', 'polygon'))).toBe(false);
  });
});
