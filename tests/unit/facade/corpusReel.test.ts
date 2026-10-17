import { describe, it, expect } from 'vitest';
import { brouillonsDeLAudit, fiabilite, juger, lireCasReel, mesurerCas, tableauReel, FORMAT_CAS_REEL, type CasReel } from '../../banc/facades/reel.js';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { photographier, coinsVrais, type PriseCamera, type SceneFacade } from '../../banc/facades/synthese.js';
import type { OuvertureDetectee } from '../../../src/facade/detection.js';

// Le corpus de facades reelles (banc/facades/reel.ts) : le format, le jugement des baies, la courbe de fiabilite de la
// confiance, les brouillons tires d'un fichier d'audit ; puis un cas fabrique d'une scene du banc, pour prouver la chaine.

const det = (x: number, confiance: number, y = 1): OuvertureDetectee => ({ type: 'fenetre', x, y, l: 1, h: 1.4, confiance, source: 'detectee' });
const vraie = (x: number, y = 1) => ({ type: 'fenetre' as const, x, y, l: 1, h: 1.4 });

describe('le jugement des baies', () => {
  it('apparie une detectee a une vraie, une seule fois', () => {
    const j = juger([vraie(2), vraie(5)], [det(2.02, 0.9), det(2.05, 0.8), det(9, 0.5)]);
    expect(j.vp).toBe(1);
    expect(j.jugees.map((x) => x.juste)).toEqual([true, false, false]);
    expect(j.cotes).toHaveLength(4);
  });
});

describe('la fiabilite de la confiance', () => {
  it('est nulle quand la confiance dit la verite', () => {
    const jugees = [...Array(8).fill(0).map(() => ({ confiance: 0.9, juste: true, devinee: false })), { confiance: 0.9, juste: false, devinee: false }];
    const f = fiabilite(jugees, 5);
    expect(f.n).toBe(9);
    expect(f.cases[4]?.taux).toBeCloseTo(8 / 9, 5);
    expect(f.ece).toBeLessThan(0.05);
  });
  it('denonce une confiance trop sure d elle', () => {
    const f = fiabilite(Array(10).fill(0).map((_, i) => ({ confiance: 0.9, juste: i < 5, devinee: false })));
    expect(f.ece).toBeCloseTo(0.4, 5);
    expect(f.brier).toBeCloseTo(0.5 * 0.01 + 0.5 * 0.81, 5);
  });
  it('rend null sans baie', () => {
    expect(fiabilite([])).toMatchObject({ ece: null, brier: null, n: 0 });
  });
});

describe('le format d un cas', () => {
  const cas = (): CasReel => ({ format: FORMAT_CAS_REEL, version: 1, nom: 'x', statut: 'valide', largeurM: 9, hauteurM: 5, photos: [{ fichier: 'x.jpg', coins: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }], ouvertures: [] });
  it('se relit, un cas sans statut reste brouillon', () => {
    expect(lireCasReel({ ...cas(), statut: undefined }).statut).toBe('brouillon');
    expect(lireCasReel(cas()).statut).toBe('valide');
  });
  it('refuse un cas incomplet', () => {
    expect(() => lireCasReel({ ...cas(), photos: [{ fichier: 'a', coins: [] }] })).toThrow(/quatre coins/);
    expect(() => lireCasReel({ ...cas(), format: 'autre' })).toThrow();
    expect(() => lireCasReel({ ...cas(), largeurM: 0 })).toThrow(/largeur/);
  });
});

describe('les brouillons d un fichier d audit', () => {
  const audit = { batiments: [{ cle: 'BATI000123', nom: 'Maison', facades: [
    { cote: 2, photos: [{ base64: 'AAAA' }], mesure: { rangReleve: 0, releve: { largeur: 8, hauteur: 5, ouvertures: [vraie(1)], calage: { photos: [{ coins: [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 9 }, { x: 1, y: 9 }] }] } } } },
    { cote: 0, photos: [], mesure: null },
  ] }] };
  it('garde la photo, les coins et les baies du releve, au statut brouillon', () => {
    const b = brouillonsDeLAudit(audit, 'audit-x');
    expect(b).toHaveLength(1);
    expect(b[0]?.cas).toMatchObject({ statut: 'brouillon', largeurM: 8, hauteurM: 5 });
    expect(b[0]?.cas.photos[0]?.coins).toHaveLength(4);
    expect(b[0]?.base64).toBe('AAAA');
    expect(lireCasReel(b[0]?.cas)).toBeTruthy();
  });
  it('refuse un fichier qui n est pas un audit de parcelle', () => {
    expect(() => brouillonsDeLAudit({ cas: [] }, 'x')).toThrow(/bâtiments/);
  });
});

describe('la chaine sur un cas fabrique d une scene du banc', () => {
  it('mesure une facade photographiee contre sa verite', () => {
    const s = chargerCorpus().find((c) => c.nom.startsWith('02-')) as SceneFacade;
    const p = s.synthese.prise as PriseCamera;
    const ph = photographier(s, 100, p), coins = coinsVrais(s, p);
    if (!ph || !coins) throw new Error('scene impossible');
    const cas: CasReel = { format: FORMAT_CAS_REEL, version: 1, nom: s.nom, statut: 'valide', largeurM: s.verite.largeur, hauteurM: s.verite.hauteur, photos: [{ fichier: 'synthese', coins, focalePx: ph.focalePx }], ouvertures: s.verite.ouvertures as never };
    const r = mesurerCas(cas, [ph.image]);
    expect(r.vraies).toBe(6);
    expect(r.vp).toBe(6);
    expect(r.fp).toBe(0);
    expect(tableauReel([r], 'Essai').join('\n')).toMatch(/Ensemble\*\* \(1\)/);
  }, 60_000);
});
