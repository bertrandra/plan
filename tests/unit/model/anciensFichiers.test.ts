import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureConstruction } from '../../../src/engine/construction.js';
import { migrer } from '../../../src/model/migrations.js';
import { COUCHE_BATIMENT_BDTOPO } from '../../../src/model/toitBdTopo.js';
import type { ObjetBrut } from '../../../src/model/types.js';

// Ce qu'un ancien fichier devient a la relecture (audit d'architecture, 25 octobre 2026). Deux chemins lui donnent des nombres sans
// numero de schema : les valeurs que le moteur pose quand un champ de construction manque (engine/construction.ts::ensureConstruction),
// et la migration 2 -> 3, qui donne un toit a un batiment BD TOPO (model/migrations.ts). Depuis le 26 octobre 2026, les deux sont
// figes (AD-19) : le remplissage lit engine/remplissageFige.ts, la migration sa copie model/fige/toitSchema3.ts, et ni l'un ni
// l'autre ne suit le code d'aujourd'hui (tests/unit/architecture.test.ts). Ces temoins ne devraient donc plus jamais bouger ; s'ils
// bougent, c'est un evenement de version (MD/RELEASE.md) : le dire dans EMPREINTES.md, puis recapturer (REECRIRE_EMPREINTES=1).

const dorees = resolve(__dirname, '../../fixtures/golden');
const temoin = (nom: string, contenu: string) => {
  const chemin = resolve(dorees, nom);
  if (process.env.REECRIRE_EMPREINTES) writeFileSync(chemin, contenu);
  return readFileSync(chemin, 'utf8');
};

describe('ce que devient un ancien fichier', () => {
  it('les valeurs par defaut de la construction (un projet qui ne les a pas enregistrees)', () => {
    const json = JSON.stringify({ sansConstruction: ensureConstruction({}), constructionVide: ensureConstruction({ construction: {} }) }, null, 1) + '\n';
    expect(json).toBe(temoin('defauts-construction.json', json));
  });

  it('la migration 2 -> 3 : le toit donne a un batiment BD TOPO qui n en avait pas', () => {
    const batiment = (pts: { x: number; y: number }[], b: Record<string, unknown>): ObjetBrut => ({ key: 'b' + pts.length, name: 'Bati', type: 'polygon', fonction: 'batiment', pts, elevation: 6, bdtopo: { couche: COUCHE_BATIMENT_BDTOPO, ...b } } as unknown as ObjetBrut);
    const doc = { objects: [
      batiment([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }], { altitudeToitM: 106, altitudeToitMaxM: 109 }),
      batiment([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 9 }, { x: 0, y: 9 }], {}),
      batiment([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }], { constructionLegere: true }),
    ] };
    const json = JSON.stringify(migrer(doc, 2).objects.map((o) => (o as { toit?: unknown }).toit ?? null), null, 1) + '\n';
    expect(json).toBe(temoin('migration-2-3.json', json));
  });
});
