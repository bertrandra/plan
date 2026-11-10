import { describe, it, expect } from 'vitest';
import { voter } from '../../../src/model/analyseClaude.js';
import {
  CandidatsIllisibles, FORMAT_CANDIDATS, VERSION_CANDIDATS, candidatDepuisVote, compterCandidats, formeDuSchema, fusionnerCandidats,
  lireFichierCandidats, observationDuVote, texteCandidat, trierCandidats, typesLucarnes, viseesDe, VISEES_PAR_DEFAUT,
  type CasCandidat, type EntreeCandidat, type FichierCandidats,
} from '../../../src/model/casCandidats.js';
import { reponse } from '../../fixtures/audit/reponseClaude.js';
import { SORTIE_DEUX_PANS, SORTIE_MANSART } from '../../fixtures/candidats/village.js';

// Les cas candidats Panoramax, cote modele (lot G3 bis) : du vote de Claude a la forme visee dans
// le vocabulaire du modele de toit (lot G1), puis le fichier du corpus, ou un candidat trie ne bouge plus.

const SOURCE = { par: 'claude', usage: 'candidats', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, le: '2026-10-14' } as const;
const PHOTO = { id: 'pa', url: 'https://panoramax.ign.fr/api/pictures/pa/hd.jpg', date: '2025-06-01T10:00:00Z', auteur: null, licence: 'CC-BY-SA-4.0', distanceM: 23, capDeg: 0 };

function entree(cle: string, sorties: ReturnType<typeof reponse>[], plus: Partial<EntreeCandidat> = {}): EntreeCandidat {
  return { cle, cleabs: 'BATIMENT_' + cle, vote: voter(sorties), typesLucarnes: sorties.flatMap((s) => s.lucarnes.types), contradictions: [], photos: [PHOTO], source: SOURCE, ...plus };
}
const candidat = (cle: string, sorties: ReturnType<typeof reponse>[], plus: Partial<EntreeCandidat> = {}) => candidatDepuisVote(entree(cle, sorties, plus)) as CasCandidat;

describe('du vote a la forme visee', () => {
  it('traduit le vocabulaire du schema dans celui du modele', () => {
    expect(formeDuSchema('demi-croupe')).toBe('demi-croupes');
    expect(formeDuSchema('mansart')).toBe('mansart');
    expect(formeDuSchema('croupes')).toBe('croupes');
    expect(formeDuSchema('indetermine')).toBeNull();
    expect(typesLucarnes(['jacobine', 'oeil-de-boeuf', 'jacobine', 'outeau', 'indetermine'])).toEqual(['jacobine', 'oeil-de-boeuf', 'outeau']);
  });

  it('ne garde que ce que la majorite des passes affirme', () => {
    const o = observationDuVote(voter([SORTIE_MANSART, SORTIE_MANSART, SORTIE_DEUX_PANS]), ['jacobine']);
    expect(o).toEqual({ forme: 'mansart', profil: 'brise', bouts: ['brisis', 'brisis'], lucarnes: { nombre: 3, types: ['jacobine'] } });
    // Trois avis differents sur la forme : rien d'affirme, pas de candidat.
    const sans = voter([SORTIE_MANSART, SORTIE_DEUX_PANS, reponse({ forme: { indices: [], valeur: 'croupes' } })]);
    expect(observationDuVote(sans)).toBeNull();
  });

  it('dit pourquoi un batiment est candidat : forme, bouts, profil brise, lucarnes', () => {
    expect(viseesDe({ forme: 'mansart', profil: 'brise', bouts: ['brisis', 'brisis'], lucarnes: { nombre: 3, types: ['jacobine'] } }, VISEES_PAR_DEFAUT)).toEqual(['mansart', 'lucarnes']);
    expect(viseesDe({ forme: 'croupes', bouts: ['demi-croupe', 'croupe'] }, VISEES_PAR_DEFAUT)).toEqual(['demi-croupes']);
    // Un profil brise sur un deux-pans annonce : les bouts departagent (un pignon : un gambrel).
    expect(viseesDe({ forme: 'deux-pans', profil: 'brise', bouts: ['pignon', 'pignon'] }, VISEES_PAR_DEFAUT)).toEqual(['gambrel']);
    expect(viseesDe({ forme: 'deux-pans', lucarnes: { nombre: 0, types: [] } }, VISEES_PAR_DEFAUT)).toEqual([]);
    // Ce que l'on ne cherche pas n'est pas retenu.
    expect(viseesDe({ forme: 'mansart', lucarnes: { nombre: 2, types: [] } }, ['demi-croupes'])).toEqual([]);
  });

  it('fait un candidat propose, avec sa preuve et son historique ; un deux-pans sans lucarne n en est pas un', () => {
    const c = candidat('A', [SORTIE_MANSART, SORTIE_MANSART, SORTIE_MANSART], { contradictions: ['brisis annoncé, mais aucune bande raide mesurée le long des murs'] });
    expect(c).toMatchObject({ id: 'cand-BATIMENT_A', statut: 'propose', visees: ['mansart', 'lucarnes'], photos: [PHOTO], source: SOURCE });
    expect(c.vote).toMatchObject({ passes: 3, forme: { valeur: 'mansart', accord: 1 }, lucarnes: { valeur: 3, accord: 1 } });
    expect(c.vote.contradictions).toHaveLength(1);
    expect(c.historique).toEqual([{ t: '2026-10-14', texte: 'proposé par Claude sur 1 photo de rue Panoramax (3 passes)' }]);
    expect(texteCandidat(c)).toBe('mansart, lucarnes · forme mansart (3/3), bouts brisis/brisis, 3 lucarne(s) jacobine · 1 photo(s) · contredit le LiDAR');
    expect(candidatDepuisVote(entree('B', [SORTIE_DEUX_PANS, SORTIE_DEUX_PANS, SORTIE_DEUX_PANS]))).toBeNull();
  });

  it('range les plus surs d abord : sans contradiction, a l unanimite, puis par cle', () => {
    const unanime = candidat('C', [SORTIE_MANSART, SORTIE_MANSART, SORTIE_MANSART]);
    const deuxSurTrois = candidat('A', [SORTIE_MANSART, SORTIE_MANSART, SORTIE_DEUX_PANS]);
    const contredit = candidat('B', [SORTIE_MANSART, SORTIE_MANSART, SORTIE_MANSART], { contradictions: ['x'] });
    const autre = candidat('D', [SORTIE_MANSART, SORTIE_MANSART, SORTIE_MANSART]);
    expect(trierCandidats([contredit, autre, deuxSurTrois, unanime]).map((c) => c.cle)).toEqual(['C', 'D', 'A', 'B']);
  });
});

