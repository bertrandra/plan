import { describe, it, expect } from 'vitest';
import { aplatirVote, comparerAnalyses, votesDeAnalyse } from '../../../../../src/app/audit/parcelle/comparaisonAnalyses.js';
import { voter } from '../../../../../src/model/analyseClaude.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { AnalyseComplete, ResultatSortant } from '../../../../../src/io/analysesAudits.js';

// Comparer les reponses de deux analyses d'un meme audit : ce que le vote des passes de chaque batiment dit
// differemment, attribut par attribut (Admin › Audits, rejeu avec le brouillon des regles).

const TOKENS = { entree: 0, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 0, sortie: 0 };
const resultat = (id: string, sortie: unknown, plus: Partial<ResultatSortant> = {}): ResultatSortant => ({
  id, passe: Number(id.slice(-1)), usage: 'rejeu', modele: 'claude-haiku-5-5', statut: 'reussi', arret: 'end_turn', erreur: null, tokens: TOKENS, cout: 0, trouve: null, texte: null, sortie, tarif: null, ...plus,
});
const analyse = (resultats: ResultatSortant[]): AnalyseComplete => ({
  audit: 'a1',
  resume: { id: 't', audit: 'a1', nature: 'rejeu', etat: 'termine', creeLe: '2026-10-16T10:00:00Z', finLe: null, idBatch: 'b', organisation: null, usage: 'rejeu', modele: 'claude-haiku-5-5', effort: 'low', prompt: 5, schema: 1, versions: {}, requetes: resultats.length, images: 0, facades: 0, resultats: null, cout: null, tokens: null },
  entrant: null,
  sortant: { idBatch: 'b', finLe: '2026-10-16T10:05:00Z', resultats },
});
/** Les trois passes d'un batiment, la meme reponse trois fois. */
const trois = (b: string, r: unknown, plus: Partial<ResultatSortant> = {}) => [1, 2, 3].map((p) => resultat(b + '-p' + p, r, plus));

describe('le vote d’une analyse, par bâtiment', () => {
  it('lit les passes réussies de l’analyse des maisons, pas le renfort ni les passes en échec', () => {
    const a = analyse([
      ...trois('b0', reponse()),
      resultat('b1-p1', reponse()), resultat('b1-p2', null, { statut: 'echoue' }), resultat('b1-p3', { forme: 'pas une reponse' }),
      resultat('b0#0-r1', reponse(), { usage: 'renfort' }),
    ]);
    const votes = votesDeAnalyse(a);
    expect([...votes.keys()]).toEqual(['b0', 'b1']);
    expect(votes.get('b1')!.passes).toBe(1);
  });

  it('aplatit le vote en attributs nommés, avec l’accord, et dit les façades une par une', () => {
    const lignes = aplatirVote(voter([reponse(), reponse(), reponse()]));
    expect(lignes.get('Forme du toit')).toEqual({ valeur: 'deux-pans', accord: 1 });
    expect(lignes.get('Cheminées')).toBeDefined();
    expect([...lignes.keys()].some((k) => k.startsWith('Façade sud : '))).toBe(true);
  });
});

describe('la comparaison de deux analyses', () => {
  const avant = analyse([...trois('b0', reponse({ forme: { indices: [], valeur: 'deux-pans' }, couverture: { indices: [], valeur: 'ardoise' } })), ...trois('b1', reponse())]);

  it('ne retient que ce qui change, et compte ce qui ne change pas', () => {
    const apres = analyse([...trois('b0', reponse({ forme: { indices: [], valeur: 'croupes' }, couverture: { indices: [], valeur: 'ardoise' } })), ...trois('b1', reponse())]);
    const c = comparerAnalyses(avant, apres);
    expect(c.batiments).toEqual(['b0', 'b1']);
    expect(c.changees).toBe(1);
    const change = c.lignes.filter((l) => l.change);
    expect(change).toHaveLength(1);
    expect(change[0]).toMatchObject({ batiment: 'b0', attribut: 'Forme du toit', avant: { valeur: 'deux-pans', accord: 1 }, apres: { valeur: 'croupes', accord: 1 } });
    expect(c.lignes.length).toBeGreaterThan(10);
  });

  it('dit qu’un désaccord des passes est un changement : l’accord est montré, la valeur décide', () => {
    const apres = analyse([
      resultat('b0-p1', reponse({ forme: { indices: [], valeur: 'deux-pans' }, couverture: { indices: [], valeur: 'ardoise' } })),
      resultat('b0-p2', reponse({ forme: { indices: [], valeur: 'deux-pans' }, couverture: { indices: [], valeur: 'zinc' } })),
      resultat('b0-p3', reponse({ forme: { indices: [], valeur: 'deux-pans' }, couverture: { indices: [], valeur: 'ardoise' } })),
      ...trois('b1', reponse()),
    ]);
    const c = comparerAnalyses(avant, apres);
    expect(c.changees).toBe(0);
    const couv = c.lignes.find((l) => l.batiment === 'b0' && l.attribut === 'Couverture')!;
    expect(couv.apres?.accord).toBe(2 / 3);
    expect(couv.avant?.accord).toBe(1);
  });

  it('nomme les bâtiments lus d’un seul côté : une passe en échec ne fausse pas la comparaison', () => {
    const apres = analyse([...trois('b0', reponse({ forme: { indices: [], valeur: 'deux-pans' }, couverture: { indices: [], valeur: 'ardoise' } })), ...trois('b2', reponse())]);
    const c = comparerAnalyses(avant, apres);
    expect(c.batiments).toEqual(['b0']);
    expect(c.seulementAvant).toEqual(['b1']);
    expect(c.seulementApres).toEqual(['b2']);
    expect(c.changees).toBe(0);
  });

  it('compare un sujet ajouté au schéma : un champ simple que l’autre analyse n’avait pas', () => {
    const apres = analyse([...trois('b0', { ...reponse({ forme: { indices: [], valeur: 'deux-pans' }, couverture: { indices: [], valeur: 'ardoise' } }) }), ...trois('b1', reponse())]);
    // Les sujets livrés ne declarent aucun champ simple : le vote n'en porte pas, la comparaison non plus.
    expect(comparerAnalyses(avant, apres).lignes.some((l) => l.attribut.startsWith('Chiens'))).toBe(false);
  });
});
