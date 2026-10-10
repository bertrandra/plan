import { describe, it, expect } from 'vitest';
import { sectionReleve } from '../../../src/ui/champs/facade.js';
import { champsVisibles, type Champ, type ChampChoix, type ChampLecture, type ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan, ToitMesure, VolumeToit } from '../../../src/model/types.js';

// Le choix « Toit en 3D » de la section « Facades et toit » (MD/spec-toit-ign.md §12.3) : quand il
// se montre, ce qu'il propose, et ce qu'il cache.

const pts = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
function contexte(plus: Record<string, unknown>): ContexteChamps {
  const o = { key: 'maison', fonction: 'batiment', type: 'polygon', elevation: 6, pts, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'bdtopo' }, ...plus } as unknown as ObjetPlan;
  return { etat: { objects: [o], highlight: {}, lectureSeule: false }, obj: o, objets: [o], elevationOf: () => 6, render: () => {} } as unknown as ContexteChamps;
}
const mesure: ToitMesure = { pas: 0.5, x0: -0.5, y0: 8.5, nx: 27, ny: 19, z: Array.from({ length: 27 * 19 }, () => 6.5), egout: 4.2, faite: 7.8, source: 'lidar' };
const volumes: VolumeToit[] = [
  { pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }], toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 90 }, egout: 6 },
  { pts: [{ x: 8, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 8, y: 8 }], toit: { forme: 'appentis', hauteur: 1, angleFaitage: 90 } },
];
const cles = (c: ContexteChamps) => champsVisibles(sectionReleve(c) as never, c).map((x: Champ) => x.cle);
const champ = <T extends Champ>(c: ContexteChamps, cle: string): T => { const ch = sectionReleve(c).champs.find((x) => x.cle === cle); if (!ch) throw new Error(cle); return ch as T; };

describe('Toit en 3D', () => {
  it('sans mesure ni corps, le choix ne se montre pas et le toit unique se regle', () => {
    const c = contexte({});
    expect(cles(c)).not.toContain('toitMode');
    expect(cles(c)).toEqual(expect.arrayContaining(['toitForme', 'toitHauteur', 'toitFaitage']));
  });

  it('avec une mesure LiDAR : « tel que mesure » par defaut, la mesure decrite, le toit unique cache', () => {
    const c = contexte({ toitMesure: mesure, volumesToit: volumes });
    const mode = champ<ChampChoix>(c, 'toitMode');
    expect(mode.lire(c)).toBe('mesure');
    expect(mode.options(c).map((o) => o.valeur)).toEqual(['mesure', 'volumes', 'simple']);
    expect(cles(c)).toContain('toitMesure');
    expect(champ<ChampLecture>(c, 'toitMesure').valeur(c)).toBe('égout 4,2 m · faîte 7,8 m · 27 × 19 cellules à 0,50 m · LiDAR HD de l’IGN');
    expect(cles(c)).not.toContain('toitForme');
    expect(cles(c)).not.toContain('toitCorps');
    // Un toit par corps : la liste des corps ; un seul toit : ses reglages reviennent.
    mode.ecrire(c, 'volumes');
    expect(c.obj.modeToit).toBe('volumes');
    expect(cles(c)).toContain('toitCorps');
    expect(champ<ChampLecture>(c, 'toitCorps').valeur(c)).toContain('Corps 8,0 × 8,0 m : deux pans · égout 6,0 m');
    expect(cles(c)).not.toContain('toitMesure');
    mode.ecrire(c, 'simple');
    expect(cles(c)).toEqual(expect.arrayContaining(['toitForme', 'toitHauteur']));
    expect(cles(c)).not.toContain('toitCorps');
  });

  it('avec des corps seuls : un toit par corps par defaut, et pas de « tel que mesure »', () => {
    const c = contexte({ volumesToit: volumes });
    const mode = champ<ChampChoix>(c, 'toitMode');
    expect(mode.lire(c)).toBe('volumes');
    expect(mode.options(c).map((o) => o.valeur)).toEqual(['volumes', 'simple']);
  });
});
