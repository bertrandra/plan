import { describe, it, expect } from 'vitest';
import { MIGRATIONS, schemaMinimal, schemaAEcrire, migrationsDepuis, migrer } from '../../../src/model/migrations.js';
import { SCHEMA_VERSION } from '../../../src/model/version.js';
import { DEMO_OBJECTS, DEMO_TEMOIN_OBJECTS } from '../../../src/model/demo.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import type { ObjetAPlat, ObjetPlan } from '../../../src/model/types.js';
import { readFileSync } from 'node:fs';

const temoin5 = JSON.parse(readFileSync(new URL('../../fixtures/migrations/schema-5.json', import.meta.url), 'utf8')) as {
  meta: { schemaVersion: number }; objects: unknown[]; measures: unknown[];
};

const temoin6 = JSON.parse(readFileSync(new URL('../../fixtures/migrations/schema-6.json', import.meta.url), 'utf8')) as {
  meta: { schemaVersion: number }; objects: unknown[]; measures: unknown[];
};
const golden = JSON.parse(readFileSync(new URL('../../fixtures/golden/projet.json', import.meta.url), 'utf8')) as { meta: { schemaVersion: number }; objects: unknown[] };

/** Un document lu (migre, normalise) puis reecrit, comme l'ouvrir et l'enregistrer sans y toucher. */
const relu = (objets: unknown[], schema: number | undefined) =>
  serializeObjects(normalizeObjects(migrer({ objects: structuredClone(objets) as ObjetAPlat[] }, schema).objects) as unknown as ObjetPlan[]) as unknown as Record<string, unknown>[];

const batiment = (extra: Partial<ObjetAPlat> = {}): ObjetAPlat =>
  ({ key: 'b', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], ...extra } as ObjetAPlat);
const releve = { cote: 0 } as unknown as NonNullable<ObjetAPlat['facades']>[number];

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

  it('lit un document de schema 4 tel quel (4 -> 5 ne fait que distinguer les champs venus apres le relief)', () => {
    const d = { objects: [batiment({ piscine: {}, corpsToit: [] } as Partial<ObjetAPlat>)], measures: [] };
    expect(migrer(structuredClone(d), 4)).toEqual(d);
    expect(schemaAEcrire(d.objects, 4)).toBe(5);
  });

  it('lit un document de schema 5 tel quel (5 -> 6 ne fait que distinguer la retouche, l egout choisi et le soleil)', () => {
    // Le temoin (tests/fixtures/migrations/schema-5.json) : un fichier ecrit au 5 avec les trois champs venus apres sa livraison.
    const d = { objects: temoin5.objects as unknown as ObjetAPlat[], measures: temoin5.measures };
    const lu = migrer(structuredClone(d), temoin5.meta.schemaVersion);
    expect(lu).toEqual(d);
    expect(schemaMinimal(lu.objects)).toBe(6);
    // Lu puis reecrit : les trois champs restent, et le document s'ecrit au 6.
    const memoire = normalizeObjects(structuredClone(lu.objects)) as unknown as ObjetPlan[];
    expect(memoire[1]!.batiment?.egoutChoisi).toBe('saisie');
    const reecrit = serializeObjects(memoire) as unknown as Record<string, unknown>[];
    expect(reecrit[0]).toMatchObject({ soleil: { dateStr: '2026-06-21', minutes: 900 }, retoucheMain: { date: '2026-10-27' } });
    expect(reecrit[1]).toMatchObject({ egoutChoisi: 'saisie', retoucheMain: { date: '2026-10-27' } });
    expect(reecrit[2]).toMatchObject({ egoutChoisi: 'audit' });
    expect(schemaMinimal(memoire)).toBe(6);
    expect(schemaAEcrire(reecrit as unknown as ObjetAPlat[], 5)).toBe(6);
  });
});

