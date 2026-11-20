// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IndicationFormalite } from '../../../../src/zones/composants/IndicationFormalite.js';
import { formaliteDuProjet } from '../../../../src/engine/regles/plu/formalite.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// « Quelle formalité pour ce projet ? » a l'ecran (zones/composants/IndicationFormalite.tsx) : la reponse en mots, ses raisons, ses
// reserves, et toujours la phrase qui dit que ce n'est pas une autorisation.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

const rect = (x: number, y: number, L: number, l: number) => [{ x, y }, { x: x + L, y }, { x: x + L, y: y + l }, { x, y: y + l }];
const parcelle = { key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 40, 40), cadastre: { idu: 'x' } };
const pergola = { key: 'p', name: 'Pergola', type: 'polygon', fonction: 'pergola', pts: rect(20, 20, 4, 3), pergola: { debord: 0 } };
const monter = (...objets: unknown[]) => act(() => racine.render(createElement(IndicationFormalite, { indication: formaliteDuProjet(objets as ObjetPlan[]), id: 'essai' })));

describe('IndicationFormalite', () => {
  it('ecrit la reponse, ses raisons, et qu’elle n’est qu’une indication', () => {
    monter(parcelle, pergola);
    const s = hote.querySelector('section#essai')!;
    expect(s.getAttribute('data-formalite')).toBe('declaration');
    expect(s.getAttribute('aria-labelledby')).toBe('essaiTitre');
    expect(hote.querySelector('#essaiTitre')!.textContent).toBe('Quelle formalité pour ce projet ?');
    expect(hote.querySelector('.formaliteReponse')!.textContent).toBe('Déclaration préalable, d’après les règles nationales.');
    expect([...hote.querySelectorAll('.formaliteRaisons li')].map((li) => li.getAttribute('data-raison'))).toEqual(['emprise']);
    // Le PLU n'a pas ete interroge : la reserve le dit.
    expect(hote.querySelector('.formaliteReserve')!.textContent).toMatch(/PLU de la parcelle n’a pas été interrogé/);
    expect(hote.querySelector('.formaliteFoi')!.textContent).toBe('C’est une indication, pas une autorisation : le PLU de la commune et la mairie font foi.');
    expect(hote.textContent).not.toMatch(/autorisé|vous pouvez construire/i);
  });

  it('dit « à vérifier en mairie » quand les regles nationales ne tranchent pas, et qu’il n’y a rien a declarer sans ouvrage', () => {
    monter(parcelle, { ...pergola, pts: rect(20, 20, 6, 5), pergola: { debord: 0, adossee: true, toit: 'appentis' } });
    expect(hote.querySelector('.formaliteReponse')!.textContent).toBe('À vérifier en mairie : les règles nationales ne tranchent pas avec ce que le plan sait.');
    monter(parcelle);
    expect(hote.querySelector('.formaliteReponse')!.textContent).toBe('Aucune formalité, d’après les règles nationales.');
    expect(hote.textContent).toMatch(/rien à déclarer d’après ce qu’il sait/);
    expect(hote.querySelector('.formaliteRaisons')).toBeNull();
  });
});
