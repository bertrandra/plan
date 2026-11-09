import { describe, it, expect } from 'vitest';
import { redessinApresRestauration, type SceneOuverte } from '../../../src/app/vue3dRestauree.js';
import type { ObjetChange } from '../../../src/core/historique.js';

// Ce que la Vue 3D ouverte refait apres un Ctrl+Z du projet (signale le 9 novembre 2026 : la donnee revenait, la scene restait).

const R = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
const maison = (x = 0, extra: Record<string, unknown> = {}) => ({ key: 'maison', type: 'polygon', fonction: 'batiment', pts: R.map((p) => ({ x: p.x + x, y: p.y })), ...extra });
const arbre = (r = 2) => ({ key: 'arbre1', type: 'circle', fonction: 'arbre', center: { x: 20, y: 20 }, r });
const scene = (s: Partial<SceneOuverte> = {}): SceneOuverte => ({ terrasseDeLaScene: 't1', terrasseCourante: 't1', tousLesObjets: true, isolement: null, pelouse: 'parcelle', ...s });
const ch = (cle: string, avant: unknown, apres: unknown): ObjetChange => ({ cle, avant, apres });

describe('la Vue 3D apres une restauration du projet', () => {
  it('ne refait rien quand aucun objet n a change (une cote seule)', () => {
    expect(redessinApresRestauration([], scene())).toEqual({ faire: 'rien' });
  });

  it('repose le seul batiment dont le toit a change (la validation du Mode Toit defaite), sans la pelouse', () => {
    const r = redessinApresRestauration([ch('maison', maison(0, { batiment: { corpsToit: [{}] } }), maison(0, { batiment: {} }))], scene());
    expect(r).toEqual({ faire: 'remplacer', cles: ['maison'] });
  });

  it('repose la pelouse avec un batiment deplace, ajoute ou retire', () => {
    expect(redessinApresRestauration([ch('maison', maison(4), maison(0))], scene())).toEqual({ faire: 'remplacer', cles: ['maison', 'parcelle'] });
    expect(redessinApresRestauration([ch('maison', null, maison())], scene())).toEqual({ faire: 'remplacer', cles: ['maison', 'parcelle'] });
    expect(redessinApresRestauration([ch('maison', maison(), null)], scene())).toEqual({ faire: 'remplacer', cles: ['maison', 'parcelle'] });
    // Sans parcelle du projet, pas de pelouse a reposer.
    expect(redessinApresRestauration([ch('maison', maison(4), maison(0))], scene({ pelouse: null }))).toEqual({ faire: 'remplacer', cles: ['maison'] });
  });

  it('repose un arbre seul : il ne perce pas la pelouse', () => {
    expect(redessinApresRestauration([ch('arbre1', arbre(2), arbre(3))], scene())).toEqual({ faire: 'remplacer', cles: ['arbre1'] });
  });

  it('rebatit quand ce qui a change se lit ailleurs que dans la pose de l objet', () => {
    const terrasse = (x: number) => ({ key: 't1', type: 'polygon', fonction: 'terrasse', pts: R.map((p) => ({ x: p.x + x, y: p.y })) });
    const parcelle = (x: number) => ({ key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: R.map((p) => ({ x: p.x + x, y: p.y })) });
    const piscine = { key: 'p1', type: 'polygon', fonction: 'piscine', pts: R };
    expect(redessinApresRestauration([ch('t1', terrasse(1), terrasse(0))], scene())).toEqual({ faire: 'rebatir' });
    expect(redessinApresRestauration([ch('parcelle', parcelle(1), parcelle(0))], scene())).toEqual({ faire: 'rebatir' });
    expect(redessinApresRestauration([ch('p1', null, piscine)], scene())).toEqual({ faire: 'rebatir' });
    // Un batiment qui devient autre chose (une fonction changee) : ce qu'il est apres compte aussi.
    expect(redessinApresRestauration([ch('maison', maison(), { ...maison(), fonction: 'terrasse' })], scene())).toEqual({ faire: 'rebatir' });
  });

  it('rebatit une scene cadree sur un objet isole, ou sur une autre terrasse que celle d aujourd hui', () => {
    expect(redessinApresRestauration([ch('maison', maison(4), maison(0))], scene({ isolement: 't1' }))).toEqual({ faire: 'rebatir' });
    expect(redessinApresRestauration([ch('maison', maison(4), maison(0))], scene({ terrasseCourante: null }))).toEqual({ faire: 'rebatir' });
    expect(redessinApresRestauration([ch('maison', maison(4), maison(0))], scene({ terrasseDeLaScene: null, terrasseCourante: null }))).toEqual({ faire: 'remplacer', cles: ['maison', 'parcelle'] });
  });

  it('sans « Tous les objets », la scene ne montre que la terrasse : un batiment n y est pas, une piscine si', () => {
    expect(redessinApresRestauration([ch('maison', maison(4), maison(0))], scene({ tousLesObjets: false }))).toEqual({ faire: 'rien' });
    expect(redessinApresRestauration([ch('p1', null, { key: 'p1', type: 'polygon', fonction: 'piscine', pts: R })], scene({ tousLesObjets: false }))).toEqual({ faire: 'rebatir' });
  });
});
