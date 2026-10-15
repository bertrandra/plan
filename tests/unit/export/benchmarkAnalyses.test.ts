import { describe, it, expect } from 'vitest';
import { batimentDe, comptesAnalyse, csvBenchmark, ligneBenchmark, lignesBenchmark } from '../../../src/export/benchmarkAnalyses.js';
import type { ResumeAnalyse, ResultatResume, Trouve } from '../../../src/io/analysesAudits.js';

// La comparaison des analyses et rejeux d'un audit (MD/spec-audit.md 15.5) : la mediane des passes
// de chaque batiment, additionnee ; les vides, les echecs, le cout, la duree ; le CSV du tableur.

const trouve = (o: Partial<Trouve>): Trouve => ({ ouvertures: 0, manquees: 0, enTrop: 0, bouts: 0, lucarnes: 0, elements: 0, ecarts: 0, coins: 0, determines: 0, vide: false, ...o });
const tokens = { entree: 100, ecritureCache: 10, ecritureCache1h: 0, lectureCache: 5, sortie: 50 };
const res = (id: string, t: Trouve | null, statut: ResultatResume['statut'] = 'reussi'): ResultatResume => ({
  id, passe: Number(id.slice(-1)), usage: 'rejeu', modele: 'claude-haiku-5-5', statut, arret: t ? 'end_turn' : null, erreur: t ? null : { type: 'overloaded_error', message: 'Surcharge' }, tokens, cout: 0.001, trouve: t,
});
const resume = (plus: Partial<ResumeAnalyse>): ResumeAnalyse => ({
  id: '20261015-100000-claude-haiku-5-5-abcd', audit: '20261013-154200-0000abcd', nature: 'rejeu', etat: 'termine', creeLe: '2026-10-15T10:00:00Z', finLe: '2026-10-15T10:03:20Z',
  idBatch: 'msgbatch_1', organisation: 'admin', usage: 'rejeu', modele: 'claude-haiku-5-5', effort: 'low', prompt: 3, schema: 2, versions: {}, requetes: 4, images: 12, facades: 2,
  resultats: null, cout: 0.004, tokens: { entree: 400, ecritureCache: 40, ecritureCache1h: 0, lectureCache: 20, sortie: 200 }, ...plus,
});

describe('la comparaison des analyses d un audit', () => {
  it('range chaque requete sous son batiment', () => {
    expect(batimentDe('b0-p2')).toBe('b0');
    expect(batimentDe('b12-p1')).toBe('b12');
    expect(batimentDe('r1')).toBe('r1');
  });

  it('prend la mediane des passes lues de chaque batiment, et additionne les batiments', () => {
    const c = comptesAnalyse([
      res('b0-p1', trouve({ ouvertures: 6, bouts: 1 })), res('b0-p2', trouve({ ouvertures: 8, bouts: 2 })), res('b0-p3', trouve({ ouvertures: 7, bouts: 2 })),
      // Deux passes lues : la mediane est leur moyenne ; la passe en echec ne compte pas.
      res('b1-p1', trouve({ ouvertures: 3, lucarnes: 1 })), res('b1-p2', trouve({ ouvertures: 4, lucarnes: 2 })), res('b1-p3', null, 'echoue'),
    ]);
    expect(c).toMatchObject({ ouvertures: 7 + 3.5, bouts: 2, lucarnes: 1.5 });
    expect(comptesAnalyse([res('b0-p1', null, 'echoue')])).toBe(null);
  });

  it('dit les reussites, les vides, les echecs, les tokens, le cout et la duree', () => {
    const l = ligneBenchmark(resume({ resultats: [res('b0-p1', trouve({ ouvertures: 2 })), res('b0-p2', trouve({ vide: true })), res('b0-p3', null, 'echoue'), res('b1-p1', trouve({ determines: 3 }))] }));
    expect(l).toMatchObject({ reussies: 3, echouees: 1, vides: 1, tokensEntree: 460, tokensSortie: 200, cout: 0.004, dureeS: 200, comptes: { ouvertures: 1, determines: 3 } });
    expect(ligneBenchmark(resume({ etat: 'en_cours', finLe: null }))).toMatchObject({ dureeS: null, comptes: null, reussies: 0 });
  });

  it('se lit dans l ordre des essais et s exporte pour un tableur francais', () => {
    const ls = lignesBenchmark([resume({ id: 'b', creeLe: '2026-10-15T11:00:00Z', finLe: '2026-10-15T11:03:20Z', modele: 'claude-sonnet-5-5' }), resume({ id: 'a' })]);
    expect(ls.map((l) => l.id)).toEqual(['a', 'b']);
    const t = csvBenchmark(ls);
    expect(t.startsWith('﻿Analyse;Nature;Envoyée le;Modèle;Identifiant du modèle;Prompt;Schéma;')).toBe(true);
    const lignes = t.trim().split('\r\n');
    expect(lignes).toHaveLength(3);
    expect(lignes[2]).toContain('Rejeu;2026-10-15T11:00:00Z;Claude Sonnet 5.5;claude-sonnet-5-5;3;2;low;Terminée;4;0;0;0;12;460;200;0,004;200');
  });
});
