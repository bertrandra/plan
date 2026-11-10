// Un projet enregistre en 5.1.0 avec des facades validees se relit et se reecrit sans perdre un champ de facade (garde-fou de la
// lecture, MD/RELEASE.md §8.2 bis). Le temoin (tests/fixtures/migrations/projet-5.1.0-facades-validees.json) a ete ecrit par le
// serialiseur de 5.1.0 (commit 1ea13701, schema 9) depuis la demonstration (parcelle sans son relief, terrasse, maison) : la maison
// porte une Facade validee qui remplit chaque champ que 5.1.0 savait ecrire (ouvertures numerotees et verifiees, details, carreaux,
// dimensions, forme, parement, pose de la texture, calage, grille, corrections, partie basse) et un releve pose d'office par l'audit.
// Le dessin de ces facades reste couvert par l'empreinte glb-structure.json.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validerProjetJSON } from '../../../src/io/validation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import type { ObjetPlan } from '../../../src/model/types.js';

const brut = JSON.parse(readFileSync(new URL('../../fixtures/migrations/projet-5.1.0-facades-validees.json', import.meta.url), 'utf8')) as {
  meta: { appVersion: string; schemaVersion: number }; objects: { key: string; facades?: unknown[] }[];
};
const facadesDuFichier = (objets: readonly { key: string; facades?: unknown }[]) => objets.find((o) => o.key === 'maison')?.facades;

/** Chaque feuille d'une valeur JSON, par son chemin (`0.ouvertures.2.details.carreaux.vantaux`) et sa valeur. */
function feuilles(v: unknown, chemin = '', out: Map<string, unknown> = new Map()): Map<string, unknown> {
  if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) feuilles(x, chemin ? chemin + '.' + k : k, out);
  else out.set(chemin, v);
  return out;
}

/** Ouvrir puis enregistrer sans rien toucher : la porte d'entree, la forme en memoire, la forme ecrite. */
function ouvrirEtEnregistrer(document: unknown): ReturnType<typeof serializeObjects> {
  const valide = validerProjetJSON(structuredClone(document));
  return serializeObjects(normalizeObjects(valide.objets) as unknown as ObjetPlan[]);
}

describe('un projet enregistre en 5.1.0 avec des facades validees', () => {
  it('est bien un temoin de 5.1.0, au schema 9, avec une facade validee complete', () => {
    expect([brut.meta.appVersion, brut.meta.schemaVersion]).toEqual(['5.1.0', 9]);
    const f = facadesDuFichier(brut.objects) as Record<string, unknown>[];
    expect(f).toHaveLength(2);
    for (const k of ['dimensions', 'forme', 'surface', 'textureCalee', 'calage', 'grille', 'corrections', 'partieBasse', 'calibration', 'photoLocale', 'hauteurTexture']) expect(f[0], k).toHaveProperty(k);
    expect(feuilles(f).size).toBeGreaterThan(150);
  });

  it('se relit et se reecrit sans perdre ni changer un champ de facade', () => {
    const avant = feuilles(facadesDuFichier(brut.objects));
    const apres = feuilles(facadesDuFichier(ouvrirEtEnregistrer(brut) as unknown as { key: string; facades?: unknown }[]));
    const perdus = [...avant].filter(([k, v]) => !apres.has(k) || apres.get(k) !== v).map(([k, v]) => k + ' : ' + JSON.stringify(v) + ' → ' + (apres.has(k) ? JSON.stringify(apres.get(k)) : 'absent'));
    expect(perdus).toEqual([]);
    expect(facadesDuFichier(ouvrirEtEnregistrer(brut) as unknown as { key: string; facades?: unknown }[])).toEqual(facadesDuFichier(brut.objects));
  });

  it('se relit une seconde fois a l identique (point fixe)', () => {
    const une = ouvrirEtEnregistrer(brut);
    const deux = ouvrirEtEnregistrer({ meta: brut.meta, objects: une, measures: [] });
    expect(deux).toEqual(une);
  });
});
