// Ce qui passe devant un mur photographie (facade/modeToit/saillies.ts) : la face d'un appentis qui recoit le bas de la photo, et le mur
// du corps porteur, que la photo suit quand il croise la ligne du cote. Sur AE 101 (tests/fixtures/toits/vesinet-ae101.json), la facade
// sud aux deux pignons : l'appentis passe devant elle sur toute sa largeur, et le mur du corps principal la croise.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { avanceeDuMurPorteur, facesDevantLeMur } from '../../../../src/facade/modeToit/saillies.js';
import { facadesDuContour } from '../../../../src/geometry/cotesVusDeDehors.js';
import type { CorpsToit } from '../../../../src/model/types.js';

const ae101 = JSON.parse(readFileSync(new URL('../../../fixtures/toits/vesinet-ae101.json', import.meta.url), 'utf8')) as { contour: { x: number; y: number }[]; corpsAvecFaits: CorpsToit[] };
const sud = facadesDuContour(ae101.contour, 5).filter((f) => f.orientation === 'Sud').sort((a, b) => b.largeur - a.largeur)[0]!;

describe('ce qui passe devant un mur photographie', () => {
  it('AE 101 : la face de l appentis couvre la facade sud d un bout a l autre, jusqu a son egout', () => {
    const faces = facesDevantLeMur(sud, ae101.corpsAvecFaits);
    expect(faces).toHaveLength(1);
    expect(faces[0]?.xa).toBeCloseTo(0, 2);
    expect(faces[0]?.xb).toBeCloseTo(sud.largeur, 2);
    expect(faces[0]?.hauteurM).toBeCloseTo(2.4, 2);
  });

  it('un appentis ouvert n a pas de face, et un mur sans corps devant lui non plus', () => {
    expect(facesDevantLeMur(sud, ae101.corpsAvecFaits.map((c) => ({ ...c, ouvert: true })))).toEqual([]);
    expect(facesDevantLeMur(sud, ae101.corpsAvecFaits.slice(0, 1))).toEqual([]);
  });

  it('AE 101 : le mur du corps principal passe devant la ligne du cote a droite, jamais a gauche', () => {
    const avancee = avanceeDuMurPorteur(sud, ae101.corpsAvecFaits);
    expect(avancee(0.5)).toBe(0);
    expect(avancee(sud.largeur - 0.1)).toBeGreaterThan(0.05);
    expect(avancee(sud.largeur - 0.1)).toBeLessThan(0.12);
    // Elle croit le long du mur : la photo reste plane.
    expect(avancee(8)).toBeGreaterThan(avancee(6));
  });

  it('AE 101 : au-dela des bouts du cote, la face de l appentis et le mur du corps continuent (les debords de la photo)', () => {
    const faces = facesDevantLeMur(sud, ae101.corpsAvecFaits, [-1.1, 0]);
    expect(faces).toHaveLength(1);
    expect(faces[0]?.xa).toBeLessThan(-0.8);
    expect(faces[0]?.xb).toBeCloseTo(0, 6);
    // Hors du cote, le mur du corps est en retrait de la ligne : l'ecart tel quel, la photo se pose sur lui.
    expect(avanceeDuMurPorteur(sud, ae101.corpsAvecFaits)(-0.5)).toBeLessThan(-0.05);
  });

  it('sans corps, rien n avance', () => {
    expect(avanceeDuMurPorteur(sud, [])(3)).toBe(0);
  });
});
