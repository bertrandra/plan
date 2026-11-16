import { describe, it, expect } from 'vitest';
import { ETAPES_FACADE, SEGMENTS_FACADE, libelleEtape, nomEtape, sansNumeros } from '../../../src/model/etapeFacade.js';

// L'audit d'une facade sans le jargon des etapes (lot 3 de la simplification) : les textes de la chaine se lisent sans « É7 » ni
// « V1 » a « V4 » pour la personne ordinaire ; rien n'est recalcule, seule la lecture change.

describe('sansNumeros', () => {
  it('retire les numeros d etape et les points de validation, et garde le reste', () => {
    expect(sansNumeros('É7 Calage du mur : mur posé')).toBe('Calage du mur : mur posé');
    expect(sansNumeros('confirmer le mur (É7, V1), ou le tirer à la main')).toBe('confirmer le mur, ou le tirer à la main');
    expect(sansNumeros('Dépend du mur à confirmer (É7 Calage du mur).')).toBe('Dépend du mur à confirmer (Calage du mur).');
    expect(sansNumeros('Bilan : 9,5 m. Validez la façade pour l’écrire dans le projet (V4).')).toBe('Bilan : 9,5 m. Validez la façade pour l’écrire dans le projet.');
    expect(sansNumeros('É3–É6 · Image')).toBe('Image');
    expect(sansNumeros('Mur, à confirmer, point de validation V1')).toBe('Mur, à confirmer');
    expect(sansNumeros('Cocher les propositions à l’avant/après de l’audit (V2)')).toBe('Cocher les propositions à l’avant/après de l’audit');
  });

  it('ne touche ni un mot qui ressemble, ni un texte sans numero', () => {
    expect(sansNumeros('Vitre V12, É15x, VMC')).toBe('Vitre V12, É15x, VMC');
    expect(sansNumeros('Mur de 9,5 × 5,6 m, 6 ouvertures')).toBe('Mur de 9,5 × 5,6 m, 6 ouvertures');
  });

  it('lit chaque libelle d etape sans son numero', () => {
    for (const e of ETAPES_FACADE) {
      expect(sansNumeros(libelleEtape(e.id))).toBe(e.nom);
      expect(nomEtape(e.id, false)).toBe(e.nom);
      expect(nomEtape(e.id, true)).toBe(libelleEtape(e.id));
      for (const a of e.actions ?? []) expect(sansNumeros(a.libelle)).not.toMatch(/É\d|\bV[1-4]\b/);
    }
    expect(SEGMENTS_FACADE.length).toBeGreaterThan(0);
  });
});
