import { describe, it, expect } from 'vitest';
import { lireDate } from '../../../src/util/date.js';
import { anneeEtSemaineDepuisDate, dateDecaleeDeSemaines } from '../../../src/util/semaine.js';
import { ombreInstantanee } from '../../../src/engine/parasol.js';

describe('dates civiles (D-7)', () => {
  it('lit une date AAAA-MM-JJ', () => {
    expect(lireDate('2026-06-21')).toEqual({ annee: 2026, mois: 6, jour: 21 });
    expect(lireDate(' 2026-6-1 ')).toEqual({ annee: 2026, mois: 6, jour: 1 });
  });

  it('refuse ce qui n a pas cette forme', () => {
    for (const t of ['', '2026-06', '2026-13-01', '2026-00-10', '21/06/2026', '2026-06-21T10:00']) expect(lireDate(t)).toBeNull();
  });

  it('une date illisible ne se decale pas, au lieu de lever dans toISOString', () => {
    expect(dateDecaleeDeSemaines('n importe quoi', 2)).toBe('n importe quoi');
    expect(dateDecaleeDeSemaines('2026-06-21', 1)).toBe('2026-06-28');
  });

  it('une date illisible met le curseur en tete d annee, jamais sur NaN', () => {
    const { annee, semaine } = anneeEtSemaineDepuisDate('???');
    expect(Number.isFinite(annee)).toBe(true);
    expect(semaine).toBe(0);
  });

  it('sans date lisible, un parasol n a pas d ombre', () => {
    const parasol = { key: 'p', type: 'circle' as const, name: 'P', center: { x: 0, y: 0 }, r: 1.5, fonction: 'parasol' };
    expect(ombreInstantanee(parasol, { dateStr: '2026-99-99', minutes: 720, lieu: { latitude: 48.9, longitude: 2.1 } })).toBeNull();
  });
});
