import { describe, it, expect } from 'vitest';
import { ETAPES_FACADE, SEGMENTS_FACADE, etapeFacade, etatDuSegment } from '../../../src/model/etapeFacade.js';

// Le contrat des etapes de l'enchainement d'une facade (model/etapeFacade.ts, MD/spec-facade-calage-audit.md §4 ter).

describe('les etapes d une facade', () => {
  it('suivent le tableau E0 a E9, chacune une fois, avec son contrat', () => {
    expect(ETAPES_FACADE.map((e) => e.numero)).toEqual(['É0', 'É1', 'É2', 'É3', 'É4', 'É5', 'É5 bis', 'É6', 'É7', 'É8', 'É9']);
    expect(new Set(ETAPES_FACADE.map((e) => e.id)).size).toBe(ETAPES_FACADE.length);
    for (const e of ETAPES_FACADE) for (const t of [e.nom, e.entrant, e.action, e.objectif, e.sortant]) expect(t.length, e.id).toBeGreaterThan(3);
    // Les quatre points de validation de l'audit (§4 ter.3), chacun sur son etape.
    expect(ETAPES_FACADE.filter((e) => e.validation).map((e) => e.id + ':' + e.validation)).toEqual(['calage:V1', 'diagnostic:V2', 'ouvertures:V3', 'validation:V4']);
    expect(() => etapeFacade('inconnue' as never)).toThrow(RangeError);
  });

  it('se rangent en huit segments, chaque etape dans un seul, la preparation dans aucun', () => {
    expect(SEGMENTS_FACADE).toHaveLength(8);
    const rangees = SEGMENTS_FACADE.flatMap((s) => s.etapes);
    expect(new Set(rangees).size).toBe(rangees.length);
    expect(ETAPES_FACADE.map((e) => e.id).filter((id) => !rangees.includes(id))).toEqual(['preparation']);
    // Un segment porte le point de validation de ses etapes.
    for (const s of SEGMENTS_FACADE) expect(s.validation).toBe(s.etapes.map((id) => etapeFacade(id).validation).find(Boolean) ?? null);
  });

  it('montrent le pire etat d un segment, et une etape sautee ne cache pas une etape faite', () => {
    expect(etatDuSegment(['ok', 'echec'])).toBe('echec');
    expect(etatDuSegment(['ok', 'a-confirmer'])).toBe('a-confirmer');
    expect(etatDuSegment(['ok', 'saute'])).toBe('ok');
    expect(etatDuSegment(['saute', 'saute'])).toBe('saute');
    expect(etatDuSegment(['ok', 'en-cours'])).toBe('en-cours');
    expect(etatDuSegment([])).toBe('a-venir');
  });
});
