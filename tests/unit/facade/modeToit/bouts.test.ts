import { describe, it, expect } from 'vitest';
import { appliquerChoix, groupesDe, valeurDuGroupe, type CibleElement } from '../../../../src/facade/modeToit/elements.js';
import { facettesCorps } from '../../../../src/three/toitCorps3d.js';
import { facettesEtendues } from '../../../../src/facade/toits/toitFormes.js';
import { hauteurDuToitEn } from '../../../../src/facade/toits/toitCorps.js';
import type { CorpsToit } from '../../../../src/model/types.js';

// Le cul de geai (demi-croupe) et la queue de vache au Mode Toit (MD/spec-mode-toit-3d.md, 5 novembre 2026) : chaque bout du faitage
// en pignon, croupe ou cul de geai, la pointe d'un pignon coupee, le debord de l'egout en coyau. Le corps : 10 x 6 m, faitage au
// milieu a 7 m, egouts a 4 m ; ses bouts a x = 0 et x = 10.

const corps = (extra: Partial<CorpsToit> = {}): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 7, egouts: [4, 4], pignons: [], ecart: 0, ...extra });
const C: CibleElement = { type: 'corps', rang: 0, i: 0 };
const tous = (l: { x: number; y: number; z: number }[][]) => l.flat();

describe('les bouts d un corps au Mode Toit', () => {
  it('propose pignon, croupe ou cul de geai a chaque bout, puis la coupe et le debord du faitage du cul de geai', () => {
    let l = [corps()];
    expect(groupesDe(l, C).map((g) => g.groupe)).toEqual(expect.arrayContaining(['bout0', 'bout1', 'qdv0', 'qdv1']));
    expect(valeurDuGroupe(l, C, 'bout0')).toBe('pignon');
    l = appliquerChoix(l, C, 'bout0', 'demi-croupe');
    expect(l[0]!.bouts?.[0]).toMatchObject({ type: 'demi-croupe' });
    expect(l[0]!.croupes).toBeUndefined();
    expect(valeurDuGroupe(l, C, 'bout0')).toBe('demi-croupe');
    expect(valeurDuGroupe(l, C, 'coupe0')).toBe('0.33');
    expect(valeurDuGroupe(l, C, 'debordFaitage0')).toBe('0');
    // Un cul de geai ferme les bouts : pas de queue de vache sur ce corps (le dessin d'un coyau ferme ses bouts en pignon).
    expect(groupesDe(l, C).map((g) => g.groupe)).not.toContain('qdv0');
    l = appliquerChoix(l, C, 'debordFaitage0', '1');
    expect(l[0]!.bouts?.[0]).toMatchObject({ debordFaitageM: 1 });
    l = appliquerChoix(l, C, 'coupe0', '0.5');
    expect(valeurDuGroupe(l, C, 'coupe0')).toBe('0.5');
    // Une croupe a l'autre bout : `croupes` la dit aussi, pour qui ne lit qu'elles.
    l = appliquerChoix(l, C, 'bout1', 'croupe');
    expect(l[0]!.croupes?.[1]).toBeGreaterThan(0);
    // Revenir aux pignons efface les bouts : le corps redevient celui d'avant.
    l = appliquerChoix(appliquerChoix(l, C, 'bout0', 'pignon'), C, 'bout1', 'pignon');
    expect(l[0]).toEqual(corps());
  });

  it('dessine le cul de geai : un mur en trapeze sous la petite croupe, au pied a la hauteur coupee', () => {
    const c = appliquerChoix([corps()], C, 'bout0', 'demi-croupe')[0]!;
    const b = c.bouts![0] as { hauteurPignonM: number };
    const zc = 4 + b.hauteurPignonM;
    const { murs } = facettesCorps(c);
    const mur0 = murs.find((m) => m.every((q) => Math.abs(q.x) < 1e-6))!;
    expect(Math.max(...mur0.map((q) => q.z))).toBeCloseTo(zc, 6);
    // Sans debord de faitage, rien ne change pour un cul de geai d'avant (le meme plan qu'au 4 novembre).
    expect(facettesEtendues({ ...c, bouts: [{ ...c.bouts![0], debordFaitageM: 0 } as never, c.bouts![1]] }, 10, 6, { egout0: 0.35, egout1: 0.35, rive0: 0.2, rive1: 0.2 }, 4))
      .toEqual(facettesEtendues(c, 10, 6, { egout0: 0.35, egout1: 0.35, rive0: 0.2, rive1: 0.2 }, 4));
  });

  it('porte la croupe en avant quand le faitage deborde : capuchon devant le mur, sous-face au pied, mur arrete au pied', () => {
    const c = appliquerChoix(appliquerChoix([corps()], C, 'bout0', 'demi-croupe'), C, 'debordFaitage0', '1')[0]!;
    const zc = 4 + (c.bouts![0] as { hauteurPignonM: number }).hauteurPignonM;
    const { pans, murs } = facettesCorps(c);
    const p = tous(pans);
    // Le toit avance d'un metre devant le mur de bout, au-dessus du pied de la croupe seulement.
    expect(Math.min(...p.map((q) => q.x))).toBeCloseTo(-1, 6);
    expect(Math.min(...p.filter((q) => q.x < -0.21).map((q) => q.z))).toBeGreaterThanOrEqual(zc - 1e-6);
    // La sous-face, horizontale au pied, du mur au bord du capuchon.
    const sous = murs.find((m) => m.every((q) => Math.abs(q.z - zc) < 1e-6));
    expect(sous && Math.min(...sous.map((q) => q.x))).toBeCloseTo(-1, 6);
    // Le mur de bout s'arrete au pied, sous le capuchon.
    const mur0 = murs.find((m) => m.every((q) => Math.abs(q.x) < 1e-6) && m.some((q) => q.z < 4.01))!;
    expect(Math.max(...mur0.map((q) => q.z))).toBeCloseTo(zc, 6);
  });

  it('entaille les pans sous un pignon traversant, et coupe la pointe du pignon en cul de geai', () => {
    const pg = { pan: 0 as const, debut: 4, fin: 7, faitage: 6.5, profondeur: 3 };
    const avecPignon = appliquerChoix([corps({ pignons: [pg] })], C, 'bout0', 'demi-croupe')[0]!;
    const { pans } = facettesCorps(avecPignon);
    // Rien du grand pan devant le triangle du pignon (sous ses noues, au milieu de sa largeur).
    const devant = tous(pans).filter((q) => q.x > 5.4 && q.x < 5.6 && q.y < 1.0 && q.y > -0.35 && q.z < 4 + (1 * 3) / 3 - 0.05);
    expect(devant.length).toBe(0);
    // La pointe du pignon en cul de geai : son mur s'arrete a la hauteur coupee.
    const P: CibleElement = { type: 'pignon', rang: 0, i: 0 };
    let l = appliquerChoix([corps({ pignons: [pg] })], P, 'pointe', 'demi-croupe');
    expect(valeurDuGroupe(l, P, 'pointe')).toBe('demi-croupe');
    const pointe = l[0]!.pignons[0]!.pointe!;
    const zc = 4 + pointe.hauteurPignonM;
    const triangle = facettesCorps(l[0]!).murs.filter((m) => m.every((q) => Math.abs(q.y) < 1e-6) && m.every((q) => q.x >= 3.99 && q.x <= 7.01));
    expect(Math.max(...tous(triangle).map((q) => q.z))).toBeCloseTo(zc, 6);
    // La hauteur du toit au droit du mur du pignon suit la petite croupe, plus bas que son faitage.
    expect(hauteurDuToitEn(l[0] ? [l[0]] : [], { x: 5.5, y: 0.05 })!).toBeLessThan(6.5 - 0.3);
    l = appliquerChoix(l, P, 'pointe', 'triangle');
    expect(l[0]!.pignons[0]).toEqual(pg);
  });

  it('pose une queue de vache sur un pan : un debord plus long a la pente adoucie, sous-face fermee', () => {
    let l = appliquerChoix([corps()], C, 'qdv0', '0.9');
    const pr = l[0]!.profil![0];
    expect(pr).toMatchObject({ type: 'coyau', debordM: 0.9 });
    expect(valeurDuGroupe(l, C, 'qdv0')).toBe('0.9');
    expect(groupesDe(l, C).map((g) => g.groupe)).toContain('penteCoyau0');
    l = appliquerChoix(l, C, 'penteCoyau0', '15');
    expect(valeurDuGroupe(l, C, 'penteCoyau0')).toBe('15');
    const { pans, murs } = facettesCorps(l[0]!);
    // Le bord de l'egout du pan 0 est a 0,9 m du mur, plus haut qu'un pan droit qui deborderait autant (la pente adoucie).
    const bord = tous(pans).filter((q) => Math.abs(q.y + 0.9) < 1e-6);
    expect(bord.length).toBeGreaterThan(0);
    expect(bord[0]!.z).toBeGreaterThan(4 - 0.9 * 1);
    expect(murs.some((m) => m.every((q) => Math.abs(q.z - bord[0]!.z) < 1e-6) && m.length === 4)).toBe(true);
    // Les bouts restent des pignons tant qu'il y a une queue de vache.
    expect(groupesDe(l, C).map((g) => g.groupe)).not.toContain('bout0');
    l = appliquerChoix(l, C, 'qdv0', '0');
    expect(l[0]).toEqual(corps());
  });
});
