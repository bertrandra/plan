import { describe, it, expect } from 'vitest';
import { estReponseAnalyse, voter, CHAMPS_LUS_A_LA_MAIN, type ReponseAnalyse } from '../../../../src/model/analyseClaude.js';
import { champsSimples, cleDeConclusion } from '../../../../src/regles/sujets/vote.js';
import { DESCRIPTIONS_SUJETS } from '../../../../src/regles/sujets/liste.js';
import { nouveauSujet } from '../../../../src/regles/sujets/edition.js';
import { CHAMPS_SIMPLES, passesLues, voterAnalyse } from '../../../../src/app/regles/sujets/vote.js';
import { reponse } from '../../../fixtures/audit/reponseClaude.js';

// Le vote generique : un champ { indices, valeur } ou { indices, nombre } declare par une description est
// lu et vote sans code propre. Un sujet nouveau (chien-assis) n'attend plus qu'on ecrive son vote.

const chienAssis = nouveauSujet({ id: 'chienAssis', libelle: 'Chiens-assis', question: 'le nombre de chiens-assis vus sur le versant', termes: [] }, DESCRIPTIONS_SUJETS);
const objetJardin = nouveauSujet({ id: 'objetJardin', libelle: 'Objets du jardin', question: 'les objets du jardin', termes: [{ terme: 'abri', definition: 'petite construction' }, { terme: 'bassin', definition: 'pièce d’eau' }] }, DESCRIPTIONS_SUJETS);

/** Une passe qui porte aussi les champs d'un sujet que la reponse d'avant ne connaissait pas. */
const avec = (plus: Record<string, unknown>): ReponseAnalyse => ({ ...reponse(), ...plus }) as ReponseAnalyse;

describe('les champs simples déclarés par les descriptions', () => {
  it('reconnaissent { indices, valeur } et { indices, nombre }, et rien d’autre', () => {
    expect(cleDeConclusion(chienAssis.champs.chienAssis!)).toBe('nombre');
    expect(cleDeConclusion(objetJardin.champs.objetJardin!)).toBe('valeur');
    expect(cleDeConclusion(DESCRIPTIONS_SUJETS.find((d) => d.id === 'terrasse')!.champs.terrasse!)).toBeNull();
    expect(cleDeConclusion({ type: 'string' })).toBeNull();
  });

  it('laissent au vote à la main tous les champs que le vote lit déjà un par un', () => {
    // Les sujets livres declarent des champs lus a la main, et les deux champs simples des murs : aucun n'est vote deux fois.
    const SIMPLES_LIVRES = [{ nom: 'teinteMurs', cle: 'valeur' }, { nom: 'decorMurs', cle: 'valeur' }];
    expect(champsSimples(DESCRIPTIONS_SUJETS)).toEqual(SIMPLES_LIVRES);
    expect(CHAMPS_SIMPLES).toEqual(SIMPLES_LIVRES);
    for (const d of DESCRIPTIONS_SUJETS) for (const nom of Object.keys(d.champs)) if (!SIMPLES_LIVRES.some((c) => c.nom === nom)) expect(CHAMPS_LUS_A_LA_MAIN, nom).toContain(nom);
  });

  it('prennent ceux d’un sujet ajouté, dans l’ordre du prompt', () => {
    expect(champsSimples([...DESCRIPTIONS_SUJETS, chienAssis, objetJardin])).toEqual([{ nom: 'teinteMurs', cle: 'valeur' }, { nom: 'decorMurs', cle: 'valeur' }, { nom: 'chienAssis', cle: 'nombre' }, { nom: 'objetJardin', cle: 'valeur' }]);
  });
});

describe('le vote des champs simples', () => {
  const simples = champsSimples([chienAssis, objetJardin]);

  it('vote un compte et un terme comme les autres attributs : la majorité, la part des passes, les indices', () => {
    const ia = { image: 1, vu: 'deux chiens-assis' };
    const v = voter([
      avec({ chienAssis: { indices: [ia], nombre: 2 }, objetJardin: { indices: [], valeur: 'abri' } }),
      avec({ chienAssis: { indices: [], nombre: 2 }, objetJardin: { indices: [], valeur: 'abri' } }),
      avec({ chienAssis: { indices: [], nombre: 1 }, objetJardin: { indices: [], valeur: 'bassin' } }),
    ], simples);
    expect(v.simples.chienAssis).toEqual({ valeur: 2, accord: 2 / 3, indices: [ia] });
    expect(v.simples.objetJardin).toMatchObject({ valeur: 'abri', accord: 2 / 3 });
  });

  it('ne compte que les passes qui portent le champ : une réponse d’avant le sujet ne dit rien', () => {
    const v = voter([reponse(), reponse(), avec({ chienAssis: { indices: [], nombre: 3 } })], simples);
    // Une seule passe le dit, sans majorite sur trois : pas de vote... mais sur les passes qui le portent, c'est unanime.
    expect(v.simples.chienAssis).toMatchObject({ valeur: 3, accord: 1 });
    expect(voter([reponse(), reponse(), reponse()], simples).simples.chienAssis).toEqual({ valeur: 'indetermine', accord: 0, indices: [] });
  });

  it('ne change rien au vote des champs lus à la main, ni sans champ simple', () => {
    const passes = [reponse(), reponse(), reponse()];
    const sans = voter(passes);
    expect(sans.simples).toEqual({});
    // Hors `simples`, le vote est le meme au bit pres.
    const sansSimples = (v: object) => Object.fromEntries(Object.entries(v).filter(([cle]) => cle !== 'simples'));
    expect(sansSimples(voter(passes, simples))).toEqual(sansSimples(sans));
  });
});

describe('la lecture d’une passe', () => {
  const simples = champsSimples([chienAssis]);

  it('accepte une passe sans le champ d’un sujet (les réponses gardées d’avant le sujet), refuse un champ mal formé', () => {
    expect(estReponseAnalyse(reponse(), simples)).toBe(true);
    expect(estReponseAnalyse(avec({ chienAssis: { indices: [], nombre: 2 } }), simples)).toBe(true);
    expect(estReponseAnalyse(avec({ chienAssis: { indices: [], nombre: 'beaucoup' } }), simples)).toBe(false);
    expect(estReponseAnalyse(avec({ chienAssis: 3 }), simples)).toBe(false);
    expect(estReponseAnalyse(avec({ chienAssis: { nombre: 2 } }), simples)).toBe(false);
    // Sans le sujet declare, un champ inconnu est simplement ignore.
    expect(estReponseAnalyse(avec({ chienAssis: 3 }))).toBe(true);
  });

  it('passesLues et voterAnalyse sont ceux de l’audit : les sujets livrés, sans changement de forme', () => {
    const sorties = [reponse(), { forme: 1 }, reponse()];
    expect(passesLues(sorties)).toHaveLength(2);
    expect(voterAnalyse(passesLues(sorties)).forme).toEqual(voter([reponse(), reponse()]).forme);
  });
});
