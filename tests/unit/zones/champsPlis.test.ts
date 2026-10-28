// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { ListeChamps } from '../../../src/zones/composants/Champs.js';
import { groupesDeChamps, type Champ, type ContexteChamps } from '../../../src/ui/champs/types.js';

// Le pli de champs (`repli`, ui/champs/types.ts) : ce qui sert rarement reste monte, dans un
// `<details>` ferme a l'ouverture ; des champs voisins du meme pli vont ensemble.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const rien = () => undefined;
const lecture = (cle: string, repli?: string): Champ => ({ type: 'lecture', cle, libelle: cle, valeur: () => cle, ...(repli ? { repli } : {}) });

describe('les plis de champs', () => {
  it('rangent les voisins d un meme pli ensemble, dans l ordre', () => {
    const g = groupesDeChamps([lecture('a'), lecture('b', 'P'), lecture('c', 'P'), lecture('d'), lecture('e', 'Q')]);
    expect(g.map(x => [x.repli, x.champs.map(c => c.cle).join('')])).toEqual([[null, 'a'], ['P', 'bc'], [null, 'd'], ['Q', 'e']]);
  });

  it('se rendent fermes, champs montes, et laissent les autres en vue', () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    const c = { etat: {}, obj: {} } as unknown as ContexteChamps;
    const champs = [lecture('ouvert'), lecture('plie1', 'Textures'), lecture('plie2', 'Textures'), { ...lecture('cache', 'Textures'), visible: () => false }];
    act(() => { racine.render(createElement(ListeChamps, { champs, c, inspecteur: { appliquer: () => true, executer: rien } })); });
    const pli = hote.querySelector<HTMLDetailsElement>('details.plichamps')!;
    expect(pli.open).toBe(false);
    expect(pli.querySelector('summary')?.textContent).toBe('Textures');
    expect([...pli.querySelectorAll('[data-cle]')].map(e => e.getAttribute('data-cle'))).toEqual(['plie1', 'plie2']);
    expect(hote.querySelector('[data-cle="ouvert"]')?.closest('details')).toBeNull();
    act(() => racine.unmount());
    hote.remove();
  });
});
