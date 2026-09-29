import { describe, it, expect } from 'vitest';
import { MIGRATIONS, schemaMinimal, schemaAEcrire, migrationsDepuis, migrer } from '../../../src/model/migrations.js';
import { SCHEMA_VERSION } from '../../../src/model/version.js';
import { DEMO_OBJECTS, DEMO_TEMOIN_OBJECTS } from '../../../src/model/demo.js';
import type { ObjetBrut } from '../../../src/model/types.js';

const batiment = (extra: Partial<ObjetBrut> = {}): ObjetBrut =>
  ({ key: 'b', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], ...extra } as ObjetBrut);
const releve = { cote: 0 } as unknown as NonNullable<ObjetBrut['facades']>[number];

describe('la chaine des migrations', () => {
  it('mene sans trou de 1 au schema du programme', () => {
    // Un schema monte sans sa migration : le programme lirait un document ancien comme s'il etait neuf.
    expect(MIGRATIONS.map((m) => m.de)).toEqual(Array.from({ length: SCHEMA_VERSION - 1 }, (_, i) => i + 1));
    MIGRATIONS.forEach((m) => expect(m.apporte.length).toBeGreaterThan(10));
  });

  it('ne rejoue rien sur un document deja courant', () => {
    expect(migrationsDepuis(SCHEMA_VERSION)).toEqual([]);
    expect(migrationsDepuis(1)).toHaveLength(SCHEMA_VERSION - 1);
  });

  it('lit un document de schema 1 sans rien perdre (1 -> 2 n ajoute que des champs facultatifs)', () => {
    const d = { objects: [batiment()], measures: [{ id: 'm' }] };
    expect(migrer(structuredClone(d), 1)).toEqual(d);
    expect(migrer(structuredClone(d), undefined)).toEqual(d);
  });
});

describe('le schema qu un document ecrit', () => {
  it('est 1 pour un plan sans releve ni toit : la demonstration s ouvre sur une plateforme restee a [1]', () => {
    expect(schemaMinimal(DEMO_OBJECTS)).toBe(1);
    expect(schemaMinimal(DEMO_TEMOIN_OBJECTS)).toBe(1);
    expect(schemaMinimal([batiment({ facades: [] })])).toBe(1);
  });

  it('est 2 des qu un batiment porte un releve ou un toit', () => {
    expect(schemaMinimal([batiment({ facades: [releve] })])).toBe(2);
    expect(schemaMinimal([batiment({ toit: { forme: 'plat' } as unknown as NonNullable<ObjetBrut['toit']> })])).toBe(2);
  });

  it('ne redescend jamais sous le plancher d un projet mis a jour', () => {
    expect(schemaAEcrire([batiment()], 2)).toBe(2);
    expect(schemaAEcrire([batiment()], 1)).toBe(1);
    expect(schemaAEcrire([batiment()], null)).toBe(1);
    expect(schemaAEcrire([batiment({ facades: [releve] })], 1)).toBe(2);
  });

  it('ne depasse jamais le schema du programme', () => {
    expect(schemaAEcrire([batiment()], SCHEMA_VERSION + 3)).toBe(SCHEMA_VERSION);
  });
});
