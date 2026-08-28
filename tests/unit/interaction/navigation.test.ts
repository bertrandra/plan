import { describe, it, expect } from 'vitest';
import {
  zoomerAutourDe, zoomMolette, debutPincement, pincer, deplacer, milieuDe, cadrerSur, empriseDe,
  ZOOM_MIN, ZOOM_MAX, FACTEUR_MOLETTE
} from '../../../src/interaction/navigation.js';
import { creerScene, versEcran, versMonde } from '../../../src/render/scene.js';

// La transformation de vue est le seul etat que les golden files ne surveillent pas : un export
// est recalcule dans son propre repere. C'est exactement la qu'une regression est passee (deux
// scenes en parallele, zoom inerte). D'ou ces tests.

const scene = () => ({ ...creerScene(), W: 800, H: 600 });

describe('zoom', () => {
  it('garde le point vise exactement sous le curseur', () => {
    // C'est ce qui donne l'impression de tirer le plan vers soi plutot que de le voir glisser.
    const s0 = scene();
    const curseur = { x: 250, y: 180 };
    const avant = versMonde(s0, curseur);
    const s1 = zoomerAutourDe(s0, curseur, 1.7);
    const apres = versMonde(s1, curseur);
    expect(apres.x).toBeCloseTo(avant.x, 9);
    expect(apres.y).toBeCloseTo(avant.y, 9);
  });

  it('multiplie l echelle par le facteur demande', () => {
    const s = zoomerAutourDe(scene(), { x: 400, y: 300 }, 2);
    expect(s.scale).toBeCloseTo(scene().scale * 2, 9);
  });

  it('se rapproche vers le haut, s eloigne vers le bas', () => {
    const s0 = scene();
    expect(zoomMolette(s0, { x: 400, y: 300 }, -100).scale).toBeCloseTo(s0.scale * FACTEUR_MOLETTE, 9);
    expect(zoomMolette(s0, { x: 400, y: 300 }, 100).scale).toBeCloseTo(s0.scale / FACTEUR_MOLETTE, 9);
  });

  it('revient exactement a l echelle de depart apres un aller-retour', () => {
    const s0 = scene();
    const s2 = zoomMolette(zoomMolette(s0, { x: 400, y: 300 }, -100), { x: 400, y: 300 }, 100);
    expect(s2.scale).toBeCloseTo(s0.scale, 9);
  });

  it('reste dans les bornes lisibles, quel que soit l acharnement', () => {
    let s = scene();
    for (let i = 0; i < 200; i++) s = zoomMolette(s, { x: 400, y: 300 }, -100);
    expect(s.scale).toBe(ZOOM_MAX);
    for (let i = 0; i < 400; i++) s = zoomMolette(s, { x: 400, y: 300 }, 100);
    expect(s.scale).toBe(ZOOM_MIN);
  });

  it('ne modifie pas la scene recue', () => {
    // Les fonctions rendent une nouvelle scene : c'est ce qui permet de les tester, et ce qui
    // evite qu'un appelant modifie l'etat sans le dire.
    const s0 = scene();
    zoomerAutourDe(s0, { x: 100, y: 100 }, 3);
    expect(s0.scale).toBe(creerScene().scale);
  });
});

describe('pincement', () => {
  it('suit le rapport des ecartements', () => {
    const s0 = scene();
    const debut = debutPincement(s0, { x: 300, y: 300 }, { x: 400, y: 300 });
    const s1 = pincer(s0, debut, { x: 250, y: 300 }, { x: 450, y: 300 });
    expect(s1.scale).toBeCloseTo(s0.scale * 2, 9);
  });

  it('garde sous les doigts le point du plan saisi au depart', () => {
    const s0 = scene();
    const a0 = { x: 300, y: 260 }, b0 = { x: 420, y: 340 };
    const debut = debutPincement(s0, a0, b0);
    // Les doigts s'ecartent ET la main se deplace.
    const a1 = { x: 200, y: 200 }, b1 = { x: 500, y: 400 };
    const s1 = pincer(s0, debut, a1, b1);
    const milieu = milieuDe([a1, b1]);
    const sousLesDoigts = versMonde(s1, milieu);
    expect(sousLesDoigts.x).toBeCloseTo(debut.milieuMonde.x, 9);
    expect(sousLesDoigts.y).toBeCloseTo(debut.milieuMonde.y, 9);
  });

  it('revient a l echelle initiale si les doigts reprennent leur ecart', () => {
    const s0 = scene();
    const a = { x: 300, y: 300 }, b = { x: 400, y: 300 };
    const debut = debutPincement(s0, a, b);
    expect(pincer(s0, debut, a, b).scale).toBeCloseTo(s0.scale, 9);
  });

  it('reste borne, meme sur un ecartement absurde', () => {
    const s0 = scene();
    const debut = debutPincement(s0, { x: 399, y: 300 }, { x: 401, y: 300 });
    expect(pincer(s0, debut, { x: 0, y: 300 }, { x: 800, y: 300 }).scale).toBe(ZOOM_MAX);
  });
});

