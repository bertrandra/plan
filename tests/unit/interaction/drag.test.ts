import { describe, it, expect } from 'vitest';
import { appliquerGlisser, sommetTire, cercleTientDansContour, type GlisserEnCours } from '../../../src/interaction/drag.js';

// Le glisser-deposer est, comme le zoom, invisible aux golden files : un export est recalcule dans
// son propre repere et ne voit jamais qu'un sommet a mal suivi la souris. D'ou ces tests.

const carre = (c: number) => [
  { x: 0, y: 0 }, { x: c, y: 0 }, { x: c, y: c }, { x: 0, y: c }
];

const glisser = (p: Partial<GlisserEnCours>): GlisserEnCours =>
  ({ startWorld: { x: 0, y: 0 }, ...p } as GlisserEnCours);

describe('cercleTientDansContour', () => {
  const contour = carre(10);

  it('accepte un cercle entierement dedans', () => {
    expect(cercleTientDansContour({ x: 5, y: 5 }, 2, contour)).toBe(true);
  });

  it('refuse un cercle qui deborde, meme si son centre est dedans', () => {
    // C'est tout l'interet du test par le bord : le centre seul ne dit rien.
    expect(cercleTientDansContour({ x: 1, y: 5 }, 2, contour)).toBe(false);
  });

  it('juge par seize points du bord, pas par une vraie intersection', () => {
    // Consequence assumee de l'echantillonnage : une pointe de contour plus fine que l'ecart
    // entre deux points de mesure passe inapercue. On le documente plutot que de le corriger
    // (§10.3), le fichier d'origine faisait deja ainsi.
    // Une fente verticale etroite, entaillee depuis le haut du carre.
    const fendu = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
      { x: 5.1, y: 10 }, { x: 5.1, y: 5.01 }, { x: 4.9, y: 5.01 }, { x: 4.9, y: 10 },
      { x: 0, y: 10 }
    ];
    // Centre decale a 5,5 : le bord du cercle traverse la fente vers 99,6 degres, entre les
    // rayons echantillonnes a 90 et 112,5. Le cercle deborde reellement, et passe quand meme.
    expect(cercleTientDansContour({ x: 5.5, y: 5 }, 3, fendu)).toBe(true);
  });
});

