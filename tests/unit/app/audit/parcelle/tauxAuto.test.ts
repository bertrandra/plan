import { describe, it, expect } from 'vitest';
import { causeManuelle, direTaux, tauxDesAudits } from '../../../../../src/app/audit/parcelle/tauxAuto.js';
import type { FichierAuditParcelle } from '../../../../../src/model/fichierAuditParcelle.js';
import type { ArbitrageProposition } from '../../../../../src/regles/decisions.js';

// Le taux de decisions automatiques des audits recus : de quoi regler les poids sur ce que le moteur a decide.

const arb = (attribut: string, decision: ArbitrageProposition['decision'], raison = ''): ArbitrageProposition => ({
  cible: 'batiment:maison', attribut, libelle: attribut, decision, accord: 'nombre', raison, avant: '', groupes: [], regles: [],
});
const prop = (id: string, decision: 'validee' | 'refusee' | null, ...arbitrages: ArbitrageProposition[]) => ({ id, decision, arbitrages });
const fichier = (...propositions: ReturnType<typeof prop>[]): FichierAuditParcelle => ({ propositions } as unknown as FichierAuditParcelle);

describe('la cause d une decision laissee a la personne', () => {
  it('se lit dans la raison que le moteur a ecrite', () => {
    expect(causeManuelle('Les sources se contredisent (3,15 contre 2,4, il faut ×1,5) : …')).toBe('contradiction');
    expect(causeManuelle('Photo de façade seul ne décide pas : …')).toBe('source-seule');
    expect(causeManuelle('Score insuffisant (2,7 pour 3 requis) : …')).toBe('score');
    expect(causeManuelle('Remplace une valeur que vous avez choisie (5 m) : …')).toBe('valeur-choisie');
    expect(causeManuelle('autre chose')).toBe('autre');
  });
});

describe('le taux des audits', () => {
  const f = fichier(
    prop('a', 'validee', arb('hauteurEgout', 'auto')),
    prop('b', 'refusee', arb('hauteurEgout', 'auto')),
    prop('c', null, arb('formeToit', 'manuelle', 'Les sources se contredisent (…)'), arb('boutsToit', 'manuelle', 'Score insuffisant (…)')),
    prop('d', 'validee', arb('formeToit', 'choisie')),
    prop('e', 'validee', arb('formeToit', 'forcee')),
    prop('f', 'validee', arb('formeToit', 'rien')),
  );
  const t = tauxDesAudits([f]);

  it('compte les decisions a prendre : « rien a changer » n y est pas', () => {
    expect(t.arbitrages).toBe(6);
    expect(t.partAuto).toBeCloseTo(2 / 6);
  });
  it('dit combien d automatiques la personne a refuses, et combien de manuelles, par attribut', () => {
    expect(t.partAutoGardee).toBe(0.5);
    expect(t.parAttribut.find((l) => l.attribut === 'hauteurEgout')).toMatchObject({ auto: 2, autoRefusees: 1 });
    expect(t.parAttribut.find((l) => l.attribut === 'formeToit')).toMatchObject({ manuelles: 1, choisies: 1, forcees: 1 });
  });
  it('dit pourquoi les decisions ont attendu', () => {
    expect(t.causes).toMatchObject({ contradiction: 1, score: 1, 'source-seule': 0 });
  });
  it('se lit en texte, et dit quand il n y a rien a compter', () => {
    expect(direTaux(t)).toMatch(/1 audit, 6 décisions : 33 % automatiques, dont 50 % gardées/);
    expect(direTaux(t)).toContain('À vous, pourquoi : contradiction 1 · score 1.');
    expect(direTaux(tauxDesAudits([fichier()]))).toMatch(/aucun arbitrage à compter/);
  });
});
