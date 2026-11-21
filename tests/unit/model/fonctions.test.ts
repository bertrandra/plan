import { describe, it, expect } from 'vitest';
import { aParticularite, estAjouteParLeProjet, estTerrain, estTerrasse, estVueUtilisable, fonctionAdmise, parcelleDuProjet, terrasseOuPremiere } from '../../../src/model/fonctions.js';
import { synchroniserContexteTerrasse } from '../../../src/core/contexteTerrasse.js';
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

  it('ne fait pas d un cercle marque terrasse la terrasse courante : son calcul echouerait', () => {
    const rond = { ...objet('terrasse', 'circle'), key: 'rond' };
    const vraie = { ...objet('terrasse', 'polygon'), key: 'vraie' };
    expect(estTerrasse(rond)).toBe(false);
    expect(terrasseOuPremiere([rond, vraie], 'rond')?.key).toBe('vraie');
    const etat = { objects: [rond, vraie], selectedKey: 'rond', terrasseSelectedKey: null };
    synchroniserContexteTerrasse(etat);
    expect(etat.terrasseSelectedKey).toBe('vraie');
  });

  it('ne liste comme point de vue que deux points', () => {
    expect(estVueUtilisable(objet('camera', 'path'))).toBe(true);
    expect(estVueUtilisable(objet('camera', 'circle'))).toBe(false);
  });

  it('prend la parcelle du projet avant une voisine, meme rangee apres', () => {
    const voisine = { ...objet('terrain', 'polygon'), key: 'v1' };
    const parcelle = { ...objet('terrain', 'polygon'), key: 'parcelle' };
    expect(parcelleDuProjet([voisine, parcelle])?.key).toBe('parcelle');
    expect(parcelleDuProjet([voisine])?.key).toBe('v1');
  });
});

describe('ce que le projet ajoute au jardin (photomontage)', () => {
  const o = (fonction: string, plus: Record<string, unknown> = {}) => ({ key: 'o', fonction, type: 'polygon', ...plus }) as unknown as ObjetPlan;

  it('retient les ouvrages du projet : terrasse, pergola, carport, piscine, parasol, dalle, chemin, mobilier', () => {
    for (const f of ['terrasse', 'pergola', 'carport', 'piscine', 'dalle', 'chemin', 'mobilier', 'massif', 'equipement', 'autre']) expect(estAjouteParLeProjet(o(f)), f).toBe(true);
    expect(estAjouteParLeProjet(o('parasol', { type: 'circle' }))).toBe(true);
  });

  it('ecarte ce que la photo montre deja : terrain, batiments, arbres, points de vue, limites', () => {
    for (const f of ['terrain', 'batiment', 'annexe', 'arbre', 'camera', 'limite']) expect(estAjouteParLeProjet(o(f)), f).toBe(false);
    expect(estAjouteParLeProjet({ ...o('terrain'), key: 'parcelle' } as ObjetPlan)).toBe(false);
  });

  it('ecarte un ouvrage existant, un objet de l IGN et tout ce qui est chez un voisin', () => {
    expect(estAjouteParLeProjet(o('terrasse', { existant: true }))).toBe(false);
    expect(estAjouteParLeProjet(o('piscine', { voisinage: true }))).toBe(false);
    expect(estAjouteParLeProjet(o('dalle', { bdtopo: { surParcellePrincipale: true } }))).toBe(false);
    expect(estAjouteParLeProjet(o('chemin', { cadastre: { idu: 'x' } }))).toBe(false);
  });
});
