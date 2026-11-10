import { describe, it, expect } from 'vitest';
import { ONGLETS, ongletsVisibles } from '../../../src/app/tiroir.js';

describe('les onglets du tiroir', () => {
  it('cachent ceux de la terrasse quand aucune n est selectionnee', () => {
    const sans = ongletsVisibles(false).map(o => o.id);
    expect(ongletsVisibles(false, true).map(o => o.id)).toEqual(['piscine', 'noteCalcul', 'mesure', 'plu', 'resume']);
    expect(ongletsVisibles(false, false, false, true).map(o => o.id)).toEqual(['abri', 'mesure', 'plu', 'resume']);
    expect(sans).toEqual(['mesure', 'plu', 'resume']);
  });

  it('les montrent tous avec une terrasse selectionnee et un relief, la terrasse en premier', () => {
    const avec = ongletsVisibles(true, true, true, true).map(o => o.id);
    expect(avec).toEqual(ONGLETS.map(o => o.id));
    expect(ongletsVisibles(true).map(o => o.id)).not.toContain('noteCalcul');
    expect(ongletsVisibles(true).map(o => o.id)).not.toContain('abri');
    // L'optimisation de la structure, un resultat, suit la nomenclature et son debit.
    expect(avec.slice(0, 6)).toEqual(['bom', 'optimisation', 'coupe', 'implantation', 'chantier', 'methode']);
  });

  it('ne montrent le profil du sol qu avec un relief, juste apres les cotes', () => {
    // Le profil prend sa ligne sur une cote (MD/spec-relief.md §5.4) : il la suit dans la barre.
    expect(ongletsVisibles(false, false, false).map(o => o.id)).not.toContain('profil');
    expect(ongletsVisibles(false, false, true).map(o => o.id)).toEqual(['mesure', 'profil', 'plu', 'resume']);
  });

  it('ont chacun un panneau distinct', () => {
    const panneaux = ONGLETS.map(o => o.panneau);
    expect(new Set(panneaux).size).toBe(panneaux.length);
  });
});
