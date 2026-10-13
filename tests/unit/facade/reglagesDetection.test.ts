import { describe, it, expect } from 'vitest';
import { REGLAGES_DETECTION, reglagesDetection, type NomReglageDetection } from '../../../src/facade/reglagesDetection.js';

// Les seuils de la detection sont des reglages nommes, avec leur raison (spec-facades §9, lot L14).

describe('reglages de la detection', () => {
  it('nomme chaque reglage facades.detection.*, avec une unite et une raison', () => {
    const noms = Object.keys(REGLAGES_DETECTION) as NomReglageDetection[];
    expect(noms.length).toBeGreaterThanOrEqual(15);
    for (const nom of noms) {
      expect(nom.startsWith('facades.detection.'), nom).toBe(true);
      const r = REGLAGES_DETECTION[nom];
      expect(Number.isFinite(r.valeur), nom).toBe(true);
      expect(r.pourquoi.length, nom).toBeGreaterThan(30);
    }
  });

  it('garde les filtres de taille d avant le lot', () => {
    const v = reglagesDetection();
    expect(v['facades.detection.largeurMinM']).toBe(0.35);
    expect(v['facades.detection.largeurMaxM']).toBe(5.5);
    expect(v['facades.detection.hauteurMinM']).toBe(0.4);
    expect(v['facades.detection.hauteurMaxM']).toBe(3.2);
    expect(v['facades.detection.remplissageMin']).toBe(0.55);
    expect(v['facades.detection.bandeMaxPart']).toBe(0.85);
    expect(v['facades.detection.seuilMin']).toBe(28);
    expect(v['facades.detection.seuilFacteur']).toBe(3);
    expect(v['facades.detection.alignementM']).toBe(0.07);
    expect(v['facades.detection.fenetreFondM']).toBe(1.5);
  });

  it('applique les surcharges sans toucher aux autres', () => {
    const v = reglagesDetection({ 'facades.detection.largeurMinM': 1 });
    expect(v['facades.detection.largeurMinM']).toBe(1);
    expect(v['facades.detection.hauteurMinM']).toBe(0.4);
    expect(REGLAGES_DETECTION['facades.detection.largeurMinM'].valeur).toBe(0.35);
  });
});
