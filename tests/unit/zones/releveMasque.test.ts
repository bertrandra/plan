// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CELLULE_MASQUE_M, masqueDeFusion, zonesDuMasque, type MasqueReleve } from '../../../src/facade/releve/masque.js';
import { EtapeResultat, type Verification } from '../../../src/zones/releve/EtapeResultat.js';
import { useOuvertures } from '../../../src/zones/releve/ouvertures.js';
import type { Resultat } from '../../../src/facade/releve/serie.js';

// Le masque d'occlusion d'une fusion de vues, hachure dans l'elevation du releve (lot G20, F§8) : le
// masque pixel par pixel devient quelques rectangles en fractions du mur ; la verification les
// hachure, avec une legende, et ne dit plus « complete a la teinte du mur » de ce qui montre l'obstacle.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Un masque de `l` x `h` pixels, cache dans les rectangles donnes (en pixels, bornes exclues a droite). */
function masque(l: number, h: number, rects: [number, number, number, number][]): Uint8Array {
  const m = new Uint8Array(l * h);
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * l + x] = 1;
  return m;
}

describe('les zones du masque', () => {
  it('fond les rangees identiques en un rectangle, en fractions du mur', () => {
    // Un mur de 100 x 50 px, une voiture de (20, 30) a (60, 50), cellules de 10 px.
    expect(zonesDuMasque(masque(100, 50, [[20, 30, 60, 50]]), 100, 50, 10)).toEqual([{ x: 0.2, y: 0.6, l: 0.4, h: 0.4 }]);
  });

  it('garde une cellule cachee a plus de la moitie, pas en deca', () => {
    expect(zonesDuMasque(masque(20, 10, [[0, 0, 6, 10]]), 20, 10, 10)).toEqual([{ x: 0, y: 0, l: 0.5, h: 1 }]);
    expect(zonesDuMasque(masque(20, 10, [[0, 0, 5, 10]]), 20, 10, 10)).toEqual([]);
  });

  it('ouvre un rectangle par plage, et coupe ou la plage change', () => {
    // Une haie basse sur toute la largeur, et au-dessus une voiture a gauche : deux etages de plages.
    const z = zonesDuMasque(masque(40, 40, [[0, 30, 40, 40], [0, 10, 20, 30]]), 40, 40, 10);
    expect(z).toHaveLength(2);
    expect(z).toContainEqual({ x: 0, y: 0.25, l: 0.5, h: 0.5 });
    expect(z).toContainEqual({ x: 0, y: 0.75, l: 1, h: 0.25 });
    // Deux obstacles sur la meme rangee : deux rectangles.
    expect(zonesDuMasque(masque(40, 10, [[0, 0, 10, 10], [30, 0, 40, 10]]), 40, 10, 10)).toHaveLength(2);
  });

  it('borne les cellules du bord a l image', () => {
    const [z] = zonesDuMasque(masque(25, 15, [[20, 10, 25, 15]]), 25, 15, 10);
    expect(z?.x).toBeCloseTo(0.8);
    expect(z!.x + z!.l).toBeCloseTo(1);
    expect(z!.y + z!.h).toBeCloseTo(1);
  });

  it('ne rend rien d un masque vide, mal dimensionne ou d une photo seule', () => {
    const elevation = { largeur: 90, hauteur: 60, donnees: new Uint8ClampedArray(90 * 60 * 4) };
    expect(masqueDeFusion(null, 9)).toBeNull();
    expect(masqueDeFusion({ occlusion: new Uint8Array(90 * 60), masque: 0, elevation }, 9)).toBeNull();
    expect(zonesDuMasque(new Uint8Array(10), 90, 60, 10)).toEqual([]);
    // 10 px par metre : une cellule de 10 cm vaut un pixel.
    const m = masqueDeFusion({ occlusion: masque(90, 60, [[0, 40, 30, 60]]), masque: 0.111, elevation }, 9);
    expect(CELLULE_MASQUE_M).toBe(0.1);
    expect(m?.part).toBe(0.111);
    expect(m?.zones).toEqual([{ x: 0, y: 40 / 60, l: 1 / 3, h: 20 / 60 }]);
  });
});

