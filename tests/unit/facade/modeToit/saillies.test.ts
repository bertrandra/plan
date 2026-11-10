import { describe, it, expect } from 'vitest';
import { appliquerPiece } from '../../../../src/three/gestesToits.js';
import { corpsDeSaillie, empriseDeSaillie, facettesBowWindow, vitresBowWindow, replacerSaillie, retirerSaillie, murDuCorps, murLePlusProche } from '../../../../src/facade/modeToit/saillies.js';
import { saillieValide } from '../../../../src/model/corpsToitEtendu.js';
import { repere } from '../../../../src/facade/toits/toitCorps.js';
import type { CorpsToit, ObjetPlan, SaillieFacade } from '../../../../src/model/types.js';

const maison = (): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 7, egouts: [3.5, 3.5], pignons: [], ecart: 0 });
const bow = (plus: Partial<SaillieFacade> = {}): SaillieFacade => ({ genre: 'bow-window', hote: 0, mur: 0, centreM: 5, largeurM: 2.4, profondeurM: 0.8, forme: 'rectangle', niveau: 'rdc', toit: 'pan', ...plus });

describe('le placement d une saillie', () => {
  it('sort du mur du corps, jamais vers l interieur', () => {
    const h = maison();
    for (let i = 0; i < 4; i++) {
      const { n, a } = murDuCorps(h, i);
      const c = corpsDeSaillie(h, bow({ mur: i, centreM: 2 }));
      const loin = c.pts[3]!;
      // Le point exterieur est du cote de la normale sortante.
      expect((loin.x - c.pts[0]!.x) * n.x + (loin.y - c.pts[0]!.y) * n.y).toBeGreaterThan(0.7);
      expect(a).toBeDefined();
    }
  });
  it('tient sur son mur : largeur et position sont bornees', () => {
    const c = corpsDeSaillie(maison(), bow({ largeurM: 40, centreM: -3 }));
    expect(repere(c.pts).L).toBeLessThanOrEqual(9.8);
    expect(c.saillie!.centreM).toBeGreaterThanOrEqual(c.saillie!.largeurM / 2);
  });
  it('un bow sous le 1er etage monte a un rez-de-chaussee, un bow jusqu au toit a l egout de la maison', () => {
    expect(Math.min(...corpsDeSaillie(maison(), bow({ niveau: 'rdc' })).egouts)).toBeCloseTo(2.7, 2);
    expect(Math.min(...corpsDeSaillie(maison(), bow({ niveau: 'toit' })).egouts)).toBeCloseTo(3.5, 2);
  });
  it('son toit propre : pan contre le mur, plat, quatre pans', () => {
    expect(corpsDeSaillie(maison(), bow({ toit: 'pan' })).posFaitage).toBe(0);
    const plat = corpsDeSaillie(maison(), bow({ toit: 'plat' }));
    expect(plat.faitage).toBe(plat.egouts[0]);
    const pav = corpsDeSaillie(maison(), bow({ toit: 'pavillon' }));
    expect(pav.croupes).toBeDefined();
    expect(pav.faitage).toBeGreaterThan(pav.egouts[0]);
  });
  it('replacer une saillie la recalcule et garde le reste', () => {
    const corps = [maison(), corpsDeSaillie(maison(), bow())];
    const neuf = replacerSaillie(corps, 1, { forme: 'arc', largeurM: 3 });
    expect(neuf[1]!.saillie!.forme).toBe('arc');
    expect(repere(neuf[1]!.pts).L).toBeCloseTo(3, 1);
    expect(neuf[0]).toBe(corps[0]);
  });
  it('retirer une saillie decale les hotes des suivantes', () => {
    const base = maison();
    const a = corpsDeSaillie(base, bow());
    const b = { ...corpsDeSaillie(base, bow({ mur: 2 })) };
    const corps = [base, a, b];
    expect(retirerSaillie(corps, 1)).toHaveLength(2);
    expect(retirerSaillie(corps, 1)[1]!.saillie!.hote).toBe(0);
  });
});

