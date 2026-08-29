import { describe, it, expect } from 'vitest';
import { anneeEtSemaineDepuisDate, dateDecaleeDeSemaines } from '../../../src/util/semaine.js';

describe('position du curseur semaine', () => {
  it('met le 1er janvier au cran 0', () => {
    expect(anneeEtSemaineDepuisDate('2026-01-01').semaine).toBe(0);
  });

  it('garde le meme cran pendant sept jours, puis avance', () => {
    expect(anneeEtSemaineDepuisDate('2026-01-07').semaine).toBe(0);
    expect(anneeEtSemaineDepuisDate('2026-01-08').semaine).toBe(1);
  });

  it('ne suit pas la numerotation ISO', () => {
    // Le 4 janvier 2026 est un dimanche : en ISO c'est la semaine 1 de 2026, ici c'est le cran 0.
    // C'est la difference assumee — le curseur sert a naviguer, pas a nommer une semaine.
    expect(anneeEtSemaineDepuisDate('2026-01-04').semaine).toBe(0);
  });

  it('plafonne a 52 les derniers jours de l annee', () => {
    // 52*7 = 364 : sans plafond, le 31 decembre sortirait de la course du curseur.
    expect(anneeEtSemaineDepuisDate('2026-12-31').semaine).toBe(52);
    expect(anneeEtSemaineDepuisDate('2024-12-31').semaine).toBe(52);
  });

  it('rend l annee de la date', () => {
    expect(anneeEtSemaineDepuisDate('2019-06-15').annee).toBe(2019);
  });

  it('compte les jours d une annee bissextile sans decalage', () => {
    expect(anneeEtSemaineDepuisDate('2024-03-01').semaine).toBe(8);
    expect(anneeEtSemaineDepuisDate('2025-03-01').semaine).toBe(8);
  });
});

describe('decalage d un cran', () => {
  it('avance de sept jours pile', () => {
    expect(dateDecaleeDeSemaines('2026-03-11', 1)).toBe('2026-03-18');
  });

  it('recule aussi bien qu il avance', () => {
    expect(dateDecaleeDeSemaines('2026-03-11', -2)).toBe('2026-02-25');
  });

  it('est relatif a la date courante, pas absolu depuis le 1er janvier', () => {
    // C'est la raison d'etre du calcul : partir d'un mardi et avancer d'un cran donne le mardi
    // suivant. Une position absolue ferait sauter d'un nombre de jours irregulier au premier cran.
    const depart = '2026-03-11';
    expect(dateDecaleeDeSemaines(depart, 1)).toBe('2026-03-18');
    expect(dateDecaleeDeSemaines(dateDecaleeDeSemaines(depart, 1), 1)).toBe('2026-03-25');
  });

  it('traverse une fin d annee', () => {
    expect(dateDecaleeDeSemaines('2026-12-30', 1)).toBe('2027-01-06');
  });

  it('traverse un 29 fevrier', () => {
    expect(dateDecaleeDeSemaines('2024-02-26', 1)).toBe('2024-03-04');
  });

  it('rend la meme date pour un delta nul', () => {
    expect(dateDecaleeDeSemaines('2026-08-29', 0)).toBe('2026-08-29');
  });

  it('peut sortir de l annee du curseur, et c est assume', () => {
    // Le curseur affiche une position dans l'annee, mais le decalage est relatif : passer le 31
    // decembre change d'annee, et la position affichee cesse alors de correspondre au calcul
    // depuis le 1er janvier.
    const apres = dateDecaleeDeSemaines('2026-12-30', 2);
    expect(apres.slice(0, 4)).toBe('2027');
    expect(anneeEtSemaineDepuisDate(apres).semaine).toBe(1);
  });
});
