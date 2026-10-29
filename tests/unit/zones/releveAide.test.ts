import { describe, it, expect } from 'vitest';
import { MASQUE_NOTABLE, coinsAvecAide, motifAide, propositionRenforcee, signauxDeVerification, signauxDesCoins } from '../../../src/zones/releve/aide.js';
import { lireObservationsFacade, type ObservationsFacade } from '../../../src/regles/facades/observations.js';
import type { Morceau } from '../../../src/facade/releve/serie.js';
import type { Image } from '../../../src/facade/vision/homographie.js';
import type { OuvertureFacade } from '../../../src/model/types.js';

// L'aide de Claude dans le releve (lot L18, run unique d'une facade depuis F2) : quand la proposer, ce qu'elle fait des coins (seuls
// les predits changent), et la proposition de l'analyse mise a jour pour tracer les corrections.

/** Une photo de 1 000 x 750 px : un mur clair de (100, 100) a (900, 600) sur un fond sombre. */
function photo(): Image {
  const L = 1000, H = 750;
  const donnees = new Uint8ClampedArray(L * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const v = x >= 100 && x < 900 && y >= 100 && y < 600 ? 215 : 40;
    donnees.set([v, v - 5, v - 15, 255], (y * L + x) * 4);
  }
  return { largeur: L, hauteur: H, donnees };
}

const morceau = (sources: Morceau['sources'], fin: Morceau['fin'] = null): Morceau => ({
  prise: { photo: { image: photo(), url: 'u', champ: 66, focalePx: null }, mesure: null, reperes: null, champ: 66, photosPrevues: null } as unknown as Morceau['prise'],
  coins: [{ x: 160, y: 150 }, { x: 860, y: 140 }, { x: 900, y: 600 }, { x: 140, y: 650 }],
  ...(sources ? { sources } : {}),
  fin,
});

/** Une reponse du run (synthetique) qui ne dit que les deux angles du mur, en part de l'image. */
const angles = (gauche: object, droite: object): ObservationsFacade => lireObservationsFacade({ calage: { angles: { gauche, droite } }, ouvertures: [] }) as ObservationsFacade;

describe('l aide de Claude au releve', () => {
  it('ne la propose que sur signal', () => {
    const fin = { coins: null, sources: ['trouve', 'trouve', 'trouve', 'trouve'] as const, note: 0.8, trouve: true, inclinaisonDeg: 0, roulisDeg: 0, azimutDeg: 0, azimutCorrige: false, distance: null, hauteur: null, contour: null };
    expect(signauxDesCoins(morceau(['trouve', 'trouve', 'trouve', 'trouve'], { ...fin, sources: [...fin.sources] }))).toEqual([]);
    expect(signauxDesCoins(morceau(['predit', 'predit', 'predit', 'predit']))).toEqual(['coins']);
    // Tous au doigt : la personne a tranche.
    expect(signauxDesCoins(morceau(['doigt', 'doigt', 'doigt', 'doigt']))).toEqual([]);
    expect(signauxDesCoins(undefined)).toEqual([]);
    const sure: OuvertureFacade = { type: 'fenetre', x: 1, y: 1, l: 1, h: 1, confiance: 0.9, source: 'detectee' };
    expect(signauxDeVerification({ ouvertures: [sure], devinees: [], largeurM: 9, couverture: 1 })).toEqual([]);
    expect(signauxDeVerification({ ouvertures: [sure], devinees: [], largeurM: 9, couverture: 0.6 })).toEqual(['malVue']);
  });

  it('la propose sur plusieurs vues des que le masque couvre un dixieme du mur (lot G20)', () => {
    const sure: OuvertureFacade = { type: 'fenetre', x: 1, y: 1, l: 1, h: 1, confiance: 0.9, source: 'detectee' };
    // Le masque compte deja dans la couverture de la fusion (ses pixels ne sont pas vus).
    expect(signauxDeVerification({ ouvertures: [sure], devinees: [], largeurM: 9, couverture: 0.95, masque: 0.05 })).toEqual([]);
    expect(MASQUE_NOTABLE).toBe(0.1);
    const s = signauxDeVerification({ ouvertures: [sure], devinees: [], largeurM: 9, couverture: 0.83, masque: 0.17 });
    expect(s).toEqual(['malVue']);
    expect(motifAide(s, 0.17)).toBe('17 % du mur caché sur toutes les photos');
    // Avec un autre signal, les deux se disent ; sans masque, le libelle du signal reste.
    const peu: OuvertureFacade = { ...sure, confiance: 0.4 };
    const s2 = signauxDeVerification({ ouvertures: [peu], devinees: [], largeurM: 9, couverture: 0.6, masque: 0.35 });
    expect(s2[0]).toBe('malVue');
    expect(motifAide(s2, 0.35)).toMatch(/^35 % du mur caché sur toutes les photos, détection peu sûre/);
    expect(motifAide(['malVue'])).toBe('façade en grande partie cachée');
  });

  it('remplace les coins predits par les graines recalees, jamais un coin trouve ni pose au doigt', () => {
    // Les angles de Claude a une vingtaine de pixels des vrais (le mur de 100 a 900 px, de 100 a 600 px sur 1 000 x 750).
    const r = angles({ x: 0.115, egout: 0.15, sol: 0.78, confiance: 'moyenne' }, { x: 0.89, egout: 0.12, sol: 0.82, confiance: 'forte' });
    const { morceau: m, recales } = coinsAvecAide(morceau(['predit', 'predit', 'trouve', 'doigt']), r, 10, 6.25);
    expect(recales).toBe(2);
    expect(m.sources).toEqual(['claude', 'claude', 'trouve', 'doigt']);
    expect(Math.hypot(m.coins[0]!.x - 100, m.coins[0]!.y - 100)).toBeLessThan(3);
    expect(Math.hypot(m.coins[1]!.x - 900, m.coins[1]!.y - 100)).toBeLessThan(3);
    expect(m.coins[2]).toEqual({ x: 900, y: 600 });
    expect(m.coins[3]).toEqual({ x: 140, y: 650 });
  });

  it('met a jour la proposition : retraits decoches, types repris, ajouts proposes', () => {
    const a: OuvertureFacade = { type: 'fenetre', x: 1, y: 1, l: 1, h: 1, confiance: 0.5, source: 'detectee' };
    const b: OuvertureFacade = { type: 'fenetre', x: 3, y: 0, l: 1, h: 2, confiance: 0.9, source: 'detectee' };
    const d: OuvertureFacade = { type: 'fenetre', x: 6, y: 1, l: 1, h: 1, confiance: 0.4, source: 'devinee' };
    const bType: OuvertureFacade = { ...b, type: 'porte', source: 'claude' };
    const ajout: OuvertureFacade = { type: 'fenetre', x: 8, y: 1, l: 1, h: 1, confiance: 0.85, source: 'claude' };
    const pointille: OuvertureFacade = { type: 'fenetre', x: 5, y: 3, l: 1, h: 1, confiance: 0.5, source: 'claude' };
    const p = propositionRenforcee({ cochees: [a, b], decochees: [d] }, { ouvertures: [bType, d, ajout], decochees: [a, pointille], retirees: [a] });
    expect(p.cochees).toEqual([bType, d, ajout]);
    expect(p.decochees).toEqual([a, pointille]);
  });
});
