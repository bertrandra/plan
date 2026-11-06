import { describe, it, expect } from 'vitest';
import { facettesCorps } from '../../../src/three/toitCorps3d.js';
import { profondeurDeNoue } from '../../../src/facade/toits/toitFormes.js';
import type { CorpsToit, PignonToit } from '../../../src/model/types.js';

// Le raccord d'un pignon traversant au pan du corps (retour du proprietaire, 6 novembre 2026 : « mauvais raccord toit corps et pignon
// s'il n'est pas au faitage ») : le toit du pignon s'arrete sur le pan par deux noues, l'intersection des plans ; le pan est entaille
// sous le pignon jusqu'au bout de ces noues, pas jusqu'au faitage. Un pignon qui monte au faitage garde le dessin d'avant.
// Le corps : 10 x 7 m, faitage au milieu (3,5 m) a 8,5 m, egouts a 5 m ; le pignon sur le pan 0, de 3,5 a 6,5 m.

const p = (x: number, y: number) => ({ x, y });
const corps = (g: Partial<PignonToit>): CorpsToit => ({ pts: [p(0, 0), p(10, 0), p(10, 7), p(0, 7)], posFaitage: 3.5, faitage: 8.5, egouts: [5, 5], pignons: [{ pan: 0, debut: 3.5, fin: 6.5, faitage: 8.5, profondeur: 3.5, ...g }], ecart: 0 });
const panCorps = (_x: number, y: number) => 5 + (y * 3.5) / 3.5;
const proche = (a: { x: number; y: number; z: number }, x: number, y: number, z: number) => Math.hypot(a.x - x, a.y - y, a.z - z) < 1e-6;

describe('le raccord d un pignon au pan du corps', () => {
  it('au faitage : la profondeur des noues est celle du pignon, comme avant', () => {
    expect(profondeurDeNoue(corps({}), corps({}).pignons[0]!, 7)).toBe(3.5);
    expect(profondeurDeNoue(corps({ profondeur: 2 }), corps({ profondeur: 2 }).pignons[0]!, 7)).toBe(2);
  });

  it.each([[8.5, 3.5], [7.2, 2.2], [6, 1], [7.4, 2.4]])('faitage du pignon a %s m : les noues finissent sur le pan a %s m du mur, sans trou ni pan qui traverse', (Fp, dv) => {
    const c = corps({ faitage: Fp, ...(Fp === 7.4 ? { debut: 4.3, fin: 5.7 } : {}) });
    const g = c.pignons[0]!, sc = (g.debut + g.fin) / 2;
    expect(profondeurDeNoue(c, g, 7)).toBeCloseTo(dv, 6);
    const { pans } = facettesCorps(c);
    // Le pan 0 du corps (ses sommets sur son plan z = 5 + d) et les deux pans du pignon (le plus haut sommet au faitage du pignon).
    const surPan = (f: { x: number; y: number; z: number }[]) => f.every((q) => Math.abs(q.z - panCorps(q.x, q.y)) < 1e-6) && f.some((q) => q.y < 3.4);
    const duPignon = pans.filter((f) => f.some((q) => Math.abs(q.z - Fp) < 1e-6 && Math.abs(q.x - sc) < 1e-6) && !surPan(f));
    const pan0 = pans.find((f) => surPan(f) && f.length > 4)!;
    expect(duPignon).toHaveLength(2);
    // Le bout du faitage du pignon est sur le pan du corps, et c'est le sommet de l'entaille du pan : une seule arete, deux noues partagees.
    const bout = { x: sc, y: dv, z: Fp };
    expect(Math.abs(bout.z - panCorps(bout.x, bout.y))).toBeLessThan(1e-6);
    for (const f of duPignon) expect(f.some((q) => proche(q, bout.x, bout.y, bout.z))).toBe(true);
    expect(pan0.some((q) => proche(q, bout.x, bout.y, bout.z))).toBe(true);
    // Les pieds des noues (sur le mur, a l'egout) sont sur le bord de l'entaille du pan : les aretes des noues sont partagees, aucune
    // n'est libre (le pan peut les continuer jusqu'au debord, alignees).
    const surLeBord = (x: number, y: number, z: number) => pan0.some((a, i) => {
      const b = pan0[(i + 1) % pan0.length]!, ab = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      return Math.abs(Math.hypot(x - a.x, y - a.y, z - a.z) + Math.hypot(b.x - x, b.y - y, b.z - z) - ab) < 1e-6;
    });
    expect(surLeBord(g.debut, 0, 5)).toBe(true);
    expect(surLeBord(g.fin, 0, 5)).toBe(true);
    expect(surLeBord(bout.x, bout.y, bout.z)).toBe(true);
    // Aucun sommet du toit du pignon sous le pan du corps : il ne le traverse pas.
    for (const f of duPignon) for (const q of f) if (q.y >= 0) expect(q.z).toBeGreaterThanOrEqual(panCorps(q.x, q.y) - 1e-6);
  });
});
