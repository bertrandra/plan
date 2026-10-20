import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { saillies, saillieDuFait, avecBaies, baiePosee } from '../../../../../src/facade/regles/toits/baies.js';
import { ecartsAuFait } from '../../../../../src/facade/regles/toits/faits.js';
import { lireFaitsToits, FaitsToitsIllisibles, type BaieFait } from '../../../../../src/regles/toits/faits.js';
import type { CorpsToit, PtBrut } from '../../../../../src/model/types.js';
import type { GrilleRelief } from '../../../../../src/model/relief.js';

// La bay window (MD/spec-regles-toits.md §2.3, §3.4 n°9) : une avancee de facade que le cadastre porte dans le contour. On la
// repere sur le contour seul ; un fait dit son toit ; la mesure donne la hauteur que le fait ne donne pas.

interface Releve { contour: PtBrut[]; corps: CorpsToit[]; grille: GrilleRelief }
const ae101 = JSON.parse(readFileSync(join(__dirname, '../../../../fixtures/toits/vesinet-ae101.json'), 'utf8')) as Releve;

/** Un carre de 10 m, avec une saillie de `l` x `d` au milieu du cote sud (y = 0), sens antihoraire. */
const maison = (l: number, d: number, avecSaillie = true): PtBrut[] => {
  const a = 5 - l / 2, b = 5 + l / 2;
  return [{ x: 0, y: 0 }, ...(avecSaillie ? [{ x: a, y: 0 }, { x: a, y: -d }, { x: b, y: -d }, { x: b, y: 0 }] : []), { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
};
const baie = (o: Partial<BaieFait> = {}): BaieFait => ({ facade: { azimutDeg: 180 }, forme: 'rectangle', pose: 'sous-premier-etage', toit: 'propre', toitForme: 'plat', ...o });
const corpsMaison: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], posFaitage: 5, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 };

describe('saillies du contour', () => {
  it('une avancee de 3 x 0,6 m sur la face sud est reperee, avec sa face et son rectangle', () => {
    const [s, ...autres] = saillies(maison(3, 0.6));
    expect(autres).toEqual([]);
    expect(s).toMatchObject({ largeurM: 3, saillieM: 0.6, azimutDeg: 180 });
    expect(s!.pts).toEqual([{ x: 3.5, y: 0 }, { x: 6.5, y: 0 }, { x: 6.5, y: -0.6 }, { x: 3.5, y: -0.6 }]);
  });

  it('le sens du contour ne change rien', () => {
    expect(saillies([...maison(3, 0.6)].reverse()).map((s) => [s.largeurM, s.saillieM, s.azimutDeg])).toEqual([[3, 0.6, 180]]);
  });

  it('un contour sans saillie, une saillie trop petite ou trop grande, une face trop etroite ou trop large : rien', () => {
    expect(saillies(maison(3, 0.6, false))).toEqual([]);
    expect(saillies(maison(3, 0.2))).toEqual([]);
    expect(saillies(maison(3, 1.5))).toEqual([]);
    expect(saillies(maison(0.8, 0.6))).toEqual([]);
    expect(saillies(maison(4.5, 0.6))).toEqual([]);
  });

  it('un renfoncement (le U vers l interieur) n est pas une bay window', () => {
    expect(saillies(maison(3, -0.6))).toEqual([]);
  });

  it('AE 101 : une seule saillie sur le cadastre, a l est-nord-est, 2,3 x 0,7 m ; le decroche du coin sud-ouest n en est pas une', () => {
    const s = saillies(ae101.contour);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ largeurM: 2.28, saillieM: 0.73, azimutDeg: 74 });
  });
});

