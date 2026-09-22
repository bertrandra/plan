import { describe, it, expect } from 'vitest';
import { ONGLETS, ongletsVisibles } from '../../../src/app/tiroir.js';

describe('les onglets du tiroir', () => {
  it('cachent ceux de la terrasse quand aucune n est selectionnee', () => {
    const sans = ongletsVisibles(false).map(o => o.id);
    expect(sans).toEqual(['mesure', 'plu', 'resume']);
  });

  it('les montrent tous avec une terrasse selectionnee, la terrasse en premier', () => {
    const avec = ongletsVisibles(true).map(o => o.id);
    expect(avec).toEqual(ONGLETS.map(o => o.id));
    expect(avec.slice(0, 5)).toEqual(['bom', 'coupe', 'implantation', 'chantier', 'methode']);
  });

  it('ont chacun un panneau distinct', () => {
    const panneaux = ONGLETS.map(o => o.panneau);
    expect(new Set(panneaux).size).toBe(panneaux.length);
  });
});