describe('le fichier du corpus', () => {
  const tous = (): CasCandidat[] => ['A', 'B', 'C'].map((k) => candidat(k, [SORTIE_MANSART, SORTIE_MANSART, SORTIE_MANSART]));
  const fichier = (cs: CasCandidat[]): FichierCandidats => ({ format: FORMAT_CANDIDATS, version: VERSION_CANDIDATS, village: 'versailles', parcelle: '78646000AE0153', candidats: cs });

  it('se relit a l identique, et refuse un fichier mal forme en disant pourquoi', () => {
    const f = fichier(tous());
    expect(lireFichierCandidats(JSON.parse(JSON.stringify(f)))).toEqual(f);
    expect(() => lireFichierCandidats({ ...f, format: 'autre' })).toThrow(CandidatsIllisibles);
    expect(() => lireFichierCandidats({ ...f, candidats: [{ ...f.candidats[0], statut: 'accepte' }] })).toThrow(/statut/);
    expect(() => lireFichierCandidats({ ...f, candidats: [{ ...f.candidats[0], visees: ['deux-pans'] }] })).toThrow(/visees/);
    expect(() => lireFichierCandidats({ ...f, candidats: [f.candidats[0], f.candidats[0]] })).toThrow(/double/);
  });

  it('ne touche jamais un candidat trie, remplace un propose relu, garde les autres', () => {
    const [a, b, c] = tous() as [CasCandidat, CasCandidat, CasCandidat];
    const ancien = fichier([{ ...a, statut: 'valide' }, { ...b, statut: 'sans_suite' }, c, { ...c, cle: 'Z', id: 'cand-Z' }]);
    // Relu cette fois : A, B, C. C ne l'est plus (deux-pans), A et B sont tries ; Z n'a pas ete relu.
    const nouveauA = { ...a, visees: ['lucarnes' as const] };
    const f = fusionnerCandidats(ancien, [nouveauA], new Set(['A', 'B', 'C']), { village: 'versailles', parcelle: null });
    expect(f.candidats.map((x) => [x.cle, x.statut])).toEqual([['A', 'valide'], ['B', 'sans_suite'], ['Z', 'propose']]);
    expect(f.candidats[0]!.visees).toEqual(['mansart', 'lucarnes']);
    expect(f.parcelle).toBe('78646000AE0153');
    expect(compterCandidats(f)).toEqual([
      { visee: 'lucarnes', propose: 1, valide: 1, sans_suite: 1 },
      { visee: 'mansart', propose: 1, valide: 1, sans_suite: 1 },
    ]);
    const neuf = fusionnerCandidats(null, tous(), new Set(['A', 'B', 'C']), { village: 'v', parcelle: null });
    expect(neuf).toMatchObject({ format: FORMAT_CANDIDATS, version: 1, village: 'v' });
    expect(neuf.candidats.map((x) => x.cle)).toEqual(['A', 'B', 'C']);
  });
});