describe('la migration 6 -> 7 : la Facade d un releve valide (lot F5)', () => {
  it('lit un document de schema 6 tel quel : son releve, ses ouvertures, son calage ancien compris', () => {
    // Le temoin (tests/fixtures/migrations/schema-6.json) : un releve pose par l'audit, avant la Facade, avec l'ecart du contour que
    // le calage portait (`contourDecaleM`, que plus rien n'ecrit ni ne lit).
    const d = { objects: temoin6.objects as unknown as ObjetAPlat[], measures: temoin6.measures };
    expect(migrer(structuredClone(d), temoin6.meta.schemaVersion)).toEqual(d);
    expect(schemaMinimal(d.objects)).toBe(6);
    // Lu puis reecrit : le releve revient a l'identique, et le document s'ecrit toujours au 6.
    const reecrit = relu(temoin6.objects, 6);
    expect(reecrit[1]!.facades).toEqual((temoin6.objects[1] as { facades: unknown }).facades);
    expect(schemaAEcrire(reecrit as unknown as ObjetAPlat[], 6)).toBe(6);
    // Relu une seconde fois, rien ne bouge plus.
    expect(relu(reecrit, 6)).toEqual(reecrit);
  });

  it('relit a l identique les anciens fichiers : le temoin dore, la demonstration, les temoins des schemas 5 et 6', () => {
    // projet.json (tests/fixtures/golden/) est ecrit par Plan : lu puis reecrit, il revient octet pour octet.
    expect(JSON.stringify(relu(golden.objects, golden.meta.schemaVersion))).toBe(JSON.stringify(golden.objects));
    // La demonstration et les temoins ne sont pas sous la forme ecrite (des cles par defaut s'ajoutent a la premiere ecriture) : leur
    // relecture est un point fixe, au schema qui les decrit (la demonstration reste au 5, que la plateforme accepte deja).
    for (const [objets, schema] of [[DEMO_OBJECTS, 5], [temoin5.objects, 6], [temoin6.objects, 6]] as const) {
      const une = relu(objets as unknown[], schema);
      expect(relu(une, schema)).toEqual(une);
      expect(schemaMinimal(une as unknown as ObjetAPlat[])).toBe(schema);
    }
  });

  it('s ecrit au 7 des qu un releve porte sa Facade, ou une ouverture son identifiant, sa verification ou ses carreaux', () => {
    const avec = (r: Record<string, unknown>) => [batiment({ facades: [{ ...releve, ouvertures: [], ...r }] } as Partial<ObjetAPlat>)];
    for (const champ of ['dimensions', 'forme', 'surface', 'textureCalee']) expect(schemaMinimal(avec({ [champ]: {} })), champ).toBe(7);
    const ov = { type: 'fenetre', x: 1, y: 1, l: 1, h: 1 };
    expect(schemaMinimal(avec({ ouvertures: [{ ...ov, id: 'o1' }] }))).toBe(7);
    expect(schemaMinimal(avec({ ouvertures: [{ ...ov, verifieeLe: '2026-10-29' }] }))).toBe(7);
    expect(schemaMinimal(avec({ ouvertures: [{ ...ov, details: { carreaux: { source: 'ia', vantaux: 2 } } }] }))).toBe(7);
    // Le releve d'avant reste au 2 ; ses details d'avant (le vitrage vu par l'analyse) n'en changent rien.
    expect(schemaMinimal(avec({ ouvertures: [{ ...ov, details: { vitrage: 'petits-bois' } }] }))).toBe(2);
    // En memoire, les facades vivent dans le sous-objet `batiment` : elles comptent tout autant.
    expect(schemaMinimal([{ ...batiment(), batiment: { facades: [{ ...releve, ouvertures: [], dimensions: {} }] } } as unknown as ObjetAPlat])).toBe(7);
  });
});

const temoin8 = JSON.parse(readFileSync(new URL('../../fixtures/migrations/schema-8.json', import.meta.url), 'utf8')) as {
  meta: { schemaVersion: number }; objects: unknown[]; measures: unknown[];
};

