import { describe, it, expect } from 'vitest';
import { estPapillon, estSpecial, facettesSpeciales, hauteurSpeciale } from '../../../src/facade/toitSpeciaux.js';
import { hauteurEtendue, facettesEtendues, facettesLucarnes } from '../../../src/facade/toitFormes.js';
import { hauteurCorpsEn } from '../../../src/facade/toitCorps.js';
import { facettesCorps } from '../../../src/three/toitCorps3d.js';
import { specialeValide, lireChampsEtendus } from '../../../src/model/corpsToitEtendu.js';
import type { CorpsToit, Lucarne } from '../../../src/model/types.js';

// Les toits a profil libre et de revolution : papillon, coyau, berceau, conique, polygonal, fleche, dome, imperiale.

const L = 10, W = 7, D0 = { egout0: 0, egout1: 0, rive0: 0, rive1: 0 };
const corps = (plus: Partial<CorpsToit>): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }], posFaitage: 3.5, faitage: 6, egouts: [3, 3], pignons: [], ecart: 0, ...plus });
const proche = (a: number | null, b: number, eps = 1e-6) => expect(Math.abs((a as number) - b)).toBeLessThan(eps);

describe('le papillon', () => {
  const c = corps({ faitage: 3, egouts: [5, 5] });
  it('est un faitage plus bas que les deux egouts, et pas un toit plat', () => {
    expect(estPapillon(c, W)).toBe(true);
    expect(estPapillon(corps({ faitage: 5.8, egouts: [6, 6] }), W)).toBe(false);
    expect(estPapillon(corps({ posFaitage: 0, faitage: 3, egouts: [5, 5] }), W)).toBe(false);
  });
  it('descend de l egout a la noue : z vaut l egout au mur et le « faitage » au milieu', () => {
    proche(hauteurEtendue(c, L, W, 5, 0), 5);
    proche(hauteurEtendue(c, L, W, 5, 3.5), 3);
    proche(hauteurEtendue(c, L, W, 5, W), 5);
    proche(hauteurCorpsEn(c, L, W, 5, 1.75), 4);
  });
  it('a deux pans et deux pignons dont le sommet suit le V', () => {
    const f = facettesSpeciales(c, L, W, D0, 3)!;
    expect(f.pans).toHaveLength(2);
    expect(f.murs).toHaveLength(2);
    const mur = f.murs[0]!;
    expect(mur.map((q) => q.z)).toContain(3);
    expect(Math.max(...mur.map((q) => q.z))).toBe(5);
  });
});

describe('le coyau et le berceau', () => {
  const coyau = corps({ faitage: 6.5, profil: [{ type: 'coyau', largeurM: 1.4, penteDeg: 12 }, { type: 'coyau', largeurM: 1.4, penteDeg: 12 }] });
  it('un coyau adoucit le bas du pan : plus bas qu une pente droite a 1,4 m de l egout, rejoint le faitage', () => {
    const droit = 3 + (3.5 * 1.4) / 3.5;
    expect(hauteurEtendue(coyau, L, W, 5, 1.4)!).toBeLessThan(droit);
    proche(hauteurEtendue(coyau, L, W, 5, 3.5), 6.5);
    proche(hauteurEtendue(coyau, L, W, 5, 0), 3);
  });
  it('un coyau plus raide que le pan n a rien a adoucir : le pan reste droit', () => {
    const raide = corps({ profil: [{ type: 'coyau', largeurM: 1, penteDeg: 80 }, { type: 'droit' }] });
    proche(hauteurEtendue(raide, L, W, 5, 1.75), 4.5);
  });
  it('un berceau bombe le pan : au-dessus de la droite, et se rejoint au faitage', () => {
    const arc = corps({ profil: [{ type: 'courbe', flecheM: 0.8 }, { type: 'courbe', flecheM: 0.8 }] });
    expect(hauteurEtendue(arc, L, W, 5, 1.75)!).toBeGreaterThan(4.5);
    proche(hauteurEtendue(arc, L, W, 5, 3.5), 6, 1e-6);
    expect(facettesSpeciales(arc, L, W, D0, 3)!.pans).toHaveLength(20);
  });
  it('le debord prolonge le pan a sa pente, sous l egout', () => {
    const f = facettesSpeciales(coyau, L, W, { ...D0, egout0: 0.35 }, 3)!;
    expect(Math.min(...f.pans.flat().map((q) => q.z))).toBeLessThan(3);
  });
});

