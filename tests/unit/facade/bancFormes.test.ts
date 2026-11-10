import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formeLocaleDuCorps, formeLocaleDesCorps, corpsPrincipal, chargerDeduction, DEDUCTION_LOCALE, MODULE_FORME_TOIT,
  formesDuBatiment, compterFormes, ligneCompte, lignesFormes, changementsDeForme, changementsDeCorps, bilanChangements,
  ecartsCompteurs, lireReference, SANS_CORPS, SANS_MESURE, ABSENT, type ReferenceFormes, type CompteursBanc,
} from '../../banc/toits/formes.js';
import type { CorpsToit } from '../../../src/model/types.js';

// Le banc des formes (MD/plan-vague-3-generaliser.md, lot G2) : la forme d'un batiment se deduit de
// ses corps comme le fera model/formeToit.ts (lot G1), et les changements par rapport a une
// reference se listent sans en oublier ni en inventer. Le banc lui-meme
// (.claude/skills/toits/scripts/banc.ts) tourne sur les JSON des villages, hors CI.

/** Un corps de L x W m, faitage le long de `pts[0] -> pts[1]`. */
function corps(L: number, W: number, o: Partial<CorpsToit> = {}): CorpsToit {
  return {
    pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }],
    posFaitage: W / 2, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0.2, ...o,
  };
}

const FIXTURES = join(__dirname, '../../fixtures/toits');
const corpsDesFixtures = (): CorpsToit[] =>
  readdirSync(FIXTURES).flatMap((f) => (JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')) as { corps?: CorpsToit[] }).corps ?? []);

describe('banc des formes : la forme d\'un corps', () => {
  it('nomme les formes que le calcul produit, en mots de couvreur', () => {
    expect(formeLocaleDuCorps(corps(10, 8))).toBe('deux-pans');
    expect(formeLocaleDuCorps(corps(10, 8, { faitage: 5.2 }))).toBe('plat');            // 20 cm de montee
    expect(formeLocaleDuCorps(corps(10, 8, { posFaitage: 0, egouts: [6, 3] }))).toBe('appentis');
    expect(formeLocaleDuCorps(corps(10, 8, { posFaitage: 8, egouts: [3, 6] }))).toBe('appentis');
    expect(formeLocaleDuCorps(corps(12, 8, { croupes: [3, 3] }))).toBe('croupes');
    expect(formeLocaleDuCorps(corps(12, 8, { croupes: [3, 0] }))).toBe('croupes');      // une seule croupe
    expect(formeLocaleDuCorps(corps(10, 8, { croupes: [0, 0] }))).toBe('deux-pans');    // croupes nulles : pignons
  });

  it('un quatre-pans presque carre au faitage court est un pavillon, pas un plan allonge', () => {
    expect(formeLocaleDuCorps(corps(8, 8, { croupes: [3.6, 3.6] }))).toBe('pavillon');   // faitage de 0,8 m
    expect(formeLocaleDuCorps(corps(8, 8, { croupes: [3, 3] }))).toBe('croupes');        // faitage de 2 m
    expect(formeLocaleDuCorps(corps(11, 8, { croupes: [5.2, 5.2] }))).toBe('croupes');   // plan allonge (1,375)
    expect(formeLocaleDuCorps(corps(8, 8, { croupes: [3.6, 0] }))).toBe('croupes');      // une croupe et un pignon
  });

  it('un faitage sous les egouts, au milieu, est un papillon', () => {
    expect(formeLocaleDuCorps(corps(10, 8, { faitage: 4, egouts: [5, 5] }))).toBe('papillon');
  });

  it('la forme d\'ensemble est celle du plus grand corps ; aucune sans corps', () => {
    const annexe = corps(4, 3, { posFaitage: 0 });
    const maison = corps(12, 9);
    expect(corpsPrincipal([annexe, maison])).toBe(maison);
    expect(formeLocaleDesCorps([annexe, maison])).toBe('deux-pans');
    expect(formeLocaleDesCorps([])).toBeNull();
    expect(formeLocaleDesCorps(null)).toBeNull();
  });

  it('AE 101 : un deux-pans, ses trois corps aussi', () => {
    const ae101 = JSON.parse(readFileSync(join(FIXTURES, 'vesinet-ae101.json'), 'utf8')) as { corps: CorpsToit[] };
    const f = formesDuBatiment(DEDUCTION_LOCALE, ae101.corps, true);
    expect(f.forme).toBe('deux-pans');
    expect(f.corps).toEqual(['deux-pans', 'deux-pans', 'deux-pans']);
  });

  it('un batiment sans corps dit pourquoi : surface mesuree ou non', () => {
    expect(formesDuBatiment(DEDUCTION_LOCALE, [], true)).toEqual({ forme: SANS_CORPS, corps: [] });
    expect(formesDuBatiment(DEDUCTION_LOCALE, [], false)).toEqual({ forme: SANS_MESURE, corps: [] });
  });
});

describe('banc des formes : la deduction retenue', () => {
  it('sans model/formeToit.ts, la copie locale', async () => {
    expect((await chargerDeduction(join(tmpdir(), 'absent-formeToit.ts'))).source).toBe('locale');
  });

  it('avec un module qui exporte les deux fonctions, celles du modele', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'banc-formes-'));
    const chemin = join(dossier, 'formeToit.ts');
    writeFileSync(chemin, "export const formeDuCorpsToit = () => 'mansart';\nexport const formeDesCorps = () => 'mansart';\n");
    const d = await chargerDeduction(chemin);
    expect(d.source).toBe('modele');
    expect(formesDuBatiment(d, [corps(10, 8)], true)).toEqual({ forme: 'mansart', corps: ['mansart'] });
  });

  // Quand le lot G1 arrive dans la branche, la copie locale doit dire la meme chose que le modele sur
  // les corps d'aujourd'hui : sinon le banc changerait de chiffres sans qu'aucune regle n'ait bouge.
  it.runIf(existsSync(MODULE_FORME_TOIT))('la copie locale s\'accorde avec model/formeToit.ts (G1)', async () => {
    const d = await chargerDeduction();
    expect(d.source).toBe('modele');
    const essais = [
      ...corpsDesFixtures(), corps(10, 8), corps(10, 8, { faitage: 5.2 }), corps(10, 8, { posFaitage: 0 }),
      corps(12, 8, { croupes: [3, 3] }), corps(8, 8, { croupes: [3.6, 3.6] }), corps(10, 8, { faitage: 4 }),
    ];
    for (const c of essais) expect(d.duCorps(c)).toBe(formeLocaleDuCorps(c));
  });
});

