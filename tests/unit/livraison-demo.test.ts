import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_OBJECTS, DEMO_MEASURES } from '../../src/model/demo.js';
import { schemaMinimal } from '../../src/model/migrations.js';
import { validerProjetJSON } from '../../src/io/validation.js';

// La livraison porte la premiere demo de l'admin (scripts/livraison.mjs) : la demonstration
// integree, au format de l'export. Elle doit etre celle du code, et se relire.

const chemin = resolve(__dirname, '../../livraison/plan-demos/1.json');

describe('la demo livree (livraison/plan-demos/1.json)', () => {
  it('existe', () => {
    expect(existsSync(chemin), 'absente : npm run livraison').toBe(true);
  });

  it('est la demonstration du code, au format de l export', () => {
    const d = JSON.parse(readFileSync(chemin, 'utf8'));
    expect(d.meta).toMatchObject({ id: '1', name: 'Parcelle AE 101', schemaVersion: schemaMinimal(DEMO_OBJECTS) });
    expect(d.objects).toEqual(JSON.parse(JSON.stringify(DEMO_OBJECTS)));
    expect(d.measures).toEqual(JSON.parse(JSON.stringify(DEMO_MEASURES)));
  });

  it('se relit comme un projet', () => {
    const v = validerProjetJSON(JSON.parse(readFileSync(chemin, 'utf8')));
    expect(v.objets.length).toBe(DEMO_OBJECTS.length);
  });
});
