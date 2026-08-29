import { describe, it, expect } from 'vitest';
import { cleObjet, idMesure } from '../../../src/model/cles.js';

const HORLOGE = () => 1700000000000;

describe('cle d un objet', () => {
  it('porte le type, l instant et le compteur', () => {
    const etat = { newObjCounter: 0 };
    expect(cleObjet('circle', etat, { horloge: HORLOGE })).toBe('circle1700000000000_0');
  });

  it('consomme un numero a chaque appel', () => {
    // Le compteur avance meme si la cle obtenue n'est finalement pas utilisee : deux objets ne
    // peuvent donc jamais se voir attribuer le meme numero.
    const etat = { newObjCounter: 5 };
    cleObjet('obj', etat, { horloge: HORLOGE });
    expect(etat.newObjCounter).toBe(6);
  });

  it('reste distincte dans une meme milliseconde', () => {
    // Le cas reel du double-clic. Sans le compteur, les deux cles seraient identiques.
    const etat = { newObjCounter: 0 };
    const a = cleObjet('obj', etat, { horloge: HORLOGE });
    const b = cleObjet('obj', etat, { horloge: HORLOGE });
    expect(a).not.toBe(b);
  });

  it('suit une horloge qui avance', () => {
    let t = 1000;
    const etat = { newObjCounter: 0 };
    const a = cleObjet('obj', etat, { horloge: () => t });
    t = 2000;
    expect(cleObjet('obj', etat, { horloge: () => t })).not.toBe(a);
  });

  it('prend l heure reelle quand aucune horloge n est fournie', () => {
    const etat = { newObjCounter: 0 };
    const avant = Date.now();
    const cle = cleObjet('obj', etat);
    const horodatage = Number(cle.slice(3).split('_')[0]);
    expect(horodatage).toBeGreaterThanOrEqual(avant);
    expect(horodatage).toBeLessThanOrEqual(Date.now());
  });
});

describe('identifiant d une cote', () => {
  it('porte l instant et cinq caracteres tires au hasard', () => {
    expect(idMesure({ horloge: HORLOGE, alea: () => 0.123456789 })).toBe('m1700000000000_4fzzz');
  });

  it('distingue deux cotes posees dans la meme milliseconde', () => {
    // Les cotes n'ont pas de compteur : c'est le tirage qui joue ce role.
    let n = 0;
    const alea = () => [0.111111111, 0.222222222][n++];
    const a = idMesure({ horloge: HORLOGE, alea });
    const b = idMesure({ horloge: HORLOGE, alea });
    expect(a).not.toBe(b);
  });

  it('rend un scenario reproductible quand les deux sources sont figees', () => {
    // C'etait la seconde source de non-determinisme, et elle n'etait meme pas signalee : deux
    // executions du meme geste ne produisaient jamais le meme identifiant.
    const figees = { horloge: HORLOGE, alea: () => 0.5 };
    expect(idMesure(figees)).toBe(idMesure(figees));
  });

  it('varie quand le hasard est reel', () => {
    const vus = new Set(Array.from({ length: 50 }, () => idMesure({ horloge: HORLOGE })));
    expect(vus.size).toBeGreaterThan(40);
  });
});
