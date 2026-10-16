import { describe, it, expect } from 'vitest';
import { jugerCriteres, mesureConformite, resumerFacades, tauxFacadesParRegion, TOLERANCE_BAIES, type VerdictFacade } from '../../../src/regles/conformite.js';

// Le taux de conformite des facades (MD/spec-facades-calage-detection.md §15.3, lot G13) : baies a ± 1,
// part vitree a ± 20 %, hauteur des niveaux ; une facade est conforme quand tous les criteres juges tiennent.

const mesure = (baies: number, partVitree: number, hauteurNiveauM: number | null) => ({ baies, partVitree, hauteurNiveauM });

describe('les criteres d une facade', () => {
  it('tient les baies a ± 1, pas a 2', () => {
    expect(jugerCriteres(mesure(7, 0.13, 2.7), mesure(6, 0.13, 2.7)).baies.tenu).toBe(true);
    expect(jugerCriteres(mesure(5, 0.13, 2.7), mesure(6, 0.13, 2.7)).baies.tenu).toBe(true);
    expect(jugerCriteres(mesure(8, 0.13, 2.7), mesure(6, 0.13, 2.7)).baies.tenu).toBe(false);
    expect(TOLERANCE_BAIES).toBe(1);
  });

  it('tient la part vitree a ± 20 % de celle du releve', () => {
    expect(jugerCriteres(mesure(6, 0.114, 2.7), mesure(6, 0.1, 2.7)).partVitree.tenu).toBe(true);
    expect(jugerCriteres(mesure(6, 0.121, 2.7), mesure(6, 0.1, 2.7)).partVitree.tenu).toBe(false);
    expect(jugerCriteres(mesure(6, 0.079, 2.7), mesure(6, 0.1, 2.7)).partVitree.tenu).toBe(false);
  });

  it('compare un mur aveugle a zero, a un point de mur pres : un pignon sans fenetre n est pas couvert de vitrage', () => {
    expect(jugerCriteres(mesure(0, 0.005, null), mesure(0, 0, null)).partVitree.tenu).toBe(true);
    expect(jugerCriteres(mesure(6, 0.12, null), mesure(0, 0, null))).toMatchObject({ partVitree: { tenu: false }, baies: { tenu: false }, conforme: false });
  });

  it('ne juge la hauteur des niveaux que si les deux la connaissent (deux niveaux au moins), a 30 cm pres', () => {
    expect(jugerCriteres(mesure(6, 0.1, 2.7), mesure(6, 0.1, null)).hauteurNiveau).toEqual({ auto: 2.7, releve: null, tenu: null });
    expect(jugerCriteres(mesure(6, 0.1, 2.9), mesure(6, 0.1, 2.7)).hauteurNiveau.tenu).toBe(true);
    expect(jugerCriteres(mesure(6, 0.1, 3.1), mesure(6, 0.1, 2.7)).hauteurNiveau.tenu).toBe(false);
    // Un critere non juge ne fait pas perdre la conformite.
    expect(jugerCriteres(mesure(6, 0.1, null), mesure(6, 0.1, 2.7)).conforme).toBe(true);
  });
});

describe('le taux des facades', () => {
  const v = (region: string, conforme: boolean, baies = true): VerdictFacade => ({
    fichier: 'a', batiment: 'M', cote: 0, orientation: 'Sud', region,
    baies: { auto: 6, releve: 6, tenu: baies }, partVitree: { auto: 0.1, releve: 0.1, tenu: conforme }, hauteurNiveau: { auto: null, releve: null, tenu: null }, conforme,
  });

  it('compte les conformes, et pour chaque critere ceux qui l ont tenu sur ceux qui l ont juge', () => {
    const r = resumerFacades([v('78', true), v('78', false), v('62', true), v('62', false, false)]);
    expect(r).toEqual({ total: 4, conformes: 2, nonConformes: 2, taux: 0.5, baies: { tenus: 3, juges: 4 }, partVitree: { tenus: 2, juges: 4 }, hauteurNiveau: { tenus: 0, juges: 0 } });
    expect(resumerFacades([])).toMatchObject({ total: 0, taux: null });
  });

  it('donne le taux de chaque region', () => {
    expect(tauxFacadesParRegion([v('78', true), v('78', false), v('62', true)])).toEqual({ '78': 0.5, '62': 1 });
    expect(tauxFacadesParRegion([])).toEqual({});
  });

  it('entre dans la mesure rangee sur le serveur : le resume, ou null sans facade', () => {
    const base = { t: new Date('2026-10-16T10:00:00Z'), code: { version: '2.2.0', commit: null }, lecture: { toits: 3, reglages: 'a', faits: 'b' }, corpus: [], audits: [], auditsLus: 0 };
    expect(mesureConformite(base).facades).toBeNull();
    expect(mesureConformite({ ...base, facades: [] }).facades).toBeNull();
    expect(mesureConformite({ ...base, facades: [v('78', true)] }).facades).toMatchObject({ total: 1, conformes: 1, taux: 1 });
  });
});
