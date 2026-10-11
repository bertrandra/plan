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

// Les demos rangees dans deploy/plan-demos/, que la livraison copie telles quelles.
describe.each([
  { id: '2', rayon: /voisinage 1 km/, objets: 1000 },
  { id: '3', rayon: /voisinage 5 km/, objets: 3500 }
])('la demo livree $id (livraison/plan-demos/$id.json)', ({ id, rayon, objets }) => {
  const livree = resolve(__dirname, '../../livraison/plan-demos/' + id + '.json');
  const source = resolve(__dirname, '../../deploy/plan-demos/' + id + '.json');

  it('est la copie de deploy/plan-demos/' + id + '.json', () => {
    expect(existsSync(livree), 'absente : npm run livraison').toBe(true);
    expect(readFileSync(livree, 'utf8')).toBe(readFileSync(source, 'utf8'));
  });

  it('est Peyrusse-le-Roc avec son voisinage, et se relit comme un projet', () => {
    const d = JSON.parse(readFileSync(source, 'utf8'));
    expect(d.meta).toMatchObject({ id, schemaVersion: schemaMinimal(d.objects) });
    expect(d.meta.name).toMatch(/^Peyrusse-le-Roc/);
    expect(d.meta.name).toMatch(rayon);
    const v = validerProjetJSON(d);
    expect(v.objets.length).toBeGreaterThan(objets);
    expect(v.objets.find(o => o.key === 'parcelle')?.relief?.paysage).toBeTruthy();
  });
});
