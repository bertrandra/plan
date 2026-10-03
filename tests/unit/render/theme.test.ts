// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import * as theme from '../../../src/render/theme.js';
import { JETONS } from '../../../src/styles/jetons.js';
import { couleursParDefaut } from '../../../src/styles/paletteServeur.js';
import { appliquerPalette } from '../../../src/app/paletteServeur.js';

describe('les encres du plan suivent la palette', () => {
  afterEach(() => { theme.poserEncres(); document.getElementById('paletteServeur')?.remove(); });

  it('partent des jetons d origine du theme affiche', () => {
    const j = JETONS[theme.themeSombre ? 'sombre' : 'clair'];
    expect(theme.SVG_INK).toBe(j.ink);
    expect(theme.SVG_GRID_MAJOR).toBe(j.rule);
    expect(theme.SVG_LABEL_HALO).toBe(j.paper + 'cc');
    expect(theme.SVG_POIGNEE).toBe(j.accent);
    expect(theme.SVG_POIGNEE_FOND).toBe(j['panel-bg']);
    expect(theme.SVG_PASTILLE).toBe(j.ink);
    expect(theme.SVG_PASTILLE_TEXTE).toBe(j['on-ink']);
  });

  it('se reprennent dans la palette du serveur, et le plan est prie de se redessiner', () => {
    const couleurs = couleursParDefaut();
    couleurs.clair = { ...couleurs.clair, ink: '#112233', accent: '#336699', rule: '#ABCDEF' };
    let demandes = 0;
    const compter = () => { demandes++; };
    window.addEventListener(theme.EVENEMENT_ENCRES, compter);
    appliquerPalette(couleurs);
    window.removeEventListener(theme.EVENEMENT_ENCRES, compter);
    expect(demandes).toBe(1);
    expect(theme.SVG_INK).toBe('#112233');
    expect(theme.SVG_PASTILLE).toBe('#112233');
    expect(theme.SVG_POIGNEE).toBe('#336699');
    expect(theme.SVG_GRID_MAJOR).toBe('#ABCDEF');
    // Les cotes gardent leur bleu : ce n'est pas un jeton.
    expect(theme.SVG_MEASURE_LINE).toBe('#1E6B8C');
    theme.poserEncres();
    expect(theme.SVG_INK).toBe(JETONS.clair.ink);
  });
});
