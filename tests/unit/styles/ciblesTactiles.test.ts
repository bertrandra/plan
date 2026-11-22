import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Les cibles tactiles des champs de l'inspecteur font 44 px (audit de l'inspecteur, 22 novembre 2026, lot A4 :
// 421 cibles trop petites relevees au telephone). La feuille de style est la seule a le dire : ce test lit les
// regles qui portent la zone de saisie du pas a pas, l'interrupteur, les choix segmentes, les boutons d'un
// champ et le curseur, pour qu'un retour en arriere se voie.

const css = readFileSync('src/styles/app.css', 'utf8');
const regle = (selecteur: string): string => {
  const i = css.indexOf(selecteur + '{');
  if (i < 0) throw new Error('regle absente : ' + selecteur);
  return css.slice(i, css.indexOf('}', i));
};

describe('les cibles tactiles des champs', () => {
  it('la zone de saisie d un pas a pas prend 44 px dans les deux sens', () => {
    const r = regle('.pas input[type=text]');
    expect(r).toContain('min-height:44px');
    expect(r).toContain('min-width:44px');
  });
  it('l interrupteur fait 44 px de haut', () => {
    expect(regle('.interrupteur')).toContain('height:44px');
  });
  it('au doigt, un choix segmente, un bouton de champ et le curseur font 44 px', () => {
    expect(regle('html:not([data-classe="large"]) .segmente button')).toMatch(/min-height:44px; min-width:44px/);
    expect(regle('html:not([data-classe="large"]) :is(#zoneInspecteur, .hoteChamps) :is(.champTexture, .champBouton) button')).toContain('min-width:44px');
    expect(regle('html:not([data-classe="large"]) :is(#zoneInspecteur, .hoteChamps) .champCurseur input[type=range]')).toContain('height:44px');
  });
});
