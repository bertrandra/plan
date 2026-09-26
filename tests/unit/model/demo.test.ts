import { describe, it, expect } from 'vitest';
import { DEMO_OBJECTS, DEMO_TEMOIN_OBJECTS, PALETTE_DEMO } from '../../../src/model/demo.js';

// Le plan de demonstration existe en deux versions depuis la 2.1.1 (src/model/demo.ts) : le temoin,
// dont les golden files sont captures, et le meme plan aux couleurs de la maquette. Ce fichier tient
// la promesse qui rend la seconde inoffensive : seules les couleurs different.

describe('le plan de demonstration aux couleurs de la maquette', () => {
  it('ne differe du temoin que par le remplissage et le trait', () => {
    expect(DEMO_OBJECTS).toHaveLength(DEMO_TEMOIN_OBJECTS.length);
    DEMO_OBJECTS.forEach((o, i) => {
      const t = DEMO_TEMOIN_OBJECTS[i]!;
      expect({ ...o, fill: t.fill, stroke: t.stroke }).toEqual(t);
    });
  });

  it('recolore chaque objet, et garde distinctes deux couleurs qui l etaient', () => {
    DEMO_OBJECTS.forEach((o, i) => expect(o.fill, DEMO_TEMOIN_OBJECTS[i]!.name).not.toBe(DEMO_TEMOIN_OBJECTS[i]!.fill));
    const remplissages = [...new Set(DEMO_TEMOIN_OBJECTS.map(o => o.fill!))];
    const nouveaux = new Set(remplissages.map(c => PALETTE_DEMO[c]));
    expect(nouveaux.size).toBe(remplissages.length);
  });

  it('ne touche pas au temoin', () => {
    expect(DEMO_TEMOIN_OBJECTS.find(o => o.key === 'parcelle')!.fill).toBe('#1b5e0d');
  });
});
