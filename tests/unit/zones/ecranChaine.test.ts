// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranChaine } from '../../../src/zones/EcranChaine.js';
import { demandeEcranChaine } from '../../../src/app/ecranChaine.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); act(() => racine.render(createElement(EcranChaine, {}))); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

describe('l ecran de la chaine', () => {
  it('se demande par ?admin&ecran=chaine', () => {
    expect(demandeEcranChaine('?admin&ecran=chaine')).toBe(true);
    expect(demandeEcranChaine('?admin&ecran=regles')).toBe(false);
  });
  it('montre le schema des etapes, chacune ancree, et une section par etape', () => {
    const liens = [...hote.querySelectorAll('.chaineSchema a')];
    expect(liens.length).toBe(7);
    expect(liens[0]?.getAttribute('href')).toBe('#chaine-sources');
    expect(hote.querySelectorAll('section.chaineEtape').length).toBe(7);
    expect(hote.querySelector('#chaine-audit')).not.toBeNull();
  });
  it('dessine une vignette par forme de toit et lucarne, gambrel, demi-croupe, meuniere et rampante compris', () => {
    const noms = [...hote.querySelectorAll('svg.chaineVignette')].map((s) => s.getAttribute('aria-label'));
    expect(noms.length).toBe(12);
    for (const m of ['Gambrel', 'Demi-croupe', 'Lucarne meunière', 'Lucarne rampante']) expect(noms).toContain('Vue 3D : ' + m);
  });
  it('lie vers les ecrans qui existent et dit le mode de chaque ligne en toutes lettres', () => {
    expect([...hote.querySelectorAll('a.chaineEcran')].some((a) => a.getAttribute('href') === '?admin&ecran=regles')).toBe(true);
    expect(hote.querySelector('.chaineMode')?.textContent).toMatch(/Automatique|Manuel/);
    expect(hote.textContent).toContain('Sélection automatique');
    expect(hote.textContent).toContain('Sélection manuelle');
  });
  it('le filtre attenue ce qui n est pas du mode choisi', () => {
    const bouton = [...hote.querySelectorAll('.chaineFiltre button')].find((b) => b.textContent?.startsWith('Manuel')) as HTMLButtonElement;
    act(() => bouton.click());
    expect(bouton.getAttribute('aria-pressed')).toBe('true');
    expect(hote.querySelectorAll('.chaineLigne[data-attenue="oui"]').length).toBeGreaterThan(0);
  });
});