describe('les toits de revolution', () => {
  const rev = (speciale: NonNullable<CorpsToit['speciale']>, plus: Partial<CorpsToit> = {}) => corps({ speciale, faitage: 9, egouts: [3, 3], pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }], ...plus });
  it('un cone : l egout au bord, le faitage a l axe, lineaire entre', () => {
    const c = rev({ type: 'conique' });
    proche(hauteurSpeciale(c, 6, 6, 3, 3), 9);
    proche(hauteurSpeciale(c, 6, 6, 3, 0.0001), 3, 0.01);
    proche(hauteurSpeciale(c, 6, 6, 3, 1.5), 6);
    proche(hauteurSpeciale(c, 6, 6, 0, 0), 3);
  });
  it('une pyramide a autant de faces que de cotes, sur une dalle', () => {
    const f = facettesSpeciales(rev({ type: 'polygonal', cotes: 6 }), 6, 6, D0, 3)!;
    expect(f.pans).toHaveLength(6 + 1);
    expect(facettesSpeciales(rev({ type: 'fleche', cotes: 8 }), 6, 6, D0, 3)!.pans).toHaveLength(8 + 1);
  });
  it('un dome est plus haut qu un cone au meme rayon ; un bulbe s elargit puis s effile', () => {
    const dome = rev({ type: 'dome' }), cone = rev({ type: 'conique' }), bulbe = rev({ type: 'imperiale' });
    expect(hauteurSpeciale(dome, 6, 6, 3, 1.5)!).toBeGreaterThan(hauteurSpeciale(cone, 6, 6, 3, 1.5)!);
    proche(hauteurSpeciale(dome, 6, 6, 3, 3), 9);
    proche(hauteurSpeciale(bulbe, 6, 6, 3, 3), 9, 0.2);
    const rayons = [0.5, 1.5, 2.5, 2.95].map((r) => hauteurSpeciale(bulbe, 6, 6, 3 + r, 3)!);
    expect(rayons.every((z) => z >= 3 && z <= 9)).toBe(true);
  });
  it('hors du rayon, la dalle de l egout', () => {
    proche(hauteurSpeciale(rev({ type: 'dome' }), 10, 6, 0.2, 0.2), 3);
  });
  it('un toit de revolution est special, ne porte pas de lucarne, et se laisse demander par facettesEtendues', () => {
    const c = rev({ type: 'dome', }, { lucarnes: [{ type: 'jacobine', pan: 0, debutM: 1, finM: 3, faitageM: 5, profondeurM: 1, source: 'observation' } as Lucarne] });
    expect(estSpecial(c, 6)).toBe(true);
    expect(facettesLucarnes(c, 6, 6).pans).toEqual([]);
    expect(facettesEtendues(c, 6, 6, D0, 3)).not.toBeNull();
  });
});

describe('dans la 3D', () => {
  const pans = (c: CorpsToit) => facettesCorps(c, null, false);
  it('un papillon descend sous son egout : les murs du prisme montent de la noue aux egouts', () => {
    const f = pans(corps({ faitage: 3, egouts: [5, 5] }));
    const z = f.pans.flatMap((p) => p.map((q) => q.z));
    expect(Math.min(...z)).toBe(3);
    expect(Math.max(...z)).toBe(5);
    expect(f.murs.some((m) => m.every((q) => q.z === 3 || q.z === 5))).toBe(true);
  });
  it('une tourelle est un cone sur sa dalle : jamais un toit plat', () => {
    const f = pans(corps({ speciale: { type: 'conique' }, faitage: 9, pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }] }));
    expect(f.pans.length).toBeGreaterThan(24);
    expect(Math.max(...f.pans.flatMap((p) => p.map((q) => q.z)))).toBe(9);
  });
  it('un acrotere borde le toit plat : quatre murets, dedans et dehors, et leur dessus', () => {
    const plat = corps({ faitage: 3, egouts: [3, 3], posFaitage: 3.5, terrasse: { acrotereM: 0.6, source: 'observation' } });
    const f = pans(plat);
    expect(f.murs.filter((m) => m.every((q) => q.z === 3 || q.z === 3.6))).toHaveLength(8);
    expect(f.pans).toHaveLength(4);
    expect(Math.max(...f.pans.flatMap((p) => p.map((q) => q.z)))).toBeCloseTo(3.6);
    expect(pans(corps({ faitage: 3, egouts: [3, 3] })).murs.filter((m) => m.some((q) => q.z > 3))).toHaveLength(0);
  });
  it('un corps a faitage ne change pas : deux pans, quatre facettes de mur et de toit comme avant', () => {
    expect(pans(corps({})).pans).toHaveLength(2);
  });
});

describe('le fichier', () => {
  it('un toit de revolution bien forme est garde, le mal forme est retire', () => {
    expect(specialeValide({ type: 'dome', extra: 1 })).toEqual({ type: 'dome' });
    expect(specialeValide({ type: 'polygonal', cotes: 6 })).toEqual({ type: 'polygonal', cotes: 6 });
    expect(specialeValide({ type: 'polygonal', cotes: 2 })).toBeNull();
    expect(specialeValide({ type: 'fleche' })).toBeNull();
    expect(specialeValide({ type: 'tour' })).toBeNull();
    const c: Record<string, unknown> = { speciale: { type: 'tour' } };
    lireChampsEtendus(c);
    expect('speciale' in c).toBe(false);
  });
});

describe('la carene : un pan bombe dont les bouts sont fermes par une croupe', () => {
  const c = { pts: [], posFaitage: 4, faitage: 6.8, egouts: [3, 3] as [number, number], pignons: [], ecart: 0, profil: [{ type: 'courbe' as const, flecheM: 1.3 }, { type: 'courbe' as const, flecheM: 1.3 }] as [{ type: 'courbe'; flecheM: number }, { type: 'courbe'; flecheM: number }], bouts: [{ type: 'croupe' as const, profondeurM: 2.5 }, { type: 'croupe' as const, profondeurM: 2.5 }] as [{ type: 'croupe'; profondeurM: number }, { type: 'croupe'; profondeurM: number }] };
  it('descend a l egout au bout et garde le faitage plus loin', () => {
    expect(hauteurSpeciale(c, 12, 8, 0, 4)).toBeCloseTo(3, 2);
    expect(hauteurSpeciale(c, 12, 8, 6, 4)).toBeCloseTo(6.8, 2);
    expect(hauteurSpeciale(c, 12, 8, 1, 4) as number).toBeGreaterThan(3.1);
    expect(hauteurSpeciale(c, 12, 8, 1, 4) as number).toBeLessThan(6.7);
  });
  it('se dessine en triangles et ferme ses bouts au niveau de l egout', () => {
    const f = facettesSpeciales(c, 12, 8, { egout0: 0, egout1: 0, rive0: 0, rive1: 0 } as never, 0);
    expect(f?.pans.every((p) => p.length === 3)).toBe(true);
    expect(f?.pans.length).toBeGreaterThan(100);
    expect(Math.max(...(f?.murs[0] ?? []).map((q) => q.z))).toBeCloseTo(3, 2);
  });
});
