import { describe, it, expect } from 'vitest';
import { groupesDe, libellesDesElements, titreDuGroupe } from '../../../../src/facade/modeToit/elements.js';
import type { CorpsToit } from '../../../../src/model/types.js';

// Les pastilles et les groupes du mode Toit se nomment sans ambiguite (audit de la navigation, 6 novembre 2026, lot C) : deux « Pignon »
// identiques ne se distinguaient pas, et les groupes de reglages n'avaient de nom que dans l'infobulle.

// Un corps de 10 m sur 6, ses murs dans l'ordre des sommets : y = 0 (le nord du plan, l'axe y allant vers le bas de l'ecran) puis l'est,
// le sud, l'ouest. Le pan 0 est du cote du mur 0, le pan 1 du cote du mur 2.
const corps = (dx = 0): CorpsToit => ({ pts: [{ x: dx, y: 0 }, { x: dx + 10, y: 0 }, { x: dx + 10, y: 6 }, { x: dx, y: 6 }], posFaitage: 3, faitage: 7, egouts: [3, 3], pignons: [], ecart: 0 });
const pignon = (pan: 0 | 1, debut: number) => ({ pan, debut, fin: debut + 2, faitage: 7, profondeur: 3 });

describe('les noms des pastilles et des groupes', () => {
  it('deux pignons sur deux murs : chacun dit le sien ; sur le meme mur, ils se numerotent', () => {
    const c = { ...corps(), pignons: [pignon(0, 1), pignon(1, 1)] };
    const noms = libellesDesElements([c]).map((e) => e.libelle);
    expect(noms.filter((n) => n.startsWith('Pignon'))).toHaveLength(2);
    expect(new Set(noms).size).toBe(noms.length);
    const memeMur = libellesDesElements([{ ...corps(), pignons: [pignon(0, 1), pignon(0, 6)] }]).map((e) => e.libelle).filter((n) => n.startsWith('Pignon'));
    expect(memeMur[0]).toMatch(/ 1$/);
    expect(memeMur[1]).toMatch(/ 2$/);
    expect(memeMur[0]?.replace(/ 1$/, '')).toBe(memeMur[1]?.replace(/ 2$/, ''));
  });

  it('sur un batiment a plusieurs corps, un element dit aussi son corps ; les corps gardent leur nom', () => {
    const l = libellesDesElements([corps(), { ...corps(10), pignons: [pignon(1, 2)] }]);
    expect(l.filter((e) => e.cible.type === 'corps').map((e) => e.libelle)).toEqual(['Corps principal', 'Corps 2']);
    expect(l.find((e) => e.cible.type === 'pignon')?.libelle).toMatch(/^Pignon \S+ · corps 2$/);
  });

  it('chaque groupe de reglages a un titre a montrer', () => {
    for (const g of groupesDe([corps()], { type: 'corps', rang: 0, i: 0 })) expect(titreDuGroupe(g)).not.toBe(g.groupe);
  });
});
