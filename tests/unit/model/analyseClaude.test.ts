import { describe, it, expect } from 'vitest';
import {
  ACCORDS_MESURES, compterSommets, contradictionsLidar, estReponseAnalyse, indicesLidar, reserveClaude, voter, voterAttribut,
} from '../../../src/model/analyseClaude.js';
import { reponse } from '../../fixtures/audit/reponseClaude.js';
import type { CorpsToit, ToitMesure } from '../../../src/model/types.js';

// L'analyse par Claude, cote modele (MD/spec-regles-toits.md §14.2) : trois passes et un vote,
// attribut par attribut ; les indices LiDAR chiffres ; le controle croise ; ce qui reste decoche.

describe('le vote d un attribut', () => {
  it('retient la valeur de plus de la moitie des passes, avec leurs indices dedoublonnes', () => {
    const v = voterAttribut(['ardoise', 'ardoise', 'tuile-plate'], [[{ image: 1, vu: 'a' }], [{ image: 1, vu: 'a' }, { image: 2, vu: 'b' }], [{ image: 3, vu: 'c' }]], 'indetermine');
    expect(v).toEqual({ valeur: 'ardoise', accord: 2 / 3, indices: [{ image: 1, vu: 'a' }, { image: 2, vu: 'b' }] });
  });

  it('rend indetermine sans majorite, en disant la part de la meilleure valeur', () => {
    expect(voterAttribut(['a', 'b', 'c'], [[], [], []], 'indetermine')).toEqual({ valeur: 'indetermine', accord: 1 / 3, indices: [] });
    expect(voterAttribut([], [], 'indetermine')).toEqual({ valeur: 'indetermine', accord: 0, indices: [] });
  });

  it('ne laisse jamais indetermine gagner contre une valeur vue par deux passes', () => {
    expect(voterAttribut(['brique', 'indetermine', 'brique'], [[], [], []], 'indetermine').valeur).toBe('brique');
    // Une seule passe qui voit, deux qui ne voient pas : pas de majorite.
    expect(voterAttribut(['brique', 'indetermine', 'indetermine'], [[], [], []], 'indetermine').valeur).toBe('indetermine');
    // Les nombres votent comme les mots.
    expect(voterAttribut<number | 'indetermine'>([2, 2, 3], [[], [], []], 'indetermine')).toMatchObject({ valeur: 2, accord: 2 / 3 });
  });
});

describe('le vote des trois passes', () => {
  it('vote chaque attribut, prend les souches de la passe qui donne le nombre retenu, et reunit ecarts et contradictions', () => {
    const p1 = reponse();
    const p2 = reponse({ cheminees: { indices: [{ image: 2, vu: 'une souche' }], nombre: 1, souches: [{ position: 'pignon', materiau: 'enduit' }] }, ecarts: [{ indices: [], sujet: 'cheminees', modele: 'aucune', observe: 'une souche' }] });
    const p3 = reponse({ couverture: { indices: [], valeur: 'tuile-plate' }, contradictions: [{ indiceLidar: 'monteeM', observation: 'plat' }] });
    const v = voter([p1, p2, p3]);
    expect(v.passes).toBe(3);
    expect(v.forme).toMatchObject({ valeur: 'deux-pans', accord: 1 });
    expect(v.couverture).toMatchObject({ valeur: 'ardoise', accord: 2 / 3 });
    expect(v.cheminees).toMatchObject({ valeur: 2, accord: 2 / 3 });
    expect(v.souches).toEqual(p1.cheminees.souches);
    expect(v.facades).toHaveLength(1);
    expect(v.facades[0]).toMatchObject({ facade: 'sud', materiau: { valeur: 'brique', accord: 1 }, volets: { valeur: 'battants' } });
    expect(v.ecarts).toEqual([{ sujet: 'cheminees', modele: 'aucune', observe: 'une souche' }]);
    expect(v.contradictions).toEqual([{ indiceLidar: 'monteeM', observation: 'plat' }]);
    expect(v.confiance.valeur).toBe('forte');
  });

  it('vote les facades par etiquette, meme si une passe en oublie une', () => {
    const avecNord = reponse({ facades: [...reponse().facades, { ...reponse().facades[0]!, facade: 'nord', materiau: 'enduit' }] });
    const v = voter([avecNord, avecNord, reponse()]);
    expect(v.facades.map((f) => [f.facade, f.materiau.valeur, f.materiau.accord])).toEqual([['sud', 'brique', 1], ['nord', 'enduit', 1]]);
  });

  it('reconnait une reponse du schema, et rejette le reste', () => {
    expect(estReponseAnalyse(reponse())).toBe(true);
    expect(estReponseAnalyse({ forme: { valeur: 'plat' } })).toBe(false);
    expect(estReponseAnalyse(null)).toBe(false);
  });
});

