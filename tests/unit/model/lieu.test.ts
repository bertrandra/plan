import { describe, it, expect } from 'vitest';
import { lieuDeParcelle, libelleLieuTexte } from '../../../src/model/lieu.js';
import { LIEU_DEFAUT } from '../../../src/model/defaults.js';

describe('lieu de la parcelle', () => {
  it('rend le lieu par defaut quand il n y a pas de parcelle', () => {
    expect(lieuDeParcelle(null)).toEqual(LIEU_DEFAUT);
  });

  it('rend le lieu saisi sur la parcelle', () => {
    const p = { latitude: 48.1147, longitude: -1.6794, nomLieu: 'Rennes' };
    expect(lieuDeParcelle(p)).toEqual({ nom: 'Rennes', latitude: 48.1147, longitude: -1.6794 });
  });

  it('ecrit les champs manquants sur la parcelle', () => {
    // Sans cette ecriture, un projet ancien afficherait le lieu par defaut sans jamais
    // l'enregistrer, et le reperdrait a chaque reouverture.
    const p: Record<string, unknown> = {};
    lieuDeParcelle(p);
    expect(p.latitude).toBe(LIEU_DEFAUT.latitude);
    expect(p.longitude).toBe(LIEU_DEFAUT.longitude);
    expect(p.nomLieu).toBe(LIEU_DEFAUT.nom);
  });

  it('accepte une longitude nulle, qui est une position et non une absence', () => {
    // Greenwich : `0` ne doit pas etre remplace par la longitude par defaut.
    const p = { latitude: 51.4779, longitude: 0, nomLieu: 'Greenwich' };
    expect(lieuDeParcelle(p).longitude).toBe(0);
  });

  it('complete une parcelle a demi renseignee sans ecraser ce qui existe', () => {
    const p: Record<string, unknown> = { latitude: 43.6 };
    const lieu = lieuDeParcelle(p);
    expect(lieu.latitude).toBe(43.6);
    expect(lieu.longitude).toBe(LIEU_DEFAUT.longitude);
  });
});

describe('libelle du lieu', () => {
  it('affiche quatre decimales a la virgule', () => {
    expect(libelleLieuTexte({ nom: 'Rennes', latitude: 48.1147, longitude: -1.6794 }))
      .toBe('📍 Rennes — 48,1147° N, -1,6794° E');
  });

  it('complete les decimales manquantes', () => {
    expect(libelleLieuTexte({ nom: 'Ici', latitude: 48.1, longitude: 2 }))
      .toBe('📍 Ici — 48,1000° N, 2,0000° E');
  });
});
