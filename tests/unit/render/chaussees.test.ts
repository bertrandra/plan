// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { dessinerChaussees, largeurChausseePx, bordsChaussee, suitesAvecTrottoir, LARGEUR_CHAUSSEE_MIN_PX, BORD_CHAUSSEE_PX } from '../../../src/render/chaussees.js';
import { SVG_CHAUSSEE, SVG_CHAUSSEE_BORD, SVG_TROTTOIR, SVG_CHAUSSEE_REELLE, SVG_TROTTOIR_REEL, SVG_BORDURE_REELLE } from '../../../src/render/theme.js';
import { creerScene } from '../../../src/geometry/vue.js';
import type { StationRue } from '../../../src/model/trottoirs.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les rues dessinees sur le plan (option « Rues », MD/spec-rues.md §7 et §8) : la chaussee entre ses bords, les trottoirs jusqu'aux
// limites des parcelles, un trait de bordure entre les deux.

const scene = () => ({ ...creerScene(), W: 800, H: 600 });
const chaussees = [
  { nature: 'Route à 1 chaussée', largeurM: 7, pts: [{ x: -20, y: -5 }, { x: 30, y: -5 }] },
  // Loin hors de l'ecran : pas ecrite.
  { nature: 'Route à 1 chaussée', largeurM: 5, pts: [{ x: 5000, y: 5000 }, { x: 5100, y: 5000 }] },
];
const parcelle = (tracer: boolean, avecChaussees = true, couleurs?: 'reelles') => ({
  key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [{ x: -15, y: 0 }, { x: 25, y: 0 }, { x: 25, y: 20 }, { x: -15, y: 20 }],
  voisinage3d: { rues: { afficher: false, ...(tracer ? { tracer: true } : {}), ...(couleurs ? { couleurs } : {}) } },
  ruesVoisinage: { recupereLe: '', rayonM: 250, rues: [], ...(avecChaussees ? { chaussees } : {}) },
}) as unknown as ObjetPlan;
const voisine = { key: 'v', fonction: 'terrain', type: 'polygon', voisinage: true, pts: [{ x: -15, y: -10 }, { x: 25, y: -10 }, { x: 25, y: -30 }, { x: -15, y: -30 }] } as unknown as ObjetPlan;
const groupe = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');
const classes = (g: SVGGElement) => [...g.children].map((c) => c.getAttribute('class'));

describe('dessinerChaussees', () => {
  it('pose les bords, les chaussees, puis les trottoirs et leur bordure, aux encres « Plan »', () => {
    const g = groupe();
    dessinerChaussees(g, [parcelle(true), voisine], scene());
    expect(classes(g)).toEqual(['chausseesBords', 'chausseesPleins', 'trottoirs', 'trottoirsBordures']);
    const [bords, pleins, trottoirs, bordures] = [...g.children].map((c) => c.querySelector('path')!);
    expect(bords!.getAttribute('fill')).toBe(SVG_CHAUSSEE_BORD);
    expect(Number(bords!.getAttribute('stroke-width'))).toBe(2 * BORD_CHAUSSEE_PX);
    expect(pleins!.getAttribute('fill')).toBe(SVG_CHAUSSEE);
    expect(trottoirs!.getAttribute('fill')).toBe(SVG_TROTTOIR);
    expect(bordures!.getAttribute('stroke')).toBe(SVG_CHAUSSEE_BORD);
    expect(bordures!.getAttribute('fill')).toBe('none');
    // La chaussee hors de l'ecran n'est pas ecrite : une chaussee et ses deux bouts, deux trottoirs et leurs deux bordures.
    expect((pleins!.getAttribute('d')!.match(/Z/g) ?? []).length).toBe(3);
    expect((trottoirs!.getAttribute('d')!.match(/Z/g) ?? []).length).toBe(2);
    expect((bordures!.getAttribute('d')!.match(/M/g) ?? []).length).toBe(2);
  });
  it('prend les encres « Reelles » quand elles sont choisies', () => {
    const g = groupe();
    dessinerChaussees(g, [parcelle(true, true, 'reelles'), voisine], scene());
    const [bords, pleins, trottoirs, bordures] = [...g.children].map((c) => c.querySelector('path')!);
    expect([bords!.getAttribute('fill'), pleins!.getAttribute('fill'), trottoirs!.getAttribute('fill'), bordures!.getAttribute('stroke')])
      .toEqual([SVG_BORDURE_REELLE, SVG_CHAUSSEE_REELLE, SVG_TROTTOIR_REEL, SVG_BORDURE_REELLE]);
  });
  it('sans parcelle a portee, la chaussee seule, comme avant', () => {
    const loin = { ...voisine, pts: [{ x: -15, y: 200 }, { x: 25, y: 200 }, { x: 25, y: 220 }] } as unknown as ObjetPlan;
    const p = { ...parcelle(true), pts: (loin as unknown as { pts: unknown }).pts } as unknown as ObjetPlan;
    const g = groupe();
    dessinerChaussees(g, [p], scene());
    expect(classes(g)).toEqual(['chausseesBords', 'chausseesPleins']);
  });
  it('garde une largeur visible de loin', () => {
    expect(largeurChausseePx(5, 0.1)).toBe(LARGEUR_CHAUSSEE_MIN_PX);
    expect(largeurChausseePx(5, 16.5)).toBe(82.5);
    const s = { x: 0, y: 0, nx: 0, ny: 1, chausseeG: 2, chausseeD: 1, trottoirG: null, trottoirD: null } as StationRue;
    expect(bordsChaussee(s, 3)).toEqual({ g: 3, d: 0 });
    expect(bordsChaussee(s, 0.5)).toEqual({ g: 2, d: 1 });
  });
  it('ne fait un ruban de trottoir que de deux mesures consecutives au moins', () => {
    const st = (t: number | null) => ({ x: 0, y: 0, nx: 0, ny: 1, chausseeG: 1, chausseeD: -1, trottoirG: t, trottoirD: null }) as StationRue;
    expect(suitesAvecTrottoir([st(2), st(2), st(null), st(2), st(null), st(2), st(2), st(2)], 'G').map((s) => s.length)).toEqual([2, 3]);
    expect(suitesAvecTrottoir([st(2), st(2)], 'D')).toEqual([]);
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
