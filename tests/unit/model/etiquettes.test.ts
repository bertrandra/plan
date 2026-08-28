import { describe, it, expect } from 'vitest';
import {
  etiquetteComposee, longueurEnMetres, angleEnDegres,
  SEP_ECRAN, DEGRE_ECRAN, SEP_EXPORT, DEGRE_EXPORT
} from '../../../src/model/etiquettes.js';

describe('etiquetteComposee', () => {
  it('joint le nom et la mesure quand les deux sont demandes', () => {
    expect(etiquetteComposee('Cote nord', '4,20 m', true, true, SEP_ECRAN)).toBe('Cote nord — 4,20 m');
  });

  it('rend le nom seul', () => {
    expect(etiquetteComposee('Cote nord', '4,20 m', true, false, SEP_ECRAN)).toBe('Cote nord');
  });

  it('rend la mesure seule', () => {
    expect(etiquetteComposee('Cote nord', '4,20 m', false, true, SEP_ECRAN)).toBe('4,20 m');
  });

  it('rend une chaine vide quand rien n est demande', () => {
    // C'est ce qui fait disparaitre l'etiquette : chaque appelant teste le resultat avant de
    // dessiner. Rendre le nom « par defaut » remettrait du texte sur un plan qu'on veut nu.
    expect(etiquetteComposee('Cote nord', '4,20 m', false, false, SEP_ECRAN)).toBe('');
  });

  it('traite undefined comme non demande', () => {
    expect(etiquetteComposee('Cote nord', '4,20 m', undefined, undefined, SEP_ECRAN)).toBe('');
  });

  it('utilise le separateur qu on lui donne, sans en supposer un', () => {
    expect(etiquetteComposee('A', 'B', true, true, SEP_EXPORT)).toBe('A - B');
  });
});

describe('separateurs', () => {
  it('distingue l ecran des exports', () => {
    // Un PDF ecrit ses textes en WinAnsi : le tiret cadratin et le signe degre n'y survivent pas.
    // Les deux jeux de constantes existent pour cette raison, et le test la conserve.
    expect(SEP_ECRAN).toBe(' — ');
    expect(SEP_EXPORT).toBe(' - ');
    expect(DEGRE_ECRAN).toBe('°');
    expect(DEGRE_EXPORT).toBe('deg');
  });

  it('n emploie que de l ASCII cote export', () => {
    // eslint-disable-next-line no-control-regex
    expect(/^[\x00-\x7F]*$/.test(SEP_EXPORT + DEGRE_EXPORT)).toBe(true);
  });
});

describe('longueurEnMetres', () => {
  it('arrondit au centimetre, la precision d un plan de masse', () => {
    expect(longueurEnMetres(4.2049)).toBe('4.20 m');
    expect(longueurEnMetres(4.205)).toBe('4.21 m');
  });

  it('garde les deux decimales sur un compte rond', () => {
    expect(longueurEnMetres(7)).toBe('7.00 m');
  });
});

describe('angleEnDegres', () => {
  it('arrondit au dixieme de degre', () => {
    expect(angleEnDegres(89.94, DEGRE_ECRAN)).toBe('89.9°');
    expect(angleEnDegres(89.96, DEGRE_EXPORT)).toBe('90.0deg');
  });
});

describe('les six compositions du programme', () => {
  // Chaque cas reproduit un site d'appel reel, pour que la table soit lisible d'un coup d'oeil.
  const cas = [
    ['ecran, cote nomme et cote', 'Nord', longueurEnMetres(4.2), true, true, SEP_ECRAN, 'Nord — 4.20 m'],
    ['ecran, coin nomme et angle', 'P1', angleEnDegres(90, DEGRE_ECRAN), true, true, SEP_ECRAN, 'P1 — 90.0°'],
    ['export, cote nomme et cote', 'Nord', longueurEnMetres(4.2), true, true, SEP_EXPORT, 'Nord - 4.20 m'],
    ['export, coin nomme et angle', 'P1', angleEnDegres(90, DEGRE_EXPORT), true, true, SEP_EXPORT, 'P1 - 90.0deg'],
    ['cote sans nom affiche', 'Nord', longueurEnMetres(4.2), false, true, SEP_EXPORT, '4.20 m'],
    ['plan nu', 'Nord', longueurEnMetres(4.2), false, false, SEP_EXPORT, '']
  ] as const;

  it.each(cas)('%s', (_titre, nom, mesure, montrerNom, montrerMesure, sep, attendu) => {
    expect(etiquetteComposee(nom, mesure, montrerNom, montrerMesure, sep)).toBe(attendu);
  });
});
