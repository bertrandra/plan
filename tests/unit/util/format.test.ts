import { describe, it, expect } from 'vitest';
import { nombreFr, formatHeureMin, slugFichier, horodatageFichier, tailleFichier } from '../../../src/util/format.js';
import { escapeHtml, escapeXml } from '../../../src/util/escape.js';

describe('nombreFr', () => {
  it('lit la virgule comme separateur decimal', () => {
    expect(nombreFr('3,5')).toBe(3.5);
  });
  it('lit aussi le point', () => {
    expect(nombreFr('3.5')).toBe(3.5);
  });
  it('rend null - et non NaN - sur une saisie vide ou illisible', () => {
    // La distinction porte du sens pour les appelants : « rien saisi » n'est pas « zero ».
    expect(nombreFr('')).toBeNull();
    expect(nombreFr(null)).toBeNull();
    expect(nombreFr(undefined)).toBeNull();
    expect(nombreFr('abc')).toBeNull();
  });
  it('accepte zero', () => {
    expect(nombreFr('0')).toBe(0);
  });
});

describe('formatHeureMin', () => {
  it('formate midi cinq', () => {
    expect(formatHeureMin(725)).toBe('12:05');
  });
  it('complete les zeros du matin', () => {
    expect(formatHeureMin(65)).toBe('01:05');
  });
  it('formate minuit', () => {
    expect(formatHeureMin(0)).toBe('00:00');
  });
});

describe('slugFichier', () => {
  it('retire les accents et remplace le reste par des tirets', () => {
    expect(slugFichier('Parcelle AE 101 — Le Vésinet')).toBe('parcelle-ae-101-le-vesinet');
  });
  it('ne laisse pas de tiret en bord de chaine', () => {
    expect(slugFichier('  !! Plan !!  ')).toBe('plan');
  });
  it('retombe sur « projet » quand il ne reste rien', () => {
    expect(slugFichier('!!!')).toBe('projet');
    expect(slugFichier('')).toBe('projet');
    expect(slugFichier(null)).toBe('projet');
  });
  it('tronque a 60 caracteres', () => {
    expect(slugFichier('a'.repeat(80))).toHaveLength(60);
  });
});

describe('horodatageFichier', () => {
  it('rend huit chiffres AAAAMMJJ', () => {
    expect(horodatageFichier()).toMatch(/^\d{8}$/);
  });
});

describe('echappement', () => {
  it('echappe l apostrophe differemment en HTML et en XML', () => {
    // Ce n'est pas un detail de style : le SVG exporte doit rester du XML valide, et &#39;
    // n'y est pas une entite predefinie.
    expect(escapeHtml("l'entree")).toBe('l&#39;entree');
    expect(escapeXml("l'entree")).toBe('l&apos;entree');
  });
  it('echappe les chevrons et l esperluette', () => {
    expect(escapeHtml('<a & b>')).toBe('&lt;a &amp; b&gt;');
    expect(escapeXml('<a & b>')).toBe('&lt;a &amp; b&gt;');
  });
  it('echappe l esperluette avant le reste, sans double echappement', () => {
    expect(escapeXml('&lt;')).toBe('&amp;lt;');
  });
});

describe('tailleFichier', () => {
  it('ecrit les Ko en entier et les Mo au dixieme, a la francaise', () => {
    expect(tailleFichier(300)).toBe('1 Ko');
    expect(tailleFichier(820 * 1024)).toBe('820 Ko');
    expect(tailleFichier(1.44 * 1024 * 1024)).toBe('1,4 Mo');
    expect(tailleFichier(2.5 * 1024 * 1024)).toBe('2,5 Mo');
  });
});
