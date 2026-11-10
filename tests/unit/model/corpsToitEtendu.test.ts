import { describe, it, expect } from 'vitest';
import {
  profilPanValide, boutToitValide, lucarneValide, bordsValides, lireChampsEtendus, compacterChampsEtendus, TYPES_LUCARNE,
} from '../../../src/model/corpsToitEtendu.js';

// Les champs etendus d'un corps de toit (MD/spec-regles-toits.md §4) : verifies a la lecture,
// compactes a l'ecriture.

const lucarne = { type: 'jacobine', pan: 0, debutM: 2, finM: 3.4, faitageM: 7.2, profondeurM: 1.5, source: 'observation' };

describe('verification des champs etendus', () => {
  it('profils : droit, brise, coyau, courbe ; les cles inconnues tombent', () => {
    expect(profilPanValide({ type: 'droit', x: 1 })).toEqual({ type: 'droit' });
    expect(profilPanValide({ type: 'brise', largeurBrisisM: 1, hauteurBrisM: 8 })).toEqual({ type: 'brise', largeurBrisisM: 1, hauteurBrisM: 8 });
    expect(profilPanValide({ type: 'coyau', largeurM: 0.8, penteDeg: 20 })).toEqual({ type: 'coyau', largeurM: 0.8, penteDeg: 20 });
    expect(profilPanValide({ type: 'courbe', flecheM: 0.6 })).toEqual({ type: 'courbe', flecheM: 0.6 });
    expect(profilPanValide({ type: 'brise', largeurBrisisM: 1 })).toBeNull();
    expect(profilPanValide({ type: 'coyau', largeurM: 0.8, penteDeg: 95 })).toBeNull();
    expect(profilPanValide({ type: 'courbe', flecheM: 0 })).toBeNull();
    expect(profilPanValide({ type: 'onde' })).toBeNull();
    expect(profilPanValide(null)).toBeNull();
  });

  it('bouts : pignon, croupe, demi-croupe, brisis, redents', () => {
    expect(boutToitValide({ type: 'pignon' })).toEqual({ type: 'pignon' });
    expect(boutToitValide({ type: 'redents' })).toEqual({ type: 'redents' });
    expect(boutToitValide({ type: 'croupe', profondeurM: 0 })).toEqual({ type: 'croupe', profondeurM: 0 });
    expect(boutToitValide({ type: 'demi-croupe', profondeurM: 1.2, hauteurPignonM: 1.8 })).toEqual({ type: 'demi-croupe', profondeurM: 1.2, hauteurPignonM: 1.8 });
    expect(boutToitValide({ type: 'brisis', largeurM: 1 })).toEqual({ type: 'brisis', largeurM: 1 });
    expect(boutToitValide({ type: 'croupe', profondeurM: -1 })).toBeNull();
    expect(boutToitValide({ type: 'demi-croupe', profondeurM: 1.2 })).toBeNull();
    expect(boutToitValide({ type: 'brisis', largeurM: Number.NaN })).toBeNull();
  });

  it('lucarnes : un type connu, un pan, des bords dans l ordre, des hauteurs, une source', () => {
    expect(TYPES_LUCARNE).toContain('inconnue');
    expect(lucarneValide({ ...lucarne, extra: 1 })).toEqual(lucarne);
    expect(lucarneValide({ ...lucarne, type: 'oeil-de-boeuf' })).toEqual({ ...lucarne, type: 'oeil-de-boeuf' });
    expect(lucarneValide({ ...lucarne, type: 'abat-jour' })).toBeNull();
    expect(lucarneValide({ ...lucarne, pan: 2 })).toBeNull();
    expect(lucarneValide({ ...lucarne, finM: 2 })).toBeNull();
    expect(lucarneValide({ ...lucarne, profondeurM: 0 })).toBeNull();
    expect(lucarneValide({ ...lucarne, source: 'photo' })).toBeNull();
  });

  it('bords : chaque cle verifiee a part, rien s il ne reste rien', () => {
    expect(bordsValides({ debordEgoutM: 0.5, saillieRiveM: 0, coyau: true, queueDeVache: false })).toEqual({ debordEgoutM: 0.5, saillieRiveM: 0, coyau: true, queueDeVache: false });
    expect(bordsValides({ debordEgoutM: -1, coyau: 'oui', saillieRiveM: 0.3 })).toEqual({ saillieRiveM: 0.3 });
    expect(bordsValides({ debordEgoutM: -1 })).toBeNull();
    expect(bordsValides([])).toBeNull();
  });
});

describe('lireChampsEtendus', () => {
  it('un corps sans ces champs n est pas touche', () => {
    const c = { pts: [], posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
    const avant = JSON.stringify(c);
    lireChampsEtendus(c);
    expect(JSON.stringify(c)).toBe(avant);
  });

  it('retire ce qui est mal forme, garde le reste, lucarne par lucarne', () => {
    const c: Record<string, unknown> = {
      profil: [{ type: 'droit' }], bouts: [{ type: 'pignon' }, { type: 'brisis', largeurM: 1, x: 2 }],
      lucarnes: [lucarne, { ...lucarne, pan: 3 }], bords: { coyau: 'peut-etre' },
    };
    lireChampsEtendus(c);
    expect(c).toEqual({ bouts: [{ type: 'pignon' }, { type: 'brisis', largeurM: 1 }], lucarnes: [lucarne] });
    const vide: Record<string, unknown> = { lucarnes: [{ type: 'jacobine' }], profil: 'brise' };
    lireChampsEtendus(vide);
    expect(vide).toEqual({});
  });
});

describe('compacterChampsEtendus', () => {
  it('ne garde que ce qui dit autre chose que l absence', () => {
    const c: Record<string, unknown> = { profil: [{ type: 'droit' }, { type: 'droit' }], bouts: [{ type: 'pignon' }, { type: 'pignon' }], lucarnes: [], bords: {} };
    compacterChampsEtendus(c);
    expect(c).toEqual({});
  });

  it('des bouts egaux a ceux que donnent les croupes ne s ecrivent pas ; d autres, si', () => {
    const egaux: Record<string, unknown> = { croupes: [0, 2.5], bouts: [{ type: 'pignon' }, { type: 'croupe', profondeurM: 2.5 }] };
    compacterChampsEtendus(egaux);
    expect(egaux).toEqual({ croupes: [0, 2.5] });
    const autres: Record<string, unknown> = { croupes: [0, 2.5], bouts: [{ type: 'redents' }, { type: 'croupe', profondeurM: 2.5 }], profil: [{ type: 'droit' }, { type: 'courbe', flecheM: 1 }] };
    compacterChampsEtendus(autres);
    expect(autres).toHaveProperty('bouts');
    expect(autres).toHaveProperty('profil');
  });
});