describe('poser une bay window', () => {
  it('toit plat a la hauteur du fait : un petit corps sur la saillie, marque bay window', () => {
    const out = avecBaies([baie({ hauteurM: 3.1 })], [corpsMaison], maison(3, 0.6), null)!;
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ faitage: 3.1, egouts: [3.1, 3.1], baie: { forme: 'rectangle', pose: 'sous-premier-etage', source: 'observation' } });
    expect(out[1]!.pts).toEqual(saillies(maison(3, 0.6))[0]!.pts);
  });

  it('toit en appentis : le pan monte contre le mur', () => {
    const c = avecBaies([baie({ toitForme: 'appentis', hautM: 3.2, egoutM: 2.8, forme: 'arc' })], [corpsMaison], maison(3, 0.6), null)![1]!;
    expect(c).toMatchObject({ posFaitage: 0, faitage: 3.2, egouts: [3.2, 2.8], baie: { forme: 'arc' } });
  });

  it('sans cote du fait ni mesure, rien n est pose et ecartsAuFait le dit', () => {
    const f = lireFaitsToits({ format: 'plan-faits-toits', faits: { BATIMENT0000000000000001: { observation: { baies: [baie()] } } } }).BATIMENT0000000000000001!;
    const out = avecBaies(f.observation.baies, [corpsMaison], maison(3, 0.6), null)!;
    expect(out).toHaveLength(1);
    expect(ecartsAuFait(f, out, maison(3, 0.6))).toContain('bay window vers 180 : non posee');
  });

  it('une bay window couverte par un appentis ne pose aucun corps et se tient quand la saillie existe', () => {
    const b = baie({ toit: 'couverte' }); delete b.toitForme;
    expect(avecBaies([b], [corpsMaison], maison(3, 0.6), null)).toEqual([corpsMaison]);
    expect(baiePosee(b, [corpsMaison], maison(3, 0.6))).toBe(true);
    expect(baiePosee(b, [corpsMaison], maison(3, 0.6, false))).toBe(false);
  });

  it('la face designee departage : une saillie qui regarde le nord n est pas celle du sud', () => {
    expect(saillieDuFait(baie({ facade: { azimutDeg: 0 } }), maison(3, 0.6))).toBe(null);
  });

  it('AE 101 : a l est-nord-est, la hauteur se lit sous la saillie sur le LiDAR (4,1 m)', () => {
    const f = baie({ facade: { azimutDeg: 74 } });
    const c = avecBaies([f], ae101.corps, ae101.contour, ae101.grille)!.at(-1)!;
    expect(c.baie).toBeDefined();
    expect(c.faitage).toBe(4.1);
  });
});

describe('le fait d une bay window', () => {
  const lire = (b: Record<string, unknown>) => () => lireFaitsToits({ format: 'plan-faits-toits', faits: { BATIMENT0000000000000001: { observation: { baies: [b] } } } });

  it('refuse un vocabulaire hors du catalogue et dit pourquoi', () => {
    expect(lire({ ...baie(), forme: 'ovale' })).toThrow(FaitsToitsIllisibles);
    expect(lire({ ...baie(), pose: 'toit' })).toThrow(/pose/);
    expect(lire({ ...baie(), toit: 'dome' })).toThrow(/toit/);
    expect(lire({ ...baie(), congeM: 0.2 })).toThrow(/congeM/);
    expect(lire({ ...baie(), toitForme: 'appentis', hautM: 2, egoutM: 3 })).toThrow(/appentis monte/);
  });

  it('une traversante se dit, mais n est pas encore dessinee : le fichier est refuse plutot que pose sans son toit', () => {
    expect(lire({ ...baie(), toit: 'traversante', toitForme: undefined })).toThrow(/traversante/);
  });

  it('une bay window couverte n a pas de cote de toit', () => {
    expect(lire({ ...baie(), toit: 'couverte', hauteurM: 3 })).toThrow(/couverte/);
    expect(lire({ ...baie({ toit: 'couverte' }), toitForme: undefined })).not.toThrow();
  });

  it('un rectangle a angles arrondis garde son rayon', () => {
    const f = lire({ ...baie({ forme: 'conge', congeM: 0.15, hauteurM: 3 }) })().BATIMENT0000000000000001!;
    expect(f.observation.baies![0]).toMatchObject({ forme: 'conge', congeM: 0.15 });
  });
});
