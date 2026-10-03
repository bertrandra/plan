import { describe, it, expect } from 'vitest';
import { JETONS } from '../../../src/styles/jetons.js';
import { couleursParDefaut, cssPalette, documentPalette, ecartsAuxOrigines, lireDocumentPalette, memesCouleurs } from '../../../src/styles/paletteServeur.js';

// La palette du serveur (styles/paletteServeur.ts) : elle ne remplace que ce qu'elle porte de
// valide, et la feuille qu'elle engendre ne deteint pas d'un theme sur l'autre.

describe('la palette du serveur', () => {
  it('n est lue que si c est une palette', () => {
    expect(lireDocumentPalette(null)).toBe(null);
    expect(lireDocumentPalette({ couleurs: {} })).toBe(null);
    expect(lireDocumentPalette({ format: 'plan-controleurs' })).toBe(null);
  });

  it('remplace les couleurs valides, ignore le reste, garde l origine ailleurs', () => {
    const lue = lireDocumentPalette({
      format: 'plan-palette', modifieLe: '2026-10-03T08:00:00.000Z',
      couleurs: { clair: { accent: '#336699', ink: 'rouge', inconnu: '#000000' }, sombre: { accent: '#88aacc' }, autre: { accent: '#111111' } }
    })!;
    expect(lue.modifieLe).toBe('2026-10-03T08:00:00.000Z');
    expect(lue.couleurs.clair.accent).toBe('#336699');
    expect(lue.couleurs.sombre.accent).toBe('#88AACC');
    expect(lue.couleurs.clair.ink).toBe(JETONS.clair.ink);
    expect(Object.keys(lue.couleurs.clair)).toEqual(Object.keys(JETONS.clair));
    expect(ecartsAuxOrigines(lue.couleurs)).toEqual([{ theme: 'clair', nom: 'accent' }, { theme: 'sombre', nom: 'accent' }]);
  });

  it('fait l aller-retour par le document exporte', () => {
    const c = couleursParDefaut();
    c.clair.ok = '#2E7D32';
    const doc = documentPalette(c, '2026-10-03T09:00:00.000Z');
    expect(doc.format).toBe('plan-palette');
    expect(memesCouleurs(lireDocumentPalette(JSON.parse(JSON.stringify(doc)))!.couleurs, c)).toBe(true);
  });

  it('engendre une feuille vide a l origine, et ne deteint pas d un theme sur l autre', () => {
    expect(cssPalette(couleursParDefaut())).toBe('');
    const c = couleursParDefaut();
    c.clair.accent = '#336699';
    const css = cssPalette(c);
    // Le reglage clair est enferme hors du theme sombre : pose apres app.css, un :root nu
    // l'emporterait aussi sur le bloc sombre.
    expect(css).toBe('@media not all and (prefers-color-scheme: dark){:root{--accent:#336699;}}');
    c.sombre.paper = '#000000';
    expect(cssPalette(c)).toContain('@media (prefers-color-scheme: dark){:root{--paper:#000000;}}');
  });
});
