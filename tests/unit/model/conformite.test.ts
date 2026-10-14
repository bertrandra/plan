import { describe, it, expect } from 'vitest';
import {
  assertionsDuVu, etatDesAssertions, formeCalculable, lireCorpusConformite, lireMesuresConformite, lireVerdict, libelleRegion,
  mesureConformite, pourCent, resumer, tauxPar, FORMAT_CORPUS_CONFORMITE, FORMAT_MESURES_CONFORMITE,
  type LectureCalculee, type VerdictCas
} from '../../../src/model/conformite.js';

// Les indicateurs de conformite (spec-regles-toits §13.5, lot G3) : le jugement d'une observation
// sur une lecture calculee, puis les taux par forme, region et probleme.

const deuxPans: LectureCalculee = { forme: 'deux-pans', bouts: ['pignon', 'pignon'], lucarnes: 0, cheminees: 0 };
const plat: LectureCalculee = { forme: 'plat', bouts: null, lucarnes: 0, cheminees: 0 };
const aucun: LectureCalculee = { forme: null, bouts: null, lucarnes: 0, cheminees: 0 };

const verdict = (p: Partial<VerdictCas>): VerdictCas => ({
  source: 'corpus', fichier: 'f.json', id: 'c1', cle: 'b', statut: 'a_corriger', etat: 'conforme', forme: 'deux-pans', region: '78',
  problemes: [], assertions: [], nonVerifiees: [], ...p,
});

describe('assertionsDuVu : ce que je vois, juge sur le calcul', () => {
  it('une forme et des bouts que le calcul dit sont tenus', () => {
    const r = assertionsDuVu({ forme: 'deux-pans', bouts: 'pignons' }, deuxPans);
    expect(r.assertions.map((a) => [a.assertion, a.tenue])).toEqual([['forme', true], ['bouts', true]]);
    expect(etatDesAssertions(r.assertions)).toBe('conforme');
  });

  it('une forme lue autrement est non conforme, avec ce que le calcul a lu', () => {
    const r = assertionsDuVu({ forme: 'croupes' }, deuxPans);
    expect(r.assertions[0]).toEqual({ assertion: 'forme', tenue: false, motif: 'lu deux-pans' });
    expect(etatDesAssertions(r.assertions)).toBe('non-conforme');
    expect(assertionsDuVu({ forme: 'croupes' }, aucun).assertions[0]?.motif).toBe('aucun toit construit');
  });

  it('une pyramide se lit en croupes', () => {
    expect(assertionsDuVu({ forme: 'pavillon' }, { ...deuxPans, forme: 'croupes', bouts: ['croupe', 'croupe'] }).assertions[0]?.tenue).toBe(true);
  });

  it('une forme que Plan ne calcule pas encore est hors calcul', () => {
    for (const f of ['mansart', 'gambrel', 'demi-croupe', 'papillon'] as const) {
      expect(formeCalculable(f)).toBe(false);
      const a = assertionsDuVu({ forme: f }, deuxPans).assertions[0];
      expect(a?.tenue).toBe(false);
      expect(a?.horsCalcul).toBe(true);
    }
    expect(assertionsDuVu({ bouts: 'demi-croupes' }, deuxPans).assertions[0]?.horsCalcul).toBe(true);
    expect(formeCalculable('deux-pans')).toBe(true);
  });

  it('les lucarnes et cheminees vues : aucune se verifie, des vues sont hors calcul', () => {
    expect(assertionsDuVu({ lucarnes: { nombre: 0 }, cheminees: { nombre: 0, souches: [] } }, deuxPans).assertions.every((a) => a.tenue)).toBe(true);
    const r = assertionsDuVu({ lucarnes: { nombre: 2, pan: 'rue' } }, deuxPans).assertions[0];
    expect(r).toEqual({ assertion: 'lucarnes', tenue: false, motif: '2 lucarnes vues, 0 calculée', horsCalcul: true });
  });

  it('une terrasse vue demande un toit plat ; acrotere et edicules sont hors calcul', () => {
    expect(assertionsDuVu({ terrasse: { accessible: true } }, plat).assertions[0]?.tenue).toBe(true);
    expect(assertionsDuVu({ terrasse: { accessible: true } }, deuxPans).assertions[0]?.tenue).toBe(false);
    expect(assertionsDuVu({ terrasse: { acrotereM: 0.6 } }, plat).assertions[0]?.horsCalcul).toBe(true);
    expect(assertionsDuVu({ terrasse: {} }, plat).assertions).toEqual([]);
  });

  it('le sens du faitage et les materiaux ne se comparent pas au calcul : notes, non verifies', () => {
    const r = assertionsDuVu({ sensFaitage: 'parallele', murs: 'enduit', couverture: 'tuile' }, deuxPans);
    expect(r.assertions).toEqual([]);
    expect(r.nonVerifiees).toEqual(['sensFaitage', 'murs', 'couverture']);
    expect(etatDesAssertions(r.assertions)).toBe('sans-observation');
  });
});

