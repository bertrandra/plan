import { describe, it, expect } from 'vitest';
import { justessesDesAudits, poidsProposes, poidsSelonJustesse, DECISIONS_MIN } from '../../../../../src/app/audit/parcelle/poidsAuto.js';
import { RECONCILIATION } from '../../../../../src/regles/reconciliation.js';
import type { FichierAuditParcelle } from '../../../../../src/model/fichierAuditParcelle.js';

// Les poids recales sur les audits recus : une source qui a souvent raison pese plus, une source souvent ecartee pese moins.

const ligne = (source: string) => ({ source, libelle: source, valeur: 'x', confiance: 0.9, score: 3 });
/** Une proposition arbitree de hauteur : le LiDAR dit une valeur, la photo une autre ; `retenu` dit laquelle le moteur a gardee. */
function audit(decision: 'validee' | 'refusee' | null, retenu: 'lidar' | 'photo', kind: 'auto' | 'forcee' = 'auto', premiere = 'lidar') {
  const groupe = (source: string) => ({ valeur: source, score: 3, retenu: retenu === source, lignes: [ligne(source === 'lidar' ? premiere : source)] });
  return { decision, arbitrages: [{ cible: 'batiment:m', attribut: 'hauteurEgout', libelle: 'Hauteur', decision: kind, accord: 'nombre', raison: '', avant: '', groupes: [groupe('lidar'), groupe('photo')], regles: [] }] };
}
const fichier = (props: ReturnType<typeof audit>[]) => ({ propositions: props } as unknown as FichierAuditParcelle);
const de = (n: number, p: ReturnType<typeof audit>) => Array.from({ length: n }, () => p);

describe('la justesse des sources dans les audits recus', () => {
  it('une proposition validee donne raison au groupe retenu et tort aux autres', () => {
    const j = justessesDesAudits([fichier([audit('validee', 'lidar')])]);
    expect(j.find((x) => x.source === 'lidar')).toMatchObject({ decisions: 1, justes: 1, taux: 1 });
    expect(j.find((x) => x.source === 'photo')).toMatchObject({ decisions: 1, justes: 0, taux: 0 });
  });

  it('une proposition refusee donne tort au groupe retenu et ne juge pas les autres', () => {
    const j = justessesDesAudits([fichier([audit('refusee', 'photo')])]);
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ source: 'photo', decisions: 1, justes: 0 });
  });

  it('une valeur forcee ou une proposition sans reponse ne juge personne', () => {
    expect(justessesDesAudits([fichier([audit('validee', 'lidar', 'forcee'), audit(null, 'lidar')])])).toEqual([]);
  });
});

describe('les poids proposes', () => {
  it('monte le poids d une source souvent juste, baisse celui d une source souvent ecartee', () => {
    const j = justessesDesAudits([fichier(de(DECISIONS_MIN, audit('validee', 'lidar')))]);
    const p = poidsProposes(j, RECONCILIATION);
    expect(p.find((x) => x.source === 'lidar')).toMatchObject({ attribut: 'hauteurEgout', actuel: 4, propose: 5 });
    expect(p.find((x) => x.source === 'photo')).toMatchObject({ actuel: 3, propose: 1.5 });
  });

  it('se tait sous le nombre de decisions requis, et quand le poids ne bougerait pas', () => {
    expect(poidsProposes(justessesDesAudits([fichier(de(DECISIONS_MIN - 1, audit('validee', 'lidar')))]), RECONCILIATION)).toEqual([]);
    expect(poidsSelonJustesse(4, 0.8)).toBe(4);
    expect(poidsSelonJustesse(4, 0)).toBe(2);
    expect(poidsSelonJustesse(4, 1)).toBe(5);
  });

  it('ne recale jamais le poids de ce que la personne a vu sur place', () => {
    const p = poidsProposes(justessesDesAudits([fichier(de(DECISIONS_MIN, audit('validee', 'lidar', 'auto', 'terrain')))]), RECONCILIATION);
    expect(p.some((x) => x.source === 'terrain')).toBe(false);
  });
});
