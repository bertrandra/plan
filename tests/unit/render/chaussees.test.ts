// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { dessinerChaussees, largeurChausseePx, LARGEUR_CHAUSSEE_MIN_PX, BORD_CHAUSSEE_PX } from '../../../src/render/chaussees.js';
import { SVG_CHAUSSEE, SVG_CHAUSSEE_BORD } from '../../../src/render/theme.js';
import { creerScene, versEcran } from '../../../src/geometry/vue.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les rues dessinees sur le plan (option « Rues », MD/spec-rues.md §7) : des rubans a la largeur de la chaussee, cernes d'un bord.

const scene = () => ({ ...creerScene(), W: 800, H: 600 });
const chaussees = [
  { nature: 'Route à 1 chaussée', largeurM: 5, pts: [{ x: -20, y: -5 }, { x: 30, y: -5 }] },
  { nature: 'Chemin', largeurM: 2.5, pts: [{ x: -5, y: -20 }, { x: -5, y: 30 }] },
  // Loin hors de l'ecran : pas ecrite.
  { nature: 'Route à 1 chaussée', largeurM: 5, pts: [{ x: 5000, y: 5000 }, { x: 5100, y: 5000 }] },
];
const parcelle = (tracer: boolean, avecChaussees = true) => ({
  key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
  voisinage3d: { rues: { afficher: false, ...(tracer ? { tracer: true } : {}) } },
  ruesVoisinage: { recupereLe: '', rayonM: 250, rues: [], ...(avecChaussees ? { chaussees } : {}) },
}) as unknown as ObjetPlan;
const groupe = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');

describe('dessinerChaussees', () => {
  it('pose un ruban par largeur, bords d abord puis chaussees, a la largeur de la chaussee a l echelle', () => {
    const g = groupe();
    const s = scene();
    dessinerChaussees(g, [parcelle(true)], s);
    const [bords, pleins] = [...g.children] as SVGGElement[];
    expect(bords!.getAttribute('class')).toBe('chausseesBords');
    expect(pleins!.getAttribute('class')).toBe('chausseesPleins');
    const largeurs = [...pleins!.querySelectorAll('path')].map((p) => Number(p.getAttribute('stroke-width')));
    expect(largeurs).toEqual([largeurChausseePx(5, s.scale), largeurChausseePx(2.5, s.scale)]);
    expect(Number(bords!.querySelector('path')!.getAttribute('stroke-width'))).toBe(largeurChausseePx(5, s.scale) + 2 * BORD_CHAUSSEE_PX);
    expect(pleins!.querySelector('path')!.getAttribute('stroke')).toBe(SVG_CHAUSSEE);
    expect(bords!.querySelector('path')!.getAttribute('stroke')).toBe(SVG_CHAUSSEE_BORD);
    expect(pleins!.querySelector('path')!.getAttribute('stroke-linecap')).toBe('round');
    // Le trace passe par les points de la voie a l'ecran ; la rue hors de l'ecran n'est pas ecrite.
    const a = versEcran(s, { x: -20, y: -5 });
    expect(pleins!.querySelector('path')!.getAttribute('d')).toBe('M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'L' + versEcran(s, { x: 30, y: -5 }).x.toFixed(1) + ' ' + a.y.toFixed(1));
    expect(g.querySelectorAll('path')).toHaveLength(4);
  });
  it('garde une largeur visible de loin', () => {
    expect(largeurChausseePx(5, 0.1)).toBe(LARGEUR_CHAUSSEE_MIN_PX);
    expect(largeurChausseePx(5, 16.5)).toBe(82.5);
  });
  it('ne dessine rien sans l option, sans chaussees lues, la parcelle masquee, et vide le groupe', () => {
    for (const [objets, masque] of [[[parcelle(false)], false], [[parcelle(true, false)], false], [[parcelle(true)], true], [[], false]] as [ObjetPlan[], boolean][]) {
      const g = groupe();
      g.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
      dessinerChaussees(g, objets, scene(), () => masque);
      expect(g.childNodes).toHaveLength(0);
    }
  });
});
