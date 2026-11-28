import { describe, it, expect } from 'vitest';
import { etiquettesGardees, rangEtiquette } from '../../../../src/app/assemblage/chevauchements.js';
import { encreDeNom, contraste } from '../../../../src/render/theme.js';

// Le plan desencombre (audit UX de la 5.45.0, constat 7) : la moins prioritaire des etiquettes qui se chevauchent se masque.
const boite = (gauche: number, haut: number, l = 40, h = 12) => ({ gauche, haut, droite: gauche + l, bas: haut + h });

describe('les etiquettes qui se chevauchent', () => {
  it('rangent l objet choisi, puis les noms, les cotes et les mesures', () => {
    expect(rangEtiquette('mesure', 'terrasse', 'terrasse')).toBe(0);
    expect(rangEtiquette('nom', 'maison', 'terrasse')).toBeLessThan(rangEtiquette('cote', 'maison', 'terrasse'));
    expect(rangEtiquette('cote', 'maison', null)).toBeLessThan(rangEtiquette('mesure', undefined, null));
  });

  it('gardent la plus prioritaire, quel que soit l ordre du plan, et laissent celles qui ont la place', () => {
    const garde = etiquettesGardees([
      { boite: boite(0, 0), rang: rangEtiquette('mesure', undefined, null) },
      { boite: boite(10, 4), rang: rangEtiquette('nom', 'a', null) },
      { boite: boite(30, 8), rang: rangEtiquette('cote', 'a', null) },
      { boite: boite(200, 0), rang: rangEtiquette('mesure', undefined, null) },
      { boite: boite(0, 0, 0, 0), rang: 1 }
    ]);
    expect(garde).toEqual([false, true, false, true, true]);
  });
});

describe('les noms lisibles sur le fond du plan', () => {
  it('eclaircissent ou foncent une couleur trop proche du fond, gardent celle qui se lit', () => {
    // Hors navigateur, le theme clair : un vert pale sur le papier se fonce jusqu'a se lire.
    const pale = encreDeNom('#B5D99C');
    expect(pale).not.toBe('#B5D99C');
    expect(contraste(pale, '#F7F2E7')).toBeGreaterThanOrEqual(5);
    expect(encreDeNom('#2B2117')).toBe('#2B2117');
  });
});
