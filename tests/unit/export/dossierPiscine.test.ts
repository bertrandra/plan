import { describe, it, expect } from 'vitest';
import { construireDossierPiscine } from '../../../src/export/dossierPiscine.js';
import { nouvellePiscine } from '../../../src/model/creation.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le dossier de mairie d'une piscine : notice et aide au cerfa, plan de situation, plan de masse,
// coupe, pieces du demandeur, note de calcul en annexe. Un PDF ecrit a la main : on verifie qu'il
// s'assemble, le nombre de pages, et que les textes qui comptent y sont (translitteres : la police
// standard n'a pas d'accents).

const parcelle: ObjetPlan = {
  key: 'parcelle', name: 'Parcelle AE 101', type: 'polygon', fonction: 'terrain', nomLieu: 'Le Vésinet', latitude: 48.89, longitude: 2.13,
  pts: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 25 }, { x: 0, y: 25 }], segmentNames: ['Sud', 'Est', 'Nord', 'Ouest'],
  cadastre: { section: 'AE', numero: '0101', commune: 'Le Vésinet', contenance: 750 }
};
const maison: ObjetPlan = { key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', fill: '#ddd', stroke: '#333', pts: [{ x: 5, y: 15 }, { x: 15, y: 15 }, { x: 15, y: 22 }, { x: 5, y: 22 }] };
const meta = { appVersion: '2.3.0', nomProjet: 'Essai', dateDuJour: () => '05/10/2026' };
const texteDe = (pdf: string) => pdf.replace(/\\\(/g, '(').replace(/\\\)/g, ')');
const nbPages = (pdf: string) => Number(/\/Count (\d+)/.exec(pdf)?.[1]);

describe('dossier de mairie', () => {
  it('refuse un plan sans piscine', () => {
    expect(() => construireDossierPiscine([parcelle, maison], null, meta)).toThrow('aucune piscine');
  });

  it('assemble une declaration prealable : notice, DP1 a DP3, pieces, annexe', () => {
    const piscine = nouvellePiscine('rectangle', { x: 15, y: 8 }, 'p', 1).obj;
    const d = construireDossierPiscine([parcelle, maison, piscine], null, meta);
    expect(d.regime).toBe('declaration');
    expect(d.piscine).toBe(piscine);
    expect(d.pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(nbPages(d.pdf)).toBe(d.pages);
    expect(d.pages).toBeGreaterThanOrEqual(6);
    const t = texteDe(d.pdf);
    expect(t).toContain('(Declaration prealable - Piscine)');
    expect(t).toContain('(DP1 - Plan de situation)');
    expect(t).toContain('(DP2 - Plan de masse)');
    expect(t).toContain('(DP3 - Plan en coupe)');
    expect(t).toContain('cerfa 13703');
    expect(t).toContain('(Annexe - Note de calcul : Piscine 1)');
    // La surface du bassin, l'assiette de la taxe, et la distance a la limite sud (8 - 2 = 6 m).
    expect(t).toContain('32,0 m2');
    expect(t).toContain('8 000 ');
    expect(t).toContain('(Distance a la limite Sud)');
    expect(t).toContain('(6,00 m)');
    expect(t).toContain('AE 101');
  });

  it('passe au permis au-dela de 100 m², et prend la piscine designee', () => {
    const petite = nouvellePiscine('ronde', { x: 5, y: 5 }, 'c', 1).obj;
    const grande = nouvellePiscine('rectangle', { x: 15, y: 10 }, 'g', 2).obj;
    if (grande.type === 'polygon') grande.pts = [{ x: 5, y: 3 }, { x: 25, y: 3 }, { x: 25, y: 9 }, { x: 5, y: 9 }];
    const d = construireDossierPiscine([parcelle, petite, grande], 'g', meta);
    expect(d.regime).toBe('permis');
    expect(d.piscine).toBe(grande);
    const t = texteDe(d.pdf);
    expect(t).toContain('(Permis de construire - Piscine)');
    expect(t).toContain('(PCMI2 - Plan de masse)');
    expect(t).toContain('cerfa 13406');
    // Sans designation, la premiere piscine du plan.
    expect(construireDossierPiscine([parcelle, petite, grande], null, meta).piscine).toBe(petite);
  });

  it('dessine l\'elevation d\'un bassin hors-sol et sa plage sur poteaux', () => {
    const piscine = nouvellePiscine('rectangle', { x: 15, y: 8 }, 'p', 1).obj;
    piscine.piscine = { implantation: 'hors-sol', plage: 'terrasse-bois', largeurPlage: 3 };
    const t = texteDe(construireDossierPiscine([parcelle, piscine], null, meta).pdf);
    expect(t).toContain('Elevation (vue de cote, bassin hors du sol)');
    expect(t).toContain('Poutres et poteaux');
    expect(t).toContain('garde-corps');
  });

  it('se passe de parcelle', () => {
    const piscine = nouvellePiscine('rectangle', { x: 0, y: 0 }, 'p', 1).obj;
    const d = construireDossierPiscine([piscine], null, { appVersion: '2.3.0' });
    expect(nbPages(d.pdf)).toBe(d.pages);
    expect(texteDe(d.pdf)).toContain('(Pas de parcelle dans le plan)');
  });
});