/** Une grille 7 x 7 au pas de 1 m : un deux-pans dont le faitage court au milieu, egout a 6 m. */
function grilleDeuxPans(): ToitMesure {
  const nx = 7, ny = 7;
  const z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(6 + 3 * (1 - Math.abs(j - 3) / 3));
  return { pas: 1, x0: 0, y0: 7, nx, ny, z, egout: 6, faite: 9, source: 'lidar' };
}

describe('les indices LiDAR chiffres et le controle croise', () => {
  const corps: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 7 }, { x: 0, y: 7 }], posFaitage: 3.5, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };

  it('chiffre l egout, le faite, la montee, les bords, les sommets et chaque corps', () => {
    const i = indicesLidar(grilleDeuxPans(), [corps]);
    expect(i).toMatchObject({ egoutM: 6, faiteM: 9, monteeM: 3, creux: false });
    expect(i?.monteeAuxBordsM).toBeLessThan(1.5);
    expect(i?.corps).toEqual([{ longueurM: 7, largeurM: 7, faitageM: 9, egoutsM: [6, 6], penteDeg: 41, appentis: false, croupes: false, ecartM: 0.1 }]);
    expect(indicesLidar(null, [corps])).toBe(null);
  });

  it('compte les sommets d une grille lissee : un faitage n en fait qu un, deux bosses deux', () => {
    const g = grilleDeuxPans();
    expect(compterSommets(g.z, g.nx, g.ny, g.egout)).toBeGreaterThanOrEqual(1);
    const z: (number | null)[] = new Array(49).fill(6);
    // Deux bosses de 3 x 3 cellules : une souche d'une seule cellule, elle, s'efface au lissage.
    for (const [ci, cj] of [[1, 1], [5, 5]] as const) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) z[(cj + dj) * 7 + ci + di] = 8;
    expect(compterSommets(z, 7, 7, 6)).toBe(2);
    const souche: (number | null)[] = new Array(49).fill(6);
    souche[3 * 7 + 3] = 8;
    expect(compterSommets(souche, 7, 7, 6)).toBe(0);
  });

  it('marque une contradiction quand la forme votee ne tient pas face aux chiffres', () => {
    const i = indicesLidar(grilleDeuxPans(), [corps]);
    expect(contradictionsLidar(voter([reponse({ forme: { indices: [], valeur: 'plat' } })]), i)).toEqual(['toit plat annoncé, mais le LiDAR monte de 3,0 m au-dessus de l’égout']);
    expect(contradictionsLidar(voter([reponse({ forme: { indices: [], valeur: 'mansart' } })]), i)[0]).toMatch(/aucune bande raide/);
    expect(contradictionsLidar(voter([reponse()]), i)).toEqual([]);
    expect(contradictionsLidar(voter([reponse({ forme: { indices: [], valeur: 'plat' } })]), null)).toEqual([]);
  });

  it('laisse toute proposition de Claude decochee tant que son taux d accord n est pas mesure', () => {
    expect(ACCORDS_MESURES).toEqual({});
    expect(reserveClaude('couverture', { accord: 1 }, [])).toMatch(/non encore mesuré/);
    expect(reserveClaude('couverture', { accord: 2 / 3 }, [])).toMatch(/67 %/);
    expect(reserveClaude('couverture', { accord: 1 }, ['toit plat annoncé'])).toMatch(/^Contredit la mesure LiDAR : toit plat annoncé/);
  });
});
