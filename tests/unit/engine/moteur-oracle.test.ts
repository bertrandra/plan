import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureConstruction } from '../../../src/engine/construction.js';
import { computeStructure, buildVisGrid, findSpaZones } from '../../../src/engine/structure.js';
import { computeTerrasseLayers } from '../../../src/engine/layers.js';
import { computeBOM } from '../../../src/engine/bom.js';
import { computeDebitLames, computeDebitsBois } from '../../../src/engine/debit.js';
import { computeImplantation } from '../../../src/engine/implantation.js';
import { computeChantier } from '../../../src/engine/chantier.js';

// Oracle capture depuis l'application AVANT le deplacement du moteur (phase 3), avec ses
// artefacts d'accumulation flottante (269.3999999999999, 3.5000000000000004) : ce sont eux qui
// prouvent que l'ordre des operations n'a pas bouge (spec-migration-typescript.md §10.2).
// Voir plus bas pourquoi la comparaison est stricte sur le BOM et le chantier, et a 12 chiffres
// significatifs ailleurs.
const oracle = JSON.parse(
  readFileSync(resolve(__dirname, '../../fixtures/golden/moteur-terrasses.json'), 'utf8')
) as {
  objets: unknown[];
  terrasses: {
    cle: string;
    entree: Record<string, unknown>;
    structure: unknown;
    layers: unknown;
    bom: unknown;
    debitLames: unknown;
    debitBois: unknown;
    implantation: unknown;
    chantier: unknown;
    visGrid: unknown;
    spaZones: unknown;
  }[];
};

// Le JSON ne transporte pas `undefined` : la sortie calculee passe par le meme filtre avant
// comparaison, sinon un champ absent d'un cote et `undefined` de l'autre ferait echouer sans
// qu'aucune valeur n'ait change.
const commeJson = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// Pourquoi 12 chiffres significatifs et non l'egalite stricte ici :
//
// l'oracle a ete capture dans le navigateur, ce test tourne sous Node. `Math.sin` et `Math.cos`
// ne rendent pas les memes derniers bits d'une version de V8 a l'autre - l'ecart mesure est d'un
// ULP (…114908 contre …114907) sur les sorties qui passent par de la trigonometrie. Ce n'est pas
// une difference de calcul, c'est une difference de bibliotheque mathematique.
//
// La parite exacte exigee par la spec §10.2 est verifiee ailleurs, sur le terrain ou elle a un
// sens : navigateur contre navigateur, avant et apres le deplacement du moteur. Les 18 sorties
// (2 terrasses x 9 calculs) y sont identiques bit a bit - voir MD/MIGRATION-JOURNAL.md, phase 3.
//
// Ici on verifie donc la stabilite a 12 chiffres, ce qui reste bien plus serre que tout ce qui
// sort sur un devis, ET l'egalite STRICTE sur le BOM et le chantier, qui passent sans tolerance :
// ce sont les nombres qui partent chez un fournisseur.
const arrondi = <T>(v: T): T => {
  const f = (x: unknown): unknown => {
    if (typeof x === 'number') return Number.isFinite(x) ? Number(x.toPrecision(12)) : x;
    if (Array.isArray(x)) return x.map(f);
    if (x && typeof x === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(x as Record<string, unknown>)) out[k] = f(val);
      return out;
    }
    return x;
  };
  return f(commeJson(v)) as T;
};

describe('moteur terrasse - parite avec l oracle', () => {
  it('couvre les deux terrasses de reference', () => {
    expect(oracle.terrasses.map((t) => t.cle)).toEqual(['terrasse', 'table']);
    expect(oracle.objets.length).toBe(35);
  });

  for (const cas of oracle.terrasses) {
    describe('terrasse ' + cas.cle, () => {
      const objets = JSON.parse(JSON.stringify(oracle.objets)) as never[];
      const obj = JSON.parse(JSON.stringify(cas.entree)) as never;
      ensureConstruction(obj);

      it('computeStructure', () => {
        expect(arrondi(computeStructure(obj, objets))).toEqual(arrondi(cas.structure));
      });
      it('computeTerrasseLayers', () => {
        expect(arrondi(computeTerrasseLayers(obj, objets))).toEqual(arrondi(cas.layers));
      });
      it('computeBOM - egalite STRICTE : ce sont les nombres qui partent chez un fournisseur', () => {
        const layers = computeTerrasseLayers(obj, objets);
        expect(commeJson(computeBOM(obj, layers))).toEqual(cas.bom);
      });
      it('computeDebitLames', () => {
        const layers = computeTerrasseLayers(obj, objets);
        expect(arrondi(computeDebitLames(obj, layers))).toEqual(arrondi(cas.debitLames));
      });
      it('computeDebitsBois', () => {
        const layers = computeTerrasseLayers(obj, objets);
        expect(arrondi(computeDebitsBois(obj, layers))).toEqual(arrondi(cas.debitBois));
      });
      it('computeImplantation', () => {
        const layers = computeTerrasseLayers(obj, objets);
        expect(arrondi(computeImplantation(obj, layers))).toEqual(arrondi(cas.implantation));
      });
      it('computeChantier - egalite stricte', () => {
        const layers = computeTerrasseLayers(obj, objets);
        expect(commeJson(computeChantier(obj, layers))).toEqual(cas.chantier);
      });
      it('buildVisGrid', () => {
        expect(arrondi(buildVisGrid(obj, computeStructure(obj, objets), objets))).toEqual(arrondi(cas.visGrid));
      });
      it('findSpaZones', () => {
        const marge =
          (obj as { construction?: { visMargeZoneSpa?: number } }).construction?.visMargeZoneSpa || 0;
        expect(arrondi(findSpaZones(marge, objets))).toEqual(arrondi(cas.spaZones));
      });
    });
  }
});
