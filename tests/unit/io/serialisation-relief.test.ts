import { describe, it, expect } from 'vitest';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { schemaMinimal, migrer, MIGRATIONS } from '../../../src/model/migrations.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// Le relief dans le fichier de projet (MD/spec-relief.md §7) : ecrit seulement present, copie en
// profondeur, relu a l'identique ; schema 4 des qu'il existe, 3 -> 4 est l'identite.

const parcelle = (): ObjetPlan => ({
  key: 'parcelle', type: 'polygon', name: 'Parcelle', fonction: 'terrain',
  pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }]
} as ObjetPlan);
const relief: Relief = {
  source: 'lidar-hd', couche: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93', dateLecture: '2026-10-06', dateDonnees: '2021-09-24',
  origine: 'LiDAR HD', precision: 'de l’ordre de 10 cm (IGN)', systemeAltimetrique: 'NGF-IGN69',
  pas: 0.5, x0: -9.75, y0: 19.75, nx: 4, ny: 2, z: [100.12, 100.2, null, 100.3, 100.4, 100.5, 100.6, 100.7], zRef: 100.3,
  affichage: { courbes: true, sol3d: false }
};

describe('serialisation du relief', () => {
  it('un projet sans relief garde la forme d avant', () => {
    const [s] = serializeObjects([parcelle()]);
    expect(s).not.toHaveProperty('relief');
    expect(schemaMinimal([s!])).toBe(1);
  });

  it('ecrit la grille en copie profonde et la relit a l identique', () => {
    const p = { ...parcelle(), relief } as ObjetPlan;
    const [s] = serializeObjects([p]);
    // Ecrite, la grille porte ses altitudes compactees (`zCode`), le reste en clair.
    const ecrit = s?.relief as unknown as Record<string, unknown>;
    expect(ecrit).not.toHaveProperty('z');
    expect(String(ecrit.zCode)).toMatch(/^u16cm:10012:/);
    expect({ ...ecrit, zCode: undefined }).toEqual({ ...relief, z: undefined, zCode: undefined });
    expect(relief.z).toHaveLength(8);
    const [relu] = normalizeObjects([JSON.parse(JSON.stringify(s))]);
    expect(relu?.relief).toEqual(relief);
    expect(relu?.relief).not.toBe(s?.relief);
  });

  it('relit une grille ecrite en clair, et garde en clair une amplitude de plus de 655 m', () => {
    const [enClair] = normalizeObjects([JSON.parse(JSON.stringify({ ...parcelle(), relief }))]);
    expect(enClair?.relief).toEqual(relief);
    const falaise = { ...relief, z: [0, 700, null, 1, 2, 3, 4, 5] };
    const [s] = serializeObjects([{ ...parcelle(), relief: falaise } as ObjetPlan]);
    expect(s?.relief?.z).toEqual(falaise.z);
  });

  it('pese moins de la moitie d une grille en clair, au centimetre', () => {
    const z = Array.from({ length: 40000 }, (_, k) => Math.round((30 + (k % 997) / 7.3) * 100) / 100);
    const grand = { ...relief, nx: 200, ny: 200, z };
    const [s] = serializeObjects([{ ...parcelle(), relief: grand } as ObjetPlan]);
    expect(JSON.stringify(s?.relief).length).toBeLessThan(JSON.stringify(grand).length / 2);
    const [relu] = normalizeObjects([JSON.parse(JSON.stringify(s))]);
    expect(relu?.relief?.z).toEqual(z);
  });

  it('porte le document au schema 4, et la migration 3 -> 4 ne change rien', () => {
    const p = { ...parcelle(), relief } as ObjetPlan;
    expect(schemaMinimal([p])).toBe(4);
    expect(MIGRATIONS.find(m => m.de === 3)?.apporte).toMatch(/relief/);
    const d = { objects: [parcelle()], measures: [] };
    expect(migrer(structuredClone(d), 3)).toEqual(d);
  });
});
