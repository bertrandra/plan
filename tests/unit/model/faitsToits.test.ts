import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  lireFaitsToits, FaitsToitsIllisibles, FAITS_TOITS_LIVRES, EMPREINTE_FAITS_TOITS, empreinteFaitsToits,
  faitDuBatiment, cleDuBatiment, essayerFaitsToits, faitsEnVigueur, essaiDeFaits, cleToucheeParEssai,
  compterFaitsParForme, signatureFait, FAITS_SEMBLABLES_MAX,
} from '../../../src/model/faitsToits.js';

// Les faits des toits : regles/toits/faits.json (MD/spec-regles-toits.md §5, §9.2).

const CLE = 'BATIMENT0000000322509199';
const fichier = (faits: Record<string, unknown>) => ({ format: 'plan-faits-toits', version: 1, faits });
const deuxPans = { observation: { forme: 'deux-pans', faitage: { par: 'long', sens: 'parallele' }, bouts: ['pignon', 'pignon'], corps: { min: 1, max: 1 } }, application: 'contrainte' };

afterEach(() => essayerFaitsToits(null));

describe('regles/toits/faits.json', () => {
  it('le fichier livre se lit, et chaque cle est une cle BD TOPO', () => {
    const brut = JSON.parse(readFileSync(join(__dirname, '../../../regles/toits/faits.json'), 'utf8')) as { faits: Record<string, unknown> };
    expect(Object.keys(FAITS_TOITS_LIVRES).sort()).toEqual(Object.keys(brut.faits).sort());
    for (const cle of Object.keys(FAITS_TOITS_LIVRES)) expect(cle).toMatch(/^BATIMENT\d{16}$/);
    expect(EMPREINTE_FAITS_TOITS).toBe(empreinteFaitsToits(FAITS_TOITS_LIVRES));
  });

  it('aucun fait livre ne vise AE 101 (la maison de reference ne bouge pas)', () => {
    for (const f of Object.values(FAITS_TOITS_LIVRES)) expect(f.adresse ?? '').not.toMatch(/allée des Limites/i);
  });
});

describe('lireFaitsToits', () => {
  it('lit un fait en contrainte, la forme seule devenant une liste', () => {
    const f = lireFaitsToits(fichier({ [CLE]: { ...deuxPans, preuve: { promenade: 'audit-x.json', cas: 'c2', photo: true }, adresse: '16 boulevard de Belgique' } }));
    expect(f[CLE]).toEqual({
      observation: { forme: ['deux-pans'], faitage: { par: 'long', sens: 'parallele' }, bouts: ['pignon', 'pignon'], corps: { min: 1, max: 1 } },
      application: 'contrainte', preuve: { promenade: 'audit-x.json', cas: 'c2', photo: true }, adresse: '16 boulevard de Belgique',
    });
  });

  it('refuse une forme du catalogue que le calcul ne produit pas encore (lot G1 : le vocabulaire reste ferme)', () => {
    expect(() => lireFaitsToits(fichier({ [CLE]: { observation: { forme: 'mansart' } } }))).toThrow(FaitsToitsIllisibles);
    expect(() => lireFaitsToits(fichier({ [CLE]: { observation: { forme: ['deux-pans', 'demi-croupes'] } } }))).toThrow(/ne se calculent pas encore/);
  });

  it('prend la contrainte par defaut, et lit un remplacement avec ses dimensions', () => {
    const f = lireFaitsToits(fichier({
      [CLE]: { observation: { forme: 'plat' } },
      BATIMENT0000000000000002: { observation: { forme: ['appentis'] }, application: 'remplacement', dimensions: { egoutM: 3, faitageM: 4.5, hautVersDeg: 180 } },
    }));
    expect(f[CLE]!.application).toBe('contrainte');
    expect(f.BATIMENT0000000000000002!.dimensions).toEqual({ egoutM: 3, faitageM: 4.5, hautVersDeg: 180 });
  });

  it.each([
    ['un autre format', { format: 'plan-reglages-toits', faits: {} }, /format inconnu/],
    ['une cle qui n est pas BD TOPO', fichier({ 'batiment.37248484': deuxPans }), /cle BD TOPO/],
    ['une forme hors du vocabulaire', fichier({ [CLE]: { observation: { forme: 'mansart' } } }), /forme/],
    ['le sens par rapport a la rue', fichier({ [CLE]: { observation: { faitage: { par: 'rue', sens: 'perpendiculaire' } } } }), /azimut de la photo/],
    ['trois bouts', fichier({ [CLE]: { observation: { bouts: ['pignon', 'pignon', 'croupe'] } } }), /deux bouts/],
    ['un remplacement sans dimensions', fichier({ [CLE]: { observation: { forme: 'deux-pans' }, application: 'remplacement' } }), /dimensions/],
    ['un remplacement a deux formes', fichier({ [CLE]: { observation: { forme: ['deux-pans', 'croupes'] }, application: 'remplacement', dimensions: { egoutM: 5, faitageM: 8 } } }), /une seule forme/],
    ['un faitage sous l egout', fichier({ [CLE]: { observation: { forme: 'deux-pans' }, application: 'remplacement', dimensions: { egoutM: 5, faitageM: 4 } } }), /au-dessus/],
    ['une application inconnue', fichier({ [CLE]: { ...deuxPans, application: 'suggestion' } }), /application/],
  ])('refuse %s', (_quoi, donnees, message) => {
    expect(() => lireFaitsToits(donnees)).toThrow(FaitsToitsIllisibles);
    expect(() => lireFaitsToits(donnees)).toThrow(message);
  });
});

