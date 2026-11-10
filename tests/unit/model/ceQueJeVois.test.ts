import { describe, it, expect } from 'vitest';
import { avecNombreDeCheminees, avecSouche, etatCheminees, materiauxVus, partieVue, resumePartie, rienVu, toitVu, AUTRES_FORMES, FORMES_COURANTES } from '../../../src/model/ceQueJeVois.js';

// « Ce que je vois » (MD/spec-audit.md §8.1) : on n'ecrit que ce que l'on a vu, et la ligne de la
// liste de controle passe a « vu » des qu'une partie est notee.

describe('ce que je vois', () => {
  it('ne propose pas les termes en doute (decision D12)', () => {
    const codes = [...FORMES_COURANTES, ...AUTRES_FORMES].map((f) => f.code as string);
    for (const douteux of ['deversee', 'queue-de-vache', 'brisure']) expect(codes).not.toContain(douteux);
  });

  it('dit une partie vue des qu un de ses champs est note', () => {
    expect(toitVu({})).toBe(false);
    expect(toitVu({ sensFaitage: 'parallele' })).toBe(true);
    expect(etatCheminees({})).toBe('aVoir');
    expect(etatCheminees({ cheminees: { nombre: 0, souches: [] } })).toBe('aucune');
    expect(partieVue({ cheminees: { nombre: 0, souches: [] } }, 'cheminees')).toBe(true);
    // Les materiaux portent les murs et la couverture : l'un sans l'autre n'est pas fini.
    expect(materiauxVus({ murs: 'enduit' })).toBe(false);
    expect(materiauxVus({ murs: 'enduit', couverture: 'ardoise' })).toBe(true);
    expect(rienVu({})).toBe(true);
    expect(rienVu({ terrasse: {} })).toBe(true);
    expect(rienVu({ murs: 'brique' })).toBe(false);
  });

  it('garde les souches deja decrites quand le nombre change', () => {
    let v = avecNombreDeCheminees({}, 2);
    v = avecSouche(v, 0, { position: 'faitage', materiau: 'brique' });
    expect(v.cheminees).toEqual({ nombre: 2, souches: [{ position: 'faitage', materiau: 'brique' }, {}] });
    v = avecNombreDeCheminees(v, 1);
    expect(v.cheminees).toEqual({ nombre: 1, souches: [{ position: 'faitage', materiau: 'brique' }] });
    expect(avecNombreDeCheminees(v, 99).cheminees?.nombre).toBe(6);
    // Une souche hors du compte ne change rien.
    expect(avecSouche(v, 5, { position: 'pan' })).toBe(v);
  });

  it('resume chaque partie pour la ligne de la liste', () => {
    const v = { forme: 'deux-pans' as const, sensFaitage: 'parallele' as const, lucarnes: { nombre: 2 }, cheminees: { nombre: 2, souches: [{ position: 'faitage' as const }, { position: 'pignon' as const }] },
      terrasse: { accessible: true, acrotereM: 0.6 }, murs: 'meuliere' as const, couverture: 'tuile-plate' as const };
    expect(resumePartie(v, 'toit')).toBe('Deux pans · parallèle à la rue · 2 lucarnes');
    expect(resumePartie(v, 'cheminees')).toBe('2 cheminées · au faîtage, dans le pignon');
    expect(resumePartie(v, 'terrasse')).toBe('Accessible · acrotère 0,6 m');
    expect(resumePartie(v, 'materiaux')).toBe('Meulière · tuiles plates');
    expect(resumePartie({ cheminees: { nombre: 0, souches: [] } }, 'cheminees')).toBe('Aucune cheminée');
    expect(resumePartie({}, 'toit')).toBe('');
  });
});
