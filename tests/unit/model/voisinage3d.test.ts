import { describe, it, expect } from 'vitest';
import { voisinage3dDe, reglerVoisinage3d, apparenceVoisin, graineDe, tirage, melanger, couleurClotureVoisinageDefaut, VOISINAGE_3D_DEFAUT, COULEUR_VITRE_DEFAUT, COULEUR_GRILLAGE_VOISINAGE } from '../../../src/model/voisinage3d.js';
import { fenetres3dDe, reglerFenetres3d, nouvelleFenetre, FENETRES_3D_DEFAUT } from '../../../src/model/fenetres3d.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// L'apparence du voisinage en 3D (MD/spec-toit-ign.md §6.4) : des defauts qui sont le rendu
// d'avant, des reglages completes, et des tirages reproductibles par maison.

const parcelle = (plus: Record<string, unknown> = {}): ObjetPlan => ({ key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: [], ...plus } as unknown as ObjetPlan);

describe('voisinage3dDe', () => {
  it('rend les defauts d avant sans reglage : couleur du plan, vitre bleu-gris, 1 x 1,2 m tous les 2,4 m, grillage', () => {
    const r = voisinage3dDe(null);
    expect(r).toEqual(VOISINAGE_3D_DEFAUT);
    expect(r.maisons.mode).toBe('plan');
    expect(r.fenetres).toMatchObject({ mode: 'unique', couleur: COULEUR_VITRE_DEFAUT, largeurMin: 1, largeurMax: 1, hauteurMin: 1.2, hauteurMax: 1.2, entraxeMin: 2.4, entraxeMax: 2.4 });
    expect(r.cloture).toEqual({ afficher: true, type: 'grillage', couleur: COULEUR_GRILLAGE_VOISINAGE });
  });

  it('complete un reglage partiel, et l ecrit entier sur la parcelle', () => {
    const p = parcelle({ voisinage3d: { cloture: { afficher: false } } });
    expect(voisinage3dDe(p).cloture).toEqual({ afficher: false, type: 'grillage', couleur: COULEUR_GRILLAGE_VOISINAGE });
    expect(voisinage3dDe(p).fenetres.largeurMin).toBe(1);
    reglerVoisinage3d(p, (r) => { r.maisons.mode = 'unique'; });
    expect(p.voisinage3d).toMatchObject({ maisons: { mode: 'unique', couleur: VOISINAGE_3D_DEFAUT.maisons.couleur }, cloture: { afficher: false, type: 'grillage' } });
  });
});

describe('apparenceVoisin', () => {
  it('par defaut, ne touche ni la couleur des murs ni les dimensions', () => {
    const a = apparenceVoisin(VOISINAGE_3D_DEFAUT, 'bati-1');
    expect(a.couleurMur).toBeUndefined();
    expect(a.fenetres).toEqual({ couleur: COULEUR_VITRE_DEFAUT, largeur: 1, hauteur: 1.2, entraxe: 2.4 });
  });

  it('tire deux tons, une nuance et des dimensions entre les bornes, pareil pour la meme cle', () => {
    const r = voisinage3dDe(parcelle({ voisinage3d: {
      maisons: { mode: 'deuxTons', couleur: '#000000', couleur2: '#FFFFFF' },
      fenetres: { mode: 'nuance', couleur: '#000000', couleur2: '#0000FF', largeurMin: 0.8, largeurMax: 1.4, hauteurMin: 1, hauteurMax: 1.6, entraxeMin: 2, entraxeMax: 4 },
    } }));
    const a = apparenceVoisin(r, 'bati-7'), b = apparenceVoisin(r, 'bati-8');
    expect(a).toEqual(apparenceVoisin(r, 'bati-7'));
    expect(a.couleurMur).toMatch(/^#[0-9A-F]{6}$/);
    expect(a.couleurMur).not.toBe(b.couleurMur);
    expect(a.fenetres.couleur).toMatch(/^#00[0-9A-F]{4}$/);
    for (const x of [a, b]) {
      expect(x.fenetres.largeur).toBeGreaterThanOrEqual(0.8); expect(x.fenetres.largeur).toBeLessThanOrEqual(1.4);
      expect(x.fenetres.hauteur).toBeGreaterThanOrEqual(1); expect(x.fenetres.hauteur).toBeLessThanOrEqual(1.6);
      expect(x.fenetres.entraxe).toBeGreaterThanOrEqual(2); expect(x.fenetres.entraxe).toBeLessThanOrEqual(4);
    }
    // Une couleur unique vaut pour toutes.
    const u = voisinage3dDe(parcelle({ voisinage3d: { maisons: { mode: 'unique', couleur: '#ABCDEF' } } }));
    expect(apparenceVoisin(u, 'x').couleurMur).toBe('#ABCDEF');
  });

  it('tire et melange de facon reproductible', () => {
    expect(graineDe('bati-1')).toBe(graineDe('bati-1'));
    expect(graineDe('bati-1')).not.toBe(graineDe('bati-2'));
    const t = tirage(graineDe('a'));
    const v = t();
    expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1);
    expect(melanger('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(melanger('#102030', '#102030', 0.3)).toBe('#102030');
    expect(couleurClotureVoisinageDefaut('haie')).toBe('#4f7a3a');
    expect(couleurClotureVoisinageDefaut('grillage')).toBe(COULEUR_GRILLAGE_VOISINAGE);
  });
});

describe('fenetres3d', () => {
  it('rend les defauts d avant sans reglage, et ecrit la structure entiere', () => {
    const o = parcelle({ key: 'maison', fonction: 'batiment' });
    expect(fenetres3dDe(o)).toEqual(FENETRES_3D_DEFAUT);
    expect(FENETRES_3D_DEFAUT).toEqual({ mode: 'toutes', largeur: 1, hauteur: 1.2, appui: 0.9, entraxe: 2.4 });
    reglerFenetres3d(o, (r) => { r.largeur = 1.4; });
    expect(o.fenetres3d).toEqual({ ...FENETRES_3D_DEFAUT, largeur: 1.4 });
    expect(nouvelleFenetre(fenetres3dDe(o), 2, 3.5)).toEqual({ cote: 2, type: 'fenetre', x: 3.5, y: 0.9, l: 1.4, h: 1.2 });
  });
});
