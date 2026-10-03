import { describe, it, expect } from 'vitest';
import { sectionsObjet } from '../../../src/ui/champs/objet.js';
import { champsVisibles, type ChampChoix, type ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les sections que l'inspecteur montre selon la fonction de l'objet (ui/champs/objet.ts), lues
// depuis le profil de la fonction (model/fonctions.ts).

const formes = {
  polygon: () => ({ type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], vertexNames: ['a', 'b', 'c', 'd'], segmentNames: ['1', '2', '3', '4'], frozenVertices: [false, false, false, false] }),
  path: () => ({ type: 'path', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }], vertexNames: ['a', 'b'], segmentNames: ['1'], frozenVertices: [false, false] }),
  circle: () => ({ type: 'circle', center: { x: 1, y: 1 }, r: 1 })
};

function contexte(fonction: string, forme: keyof typeof formes, plus: Partial<ObjetPlan> = {}, autres: ObjetPlan[] = []): ContexteChamps {
  const obj = { key: 'o', name: 'O', fonction, ...formes[forme](), ...plus } as unknown as ObjetPlan;
  const objets = [obj, ...autres];
  const parcelle = objets.find(o => o.key === 'parcelle') || objets.find(o => o.fonction === 'terrain');
  return { etat: { objects: objets, highlight: {} }, obj, objets, parcelle, libelleType: () => forme, elevationOf: () => 1 } as unknown as ContexteChamps;
}
const ids = (c: ContexteChamps) => sectionsObjet(c).filter(s => champsVisibles(s, c).length).map(s => s.id);
const cles = (c: ContexteChamps, id: string) => { const s = sectionsObjet(c).find(x => x.id === id); return s ? champsVisibles(s, c).map(ch => ch.cle) : []; };
const fonctions = (c: ContexteChamps) => (sectionsObjet(c)[0]!.champs.find(ch => ch.cle === 'fonction') as ChampChoix).options(c).map(o => o.valeur);

describe('sections de l inspecteur par fonction', () => {
  it('ne propose dans le menu Fonction que les fonctions admises par la forme', () => {
    expect(fonctions(contexte('autre', 'circle'))).toContain('parasol');
    expect(fonctions(contexte('autre', 'circle'))).not.toContain('terrasse');
    expect(fonctions(contexte('autre', 'polygon'))).toEqual(expect.arrayContaining(['terrasse', 'batiment', 'annexe', 'terrain']));
    expect(fonctions(contexte('autre', 'polygon'))).not.toContain('parasol');
    expect(fonctions(contexte('autre', 'path'))).not.toContain('terrasse');
  });

  it('garde la fonction en place, meme inadmise, pour un ancien fichier', () => {
    expect(fonctions(contexte('parasol', 'polygon'))).toContain('parasol');
  });

  it('range les reglages du feuillage dans une section Arbre', () => {
    const c = contexte('arbre', 'circle');
    expect(ids(c)).toContain('arbre');
    expect(cles(c, 'arbre')).toEqual(['diametreArbre', 'couleurArbre', 'textureArbre']);
    expect(cles(c, 'apparence')).not.toContain('diametreArbre');
    expect(ids(contexte('massif', 'circle'))).not.toContain('arbre');
  });

  it('ne montre ni matiere ni priorite sur un point de vue', () => {
    const c = contexte('camera', 'path');
    expect(cles(c, 'objet')).not.toContain('matiere');
    expect(cles(c, 'objet')).not.toContain('priority');
    expect(ids(c)).toContain('pointDeVue');
  });

  it('montre la cloture et le lieu sur la parcelle du projet seulement', () => {
    const parcelle = contexte('terrain', 'polygon', { key: 'parcelle' });
    expect(cles(parcelle, 'parcelle')).toEqual(['lieu', 'clotureActive', 'clotureHauteur', 'clotureCouleur', 'clotureTexture']);
    const principale = { key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [] } as unknown as ObjetPlan;
    const voisine = contexte('terrain', 'polygon', { key: 'v1', voisinage: true, cadastre: { commune: 'Chatou', section: 'AB', numero: '12' } } as Partial<ObjetPlan>, [principale]);
    expect(cles(voisine, 'parcelle')).toEqual(['cadastre']);
    // Une voisine sans reference cadastrale n'a plus rien a montrer : la section disparait.
    const anonyme = contexte('terrain', 'polygon', { key: 'v2' }, [principale]);
    expect(ids(anonyme)).not.toContain('parcelle');
  });

  it('ne donne la section Parasol qu a un parasol rond', () => {
    expect(ids(contexte('parasol', 'circle'))).toContain('parasol');
    expect(ids(contexte('parasol', 'polygon'))).not.toContain('parasol');
  });
});
