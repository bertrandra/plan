import { describe, it, expect } from 'vitest';
import { cameraDepuisPointDeVue, HAUTEUR_YEUX_M } from '../../../src/three/navigation.js';

// Le calcul etait ecrit deux fois — une pour la Vue 3D, une pour la visionneuse GLB. Ces tests
// fixent la conversion plan → repere local de la scene, qui est la partie qu'on ne devine pas.

/** Un point de vue : position, puis un second point qui dit ce qu'il regarde. */
function vue(x: number, y: number, vx: number, vy: number, altitude?: number) {
  return { pts: [{ x, y }, { x: vx, y: vy }], altitude };
}

describe('conversion vers le repere de la scene', () => {
  it('pose la camera au point de vue, mesure depuis le centroide', () => {
    const c = cameraDepuisPointDeVue(vue(13, 27, 14, 27), { x: 10, y: 20 });
    expect(c.position.x).toBeCloseTo(3, 9);
    expect(c.position.z).toBeCloseTo(-7, 9);
  });

  it('retourne l axe Nord-Sud : dans la scene, le Nord est en -Z', () => {
    // Le plan compte Y vers le nord, la scene compte Z vers le sud. Un point de vue au nord du
    // centroide doit donc se retrouver a Z negatif.
    const nord = cameraDepuisPointDeVue(vue(0, 10, 0, 11), { x: 0, y: 0 });
    expect(nord.position.z).toBeCloseTo(-10, 9);
  });

  it('prend l altitude du point de vue', () => {
    expect(cameraDepuisPointDeVue(vue(0, 0, 1, 0, 2.4), { x: 0, y: 0 }).position.y).toBe(2.4);
  });

  it('retombe sur 1,60 m quand l altitude manque', () => {
    expect(cameraDepuisPointDeVue(vue(0, 0, 1, 0), { x: 0, y: 0 }).position.y).toBe(1.6);
    expect(HAUTEUR_YEUX_M).toBe(1.6);
  });

  it('traite une altitude nulle comme absente', () => {
    // Verifie apres coup : ce n'est pas une valeur perdue, parce qu'elle ne peut pas etre saisie.
    // Le panneau d'attributs plafonne l'altitude par le bas a 0,10 m (`min='0.1'` et un
    // `Math.max(0.1, …)` a la saisie) : une camera au ras du sol n'est pas un cas prevu, et `0` ne
    // peut venir que d'un fichier de projet ecrit a la main. Le repli sur 1,60 m est alors le meme
    // que pour un champ absent, ce qui est le comportement le moins surprenant.
    expect(cameraDepuisPointDeVue(vue(0, 0, 1, 0, 0), { x: 0, y: 0 }).position.y).toBe(1.6);
  });
});

describe('la direction du regard', () => {
  it('vise a 1,50 m devant, une distance de conversation', () => {
    const c = cameraDepuisPointDeVue(vue(0, 0, 5, 0), { x: 0, y: 0 });
    const d = Math.hypot(c.cible.x - c.position.x, c.cible.z - c.position.z);
    expect(d).toBeCloseTo(1.5, 9);
  });

  it('ne depend que de la direction, pas de la longueur du second segment', () => {
    // Le second point dit OU regarder, pas a quelle distance : l'eloigner ne change rien.
    const proche = cameraDepuisPointDeVue(vue(0, 0, 1, 1), { x: 0, y: 0 });
    const loin = cameraDepuisPointDeVue(vue(0, 0, 40, 40), { x: 0, y: 0 });
    expect(loin.cible.x).toBeCloseTo(proche.cible.x, 9);
    expect(loin.cible.z).toBeCloseTo(proche.cible.z, 9);
  });

  it('regarde vers l est, vers le nord, vers l ouest', () => {
    const est = cameraDepuisPointDeVue(vue(0, 0, 1, 0), { x: 0, y: 0 });
    expect(est.cible.x).toBeCloseTo(1.5, 9);
    expect(est.cible.z).toBeCloseTo(0, 9);
    const nord = cameraDepuisPointDeVue(vue(0, 0, 0, 1), { x: 0, y: 0 });
    expect(nord.cible.z).toBeCloseTo(-1.5, 9);
    const ouest = cameraDepuisPointDeVue(vue(0, 0, -1, 0), { x: 0, y: 0 });
    expect(ouest.cible.x).toBeCloseTo(-1.5, 9);
  });

  it('regarde a l est quand les deux points sont confondus', () => {
    // Direction indefinie : la longueur nulle est remplacee par 1, ce qui donne l'est. Pas un choix,
    // un repli — mais il ne doit pas produire de NaN.
    const c = cameraDepuisPointDeVue(vue(3, 3, 3, 3), { x: 0, y: 0 });
    expect(Number.isNaN(c.cible.x)).toBe(false);
    expect(c.cible.x).toBeCloseTo(4.5, 9);
  });

  it('garde la cible a la hauteur des yeux : on regarde droit devant', () => {
    const c = cameraDepuisPointDeVue(vue(0, 0, 1, 0, 3), { x: 0, y: 0 });
    expect(c.cible.y).toBe(c.position.y);
  });
});
