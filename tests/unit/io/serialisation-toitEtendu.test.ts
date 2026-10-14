import { describe, it, expect } from 'vitest';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import demo from '../../../src/model/demo-projet.json';
import type { BoutToit, CorpsToit, Lucarne, ObjetPlan, ProfilPan } from '../../../src/model/types.js';

// Le modele de toit etendu a l'enregistrement (MD/spec-regles-toits.md §4, lot G1) : profil, bouts,
// lucarnes et bords sont facultatifs ; un fichier ancien se relit et se reecrit a l'identique.

const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
const corps: CorpsToit = { pts, posFaitage: 4, faitage: 9, egouts: [5, 5], pignons: [], ecart: 0.2 };
const profil: [ProfilPan, ProfilPan] = [{ type: 'brise', largeurBrisisM: 1, hauteurBrisM: 8 }, { type: 'brise', largeurBrisisM: 1.2, hauteurBrisM: 8 }];
const bouts: [BoutToit, BoutToit] = [{ type: 'brisis', largeurM: 1 }, { type: 'demi-croupe', profondeurM: 1.5, hauteurPignonM: 1.8 }];
const lucarnes: Lucarne[] = [{ type: 'capucine', pan: 1, debutM: 2, finM: 3.2, faitageM: 8, profondeurM: 1.2, source: 'observation' }];
const batiment = (corpsToit: CorpsToit[]) => ({
  key: 'b', type: 'polygon', name: 'Maison', pts, fonction: 'batiment', vertexNames: ['A', 'B', 'C', 'D'], segmentNames: ['1', '2', '3', '4'],
  frozenVertices: [false, false, false, false], corpsToit,
}) as unknown as ObjetPlan;

function allerRetour(o: ObjetPlan): CorpsToit[] {
  const [s] = serializeObjects([o]);
  const [relu] = normalizeObjects([JSON.parse(JSON.stringify(s))]) as unknown as { corpsToit: CorpsToit[] }[];
  return relu!.corpsToit;
}

describe('modele de toit etendu a l enregistrement', () => {
  it('profil, bouts, lucarnes et bords reviennent a l identique', () => {
    const etendu: CorpsToit = { ...corps, profil, bouts, lucarnes, bords: { debordEgoutM: 0.5, queueDeVache: true } };
    expect(allerRetour(batiment([etendu]))).toEqual([etendu]);
  });

  it('ce qui dit la meme chose que l absence ne s ecrit pas', () => {
    const neutre: CorpsToit = { ...corps, profil: [{ type: 'droit' }, { type: 'droit' }], bouts: [{ type: 'pignon' }, { type: 'pignon' }], lucarnes: [], bords: {} };
    const [s] = serializeObjects([batiment([neutre])]) as unknown as { corpsToit: Record<string, unknown>[] }[];
    for (const k of ['profil', 'bouts', 'lucarnes', 'bords']) expect(s!.corpsToit[0]).not.toHaveProperty(k);
    expect(allerRetour(batiment([neutre]))).toEqual([corps]);
  });

  it('un champ mal forme dans le fichier est retire a la lecture, le corps reste', () => {
    const abime = { ...corps, profil: [{ type: 'brise' }], lucarnes: [{ type: 'jacobine' }] } as unknown as CorpsToit;
    expect(allerRetour(batiment([abime]))).toEqual([corps]);
  });

  it('le projet de demonstration (des corps d avant le lot) se relit et se reecrit a l identique', () => {
    const objets = (demo as { objects: Record<string, unknown>[] }).objects.filter((o) => Array.isArray(o.corpsToit));
    expect(objets.length).toBeGreaterThan(20);
    const relus = normalizeObjects(JSON.parse(JSON.stringify(objets))) as unknown as { corpsToit: CorpsToit[] }[];
    relus.forEach((o, i) => {
      const brut = objets[i]!.corpsToit as Record<string, unknown>[];
      // La relecture d'avant le lot : une copie, les pignons absents redevenus une liste vide.
      expect(o.corpsToit).toEqual(brut.map((k) => ({ ...k, pignons: k.pignons ?? [] })));
    });
    const ecrits = serializeObjects(relus as unknown as ObjetPlan[]) as unknown as { corpsToit: Record<string, unknown>[] }[];
    ecrits.forEach((o, i) => {
      // L'ecriture d'avant le lot : sans les listes vides de pignons et de cheminees.
      const attendu = (objets[i]!.corpsToit as Record<string, unknown>[]).map((k) => {
        const c = { ...k };
        if (Array.isArray(c.pignons) && !c.pignons.length) delete c.pignons;
        if (Array.isArray(c.cheminees) && !c.cheminees.length) delete c.cheminees;
        return c;
      });
      expect(JSON.stringify(o.corpsToit)).toBe(JSON.stringify(attendu));
    });
  });
});
