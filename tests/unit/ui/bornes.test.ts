import { describe, it, expect } from 'vitest';
import { aLaBorne, avecCurseur, facteurDePas, horsBornes, messageRefus, phraseBornes, valeurApresPas, valeurDuCurseur } from '../../../src/ui/champs/bornes.js';
import { sectionsInspecteur } from '../../../src/ui/champs/sections.js';
import { sectionsConstruction } from '../../../src/ui/champs/construction.js';
import type { Champ, ChampNombre, ContexteChamps } from '../../../src/ui/champs/types.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les bornes d'un nombre (audit de l'inspecteur, 22 novembre 2026, lot A3) : une saisie hors des bornes declarees est refusee
// avec sa phrase, le pas s'arrete a la borne, et la valeur que porte deja un projet n'est jamais corrigee.

const nombre = (plus: Partial<ChampNombre> = {}): ChampNombre => ({ type: 'nombre', cle: 'n', libelle: 'Entraxe', unite: 'cm', pas: 5, lire: () => 40, ecrire: () => undefined, ...plus });

describe('les bornes d un nombre', () => {
  it('dit si une saisie en sort', () => {
    const ch = nombre({ min: 20, max: 150 });
    expect([3, -10, 19.9, 151].map(v => horsBornes(ch, v))).toEqual([true, true, true, true]);
    expect([20, 40, 150].map(v => horsBornes(ch, v))).toEqual([false, false, false]);
    expect(horsBornes(nombre(), -10)).toBe(false);
    expect(horsBornes(nombre({ min: 20 }), 100000)).toBe(false);
  });

  it('ne juge pas un champ aux bornes indicatives', () => {
    expect(horsBornes(nombre({ min: 0.1, bornesIndicatives: true }), 0.06)).toBe(false);
  });

  it('les ecrit en une phrase, a la francaise, avec l unite', () => {
    expect(phraseBornes(nombre({ min: 20, max: 150 }))).toBe('Entre 20 et 150 cm');
    expect(phraseBornes(nombre({ min: 20 }))).toBe('Au moins 20 cm');
    expect(phraseBornes(nombre({ max: 6, unite: 'm' }))).toBe('Au plus 6 m');
    expect(phraseBornes(nombre({ min: 0.05, max: 1.5, unite: 'm' }))).toBe('Entre 0,05 et 1,5 m');
    expect(phraseBornes({ type: 'nombre', cle: 'k', libelle: 'K', min: 5, lire: () => 5, ecrire: () => undefined })).toBe('Au moins 5');
    expect(phraseBornes(nombre())).toBe('');
  });

  it('donne les bornes pour une saisie qui en sort, la raison du champ sinon', () => {
    const ch = nombre({ min: 20, max: 150 });
    expect(messageRefus(ch, 3)).toBe('Entre 20 et 150 cm');
    expect(messageRefus(ch, 40)).toMatch(/n’est pas possible ici/);
    expect(messageRefus(nombre({ raisonRefus: 'Le cercle sortirait de la parcelle.' }), 4)).toBe('Le cercle sortirait de la parcelle.');
  });

  it('arrete le pas a la borne, et la signale', () => {
    const ch = nombre({ min: 20, max: 150 });
    expect(valeurApresPas(ch, 25, -1)).toBe(20);
    expect(valeurApresPas(ch, 20, -1)).toBeNull();
    expect(valeurApresPas(ch, 148, 1)).toBe(150);
    expect(valeurApresPas(ch, 150, 1)).toBeNull();
    expect(aLaBorne(ch, 20, -1)).toBe(true);
    expect(aLaBorne(ch, 20, 1)).toBe(false);
    expect(aLaBorne(nombre(), -1000, -1)).toBe(false);
    // Le pas arrondit a ses decimales : 0,1 + 0,2 ne laisse pas de poussiere.
    expect(valeurApresPas(nombre({ pas: 0.1 }), 0.2, 1)).toBe(0.3);
  });

  it('d une valeur hors bornes, le pas se pose sur la borne et ne s eloigne pas', () => {
    const ch = nombre({ min: 20, max: 150 });
    expect(valeurApresPas(ch, 3, 1)).toBe(20);
    expect(valeurApresPas(ch, 3, -1)).toBeNull();
    expect(valeurApresPas(ch, 400, -1)).toBe(150);
    expect(valeurApresPas(ch, 400, 1)).toBeNull();
  });
});

describe('les bornes des champs du plan', () => {
  const objets = structuredClone(DEMO_OBJECTS) as ObjetPlan[];
  const terrasse = objets.find(o => o.fonction === 'terrasse')!;
  const cx = { etat: { objects: objets, highlight: {} }, obj: terrasse, objets, parcelle: objets.find(o => o.key === 'parcelle'), construction: () => terrasse.construction!, elevationOf: () => 0, libelleType: () => 'objet' } as unknown as ContexteChamps;
  const champDe = (cle: string): ChampNombre => {
    const ch = sectionsConstruction(cx).flatMap(s => s.champs).find(x => x.cle === cle);
    if (!ch || ch.type !== 'nombre') throw new Error('pas un nombre : ' + cle);
    return ch;
  };

  it('un projet qui porte une valeur hors bornes la montre telle quelle', () => {
    // Un entraxe de 3 cm, ecrit avant que le clavier ne soit borne : le champ le lit, rien ne le corrige.
    const avant = terrasse.construction!.soliveEntraxe;
    terrasse.construction!.soliveEntraxe = 3;
    const ch = champDe('soliveEntraxe');
    expect(ch.lire(cx)).toBe(3);
    expect(terrasse.construction!.soliveEntraxe).toBe(3);
    expect(horsBornes(ch, 3)).toBe(true);
    if (avant === undefined) delete terrasse.construction!.soliveEntraxe; else terrasse.construction!.soliveEntraxe = avant;
  });

  it('l entraxe des solives refuse 3 cm et −10 cm', () => {
    const ch = champDe('soliveEntraxe');
    expect(horsBornes(ch, 3)).toBe(true);
    expect(horsBornes(ch, -10)).toBe(true);
    expect(messageRefus(ch, 3)).toBe('Au moins 20 cm');
  });

  it('les bornes de la cloture, du rayon et de la longueur d un cote restent indicatives', () => {
    const tous = (o: ObjetPlan): { section: string; ch: ChampNombre }[] => {
      const c = { ...cx, obj: o } as ContexteChamps;
      const aplatir = (s: string, liste: Champ[]): { section: string; ch: ChampNombre }[] =>
        liste.flatMap(ch => ch.type === 'nombre' ? [{ section: s, ch }] : ch.type === 'ligne' ? aplatir(s, ch.champs) : []);
      return sectionsInspecteur(c).flatMap(s => aplatir(s.id, s.champs));
    };
    const parcelle = objets.find(o => o.key === 'parcelle')!;
    const deLaCloture = tous(parcelle).filter(x => x.section === 'cloture' || x.section === 'portails');
    expect(deLaCloture.length).toBeGreaterThan(0);
    expect(deLaCloture.every(x => x.ch.bornesIndicatives)).toBe(true);
    expect(tous(terrasse).filter(x => x.section === 'cotes' && x.ch.cle === 'longueur').every(x => x.ch.bornesIndicatives)).toBe(true);
    // Les reglages de la construction, eux, tiennent leurs bornes.
    expect(tous(terrasse).filter(x => x.section === 'structure').some(x => x.ch.bornesIndicatives)).toBe(false);
  });
});

describe('le pas qui grandit et le curseur (decision B4)', () => {
  it('maintenu, le pas grandit : un, puis deux, cinq et dix pas a la fois', () => {
    expect([0, 5, 6, 15, 16, 29, 30, 100].map(facteurDePas)).toEqual([1, 1, 2, 2, 5, 5, 10, 10]);
  });

  it('un grand pas reste dans les bornes', () => {
    const ch = nombre({ min: 20, max: 150 });
    expect(valeurApresPas(ch, 125, -1, 10)).toBe(75);
    expect(valeurApresPas(ch, 40, -1, 10)).toBe(20);
    expect(valeurApresPas(ch, 145, 1, 5)).toBe(150);
    expect(valeurApresPas(ch, 20, -1, 10)).toBeNull();
  });

  it('maintenir « − » de 125 a 20 cm prend moins de deux secondes, contre 21 touchers', () => {
    // Le premier pas, puis une repetition toutes les 90 ms apres 400 ms (zones/composants/Champs.tsx).
    const ch = nombre({ min: 20, max: 150 });
    let v: number | null = valeurApresPas(ch, 125, -1)!, n = 0, ms = 400;
    while (v !== null && v > 20) { n++; ms += 90; v = valeurApresPas(ch, v, -1, facteurDePas(n)); }
    expect(v).toBe(20);
    expect(ms).toBeLessThan(2000);
  });

  it('ne montre un curseur qu entre deux bornes fermes, et pas pour des centaines de milliers de pas', () => {
    expect(avecCurseur(nombre({ min: 2, max: 45, pas: 1 }))).toBe(true);
    expect(avecCurseur(nombre({ min: 20 }))).toBe(false);
    expect(avecCurseur(nombre({ min: 20, max: 150, bornesIndicatives: true }))).toBe(false);
    expect(avecCurseur(nombre({ min: 0, max: 1e6, pas: 1 }))).toBe(false);
    expect(avecCurseur(nombre({ min: 5, max: 5 }))).toBe(false);
  });

  it('le curseur montre la valeur du projet ramenee dans les bornes, sans l ecrire', () => {
    const ch = nombre({ min: 20, max: 150 });
    expect([3, 40, 400].map((v) => valeurDuCurseur(ch, v))).toEqual([20, 40, 150]);
  });

  it('le niveau fini d une terrasse, borne de 0 a 200 cm, a son curseur', () => {
    const terrasse = DEMO_OBJECTS.find((o) => o.fonction === 'terrasse') as ObjetPlan;
    const cx = { etat: { objects: DEMO_OBJECTS, highlight: {} }, obj: terrasse, objets: DEMO_OBJECTS, parcelle: null, construction: () => terrasse.construction } as unknown as ContexteChamps;
    const niveau = sectionsConstruction(cx).flatMap((s) => s.champs).find((c) => c.cle === 'niveauFini') as ChampNombre;
    expect(avecCurseur(niveau)).toBe(true);
  });
});
