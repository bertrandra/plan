import { describe, it, expect } from 'vitest';
import { facadeDevant, facadesDevant, ecartAuCap, texteFacadeDevant, murPropose, type FacadesDUnBatiment } from '../../../../src/facade/calage/priseDeVue.js';
import { facadesDuContour } from '../../../../src/facade/geometrie.js';
import { obstacle, vueCachee } from '../../../../src/geometry/ligneDeVue.js';
import type { PtBrut } from '../../../../src/model/types.js';

// La facade devant laquelle on se tient (MD/spec-audit.md §6.1) : cote exterieur, 3 a 40 m, rien
// entre soi et le mur, puis l'axe de la boussole a 50 degres pres ; a egalite, la plus proche.

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const bat = (cle: string, pts: PtBrut[]): FacadesDUnBatiment & { pts: PtBrut[] } => ({ cle, pts, facades: facadesDuContour(pts, 6) });
const obstacles = (...b: { pts: PtBrut[] }[]) => b.map((x) => obstacle(x.pts));

const maison = bat('maison', rect(0, 0, 10, 8));

describe('facadeDevant : position et cap connus', () => {
  it('face au mur sud, cap au nord : la facade sud, a 6 m', () => {
    const v = facadeDevant(p(5, -6), 0, [maison], obstacles(maison))!;
    expect(v.cle).toBe('maison');
    expect(v.facade.orientation).toBe('Sud');
    expect(v.distance).toBeCloseTo(6, 9);
    expect(v.ecartCap).toBe(0);
    expect(texteFacadeDevant(v)).toBe('Vous êtes devant la façade sud, 6,0 m');
  });

  it('pres d un angle, le cap choisit entre les deux murs vus', () => {
    const pos = p(14, -4);
    expect(facadesDevant(pos, [maison], obstacles(maison)).map((v) => v.facade.orientation).sort()).toEqual(['Est', 'Sud']);
    expect(facadeDevant(pos, 300, [maison], obstacles(maison))?.facade.orientation).toBe('Sud');
    expect(facadeDevant(pos, 330, [maison], obstacles(maison))?.facade.orientation).toBe('Est');
  });

  it('a 50 degres du mur on le garde, au-dela rien ; dos au mur, rien', () => {
    // Depuis (5, -6), le mur sud s'etend de 320 a 40 degres environ.
    expect(facadeDevant(p(5, -6), 85, [maison], obstacles(maison))?.facade.orientation).toBe('Sud');
    expect(facadeDevant(p(5, -6), 95, [maison], obstacles(maison))).toBeNull();
    expect(facadeDevant(p(5, -6), 180, [maison], obstacles(maison))).toBeNull();
  });

  it('un long mur vu de pres, pres d un bout : on le regarde en plein, meme loin de son milieu', () => {
    const longue = bat('longue', rect(0, 0, 20, 8));
    const sud = longue.facades.find((f) => f.orientation === 'Sud')!;
    expect(ecartAuCap(p(2, -5), sud, 0)).toBe(0);
    expect(facadeDevant(p(2, -5), 0, [longue], obstacles(longue))?.facade.orientation).toBe('Sud');
  });

  it('a egalite d ecart, la plus proche : la cabane devant la maison', () => {
    const cabane = bat('cabane', rect(4, -6, 2, 1));
    const v = facadeDevant(p(5, -10), 0, [maison, cabane], obstacles(maison, cabane))!;
    expect(v.cle).toBe('cabane');
    expect(v.distance).toBeCloseTo(4, 9);
  });
});

describe('facadeDevant : distance, cote et obstacle', () => {
  it('trop pres, trop loin, ou dedans : rien', () => {
    expect(facadeDevant(p(5, -2), null, [maison], obstacles(maison))).toBeNull();
    expect(facadeDevant(p(5, -45), null, [maison], obstacles(maison))).toBeNull();
    expect(facadeDevant(p(5, 4), null, [maison], obstacles(maison))).toBeNull();
  });

  it('dans le prolongement du mur, on le longe : il n est pas devant', () => {
    expect(facadesDevant(p(30, -1), [maison], obstacles(maison)).map((v) => v.facade.orientation)).toEqual(['Est']);
  });

  it('sans boussole, la plus proche devant laquelle on est', () => {
    expect(facadeDevant(p(5, -6), null, [maison], obstacles(maison))?.facade.orientation).toBe('Sud');
    expect(facadeDevant(p(13, -9), null, [maison], obstacles(maison))?.facade.orientation).toBe('Sud');
    expect(facadeDevant(p(16, 3), null, [maison], obstacles(maison))?.facade.orientation).toBe('Est');
  });

  it('un garage entre soi et le mur le cache ; c est alors la facade du garage qui est devant', () => {
    const garage = bat('garage', rect(2, -5, 6, 2));
    expect(facadeDevant(p(5, -10), 0, [maison], obstacles(maison, garage))).toBeNull();
    const v = facadeDevant(p(5, -10), 0, [maison, garage], obstacles(maison, garage))!;
    expect(v.cle).toBe('garage');
    expect(v.facade.orientation).toBe('Sud');
  });

  it('un poteau qui cache le milieu du mur ne le cache pas tout entier', () => {
    const poteau = { pts: rect(4.5, -5, 1, 2) };
    expect(facadeDevant(p(5, -10), 0, [maison], obstacles(maison, poteau))?.facade.orientation).toBe('Sud');
  });
});

describe('murPropose : le mur que le releve propose', () => {
  it('position connue : la facade devant soi, avec sa distance, meme sans boussole', () => {
    const m = murPropose(maison.facades, 'maison', p(5, -6), obstacles(maison), null)!;
    expect(m.facade.orientation).toBe('Sud');
    expect(m.devant?.distance).toBeCloseTo(6, 9);
    // Dans le dos du mur sud, la boussole ne suffit plus : on n'est devant aucun mur qu'elle designe.
    expect(murPropose(maison.facades, 'maison', p(5, -6), obstacles(maison), 180)).toBeNull();
  });

  it('position inconnue : la facade qui fait face au cap, sans distance ; ni l un ni l autre, rien', () => {
    const m = murPropose(maison.facades, 'maison', null, [], 0)!;
    expect(m.facade.orientation).toBe('Sud');
    expect(m.devant).toBeNull();
    expect(murPropose(maison.facades, 'maison', null, [], null)).toBeNull();
  });
});

describe('ligne de vue', () => {
  it('un contour coupe la vue, un contour a cote ne la coupe pas', () => {
    expect(vueCachee(p(0, -10), p(0, 0), [obstacle(rect(-1, -6, 2, 2))])).toBe(true);
    expect(vueCachee(p(0, -10), p(0, 0), [obstacle(rect(3, -6, 2, 2))])).toBe(false);
  });
});