describe('empreinteFaitsToits', () => {
  it('suit l observation et l application, pas la preuve ni l historique', () => {
    const a = lireFaitsToits(fichier({ [CLE]: deuxPans }));
    const b = lireFaitsToits(fichier({ [CLE]: { ...deuxPans, preuve: { cas: 'c9' }, historique: [{ t: '2026-10-14', texte: 'valide' }] } }));
    const c = lireFaitsToits(fichier({ [CLE]: { ...deuxPans, observation: { ...deuxPans.observation, forme: 'croupes', bouts: undefined } } }));
    expect(empreinteFaitsToits(b)).toBe(empreinteFaitsToits(a));
    expect(empreinteFaitsToits(c)).not.toBe(empreinteFaitsToits(a));
    expect(empreinteFaitsToits({})).not.toBe(empreinteFaitsToits(a));
  });
});

describe('le fait d un batiment, et le mode d essai', () => {
  it('se trouve par la cle BD TOPO (cleabs), pas par l identifiant du service', () => {
    const faits = lireFaitsToits(fichier({ [CLE]: deuxPans }));
    expect(cleDuBatiment({ bdtopo: { id: 'batiment.1', cleabs: CLE } })).toBe(CLE);
    expect(faitDuBatiment({ bdtopo: { cleabs: CLE } }, faits)?.application).toBe('contrainte');
    expect(faitDuBatiment({ bdtopo: { id: CLE } }, faits)).toBe(null);
    expect(faitDuBatiment({ bdtopo: null }, faits)).toBe(null);
    expect(faitDuBatiment({ bdtopo: { cleabs: 'toString' } }, faits)).toBe(null);
  });

  it('un essai remplace les faits du depot le temps de la seance, et touche les batiments des deux jeux', () => {
    expect(essaiDeFaits()).toBe(false);
    expect(faitsEnVigueur()).toBe(FAITS_TOITS_LIVRES);
    expect(cleToucheeParEssai(CLE)).toBe(false);
    const essai = lireFaitsToits(fichier({ [CLE]: deuxPans }));
    essayerFaitsToits(essai);
    expect(essaiDeFaits()).toBe(true);
    expect(faitDuBatiment({ bdtopo: { cleabs: CLE } })).toBe(essai[CLE]);
    expect(cleToucheeParEssai(CLE)).toBe(true);
    expect(cleToucheeParEssai('BATIMENT0000000000000009')).toBe(Object.prototype.hasOwnProperty.call(FAITS_TOITS_LIVRES, 'BATIMENT0000000000000009'));
    expect(cleToucheeParEssai(null)).toBe(false);
    essayerFaitsToits(null);
    expect(faitDuBatiment({ bdtopo: { cleabs: CLE } })).toBe(FAITS_TOITS_LIVRES[CLE] ?? null);
  });
});

describe('compterFaitsParForme', () => {
  const cle = (i: number) => 'BATIMENT' + String(i).padStart(16, '0');
  it('groupe les faits qui disent la meme chose, et signale au-dela de cinq', () => {
    const faits: Record<string, unknown> = {};
    for (let i = 1; i <= FAITS_SEMBLABLES_MAX + 1; i++) faits[cle(i)] = { observation: { forme: 'croupes', bouts: ['croupe', 'croupe'] } };
    for (let i = 20; i < 20 + FAITS_SEMBLABLES_MAX; i++) faits[cle(i)] = { observation: { forme: 'deux-pans', faitage: { par: 'long', sens: 'parallele' } } };
    const groupes = compterFaitsParForme(lireFaitsToits(fichier(faits)));
    expect(groupes.map((g) => [g.signature, g.nombre, g.signal])).toEqual([
      ['croupes, bouts croupe+croupe', 6, true],
      ['deux-pans, faitage parallele au long cote', 5, false],
    ]);
    expect(groupes[0]!.cles).toHaveLength(6);
  });

  it('une forme dite dans un autre ordre est la meme', () => {
    const f = lireFaitsToits(fichier({ [CLE]: { observation: { forme: ['croupes', 'deux-pans'] } }, [cle(2)]: { observation: { forme: ['deux-pans', 'croupes'] } } }));
    expect(signatureFait(f[CLE]!)).toBe(signatureFait(f[cle(2)]!));
  });
});
