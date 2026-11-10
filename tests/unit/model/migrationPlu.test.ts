import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { migrer, schemaAEcrire, schemaMinimal } from '../../../src/model/migrations.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { REGLEMENT } from '../../fixtures/plu/reglement.js';
import type { ObjetAPlat, ObjetPlan } from '../../../src/model/types.js';

// La migration 7 -> 8 (lot L4) : le reglement du PLU lu pour le projet, `reglementPlu` sur la parcelle.

const temoin7 = JSON.parse(readFileSync(new URL('../../fixtures/migrations/schema-7.json', import.meta.url), 'utf8')) as {
  meta: { schemaVersion: number }; objects: Record<string, unknown>[]; measures: unknown[];
};
const relu = (objets: unknown[], schema: number | undefined) =>
  serializeObjects(normalizeObjects(migrer({ objects: structuredClone(objets) as ObjetAPlat[] }, schema).objects) as unknown as ObjetPlan[]) as unknown as Record<string, unknown>[];

describe('la migration 7 -> 8 : le reglement du PLU (lot L4)', () => {
  it('lit un document de schema 7 tel quel, zonage compris, et il s’ecrit toujours au plus petit schema qui le decrit', () => {
    const d = { objects: temoin7.objects as unknown as ObjetAPlat[], measures: temoin7.measures };
    expect(migrer(structuredClone(d), 7)).toEqual(d);
    const une = relu(temoin7.objects, 7);
    expect(une[0]!.plu).toEqual(temoin7.objects[0]!.plu);
    expect(une[0]).not.toHaveProperty('reglementPlu');
    expect(schemaAEcrire(une as unknown as ObjetAPlat[], null)).toBe(6);
    expect(relu(une, 7)).toEqual(une);
  });

  it('s’ecrit au 8 des que la parcelle porte un reglement lu, qui revient a l’identique', () => {
    const avec = structuredClone(temoin7.objects);
    avec[0]!.reglementPlu = structuredClone(REGLEMENT);
    expect(schemaMinimal(avec as unknown as ObjetAPlat[])).toBe(8);
    const une = relu(avec, 8);
    expect(une[0]!.reglementPlu).toEqual(REGLEMENT);
    expect(relu(une, 8)).toEqual(une);
  });

  it('retire a la lecture un reglement qui ne se lit pas', () => {
    const avec = structuredClone(temoin7.objects);
    avec[0]!.reglementPlu = { format: 'autre' };
    expect(relu(avec, 8)[0]).not.toHaveProperty('reglementPlu');
  });
});
