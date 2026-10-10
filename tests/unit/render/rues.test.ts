// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { dessinerNomsDesRues, tailleNomRue, TAILLE_NOM_RUE_MIN_PX, TAILLE_NOM_RUE_MAX_PX } from '../../../src/render/rues.js';
import { creerScene, versEcran } from '../../../src/geometry/vue.js';
import type { ObjetPlan } from '../../../src/model/types.js';

const scene = () => ({ ...creerScene(), W: 800, H: 600 });
const parcelle = (afficher: boolean, avecRues = true) => ({
  key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
  voisinage3d: { rues: { afficher } },
  ...(avecRues ? { ruesVoisinage: { recupereLe: '', rayonM: 250, rues: [{ nom: 'Allée des Limites', troncons: [[{ x: -20, y: -5 }, { x: 30, y: -5 }]] }, { nom: 'Avenue', troncons: [[{ x: -5, y: -20 }, { x: -5, y: 30 }]] }] } } : {}),
}) as unknown as ObjetPlan;
const groupe = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');

describe('dessinerNomsDesRues', () => {
  it('pose chaque nom a son point, tourne dans le sens de la voie, en italique sous un halo', () => {
    const g = groupe();
    const s = scene();
    dessinerNomsDesRues(g, [parcelle(true)], s);
    const textes = [...g.querySelectorAll('text')];
    expect(textes.map((t) => t.textContent)).toEqual(['Allée des Limites', 'Avenue']);
    // Le nom se pose sur la voie, au milieu de ce qu'on en voit : dans l'ecran, a la hauteur de la rue.
    const m = /translate\(([-\d.]+),([-\d.]+)\) rotate\(([-\d.]+)\)/.exec(textes[0]!.getAttribute('transform')!)!;
    expect(Number(m[2])).toBeCloseTo(versEcran(s, { x: 0, y: -5 }).y, 1);
    expect(Number(m[1])).toBeGreaterThan(0);
    expect(Number(m[1])).toBeLessThan(s.W);
    expect(Number(m[3])).toBe(0);
    expect(textes[1]!.getAttribute('transform')).toContain('rotate(-90.0)');
    expect(textes[0]!.getAttribute('font-style')).toBe('italic');
    expect(textes[0]!.getAttribute('paint-order')).toBe('stroke');
  });
  it('rien sans la case, sans rues lues, ou la parcelle masquee ; le calque est vide a chaque fois', () => {
    const g = groupe();
    dessinerNomsDesRues(g, [parcelle(true)], scene());
    dessinerNomsDesRues(g, [parcelle(false)], scene());
    expect(g.childNodes).toHaveLength(0);
    dessinerNomsDesRues(g, [parcelle(true, false)], scene());
    expect(g.childNodes).toHaveLength(0);
    dessinerNomsDesRues(g, [parcelle(true)], scene(), () => true);
    expect(g.childNodes).toHaveLength(0);
  });
  it('la taille suit le zoom, bornee', () => {
    expect(tailleNomRue(1)).toBe(TAILLE_NOM_RUE_MIN_PX);
    expect(tailleNomRue(5)).toBeCloseTo(12, 9);
    expect(tailleNomRue(100)).toBe(TAILLE_NOM_RUE_MAX_PX);
  });
});