describe('les taux', () => {
  const vs: VerdictCas[] = [
    verdict({ etat: 'conforme', forme: 'deux-pans', region: '78' }),
    verdict({ etat: 'non-conforme', forme: 'deux-pans', region: '62', problemes: ['toit.morceaux', 'toit.hauteur'] }),
    verdict({ etat: 'a-revoir', forme: 'non-notee', region: '62', problemes: ['toit.morceaux'] }),
    verdict({ etat: 'sans-observation', forme: 'non-notee', region: 'Gordes' }),
    verdict({ etat: 'ecarte', forme: 'mansart', region: '78' }),
    verdict({ etat: 'non-conforme', forme: 'mansart', region: '78', assertions: [{ assertion: 'forme', tenue: false, horsCalcul: true }] }),
  ];

  it('le resume : le taux ne compte que les cas juges, les ecartes a part', () => {
    const r = resumer(vs);
    expect(r).toEqual({ total: 6, observes: 4, conformes: 1, nonConformes: 2, aRevoir: 1, sansObservation: 1, ecartes: 1, horsCalcul: 1, taux: 1 / 3 });
    expect(pourCent(r.taux)).toBe('33 %');
    expect(pourCent(null)).toBe('—');
  });

  it('par forme, les plus fournies d’abord, libelles de la fiche', () => {
    const l = tauxPar(vs, 'forme');
    expect(l.map((x) => [x.libelle, x.cas, x.taux])).toEqual([['Deux pans', 2, 0.5], ['Forme non notée', 2, null], ['Mansart', 1, 0]]);
  });

  it('par region : le departement nomme, sinon la commune', () => {
    const l = tauxPar(vs, 'region');
    expect(l.map((x) => x.libelle)).toEqual(['Pas-de-Calais (62)', 'Yvelines (78)', 'Gordes']);
    expect(libelleRegion('inconnue')).toBe('Région inconnue');
  });

  it('par probleme : un cas a deux problemes compte deux fois ; sans probleme, une ligne a part', () => {
    const l = tauxPar(vs, 'probleme');
    const morceaux = l.find((x) => x.cle === 'toit.morceaux');
    expect(morceaux).toMatchObject({ libelle: 'Découpé en morceaux', cas: 2, nonConformes: 1, aRevoir: 1, taux: 0 });
    expect(l.find((x) => x.cle === 'aucun')?.libelle).toBe('Aucun problème noté');
  });

  it('la mesure range resume, axes et etats ; facades et Claude a venir', () => {
    const m = mesureConformite({ t: new Date('2026-10-14T10:00:00Z'), code: { version: '2.2.0', commit: 'abc' }, lecture: { toits: 1, reglages: 'r', faits: 'f' }, corpus: vs.slice(0, 2), audits: vs.slice(2), auditsLus: 1 });
    expect(m.sources).toEqual({ corpus: 2, audits: 1 });
    expect(m.facades).toBeNull();
    expect(m.claude).toBeNull();
    expect(m.cas).toHaveLength(6);
    expect(m.t).toBe('2026-10-14T10:00:00.000Z');
  });
});

describe('les fichiers', () => {
  it('un verdict se relit tel quel, un objet mal forme est refuse', () => {
    const v = verdict({ assertions: [{ assertion: 'forme', tenue: false, motif: 'lu plat', horsCalcul: true }] });
    expect(lireVerdict(JSON.parse(JSON.stringify(v)))).toEqual(v);
    expect(lireVerdict({ ...v, etat: 'bizarre' })).toBeNull();
    expect(lireCorpusConformite({ format: FORMAT_CORPUS_CONFORMITE, version: 1, verdicts: [v, { n: 1 }] })).toEqual([v]);
    expect(lireCorpusConformite({ format: 'autre' })).toEqual([]);
  });

  it('l’historique du serveur se relit du plus ancien au plus recent', () => {
    const m = (t: string) => mesureConformite({ t: new Date(t), code: { version: '2.2.0', commit: null }, lecture: { toits: 1, reglages: 'r', faits: 'f' }, corpus: [verdict({})], audits: [], auditsLus: 0 });
    const lu = lireMesuresConformite({ format: FORMAT_MESURES_CONFORMITE, version: 1, mesures: [{ ...m('2026-10-14T10:00:00Z'), recuLe: '2026-10-14T10:00:01Z' }, m('2026-10-01T10:00:00Z'), { t: 'x' }] });
    expect(lu?.map((x) => x.t)).toEqual(['2026-10-01T10:00:00.000Z', '2026-10-14T10:00:00.000Z']);
    expect(lu?.[1]?.recuLe).toBe('2026-10-14T10:00:01Z');
    expect(lu?.[0]?.toits.taux).toBe(1);
    expect(lireMesuresConformite({ format: 'x' })).toBeNull();
  });
});