describe('la migration 8 -> 9 : le jardin (lot L3 ; le 8 est celui du lot L4)', () => {
  it('lit un document de schema 8 tel quel : un massif d avant et un spa restent ce qu ils etaient, au schema qui les decrit', () => {
    const d = { objects: temoin8.objects as unknown as ObjetAPlat[], measures: temoin8.measures };
    expect(migrer(structuredClone(d), 7)).toEqual(d);
    expect(migrer(structuredClone(d), 8)).toEqual(d);
    const reecrit = relu(temoin8.objects, 8);
    expect(reecrit[1]!.plantation).toBeUndefined();
    expect(reecrit[2]!.nature).toBeUndefined();
    expect(schemaMinimal(reecrit as unknown as ObjetAPlat[])).toBe(1);
    expect(relu(reecrit, 8)).toEqual(reecrit);
  });

  it('s ecrit au 9 des qu un objet porte une plantation, son retrait de vegetation, une nature d equipement ou la marque existant', () => {
    for (const [champ, v] of [['plantation', { type: 'fleurs', source: 'main' }], ['vegetation3d', false], ['nature', 'regard'], ['existant', true]] as const) {
      expect(schemaMinimal([batiment({ [champ]: v } as Partial<ObjetAPlat>)]), champ).toBe(9);
    }
  });
});

describe('la migration 2 -> 3 : un toit pour chaque batiment BD TOPO', () => {
  const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
  const ign = (extra: Partial<ObjetAPlat> = {}, bdtopo: Record<string, unknown> = {}) =>
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

  it('est 5 pour la demonstration, dont les batiments portent leurs corps de toit, et 3 pour son temoin (maison a croupes) : la plateforme doit accepter 5', () => {
    expect(schemaMinimal(DEMO_OBJECTS)).toBe(5);
    expect(schemaMinimal(DEMO_TEMOIN_OBJECTS)).toBe(3);
  });

  it('est 5 des qu un objet porte un champ venu apres le relief (piscine, pergola, cloture, corps du toit…) : un lecteur 4 le perdrait', () => {
    for (const champ of ['piscine', 'pergola', 'cloture', 'corpsToit', 'volumesToit', 'toitMesure', 'fenetres3d', 'voisinage3d', 'ruesVoisinage']) {
      expect(schemaMinimal([batiment({ [champ]: {} } as Partial<ObjetAPlat>)]), champ).toBe(5);
    }
  });

  it('est 6 des qu un objet porte un champ venu apres la premiere livraison du 5 (retouche, egout choisi, soleil) : un lecteur 5 le perdrait', () => {
    expect(schemaMinimal([batiment({ retoucheMain: { date: '2026-10-27' } } as Partial<ObjetAPlat>)])).toBe(6);
    expect(schemaMinimal([batiment({ egoutChoisi: 'saisie' } as Partial<ObjetAPlat>)])).toBe(6);
    expect(schemaMinimal([batiment({ soleil: { dateStr: '2026-06-21', minutes: 900 } } as Partial<ObjetAPlat>)])).toBe(6);
    // En memoire, l'egout choisi vit dans le sous-objet `batiment` : il compte tout autant.
    expect(schemaMinimal([{ ...batiment(), batiment: { egoutChoisi: 'audit' } } as unknown as ObjetAPlat])).toBe(6);
  });

  it('est 3 des qu un toit est a croupes', () => {
    expect(schemaMinimal([batiment({ toit: { forme: 'croupes', hauteur: 3, angleFaitage: 0 } })])).toBe(3);
  });

  it('est 2 des qu un batiment porte un releve ou un toit', () => {
    expect(schemaMinimal([batiment({ facades: [releve] })])).toBe(2);
    expect(schemaMinimal([batiment({ toit: { forme: 'plat' } as unknown as NonNullable<ObjetAPlat['toit']> })])).toBe(2);
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
