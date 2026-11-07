import { describe, it, expect } from 'vitest';
import { ANCIENS_NUMEROS, ETAPES_FACADE, SEGMENTS_FACADE, actionDe, etapeFacade, etatDuSegment } from '../../../src/model/etapeFacade.js';

// Le contrat des etapes de l'enchainement d'une facade (model/etapeFacade.ts, MD/spec-facade-calage-audit.md §4 ter).

describe('les etapes d une facade', () => {
  it('suivent le tableau E1 a E14, chacune une fois, avec son contrat', () => {
    // Quatorze etapes, numeros continus, sans « bis » (decision du proprietaire, 7 novembre 2026).
    expect(ETAPES_FACADE.map((e) => e.numero)).toEqual(ETAPES_FACADE.map((_, k) => 'É' + (k + 1)));
    expect(ETAPES_FACADE.map((e) => e.id)).toEqual(['preparation', 'prises', 'objectif', 'coins', 'redressement', 'assemblage', 'calage', 'lectureIa', 'silhouette', 'diagnostic', 'texture', 'ouvertures', 'toit', 'validation']);
    expect(new Set(ETAPES_FACADE.map((e) => e.id)).size).toBe(ETAPES_FACADE.length);
    for (const e of ETAPES_FACADE) for (const t of [e.nom, e.entrant, e.action, e.objectif, e.sortant]) expect(t.length, e.id).toBeGreaterThan(3);
    // Les quatre points de validation de l'audit (§4 ter.3), chacun sur son etape.
    expect(ETAPES_FACADE.filter((e) => e.validation).map((e) => e.id + ':' + e.validation)).toEqual(['calage:V1', 'diagnostic:V2', 'ouvertures:V3', 'validation:V4']);
    expect(() => etapeFacade('inconnue' as never)).toThrow(RangeError);
    // L'audit cache l'objectif et les coins comme le redressement ; la lecture de Claude y tient en une ligne.
    expect(['objectif', 'coins', 'redressement'].map((id) => etapeFacade(id as never).modeAudit)).toEqual(['cache', 'cache', 'cache']);
    expect(etapeFacade('lectureIa').modeAudit).toBe('resume');
  });

  it('portent chacune leurs actions typees, aux identifiants uniques ; Claude n a d actions qu a sa lecture', () => {
    for (const e of ETAPES_FACADE) {
      expect(e.actions.length, e.id).toBeGreaterThan(0);
      expect(new Set(e.actions.map((a) => a.id)).size, e.id).toBe(e.actions.length);
      for (const a of e.actions) expect(['code', 'claude', 'manuel', 'mesure']).toContain(a.type);
    }
    expect(ETAPES_FACADE.filter((e) => e.actions.some((a) => a.type === 'claude')).map((e) => e.id)).toEqual(['lectureIa']);
    expect(etapeFacade('lectureIa').actions.filter((a) => a.type === 'claude').map((a) => a.id)).toEqual(['run', 'enrichie', 'toit']);
    // La verite d'un cas est une mesure, la ou une etape se mesure contre elle.
    expect(ETAPES_FACADE.filter((e) => e.actions.some((a) => a.type === 'mesure')).map((e) => e.id)).toEqual(['calage', 'lectureIa', 'diagnostic', 'ouvertures']);
    expect(actionDe('calage', 'tirer').type).toBe('manuel');
    expect(() => actionDe('calage', 'inconnue')).toThrow(RangeError);
  });

  it('gardent la table des anciens numeros (E1 a E11) pour relire ce qui les cite', () => {
    expect(Object.keys(ANCIENS_NUMEROS)).toHaveLength(11);
    expect(Object.entries(ANCIENS_NUMEROS).map(([n, id]) => n + ' → ' + etapeFacade(id).numero)).toEqual(['É1 → É1', 'É2 → É2', 'É3 → É5', 'É4 → É6', 'É5 → É7', 'É6 → É9', 'É7 → É10', 'É8 → É11', 'É9 → É12', 'É10 → É13', 'É11 → É14']);
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
