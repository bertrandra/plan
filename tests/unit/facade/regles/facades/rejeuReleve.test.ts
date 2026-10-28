import { describe, it, expect, afterEach } from 'vitest';
import { reglagesDuReleve } from '../../../../../src/facade/regles/facades/rejeuReleve.js';
import { REGLAGES_DETECTION, reglagesDetection } from '../../../../../src/facade/regles/facades/detection.js';
import { REGLAGES_STRUCTURE } from '../../../../../src/facade/regles/facades/structure.js';
import { poserSurchargesCalibrees } from '../../../../../src/facade/regles/facades/surcharges.js';
import { releveDuMur } from '../../../../../src/facade/releve/analyseSerie.js';
import { schemaMinimal } from '../../../../../src/model/migrations.js';
import type { Facade } from '../../../../../src/geometry/cotesVusDeDehors.js';
import type { Resultat } from '../../../../../src/facade/releve/serie.js';
import type { ObjetAPlat } from '../../../../../src/model/types.js';

// Etape 1.4 : un releve garde la calibration qui l'a produit, et un rejeu part des memes seuils, quelle que soit la calibration du
// moment.

const [nom, reglage] = Object.entries(REGLAGES_DETECTION)[0]!;
const autre = Object.keys(REGLAGES_DETECTION)[1]!;
const resultat = { texture: null, hauteurTexture: 5, partieBasse: null } as unknown as Resultat;

afterEach(() => poserSurchargesCalibrees({}));

describe('la calibration gardee avec un releve', () => {
  it('le releve ecrit les valeurs calibrees du moment, et rien quand ce sont les valeurs livrees', () => {
    expect(releveDuMur({ cote: 0, largeur: 8 } as Facade, resultat, [], 6, null).calibration).toEqual({});
    poserSurchargesCalibrees({ [nom]: reglage.valeur * 1.5 });
    const r = releveDuMur({ cote: 0, largeur: 8 } as Facade, resultat, [], 6, null);
    expect(r.calibration).toEqual({ [nom]: reglage.valeur * 1.5 });
    // Une copie : recalibrer ensuite ne touche pas au releve.
    poserSurchargesCalibrees({ [nom]: reglage.valeur * 2 });
    expect(r.calibration).toEqual({ [nom]: reglage.valeur * 1.5 });
  });

  it('le rejeu prend les seuils du releve, jamais la calibration du moment', () => {
    poserSurchargesCalibrees({ [nom]: reglage.valeur * 2, [autre]: 0.123 });
    const rejeu = reglagesDuReleve({ calibration: { [nom]: reglage.valeur * 1.5 } })!;
    expect(rejeu[nom as keyof typeof rejeu]).toBe(reglage.valeur * 1.5);
    // Ce que le releve ne gardait pas reprend la valeur livree, pas celle calibree depuis.
    expect(rejeu[autre as keyof typeof rejeu]).toBe(REGLAGES_DETECTION[autre as keyof typeof REGLAGES_DETECTION].valeur);
    for (const [n, r] of Object.entries(REGLAGES_STRUCTURE)) expect(rejeu[n as keyof typeof rejeu]).toBe(r.valeur);
    // Passes en surcharge, ils l'emportent sur la calibration posee.
    expect(reglagesDetection(rejeu)[nom as keyof ReturnType<typeof reglagesDetection>]).toBe(reglage.valeur * 1.5);
  });

  it('un releve d avant l etape 1.4 ne dit rien : la detection prend les seuils du moment', () => {
    expect(reglagesDuReleve({})).toBeNull();
  });

  it('un releve qui garde sa calibration s ecrit au schema 5', () => {
    const maison = (facades: unknown[]) => ({ key: 'm', type: 'polygon', pts: [], facades }) as unknown as ObjetAPlat;
    expect(schemaMinimal([maison([{ cote: 0 }])])).toBe(2);
    expect(schemaMinimal([maison([{ cote: 0, calibration: {} }])])).toBe(5);
  });
});
