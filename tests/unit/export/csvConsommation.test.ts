import { describe, it, expect } from 'vitest';
import { csv, csvOrganisations, csvParcelles, csvTemps, csvUsages } from '../../../src/export/csvConsommation.js';
import { parParcelle, parUsage, serieTemps, type LigneConsommation } from '../../../src/model/consommation.js';

// L'export CSV de la vue affichee du tableau de bord (MD/spec-audit.md 13.3) : pour un tableur
// francais, sans perte de precision, sans formule glissee par une adresse.

const BOM = '﻿';
const lignesDe = (texte: string) => texte.replace(BOM, '').split('\r\n').filter(Boolean);

function ligne(t: string, plus: Partial<LigneConsommation> = {}): LigneConsommation {
  return {
    t, organisation: 'admin', projet: 'admin', idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet', audit: 'audit-1',
    usage: 'analyse', modele: 'claude-haiku-5-5', batch: true, passe: 1,
    tokens: { entree: 4000, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 25000, sortie: 1500 }, images: 1, cout: 0.0007, statut: 'reussi', ...plus
  };
}

describe('le CSV de la consommation', () => {
  it('ecrit pour un tableur francais : BOM, point-virgule, virgule decimale, CRLF', () => {
    const t = csv(['Nom', 'Coût ($)'], [['a', 0.0012], ['b', 1500], ['c', null]]);
    expect(t.startsWith(BOM)).toBe(true);
    expect(t.endsWith('\r\n')).toBe(true);
    expect(lignesDe(t)).toEqual(['Nom;Coût ($)', 'a;0,0012', 'b;1500', 'c;']);
  });

  it('garde la precision, sans notation scientifique', () => {
    expect(lignesDe(csv(['x'], [[1e-7], [0.00000001], [0.1 + 0.2], [0]]))).toEqual(['x', '0,0000001', '0,00000001', '0,3', '0']);
  });

  it('protege les textes : guillemets, separateurs, retours, et formules neutralisees', () => {
    expect(lignesDe(csv(['a'], [['Rue "du Parc"; 3'], ['=SOMME(A1)'], ['+33 1'], ['-x'], ['@x']]))).toEqual(['a', '"Rue ""du Parc""; 3"', '\'=SOMME(A1)', '\'+33 1', '\'-x', '\'@x']);
    expect(csv(['a'], [['deux\nlignes']])).toContain('"deux\nlignes"');
  });

  it('exporte la vue dans le temps, par modele, avec son unite', () => {
    const s = serieTemps([ligne('2026-10-13T08:00:00Z'), ligne('2026-10-14T08:00:00Z', { modele: 'claude-sonnet-5-5', cout: 0.004 })], '2026-10-13', '2026-10-14', 'jour', 'cout');
    expect(lignesDe(csvTemps(s, 'cout'))).toEqual([
      'Période;Claude Haiku 5.5 ($);Claude Sonnet 5.5 ($);Total ($)',
      '2026-10-13;0,0007;0;0,0007',
      '2026-10-14;0;0,004;0,004'
    ]);
    const t = serieTemps([ligne('2026-10-13T08:00:00Z')], '2026-10-13', '2026-10-13', 'jour', 'tokens');
    expect(lignesDe(csvTemps(t, 'tokens'))).toEqual(['Période;Claude Haiku 5.5 (tokens);Total (tokens)', '2026-10-13;30500;30500']);
  });

  it('exporte les parcelles, les usages et les organisations', () => {
    const ls = [ligne('2026-10-13T08:00:00Z'), ligne('2026-10-14T08:00:00Z', { idu: null, adresse: '=1+1', audit: 'audit-2' })];
    expect(lignesDe(csvParcelles(parParcelle(ls), ['claude-haiku-5-5']))).toEqual([
      'Adresse;IDU;Audits;Tokens Claude Haiku 5.5;Tokens;Part du cache;Coût ($);Dernier audit',
      '2 allée des Limites, Le Vésinet;78650000AE0101;1;30500;30500;0,86206897;0,0007;2026-10-13',
      '\'=1+1;;1;30500;30500;0,86206897;0,0007;2026-10-14'
    ]);
    expect(lignesDe(csvUsages(parUsage(ls)))[1]).toBe('Analyse;2;61000;0,0014;1;1');
    expect(lignesDe(csvOrganisations([{ id: 'admin', coutPeriode: 0.0014, jour: 0.0007, plafondJour: 1, mois: 0.0014, plafondMois: 10, partJour: 0.0007, partMois: 0.00014 }])))
      .toEqual(['Organisation;Coût de la période ($);Aujourd’hui ($);Plafond du jour ($);Ce mois ($);Plafond du mois ($);Part du plafond du mois', 'admin;0,0014;0,0007;1;0,0014;10;0,00014']);
  });
});
