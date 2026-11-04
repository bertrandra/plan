import { describe, it, expect } from 'vitest';
import { facettesCorps, portionsOuvertesDuMur } from '../../../src/three/toitCorps3d.js';
import type { CorpsToit } from '../../../src/model/types.js';

// Un corps passe ouvert par la personne (un garage en carport) : sous lui, pas de mur, donc ni photo de releve, ni baie, ni soubassement
// sur cette portion du contour ; et pas de poteau dans l'emprise d'un bow-window que son toit couvre (decisions du 4 novembre 2026).

const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
// Un appentis devant le mur y = 0 de la maison : son mur haut contre elle (t = 0, faitage), sa rive basse a y = -3.
const auvent = (ouvert?: boolean): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: -3 }, { x: 0, y: -3 }], posFaitage: 0, faitage: 3.2, egouts: [3.2, 2.4], pignons: [], ecart: 0, ...(ouvert === undefined ? {} : { ouvert }) });

describe('un appentis ouvert', () => {
  it('ouvre la portion du mur qu il couvre ; un appentis ferme, ou sans indication, n ouvre rien', () => {
    const mur = { gauche: { x: 0, y: -3 }, droite: { x: 12, y: -3 }, largeur: 12 };
    expect(portionsOuvertesDuMur(mur, [auvent(true)])).toEqual([[0, 8]]);
    expect(portionsOuvertesDuMur(mur, [auvent(false)])).toEqual([]);
    expect(portionsOuvertesDuMur(mur, [auvent()])).toEqual([]);
    // Un mur qui ne longe pas l'appentis.
    expect(portionsOuvertesDuMur({ gauche: { x: 0, y: 5 }, droite: { x: 12, y: 5 }, largeur: 12 }, [auvent(true)])).toEqual([]);
  });

  it('ne pose pas de poteau dans l emprise d un bow-window qu il couvre', () => {
    const tous = facettesCorps(auvent(true), null, false).murs.length;
    const bow = rect(0.5, -1.5, 3, 0);
    const abrites = facettesCorps(auvent(true), null, false, false, [bow]).murs.length;
    expect(tous).toBeGreaterThan(0);
    expect(abrites).toBeLessThan(tous);
    // Sans avancee dessous, le dessin d'avant.
    expect(facettesCorps(auvent(true), null, false, false, []).murs.length).toBe(tous);
  });
});
