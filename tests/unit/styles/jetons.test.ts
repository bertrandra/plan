import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JETONS, PAIRES_CONTRASTE, contraste } from '../../../src/styles/jetons.js';

// Les jetons de couleur (MD/spec-ihm-mobile.md §5.1) : declares dans la feuille avec la valeur de
// jetons.ts, dans les deux themes, et lisibles.

const css = readFileSync(resolve(__dirname, '../../../src/styles/app.css'), 'utf8');

/** Le premier bloc `:root{…}` (clair), et celui du theme sombre du systeme. */
const blocClair = css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{')));
const debutSombre = css.indexOf('@media (prefers-color-scheme: dark)');
const blocSombre = css.slice(debutSombre, css.indexOf('}', css.indexOf(':root', debutSombre)));

describe('les jetons de couleur', () => {
  for (const [theme, bloc] of [['clair', blocClair], ['sombre', blocSombre]] as const) {
    it('sont tous declares dans la feuille, en ' + theme, () => {
      const manques = Object.entries(JETONS[theme])
        .filter(([nom, valeur]) => !bloc.replace(/\s+/g, '').toLowerCase().includes(('--' + nom + ':' + valeur + ';').toLowerCase()))
        .map(([nom, valeur]) => '--' + nom + ':' + valeur);
      expect(manques).toEqual([]);
    });

    it('gardent le texte lisible, en ' + theme, () => {
      const faibles = PAIRES_CONTRASTE
        .map(([texte, fond, min]) => ({ texte, fond, min, r: contraste(JETONS[theme][texte], JETONS[theme][fond]) }))
        .filter((p) => p.r < p.min)
        .map((p) => p.texte + ' sur ' + p.fond + ' : ' + p.r.toFixed(2) + ' < ' + p.min);
      expect(faibles).toEqual([]);
    });
  }

  it('ne laisse plus de couleur en dur dans la feuille, hors des blocs de jetons', () => {
    // Les ombres et les voiles portent leur teinte en rgba() par variable ; les couleurs pleines
    // passent toutes par un jeton. Seule exception tenue : les couleurs d'etat de la pastille de la
    // porte, qui passent elles aussi par des jetons (--ok, --danger).
    const horsJetons = css.slice(0, css.indexOf(':root{')) + css.slice(css.indexOf('}', css.indexOf(':root', debutSombre)) + 1);
    const couleurs = horsJetons.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    expect(couleurs).toEqual([]);
  });
});
