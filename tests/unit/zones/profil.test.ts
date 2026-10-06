import { describe, it, expect } from 'vitest';
import { echellesProfil } from '../../../src/zones/resultats/Profil.js';

// Le panneau Profil (zones/resultats/Profil.tsx, MD/spec-relief.md §5.4) : les echelles du dessin.
// Un terrain qui descend d'un metre sur trente se verrait a peine a l'echelle vraie : les hauteurs
// sont exagerees d'un facteur rond, et le dessin le dit.

describe('les echelles du profil', () => {
  it('gardent la meme echelle en x et en z quand le denivele se voit', () => {
    // 20 m de long, 8 m de denivele, sur 512 × 174 px : 25,6 px/m en x, le denivele ferait 205 px
    // (trop haut pour 174) : z est ramene a la hauteur disponible, sans exageration.
    const e = echellesProfil(20, 8, 512, 174);
    expect(e.x).toBeCloseTo(25.6, 9);
    expect(e.z).toBeCloseTo(174 / 8, 9);
    expect(e.exageration).toBe(1);
    // 20 m de long, 4 m de denivele : 102 px a l'echelle vraie, plus de la moitie, rien a exagerer.
    expect(echellesProfil(20, 4, 512, 174)).toEqual({ x: 25.6, z: 25.6, exageration: 1 });
  });

  it('exagerent les hauteurs d un facteur rond quand le denivele est petit', () => {
    // 30 m de long, 1 m de denivele : 17 px a l'echelle vraie ; × 5 donne 85 px, juste sous la
    // moitie de 174, et c'est × 10 qui la depasse.
    const e = echellesProfil(30, 1, 512, 174);
    expect(e.exageration).toBe(10);
    expect(e.z).toBeCloseTo(e.x * 10, 9);
    // 30 m de long, 10 cm de denivele : meme × 20 ne remplit pas la moitie, c'est le plus grand facteur.
    expect(echellesProfil(30, 0.1, 512, 174).exageration).toBe(20);
  });

  it('ne divisent pas par zero sur un sol plat ou une ligne sans longueur', () => {
    expect(echellesProfil(30, 0, 512, 174)).toMatchObject({ exageration: 1 });
    expect(Number.isFinite(echellesProfil(0, 1, 512, 174).x)).toBe(true);
  });
});
