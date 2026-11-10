// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { redessinerSiChange, cleDesCalques, cleDesCalquesEnMetres } from '../../../src/render/calquesGardes.js';
import type { EtatApp } from '../../../src/core/state.js';
import { poserEnQueue } from '../../../src/render/empilement.js';

// Les calques du dessus du plan ne se refont que si leur cle change ; en developpement, un calque saute est quand meme redessine
// et compare, et un ecart s'ecrit `[cle de version]`. Leur ordre se pose sans rien deplacer s'il est deja le bon.

describe('redessinerSiChange', () => {
  afterEach(() => { vi.restoreAllMocks(); delete (globalThis as { __sansVerifierCles?: boolean }).__sansVerifierCles; });

  it('une cle inchangee ne redessine pas (paquet livre), une cle changee redessine', () => {
    (globalThis as { __sansVerifierCles?: boolean }).__sansVerifierCles = true;
    const g = document.createElement('div');
    let n = 0;
    const dessiner = () => { n++; g.innerHTML = '<span>' + n + '</span>'; };
    redessinerSiChange(g, 'essai', 'a', dessiner);
    redessinerSiChange(g, 'essai', 'a', dessiner);
    expect(n).toBe(1);
    redessinerSiChange(g, 'essai', 'b', dessiner);
    expect(n).toBe(2);
  });

  it('en developpement, un dessin qui change sous la meme cle est signale', () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const g = document.createElement('div');
    let contenu = 'x';
    const dessiner = () => { g.innerHTML = contenu; };
    redessinerSiChange(g, 'essai', 'a', dessiner);
    redessinerSiChange(g, 'essai', 'a', dessiner);
    expect(erreur).not.toHaveBeenCalled();
    contenu = 'y';
    redessinerSiChange(g, 'essai', 'a', dessiner);
    expect(erreur.mock.calls.some((c) => String(c[0]).startsWith('[cle de version] calque « essai »'))).toBe(true);
    expect(g.innerHTML).toBe('y');
  });
});

describe('la cle d un calque', () => {
  const objets: EtatApp['objects'] = [];
  const etat = (scale: number, x: number) => ({
    objects: objets, scene: { scale, origine: { x, y: 0 }, W: 100, H: 100 }, selectedKey: null, terrasseSelectedKey: null, isolement: null,
    voisinageVisible: true, calquesVisibles: false, showNorth: true, parasol: { ombreAffichee: true, carteAffichee: false }, measures: []
  }) as unknown as EtatApp;
  it('lit le repere du dessin, sauf pour un calque dessine en metres (render/repere.ts)', () => {
    expect(cleDesCalques(etat(10, 0), () => false)).not.toBe(cleDesCalques(etat(20, 0), () => false));
    expect(cleDesCalquesEnMetres(etat(10, 0), () => false)).toBe(cleDesCalquesEnMetres(etat(20, 5), () => false));
    // Ce qui depend malgre tout de l'echelle se passe en plus.
    expect(cleDesCalquesEnMetres(etat(10, 0), () => false, 1.4)).not.toBe(cleDesCalquesEnMetres(etat(10, 0), () => false, 0.4));
  });
});

describe('poserEnQueue', () => {
  const parent = () => { const p = document.createElement('div'); ['a', 'b', 'c', 'd'].forEach((id) => { const e = document.createElement('i'); e.id = id; p.appendChild(e); }); return p; };
  const ordre = (p: HTMLElement) => [...p.children].map((e) => e.id).join('');
  const el = (p: HTMLElement, id: string) => p.querySelector('#' + id) as HTMLElement;

  it('ne deplace rien quand la queue est deja dans l ordre', () => {
    const p = parent();
    const mutations: MutationRecord[] = [];
    const mo = new MutationObserver((l) => mutations.push(...l));
    mo.observe(p, { childList: true });
    poserEnQueue(p, [el(p, 'c'), el(p, 'd')]);
    mutations.push(...mo.takeRecords()); mo.disconnect();
    expect(mutations).toEqual([]);
    expect(ordre(p)).toBe('abcd');
  });

  it('fait comme des appendChild successifs sinon, la derniere place d un element nomme deux fois comptant', () => {
    const p = parent();
    poserEnQueue(p, [el(p, 'b'), el(p, 'a'), el(p, 'b')]);
    expect(ordre(p)).toBe('cdab');
  });

  it('les suivants deja derriere ne sont pas un desordre ; remis apres si l ordre est refait', () => {
    const p = parent();
    poserEnQueue(p, [el(p, 'b'), el(p, 'c')], [el(p, 'd')]);
    expect(ordre(p)).toBe('abcd');
    poserEnQueue(p, [el(p, 'a')], [el(p, 'd')]);
    expect(ordre(p)).toBe('bcad');
  });
});
