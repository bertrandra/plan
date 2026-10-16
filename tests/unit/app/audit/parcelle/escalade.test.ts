import { describe, it, expect, vi } from 'vitest';
import { batimentsEnDesaccord, escalader, requetesEscalade, ESCALADE_PAR_APPEL } from '../../../../../src/app/audit/parcelle/escalade.js';
import { EchecAnalyse, type ClientAnalyse, type DemandeAnalyse, type ResultatBatch } from '../../../../../src/io/analyseClaude.js';
import type { BatchAnalyse } from '../../../../../src/model/auditParcelle.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';

// L'escalade (D20) : quels batiments se desaccordent, quelles requetes repartent, et ce qui arrive quand le
// serveur refuse (plafond) ou echoue.

const forme = (v: string) => reponse({ forme: { indices: [], valeur: v } });
const D = [forme('deux-pans'), forme('croupes'), forme('deux-pans')];
const U = [forme('deux-pans'), forme('deux-pans'), forme('deux-pans')];

/** Une demande de n batiments, trois passes chacun, plus une requete de renfort (qui ne doit jamais repartir). */
function demande(n: number): { demande: DemandeAnalyse; requetes: BatchAnalyse['requetes'] } {
  const requetes: BatchAnalyse['requetes'] = {};
  const liste: DemandeAnalyse['requetes'] = [];
  for (let b = 0; b < n; b++) for (let p = 1; p <= 3; p++) {
    requetes['b' + b + '-p' + p] = { cle: 'cle' + b, passe: p };
    liste.push({ id: 'b' + b + '-p' + p, passe: p as 1 | 2 | 3, facades: 2, contenu: [{ type: 'text', text: 'batiment ' + b }] });
  }
  requetes['b0#0-r1'] = { cle: 'cle0', passe: 1, cote: 0, usage: 'renfort' };
  liste.push({ id: 'b0#0-r1', passe: 1, usage: 'renfort', facades: 1, contenu: [{ type: 'text', text: 'renfort' }] });
  return { demande: { projet: 'p', idu: 'i', adresse: null, audit: 'a', depot: 'depot-1', usage: 'analyse', requetes: liste }, requetes };
}
const ok = (id: string, sortie: unknown = reponse()): ResultatBatch => ({ id, statut: 'reussi', passe: 1, sortie, erreur: null });
function client(immediat: ClientAnalyse['immediat']): ClientAnalyse {
  return { etat: vi.fn(), creerBatch: vi.fn(), etatBatch: vi.fn(), resultats: vi.fn(), immediat };
}

describe('les batiments en desaccord', () => {
  it('sont ceux dont les passes ne s accordent pas toutes sur un attribut, avec ces attributs', () => {
    expect(batimentsEnDesaccord({ a: D, b: U, c: D })).toEqual({ a: ['forme'], c: ['forme'] });
  });
  it('ignorent un batiment avec une seule passe lue, et les sorties illisibles', () => {
    expect(batimentsEnDesaccord({ a: [forme('plat')], b: [forme('plat'), { pas: 'une reponse' }], c: [] })).toEqual({});
  });
});

describe('les requetes de l escalade', () => {
  it('reprennent la premiere passe des batiments en desaccord, sans les facades a recompter, jamais le renfort', () => {
    const { demande: d, requetes } = demande(3);
    const r = requetesEscalade(d, requetes, ['cle0', 'cle2']);
    expect(r.map((x) => [x.cle, x.requete.id, x.requete.facades, x.requete.usage])).toEqual([['cle0', 'b0-p1', 0, 'analyse'], ['cle2', 'b2-p1', 0, 'analyse']]);
    expect(r[0]!.requete.contenu).toEqual(d.requetes[0]!.contenu);
  });
  it('sautent un batiment que la demande ne porte plus', () => {
    const { demande: d, requetes } = demande(1);
    expect(requetesEscalade(d, requetes, ['inconnu'])).toEqual([]);
  });
});

describe('appeler le modele fin', () => {
  it('part par appels de trois requetes, usage escalade, sans depot, et range la reponse de chaque batiment', async () => {
    const { demande: d, requetes } = demande(5);
    const immediat = vi.fn(async (x: DemandeAnalyse) => ({ modele: 'claude-sonnet-5-5', prompt: 5, schema: 1, resultats: x.requetes.map((r) => ok(r.id, forme(r.id))) }));
    const out = await escalader(client(immediat), d, requetes, ['cle0', 'cle1', 'cle2', 'cle3', 'cle4']);
    expect(ESCALADE_PAR_APPEL).toBe(3);
    expect(immediat.mock.calls.map((c) => c[0].requetes.length)).toEqual([3, 2]);
    expect(immediat.mock.calls.every((c) => c[0].usage === 'escalade' && c[0].depot === null)).toBe(true);
    expect(Object.keys(out.parBatiment)).toEqual(['cle0', 'cle1', 'cle2', 'cle3', 'cle4']);
    expect(out).toMatchObject({ arret: null, message: null });
  });

  it('ne garde pas une reponse en echec ou vide : le batiment garde le vote de ses passes', async () => {
    const { demande: d, requetes } = demande(2);
    const immediat = vi.fn(async () => ({ modele: 'm', prompt: 1, schema: 1, resultats: [ok('b0-p1'), { id: 'b1-p1', statut: 'echoue' as const, passe: 1, sortie: null, erreur: { type: 'overloaded_error', message: 'x' } }] }));
    const out = await escalader(client(immediat), d, requetes, ['cle0', 'cle1']);
    expect(Object.keys(out.parBatiment)).toEqual(['cle0']);
  });

  it('s arrete au plafond de l organisation, garde ce qui est deja revenu et le dit', async () => {
    const { demande: d, requetes } = demande(4);
    let n = 0;
    const immediat = vi.fn(async (x: DemandeAnalyse) => {
      if (++n === 2) throw new EchecAnalyse('plafond', 'demande de l’analyse : Plafond atteint');
      return { modele: 'm', prompt: 1, schema: 1, resultats: x.requetes.map((r) => ok(r.id)) };
    });
    const out = await escalader(client(immediat), d, requetes, ['cle0', 'cle1', 'cle2', 'cle3']);
    expect(immediat).toHaveBeenCalledTimes(2);
    expect(Object.keys(out.parBatiment)).toEqual(['cle0', 'cle1', 'cle2']);
    expect(out.arret).toBe('plafond');
    expect(out.message).toMatch(/plafond de l’analyse est atteint/);
  });

  it('dit l echec du serveur sans lever : les propositions restent celles des trois passes', async () => {
    const { demande: d, requetes } = demande(1);
    const out = await escalader(client(async () => { throw new EchecAnalyse('serveur', 'HTTP 500'); }), d, requetes, ['cle0']);
    expect(out).toMatchObject({ parBatiment: {}, arret: 'echec' });
    expect(out.message).toMatch(/n’a pas pu départager.*trois passes/);
  });
});
