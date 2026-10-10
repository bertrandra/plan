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

describe('la migration 2 -> 3 : un toit pour chaque batiment BD TOPO', () => {
  const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
  const ign = (extra: Partial<ObjetBrut> = {}, bdtopo: Record<string, unknown> = {}) =>
    batiment({ pts: rect, bdtopo: { couche: 'BDTOPO_V3:batiment', id: 'B1', altitudeToitM: 52.1, ...bdtopo }, ...extra });

  // Le rectangle de 10 x 6 m est allonge : deux pans a pignons dans son axe (spec-toit-ign §4, regle 7).
  it('pose un toit estime sur un batiment importe avant le schema 3', () => {
    const lu = migrer({ objects: [ign()] }, 2);
    expect(lu.objects[0]!.toit).toMatchObject({ forme: 'deux-pans', source: 'bdtopo', estime: true });
    expect(lu.objects[0]!.toit!.hauteur).toBeCloseTo(3 * Math.tan((35 * Math.PI) / 180), 2);
    // Depuis le schema 1 aussi : la chaine passe par 2.
    expect(migrer({ objects: [ign()] }, 1).objects[0]!.toit!.forme).toBe('deux-pans');
  });

  it('lit la hauteur quand elle est enregistree, et laisse plat une construction legere', () => {
    expect(migrer({ objects: [ign({}, { altitudeToitMaxM: 55.1 })] }, 2).objects[0]!.toit).toEqual({ forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'bdtopo' });
    expect(migrer({ objects: [ign({}, { constructionLegere: true })] }, 2).objects[0]!.toit!.forme).toBe('plat');
  });

  it('ne touche ni un toit existant, ni un objet dessine, ni une zone de vegetation', () => {
    const photo = { forme: 'deux-pans' as const, hauteur: 2.8, angleFaitage: 90, source: 'photo' as const };
    const d = {
      objects: [
        ign({ toit: photo }),
        batiment({ pts: rect }),
        batiment({ pts: rect, bdtopo: { couche: 'BDTOPO_V3:zone_de_vegetation', id: 'V1' } })
      ]
    };
    expect(migrer(structuredClone(d), 2)).toEqual(d);
  });

  it('ne rejoue rien sur un document deja au schema 3', () => {
    const d = { objects: [ign()] };
    expect(migrer(structuredClone(d), 3)).toEqual(d);
  });
});

describe('le schema qu un document ecrit', () => {
  it('est 1 pour un plan sans releve ni toit', () => {
    expect(schemaMinimal([batiment()])).toBe(1);
    expect(schemaMinimal([batiment({ facades: [] })])).toBe(1);
  });

  it('est 3 pour la demonstration, dont la maison porte un toit a croupes : la plateforme doit accepter 3', () => {
    expect(schemaMinimal(DEMO_OBJECTS)).toBe(3);
    expect(schemaMinimal(DEMO_TEMOIN_OBJECTS)).toBe(3);
  });

  it('est 3 des qu un toit est a croupes', () => {
    expect(schemaMinimal([batiment({ toit: { forme: 'croupes', hauteur: 3, angleFaitage: 0 } })])).toBe(3);
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
