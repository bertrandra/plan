import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { citer, libelleOuMot, motConnu, poserAvertissementMotsInconnus, signalerMotInconnu } from '../../../src/shell/motsInconnus.js';

// Le socle des replis sur un mot inconnu (fichier d'une version plus recente, ou corrompu) : reconnaitre un mot d'une table, le dire
// une fois par session, l'ecrire tel quel dans un texte. Decision du 30 octobre 2026.

let signaux: string[] = [];
beforeEach(() => { signaux = []; poserAvertissementMotsInconnus((m) => signaux.push(m)); });
afterAll(() => poserAvertissementMotsInconnus(null));

const TABLE = { bois: 'Bois', aluminium: 'Aluminium' };

describe('mots inconnus', () => {
  it('ne reconnait que les clefs propres de la table : ni le prototype, ni un autre type', () => {
    expect(motConnu(TABLE, 'bois')).toBe(true);
    expect(motConnu(TABLE, 'acier')).toBe(false);
    for (const m of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(motConnu(TABLE, m)).toBe(false);
    for (const m of [undefined, null, 3, {}, ['bois']]) expect(motConnu(TABLE, m)).toBe(false);
  });

  it('signale une fois par message et par session', () => {
    for (let k = 0; k < 4; k++) signalerMotInconnu('Matériau inconnu (« acier »), calculé en bois.');
    signalerMotInconnu('Matériau inconnu (« verre »), calculé en bois.');
    expect(signaux).toEqual(['Matériau inconnu (« acier »), calculé en bois.', 'Matériau inconnu (« verre »), calculé en bois.']);
  });

  it('sans document ni rappel pose, un signal ne leve pas', () => {
    poserAvertissementMotsInconnus(null);
    expect(typeof document).toBe('undefined');
    expect(() => signalerMotInconnu('Clôture inconnue (« gabion »), dessinée en palissade bois.')).not.toThrow();
  });

  it('ecrit le libelle d un mot connu, le mot lui-meme sinon, jamais undefined', () => {
    expect(libelleOuMot(TABLE, 'bois')).toBe('Bois');
    expect(libelleOuMot(TABLE, 'bois', (l) => l.toLowerCase())).toBe('bois');
    expect(libelleOuMot(TABLE, 'Acier', (l) => l.toLowerCase())).toBe('Acier');
    expect(libelleOuMot(TABLE, 'constructor')).toBe('constructor');
    expect(citer('acier')).toBe('« acier »');
    expect(signaux).toEqual([]);
  });
});
