// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { dessinerFlecheNord, dessinerEchelle } from '../../../src/render/decor.js';
import { dessinerGrille } from '../../../src/render/grille.js';
import { creerScene } from '../../../src/geometry/vue.js';
import { creerSvg } from '../../../src/render/svg.js';

const scene = () => ({ ...creerScene(), W: 800, H: 600 });
const groupe = () => creerSvg('g');

describe('flèche du Nord', () => {
  it('se dessine en haut a droite, avec la lettre N', () => {
    const g = groupe();
    dessinerFlecheNord(g, { scene: scene(), showNorth: true });
    expect(g.textContent).toBe('N');
    expect(g.querySelector('g')?.getAttribute('transform')).toBe('translate(770,34)');
  });

  it('ne dessine rien quand la bascule est fermee', () => {
    const g = groupe();
    dessinerFlecheNord(g, { scene: scene(), showNorth: false });
    expect(g.children).toHaveLength(0);
  });

  it('efface le dessin precedent au lieu de l empiler', () => {
    const g = groupe();
    const etat = { scene: scene(), showNorth: true };
    dessinerFlecheNord(g, etat);
    dessinerFlecheNord(g, etat);
    expect(g.children).toHaveLength(1);
  });
});

describe('echelle graphique', () => {
  it('choisit un pas rond, jamais une valeur batarde', () => {
    // A 16,5 px/m, 110 px valent 6,67 m : la barre annonce 5 m.
    const g = groupe();
    dessinerEchelle(g, { scene: scene(), showNorth: true });
    expect([...g.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['0', '5 m']);
  });

  it('passe aux centimetres quand on zoome fort', () => {
    const g = groupe();
    dessinerEchelle(g, { scene: { ...scene(), scale: 600 }, showNorth: true });
    expect([...g.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['0', '20 cm']);
  });

  it('se cale en bas a droite de la scene', () => {
    const g = groupe();
    const s = scene();
    dessinerEchelle(g, { scene: s, showNorth: true });
    const barre = g.querySelector('line')!;
    expect(Number(barre.getAttribute('y1'))).toBe(s.H - 22);
    expect(Number(barre.getAttribute('x2'))).toBe(s.W - 24);
  });
});

describe('grille', () => {
  it('ne dessine rien quand elle est masquee', () => {
    const g = groupe();
    dessinerGrille(g, { scene: scene(), grilleVisible: false });
    expect(g.children).toHaveLength(0);
  });

  it('couvre toute la vue, verticales et horizontales', () => {
    const g = groupe();
    dessinerGrille(g, { scene: scene(), grilleVisible: true });
    expect(g.children.length).toBeGreaterThan(10);
  });

  it('marque les axes de l origine plus fort que le reste', () => {
    // Les deux traits epais reperent le sommet nord de la parcelle, origine du plan.
    const g = groupe();
    dessinerGrille(g, { scene: scene(), grilleVisible: true });
    const epais = [...g.querySelectorAll('line')].filter((l) => l.getAttribute('stroke-width') === '1.3');
    expect(epais).toHaveLength(2);
  });

  it('garde un pas lisible a l ecran, quel que soit le zoom', () => {
    // C'est la raison d'etre du pas rond vise a 60 px : ni un quadrillage illisible, ni deux
    // traits perdus dans la fenetre. Le pas en metres change, l'espacement en pixels non.
    for (const scale of [4, 16.5, 60, 220]) {
      const g = groupe();
      dessinerGrille(g, { scene: { ...scene(), scale }, grilleVisible: true });
      const verticales = [...g.querySelectorAll('line')].filter((l) => l.getAttribute('x1') === l.getAttribute('x2'));
      const ecart = Math.abs(Number(verticales[1]!.getAttribute('x1')) - Number(verticales[0]!.getAttribute('x1')));
      expect(ecart).toBeGreaterThan(30);
      expect(ecart).toBeLessThan(130);
    }
  });
});