describe('l emprise et les facettes d un bow-window', () => {
  const hauteurs = (f: { z: number }[][]) => f.flat().map((p) => p.z);
  for (const forme of ['rectangle', 'arc', 'conge'] as const) {
    it(`${forme} : un contour qui reste dans le rectangle de la saillie`, () => {
      const c = corpsDeSaillie(maison(), bow({ forme, profondeurM: 1.2 }));
      const r = repere(c.pts);
      for (const q of empriseDeSaillie(c)) {
        const s = (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y, t = (q.x - r.p0.x) * r.v.x + (q.y - r.p0.y) * r.v.y;
        expect(s).toBeGreaterThanOrEqual(-1e-6); expect(s).toBeLessThanOrEqual(r.L + 1e-6);
        expect(t).toBeGreaterThanOrEqual(-1e-6); expect(t).toBeLessThanOrEqual(r.W + 1e-6);
      }
    });
  }
  it('l arc a plus de murs que le rectangle, sans celui qui est contre la maison', () => {
    const r = facettesBowWindow(corpsDeSaillie(maison(), bow({ forme: 'rectangle' })));
    const a = facettesBowWindow(corpsDeSaillie(maison(), bow({ forme: 'arc' })));
    expect(r.murs).toHaveLength(3);
    expect(a.murs.length).toBeGreaterThan(8);
  });
  it('les murs montent du sol a l egout et le toit ne passe jamais sous l egout', () => {
    for (const toit of ['pan', 'pavillon', 'plat'] as const) for (const forme of ['rectangle', 'arc', 'conge'] as const) {
      const c = corpsDeSaillie(maison(), bow({ toit, forme }));
      const f = facettesBowWindow(c);
      expect(Math.min(...hauteurs(f.murs))).toBe(0);
      expect(Math.max(...hauteurs(f.murs))).toBeCloseTo(c.egouts[0], 5);
      // Le toit deborde : son bord descend un peu sous l'egout, selon la pente.
      expect(Math.min(...hauteurs(f.pans))).toBeGreaterThanOrEqual(c.egouts[0] - 0.5);
      expect(Math.max(...hauteurs(f.pans))).toBeCloseTo(c.faitage, 5);
    }
  });
});

describe('choisir le mur par un toucher', () => {
  it('le mur le plus proche du point, et l abscisse sur ce mur', () => {
    const h = maison();
    // Un point juste en dehors du mur de gauche (x = 0), a 2 m du bout pts[3] : le mur 3 va de (0,6) a (0,0).
    const r = murLePlusProche(h, { x: -0.4, y: 4 });
    expect(r.mur).toBe(3);
    expect(r.centreM).toBeCloseTo(2, 5);
    expect(murLePlusProche(h, { x: 5, y: -1 })).toEqual({ mur: 0, centreM: 5 });
  });
  it('un point au-dela d un bout reste sur le mur', () => {
    expect(murLePlusProche(maison(), { x: 14, y: 0.2 }).centreM).toBeLessThanOrEqual(6);
  });
});

describe('la hauteur propre, le debord et les vitres', () => {
  it('une hauteur reglee l emporte sur le niveau, et la retirer rend celle du niveau', () => {
    const corps = [maison(), corpsDeSaillie(maison(), bow({ niveau: 'rdc' }))];
    const haut = replacerSaillie(corps, 1, { hauteurM: 4.2 });
    expect(haut[1]!.egouts[0]).toBeCloseTo(4.2, 2);
    expect(haut[1]!.saillie!.hauteurM).toBe(4.2);
    const rendu = replacerSaillie(haut, 1, { niveau: 'rdc', hauteurM: undefined });
    expect(rendu[1]!.egouts[0]).toBeCloseTo(2.7, 2);
    expect('hauteurM' in rendu[1]!.saillie!).toBe(false);
  });
  it('le toit deborde de ses murs', () => {
    const c = corpsDeSaillie(maison(), bow({ toit: 'plat', forme: 'rectangle' }));
    const f = facettesBowWindow(c);
    const r = repere(c.pts);
    const sMax = Math.max(...f.pans[0]!.map((q) => (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y));
    expect(sMax).toBeGreaterThan(r.L + 0.15);
  });
  it('un bow rectangle a des fenetres sur sa facade, un arc en a plusieurs qui suivent la courbe, un bow bas ou etroit aucune', () => {
    const rect = vitresBowWindow(corpsDeSaillie(maison(), bow({ forme: 'rectangle', largeurM: 3 })));
    expect(rect.length).toBeGreaterThanOrEqual(1);
    const arc = vitresBowWindow(corpsDeSaillie(maison(), bow({ forme: 'arc', largeurM: 3, profondeurM: 1.5 })));
    expect(arc.length).toBeGreaterThanOrEqual(2);
    expect(vitresBowWindow(corpsDeSaillie(maison(), bow({ hauteurM: 1.1 })))).toHaveLength(0);
    for (const v of rect.concat(arc)) for (const q of v) { expect(q.z).toBeGreaterThanOrEqual(0.9 - 1e-9); expect(q.z).toBeLessThan(2.7); }
  });
});

describe('le fichier', () => {
  it('relit une saillie bien formee et refuse une mal formee', () => {
    expect(saillieValide(bow())).toEqual(bow());
    expect(saillieValide({ ...bow(), forme: 'hexagone' })).toBeNull();
    expect(saillieValide({ ...bow(), largeurM: 0 })).toBeNull();
    expect(saillieValide(null)).toBeNull();
    expect(saillieValide(bow({ hauteurM: 3.5 }))!.hauteurM).toBe(3.5);
    expect(saillieValide({ ...bow(), hauteurM: -1 })).toEqual(bow());
  });
  it('un bow pose par la palette fait l aller-retour', () => {
    const o = { key: 'b', type: 'polygon', elevation: 3, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], batiment: { toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' } } } as unknown as ObjetPlan;
    appliquerPiece(o, 'facade:bow-arc');
    const copie = JSON.parse(JSON.stringify(o.batiment?.corpsToit)) as CorpsToit[];
    expect(copie[1]!.saillie).toEqual(o.batiment!.corpsToit![1]!.saillie);
  });
});