describe('sommetTire', () => {
  const polygone = (frozen?: boolean[]) => ({
    type: 'polygon',
    pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
    frozenVertices: frozen
  });

  it('suit librement le pointeur quand rien n est gele', () => {
    const p = sommetTire(polygone([false, false, false, false]), 1, { x: 10, y: 0 }, { x: 13, y: 4 });
    expect(p).toEqual({ x: 13, y: 4 });
  });

  it('suit librement le pointeur quand la forme n a pas de sommets geles', () => {
    expect(sommetTire(polygone(), 1, { x: 10, y: 0 }, { x: 13, y: 4 })).toEqual({ x: 13, y: 4 });
  });

  it('refuse de bouger un sommet coince entre deux voisins geles', () => {
    // Aucun deplacement ne conserverait les deux angles : mieux vaut ne rien faire que mentir.
    expect(sommetTire(polygone([true, false, true, false]), 1, { x: 10, y: 0 }, { x: 13, y: 4 })).toBeNull();
  });

  it('fait coulisser le sommet sur la direction figee par le voisin gele', () => {
    // Voisin precedent gele en (0,0), sommet en (10,0) : la direction est +x. Le pointeur part
    // en diagonale, le sommet ne retient que sa projection.
    const p = sommetTire(polygone([true, false, false, false]), 1, { x: 10, y: 0 }, { x: 14, y: 7 })!;
    expect(p.x).toBeCloseTo(14, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('garde une longueur minimale plutot que d absorber le sommet dans son voisin', () => {
    // Le pointeur passe derriere l'ancre : sans plancher, le cote s'annulerait puis se retournerait.
    const p = sommetTire(polygone([true, false, false, false]), 1, { x: 10, y: 0 }, { x: -5, y: 0 })!;
    expect(p).toEqual({ x: 0.05, y: 0 });
  });
});

describe('appliquerGlisser', () => {
  const contour = carre(10);

  describe('deplacement d une forme', () => {
    const forme = () => ({ type: 'polygon', pts: [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }] });

    it('translate tous les sommets du meme vecteur', () => {
      const obj = forme();
      const d = glisser({ type: 'shapeMove', obj, startWorld: { x: 3, y: 3 }, startPts: obj.pts.map((p) => ({ ...p })) });
      appliquerGlisser(d, { x: 4, y: 3.5 }, contour);
      expect(obj.pts).toEqual([{ x: 3, y: 2.5 }, { x: 5, y: 2.5 }, { x: 5, y: 4.5 }, { x: 3, y: 4.5 }]);
    });

    it('refuse en bloc si un seul sommet sortirait du contour', () => {
      // On ne deforme pas et on ne rogne pas : la forme reste ou elle est.
      const obj = forme();
      const avant = obj.pts.map((p) => ({ ...p }));
      const d = glisser({ type: 'shapeMove', obj, startWorld: { x: 3, y: 3 }, startPts: avant.map((p) => ({ ...p })) });
      appliquerGlisser(d, { x: 12, y: 3 }, contour);
      expect(obj.pts).toEqual(avant);
    });

    it('marque le geste comme un vrai deplacement, meme quand il est refuse', () => {
      // `moved` distingue un glisser d'un simple clic : au relachement, un clic sans mouvement
      // deselectionne. Un glisser refuse par le contour n'est pas un clic.
      const obj = forme();
      const d = glisser({ type: 'shapeMove', obj, startWorld: { x: 3, y: 3 }, startPts: obj.pts.map((p) => ({ ...p })), moved: false });
      appliquerGlisser(d, { x: 12, y: 3 }, contour);
      expect(d.moved).toBe(true);
    });

    it('se deplace sans limite quand il n y a pas de contour', () => {
      const obj = forme();
      const d = glisser({ type: 'shapeMove', obj, startWorld: { x: 3, y: 3 }, startPts: obj.pts.map((p) => ({ ...p })) });
      appliquerGlisser(d, { x: 300, y: 300 }, null);
      expect(obj.pts[0]).toEqual({ x: 299, y: 299 });
    });
  });

  describe('deplacement d un cercle', () => {
    it('deplace le centre et laisse le rayon tranquille', () => {
      const obj = { type: 'circle', pts: [] as { x: number; y: number }[], center: { x: 5, y: 5 }, r: 1 };
      const d = glisser({ type: 'circleMove', obj, startWorld: { x: 5, y: 5 }, startCenter: { x: 5, y: 5 } });
      appliquerGlisser(d, { x: 6, y: 7 }, contour);
      expect(obj.center).toEqual({ x: 6, y: 7 });
      expect(obj.r).toBe(1);
    });

    it('refuse quand le bord sortirait, meme si le centre reste dedans', () => {
      const obj = { type: 'circle', pts: [] as { x: number; y: number }[], center: { x: 5, y: 5 }, r: 2 };
      const d = glisser({ type: 'circleMove', obj, startWorld: { x: 5, y: 5 }, startCenter: { x: 5, y: 5 } });
      appliquerGlisser(d, { x: 9.5, y: 5 }, contour);
      expect(obj.center).toEqual({ x: 5, y: 5 });
    });
  });

  describe('rayon', () => {
    it('suit la distance du pointeur au centre', () => {
      const obj = { type: 'circle', pts: [] as { x: number; y: number }[], center: { x: 5, y: 5 }, r: 1 };
      appliquerGlisser(glisser({ type: 'radius', obj, startWorld: { x: 6, y: 5 } }), { x: 8, y: 5 }, contour);
      expect(obj.r).toBe(3);
    });

    it('ne descend pas sous un rayon rattrapable a la souris', () => {
      const obj = { type: 'circle', pts: [] as { x: number; y: number }[], center: { x: 5, y: 5 }, r: 1 };
      appliquerGlisser(glisser({ type: 'radius', obj, startWorld: { x: 6, y: 5 } }), { x: 5, y: 5 }, contour);
      expect(obj.r).toBe(0.15);
    });

    it('refuse de grandir au-dela du contour', () => {
      const obj = { type: 'circle', pts: [] as { x: number; y: number }[], center: { x: 5, y: 5 }, r: 1 };
      appliquerGlisser(glisser({ type: 'radius', obj, startWorld: { x: 6, y: 5 } }), { x: 14, y: 5 }, contour);
      expect(obj.r).toBe(1);
    });
  });

  describe('cote', () => {
    const forme = () => ({ type: 'polygon', pts: [{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 5 }, { x: 2, y: 6 }] });

    it('translate les deux extremites et laisse les autres sommets en place', () => {
      const obj = forme();
      const d = glisser({ type: 'edge', obj, i: 0, j: 1, startWorld: { x: 3, y: 2 }, startA: { x: 2, y: 2 }, startB: { x: 5, y: 2 } });
      appliquerGlisser(d, { x: 3, y: 3 }, contour);
      expect(obj.pts[0]).toEqual({ x: 2, y: 3 });
      expect(obj.pts[1]).toEqual({ x: 5, y: 3 });
      expect(obj.pts[2]).toEqual({ x: 6, y: 5 });
      expect(obj.pts[3]).toEqual({ x: 2, y: 6 });
    });

    it('refuse si une seule des deux extremites sortirait', () => {
      const obj = forme();
      const avant = obj.pts.map((p) => ({ ...p }));
      const d = glisser({ type: 'edge', obj, i: 1, j: 2, startWorld: { x: 5, y: 3 }, startA: { x: 5, y: 2 }, startB: { x: 6, y: 5 } });
      appliquerGlisser(d, { x: 9.5, y: 3 }, contour);
      expect(obj.pts).toEqual(avant);
    });
  });

  describe('rectangle', () => {
    // Un rectangle ne se deforme pas librement : tirer un coin le redimensionne en gardant
    // l'oppose fixe, tirer un cote translate ce cote. C'est geometry/rect.ts qui le calcule.
    const rect = () => ({ type: 'polygon', pts: [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 5 }, { x: 2, y: 5 }] });

    it('redimensionne depuis un coin en gardant l oppose fixe', () => {
      const obj = rect();
      appliquerGlisser(glisser({ type: 'point', obj, idx: 0, startWorld: { x: 2, y: 2 }, startPt: { x: 2, y: 2 } }), { x: 1, y: 1 }, contour);
      expect(obj.pts[2]).toEqual({ x: 6, y: 5 });
      expect(obj.pts[0]).toEqual({ x: 1, y: 1 });
      expect(obj.pts).toHaveLength(4);
    });

    it('refuse un redimensionnement qui sortirait du contour', () => {
      const obj = rect();
      const avant = obj.pts.map((p) => ({ ...p }));
      appliquerGlisser(glisser({ type: 'point', obj, idx: 0, startWorld: { x: 2, y: 2 }, startPt: { x: 2, y: 2 } }), { x: -3, y: 1 }, contour);
      expect(obj.pts).toEqual(avant);
    });

    it('translate un cote entier', () => {
      const obj = rect();
      const d = glisser({ type: 'edge', obj, i: 0, j: 1, startWorld: { x: 4, y: 2 }, startA: { x: 2, y: 2 }, startB: { x: 6, y: 2 } });
      appliquerGlisser(d, { x: 4, y: 1 }, contour);
      expect(obj.pts[0].y).toBeCloseTo(1, 9);
      expect(obj.pts[1].y).toBeCloseTo(1, 9);
    });
  });

  describe('sommet libre', () => {
    it('ne deplace que le sommet tire', () => {
      const obj = { type: 'polygon', pts: [{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 5 }, { x: 2, y: 6 }] };
      appliquerGlisser(glisser({ type: 'point', obj, idx: 2, startWorld: { x: 6, y: 5 }, startPt: { x: 6, y: 5 } }), { x: 7, y: 6 }, contour);
      expect(obj.pts[2]).toEqual({ x: 7, y: 6 });
      expect(obj.pts[0]).toEqual({ x: 2, y: 2 });
    });

    it('refuse un sommet pose hors du contour', () => {
      const obj = { type: 'polygon', pts: [{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 5 }, { x: 2, y: 6 }] };
      appliquerGlisser(glisser({ type: 'point', obj, idx: 2, startWorld: { x: 6, y: 5 }, startPt: { x: 6, y: 5 } }), { x: 14, y: 6 }, contour);
      expect(obj.pts[2]).toEqual({ x: 6, y: 5 });
    });
  });
});