describe('deplacement', () => {
  it('suit le doigt, au pixel', () => {
    const s0 = scene();
    const s1 = deplacer(s0, s0.origine, { x: 300, y: 300 }, { x: 350, y: 280 });
    expect(s1.origine.x).toBe(s0.origine.x + 50);
    expect(s1.origine.y).toBe(s0.origine.y - 20);
  });

  it('ne touche pas a l echelle', () => {
    const s0 = scene();
    expect(deplacer(s0, s0.origine, { x: 0, y: 0 }, { x: 500, y: 500 }).scale).toBe(s0.scale);
  });

  it('deplace le dessin d autant que le doigt', () => {
    const s0 = scene();
    const p = { x: 12, y: -7 };
    const avant = versEcran(s0, p);
    const s1 = deplacer(s0, s0.origine, { x: 0, y: 0 }, { x: 40, y: 25 });
    const apres = versEcran(s1, p);
    expect(apres.x - avant.x).toBeCloseTo(40, 9);
    expect(apres.y - avant.y).toBeCloseTo(25, 9);
  });
});

describe('milieuDe', () => {
  it('moyenne deux points', () => {
    expect(milieuDe([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
  });
  it('moyenne trois doigts', () => {
    expect(milieuDe([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 30 }])).toEqual({ x: 10, y: 10 });
  });
});

describe('cadrage', () => {
  const carre = { type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };

  it('mesure l emprise d un polygone', () => {
    expect(empriseDe([carre])).toEqual({ minX: 0, maxX: 10, minY: 0, maxY: 10 });
  });

  it('mesure un cercle par son rayon, pas par son centre', () => {
    expect(empriseDe([{ type: 'circle', center: { x: 5, y: 5 }, r: 2 }])).toEqual({ minX: 3, maxX: 7, minY: 3, maxY: 7 });
  });

  it('englobe plusieurs formes', () => {
    const e = empriseDe([carre, { type: 'circle', center: { x: 20, y: -5 }, r: 1 }])!;
    expect(e).toEqual({ minX: 0, maxX: 21, minY: -6, maxY: 10 });
  });

  it('rend null quand il n y a rien a cadrer', () => {
    expect(empriseDe([])).toBeNull();
  });

  it('centre l emprise dans la scene', () => {
    const s = cadrerSur(scene(), { minX: 0, maxX: 10, minY: 0, maxY: 10 });
    const centre = versEcran(s, { x: 5, y: 5 });
    expect(centre.x).toBeCloseTo(400, 6);
    expect(centre.y).toBeCloseTo(300, 6);
  });

  it('laisse la marge de respiration demandee', () => {
    // 10 m dans 800 px de large avec 80 px de marge : 72 px par metre.
    const s = cadrerSur(scene(), { minX: 0, maxX: 10, minY: 0, maxY: 10 }, 80);
    expect(s.scale).toBeCloseTo(Math.min((800 - 80) / 10, (600 - 80) / 10), 9);
  });

  it('ne divise pas par zero sur une forme degeneree', () => {
    const s = cadrerSur(scene(), { minX: 3, maxX: 3, minY: 3, maxY: 3 });
    expect(Number.isFinite(s.scale)).toBe(true);
  });

  it('plafonne a 400 px/m - au-dela de la molette, ecart repris du fichier d origine', () => {
    const s = cadrerSur(scene(), { minX: 0, maxX: 0.001, minY: 0, maxY: 0.001 });
    expect(s.scale).toBe(400);
    expect(s.scale).toBeGreaterThan(ZOOM_MAX);
  });
});