describe('le masque dans la verification', () => {
  let racine: Root, hote: HTMLElement;
  beforeAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
    const proto = window.SVGElement.prototype as unknown as Record<string, unknown>;
    proto.getScreenCTM = () => null;
  });
  afterEach(() => { act(() => racine.unmount()); hote.remove(); });

  function monter(r: Resultat) {
    function Banc() {
      const o = useOuvertures();
      useEffect(() => o.poser({ ouvertures: [{ type: 'fenetre', x: 1, y: 0.9, l: 1.2, h: 1.35, confiance: 0.95, source: 'detectee' }], devinees: [] }), []);
      const v: Verification = {
        resultat: r, largeur: 10, hauteurMur: 6, ouvertures: o.ouvertures, setOuvertures: o.setOuvertures, choisie: o.choisie, setChoisie: o.setChoisie,
        devinees: o.devinees, garder: o.garder, ecarter: o.ecarter, toit: null, setToit: () => {}, appliquerToit: false, setAppliquerToit: () => {}, toitAutomatique: null,
        contour: [], cote: 0, partieBasse: null, setPartieBasse: () => {}, hauteurEstimee: 6, hauteurMesuree: true, corrigerHauteur: () => {},
      };
      return createElement(EtapeResultat, { v, onRevoir: () => {}, onValider: () => {} });
    }
    hote = document.createElement('div');
    document.body.appendChild(hote);
    racine = createRoot(hote);
    act(() => racine.render(createElement(Banc)));
  }
  const base: Resultat = { partieBasse: null, texture: 'data:', hauteurTexture: 6.5, hauteurMesuree: true, couverture: 1, toitPropose: null, avis: null };

  it('hachure ce qui reste cache sur toutes les vues, a l echelle du mur, et le legende', () => {
    const m: MasqueReleve = { zones: [{ x: 0.2, y: 0.6, l: 0.4, h: 0.4 }], part: 0.17 };
    monter({ ...base, couverture: 0.83, masque: m });
    const g = hote.querySelector('g.releveMasque');
    expect(g?.getAttribute('pointer-events')).toBe('none');
    const chemins = g?.querySelectorAll('path') ?? [];
    expect(chemins).toHaveLength(2);
    // 10 m x 6 m : la zone va de x = 2 a 6 m, de 3,6 m sous l'egout jusqu'au sol.
    expect(chemins[1]?.getAttribute('d')).toBe('M2 3.6h4v2.4h-4Z');
    const motif = g?.querySelector('pattern')?.getAttribute('id');
    expect(motif).toBeTruthy();
    expect(chemins[1]?.getAttribute('fill')).toBe(`url(#${motif})`);
    expect(hote.querySelector('.releveLegendeMasque')?.textContent).toBe('Hachuré : caché sur toutes les photos par ce qui est devant le mur (voiture, haie…), 17 % du mur.');
    // Le masque montre l'obstacle, pas la teinte du mur : il ne compte pas dans « le reste est complete ».
    expect(hote.textContent).not.toContain('complété à la teinte du mur');
    // Le hachure passe sous les ouvertures, qui restent a saisir.
    const enfants = [...(hote.querySelector('svg.releveElevation')?.children ?? [])];
    expect(enfants.findIndex((e) => e.matches('g.releveMasque'))).toBeLessThan(enfants.findIndex((e) => e.matches('g.releveOuverture')));
  });

  it('dit la part hors des photos d une fusion, sans le masque', () => {
    monter({ ...base, couverture: 0.7, masque: { zones: [{ x: 0, y: 0.5, l: 0.2, h: 0.5 }], part: 0.1 } });
    expect(hote.textContent).toContain('Les photos couvraient 80 % du mur ; le reste est complété à la teinte du mur.');
  });

  it('sans masque, rien n est hachure et la photo seule garde son avis', () => {
    monter({ ...base, couverture: 0.8 });
    expect(hote.querySelector('g.releveMasque')).toBeNull();
    expect(hote.querySelector('.releveLegendeMasque')).toBeNull();
    expect(hote.textContent).toContain('La photo couvrait 80 % du mur ; le reste est complété à la teinte du mur.');
  });
});
