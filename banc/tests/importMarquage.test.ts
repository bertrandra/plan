// Le pre-marquage a l'import (banc/src/importMarquage.ts ; demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 3) : quand
// la case peut se cocher, quelles vues recoivent un brouillon, et ce que l'import en dit.
import { describe, expect, it } from 'vitest';
import { modelesActifs, raisonSansMarquage, texteDeLImportFait, vueAMarquer } from '../src/importMarquage.js';
import type { Modele } from '../src/types.js';

const modele = (m: Partial<Modele>): Modele => ({ id: 'm', nom: 'M', format: 'yolov10', classes: ['fenetre'], correspondance: { fenetre: 'fenetre' }, seuil: 0.3, installe: true, ...m });

describe('le pré-marquage à l’import', () => {
  it('les modèles qui proposent : installés et actifs, comme à l’étape 3', () => {
    const l = [modele({ id: 'a' }), modele({ id: 'b', installe: false }), modele({ id: 'c', actif: false }), modele({ id: 'd', actif: true })];
    expect(modelesActifs(l).map((m) => m.id)).toEqual(['a', 'd']);
  });

  it('la case ne se coche qu’avec un modèle actif et des vues rendues face au mur, et dit pourquoi sinon', () => {
    expect(raisonSansMarquage(true, 2)).toBeNull();
    expect(raisonSansMarquage(true, 0)).toContain('étape 3');
    expect(raisonSansMarquage(false, 2)).toContain('Redresser sur le mur');
    // Sans modele, c'est d'abord lui qui manque.
    expect(raisonSansMarquage(false, 0)).toContain('étape 3');
  });

  it('seule une vue rendue face au mur reçoit un brouillon : les autres passeront par le redressement, qui le jetterait', () => {
    const plan = { axe: 90, x0: -1, x1: 1, y0: -0.5, y1: 1 };
    expect(vueAMarquer(true, { champ: 75, tangage: 8, source: 'facade', plan })).toBe(true);
    expect(vueAMarquer(true, { champ: 60, tangage: 12, source: 'facade' })).toBe(false);
    expect(vueAMarquer(true, undefined)).toBe(false);
    expect(vueAMarquer(false, { champ: 75, tangage: 8, source: 'facade', plan })).toBe(false);
  });

  it('l’import dit ce qu’il a fait : sans pré-marquage le message d’avant ; avec, les vues passées au brouillon et celles à redresser', () => {
    expect(texteDeLImportFait(12, 'panoramax-1', null)).toBe('12 vue(s) importée(s), lot panoramax-1.');
    expect(texteDeLImportFait(12, 'panoramax-1', { marquees: 9, objets: 143, echecs: 0 })).toBe('12 vue(s) importée(s), lot panoramax-1 ; 9 passée(s) au brouillon (143 objet(s) proposé(s), à relire à l’étape 4), 3 à redresser.');
    expect(texteDeLImportFait(4, 'panoramax-1', { marquees: 4, objets: 20, echecs: 0 })).toBe('4 vue(s) importée(s), lot panoramax-1 ; 4 passée(s) au brouillon (20 objet(s) proposé(s), à relire à l’étape 4).');
    expect(texteDeLImportFait(4, 'panoramax-1', { marquees: 3, objets: 20, echecs: 1 })).toContain('1 à redresser ; 1 brouillon(s) en échec.');
  });
});