describe('banc des formes : compte et changements', () => {
  const ref = {
    a: { forme: 'deux-pans', corps: ['deux-pans', 'appentis'] },
    b: { forme: 'croupes', corps: ['croupes'] },
    c: { forme: 'plat', corps: ['plat'] },
    d: { forme: SANS_CORPS, corps: [] },
  };
  const apres = {
    a: { forme: 'deux-pans', corps: ['appentis', 'deux-pans'] },  // meme corps, autre ordre : rien
    b: { forme: 'mansart', corps: ['mansart'] },
    c: { forme: 'plat', corps: ['plat', 'appentis'] },             // une annexe de plus
    e: { forme: 'appentis', corps: ['appentis'] },
  };

  it('compte dans l\'ordre du catalogue, les formes inconnues a la fin', () => {
    expect(compterFormes(['deux-pans', 'plat', 'zz-nouvelle', 'deux-pans', SANS_CORPS, 'croupes'])).toEqual([
      ['plat', 1], ['deux-pans', 2], ['croupes', 1], [SANS_CORPS, 1], ['zz-nouvelle', 1],
    ]);
    expect(ligneCompte([])).toBe('aucune');
    expect(lignesFormes(ref)).toEqual([
      'formes des batiments : plat 1, deux-pans 1, croupes 1, sans corps 1',
      'formes des corps : plat 1, appentis 1, deux-pans 1, croupes 1',
    ]);
  });

  it('liste les batiments dont la forme change, ceux qui apparaissent et ceux qui disparaissent', () => {
    const ch = changementsDeForme(ref, apres);
    expect(ch).toEqual([
      { cle: 'b', avant: 'croupes', apres: 'mansart' },
      { cle: 'd', avant: SANS_CORPS, apres: ABSENT },
      { cle: 'e', avant: ABSENT, apres: 'appentis' },
    ]);
    expect(bilanChangements(ch)).toEqual(['absent -> appentis 1', 'croupes -> mansart 1', 'sans corps -> absent 1']);
    expect(changementsDeForme(ref, ref)).toEqual([]);
  });

  it('a part, les batiments de meme forme dont un corps change', () => {
    expect(changementsDeCorps(ref, apres)).toEqual(['c']);
  });

  it('les compteurs qui bougent, et seulement eux', () => {
    const c: CompteursBanc = { batiments: 69, corps: 118, suspects: 33, sansCorps: 2, reprise: 14 };
    expect(ecartsCompteurs(c, { ...c })).toEqual([]);
    expect(ecartsCompteurs(c, { ...c, suspects: 34 })).toEqual(['suspects 33 -> 34']);
  });

  it('relit une reference ecrite, et refuse un fichier faux', () => {
    const r: ReferenceFormes = {
      version: 1, village: 'hucqueliers', date: '2026-10-14T12:00:00Z', commit: 'bf39898', deduction: 'locale',
      compteurs: { batiments: 69, corps: 118, suspects: 34, sansCorps: 2, reprise: 14 }, batiments: ref,
    };
    expect(lireReference(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(() => lireReference({ ...r, version: 2 })).toThrow(/version/);
    expect(() => lireReference({ ...r, compteurs: { corps: 1 } })).toThrow(/compteurs/);
    expect(() => lireReference({ ...r, batiments: { a: { forme: 3 } } })).toThrow(/batiments/);
    expect(() => lireReference({ ...r, deduction: 'autre' })).toThrow(/deduction/);
  });
});
