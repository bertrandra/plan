import { describe, it, expect } from 'vitest';
import { sectionReleve } from '../../../src/ui/champs/facade.js';
import { champsVisibles, type Champ, type ChampChoix, type ChampLecture, type ContexteChamps } from '../../../src/ui/champs/types.js';
import type { CorpsToit, ObjetPlan, ToitMesure, VolumeToit } from '../../../src/model/types.js';
import { decrireCorps } from '../../../src/ui/champs/facade.js';
import type { ChampCarte } from '../../../src/ui/champs/types.js';
import { versMemoire } from '../../../src/model/champsFonction.js';

// Le choix « Toit en 3D » de la section « Facades et toit » (MD/spec-toit-ign.md §12.3) : quand il
// se montre, ce qu'il propose, et ce qu'il cache.

const pts = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
function contexte(plus: Record<string, unknown>): ContexteChamps {
  const o = versMemoire({ key: 'maison', fonction: 'batiment', type: 'polygon', elevation: 6, pts, ...plus, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'bdtopo' }, ...(plus.batiment as object) } }) as unknown as ObjetPlan;
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

  it('avec une mesure LiDAR sans corps : un toit par corps par defaut, « tel que mesure » propose, la mesure decrite', () => {
    const c = contexte({ toitMesure: mesure, volumesToit: volumes });
    const mode = champ<ChampChoix>(c, 'toitMode');
    // Un toit construit par defaut ; la surface brute se choisit.
    expect(mode.lire(c)).toBe('volumes');
    mode.ecrire(c, 'mesure');
    expect(mode.lire(c)).toBe('mesure');
    expect(mode.options(c).map((o) => o.valeur)).toEqual(['mesure', 'volumes', 'simple']);
    expect(cles(c)).toContain('toitMesure');
    expect(champ<ChampLecture>(c, 'toitMesure').valeur(c)).toBe('égout 4,2 m · faîte 7,8 m · 27 × 19 cellules à 0,50 m · LiDAR HD de l’IGN');
    expect(cles(c)).not.toContain('toitForme');
    expect(cles(c)).not.toContain('toitCorps');
    // Un toit par corps : la liste des corps ; un seul toit : ses reglages reviennent.
    mode.ecrire(c, 'volumes');
    expect(c.obj.batiment?.modeToit).toBe('volumes');
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

describe('Corps et pignons', () => {
  const corps: CorpsToit[] = [
    { pts: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }], posFaitage: 4, faitage: 7.6, egouts: [6.1, 5.4], pignons: [{ pan: 1, debut: 1.5, fin: 4, faitage: 7.6, profondeur: 4 }, { pan: 1, debut: 8, fin: 11, faitage: 7.6, profondeur: 4 }], ecart: 0.3 },
    { pts: [{ x: 12, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 6 }, { x: 12, y: 6 }], posFaitage: 0, faitage: 4.2, egouts: [4.2, 3], pignons: [], ecart: 0.2 },
    { pts: [{ x: 0, y: 8 }, { x: 4, y: 8 }, { x: 4, y: 12 }, { x: 0, y: 12 }], posFaitage: 2, faitage: 3.2, egouts: [3.2, 3.2], pignons: [], ecart: 0.1 },
  ];
  it('dit les cheminees et la terrasse observees, seulement quand elles existent', () => {
    const souche = { x: 6, y: 4, largeurM: 0.6, profondeurM: 0.4, sommetM: 8.2, position: 'faitage' as const, source: 'observation' as const };
    const avec: CorpsToit[] = [
      { ...corps[0]!, pignons: [], cheminees: [souche, { ...souche, x: 2 }] },
      { ...corps[2]!, cheminees: [souche], terrasse: { accessible: true, acrotereM: 0.6, edicules: [{ pts: [], sommetM: 5 }], source: 'observation' } },
      // Une terrasse sur un corps en pente n'a pas de sens : elle n'est pas dite.
      { ...corps[1]!, terrasse: { source: 'observation' } },
    ];
    expect(decrireCorps(avec)).toEqual([
      'Corps 12,0 × 8,0 m : deux pans, faîtage 7,6 m, égouts 6,1 / 5,4 m, 2 cheminées',
      'Corps 2 4,0 × 4,0 m : toit plat à 3,2 m, une cheminée, terrasse accessible, acrotère de 0,60 m, un édicule',
      'Corps 3 4,0 × 6,0 m : appentis de 3,0 m à 4,2 m',
    ]);
    expect(decrireCorps([{ ...corps[2]!, terrasse: { source: 'observation' } }])[0]).toBe('Corps 4,0 × 4,0 m : toit plat à 3,2 m, toit-terrasse');
  });

  it('est le defaut quand les corps existent, la carte se montre avec le decoupage, et chaque corps se decrit', () => {
    const c = contexte({ toitMesure: mesure, volumesToit: volumes, corpsToit: corps });
    const mode = champ<ChampChoix>(c, 'toitMode');
    expect(mode.lire(c)).toBe('corps');
    expect(mode.options(c).map((o) => o.valeur)).toEqual(['corps', 'mesure', 'volumes', 'simple']);
    expect(cles(c)).toEqual(expect.arrayContaining(['toitMode', 'toitCarte', 'toitCorpsLus']));
    expect(cles(c)).not.toContain('toitForme');
    const carte = champ<ChampCarte>(c, 'toitCarte').carte(c)!;
    expect(carte.corps).toHaveLength(3);
    expect(carte.pignons).toHaveLength(2);
    expect(carte.cellules.length).toBeGreaterThan(0);
    expect(decrireCorps(corps)).toEqual([
      'Corps 12,0 × 8,0 m : deux pans, faîtage 7,6 m, égouts 6,1 / 5,4 m, 2 pignons depuis le faîtage',
      'Corps 2 4,0 × 6,0 m : appentis de 3,0 m à 4,2 m',
      'Corps 3 4,0 × 4,0 m : toit plat à 3,2 m',
    ]);
    // A croupes : quatre pans, le faitage raccourci et ses quatre aretiers sur la carte.
    const aCroupes = [{ ...corps[0]!, pignons: [], croupes: [4, 4] as [number, number] }];
    expect(decrireCorps(aCroupes)).toEqual(['Corps 12,0 × 8,0 m : quatre pans, faîtage 7,6 m, égouts 6,1 / 5,4 m']);
    expect(decrireCorps([{ ...aCroupes[0]!, croupes: [0, 4] }])[0]).toContain('deux pans et une croupe');
    const cc = contexte({ toitMesure: mesure, volumesToit: volumes, corpsToit: aCroupes });
    const carteCroupes = champ<ChampCarte>(cc, 'toitCarte').carte(cc)!;
    expect(carteCroupes.corps[0]!.aretiers).toHaveLength(4);
    expect(carte.corps.every((k) => k.aretiers.length === 0)).toBe(true);
    // Tel que mesure : la carte reste, la ligne des corps se cache.
    mode.ecrire(c, 'mesure');
    expect(c.obj.batiment?.modeToit).toBe('mesure');
    expect(cles(c)).toContain('toitCarte');
    expect(cles(c)).not.toContain('toitCorpsLus');
  });
});

// Le materiau de la couverture : deduit par defaut (et annonce tel quel), il se choisit et l'emporte.
describe('Materiau de la couverture', () => {
  it('annonce le materiau deduit, se choisit, puis revient a l automatique', () => {
    const c = contexte({ bdtopo: { materiauxToiture: '2' } });
    const m = champ<ChampChoix>(c, 'toitMateriau');
    expect(cles(c)).toContain('toitMateriau');
    expect(m.lire(c)).toBe('');
    expect(m.options(c)[0]).toEqual({ valeur: '', libelle: 'Automatique (ardoise)' });
    expect(m.options(c).map((o) => o.valeur)).toEqual(['', 'tuile', 'tuile-plate', 'tuile-canal', 'ardoise', 'ardoise-losange', 'zinc']);
    m.ecrire(c, 'zinc');
    expect(c.obj.batiment?.toit?.couverture).toBe('zinc');
    // Le materiau deduit ne change pas avec le choix : il reste lisible dans « Automatique ».
    expect(m.options(c)[0]!.libelle).toBe('Automatique (ardoise)');
    m.ecrire(c, '');
    expect(c.obj.batiment?.toit && 'couverture' in c.obj.batiment?.toit).toBe(false);
  });

  it('ne se montre pas sur un toit plat simple', () => {
    const c = contexte({ toit: { forme: 'plat', hauteur: 0, angleFaitage: 0 } });
    expect(cles(c)).not.toContain('toitMateriau');
  });
});

describe('Appentis ouvert ou ferme', () => {
  const MAISON: CorpsToit = { pts: [{ x: 0, y: 3 }, { x: 12, y: 3 }, { x: 12, y: 8 }, { x: 0, y: 8 }], posFaitage: 2.5, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
  const GALERIE: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 3 }, { x: 0, y: 3 }], posFaitage: 3, faitage: 3.4, egouts: [2.4, 3.4], pignons: [], ecart: 0.1 };

  it('se montre quand un corps est un appentis, et s ecrit sur tous les appentis sans toucher aux autres corps', () => {
    const c = contexte({ corpsToit: [MAISON, GALERIE], modeToit: 'corps' });
    expect(cles(c)).toContain('appentisOuvert');
    const ch = champ<ChampChoix>(c, 'appentisOuvert');
    expect(ch.lire(c)).toBe('');
    ch.ecrire(c, 'ouvert');
    expect(c.obj.batiment?.corpsToit?.map((k) => k.ouvert)).toEqual([undefined, true]);
    expect(ch.lire(c)).toBe('ouvert');
    ch.ecrire(c, 'ferme');
    expect(c.obj.batiment?.corpsToit?.map((k) => k.ouvert)).toEqual([undefined, false]);
    expect(ch.lire(c)).toBe('ferme');
    // « Sans indication » retire la cle : le dessin redevient celui du toit seul.
    ch.ecrire(c, '');
    expect(c.obj.batiment?.corpsToit?.[1]).not.toHaveProperty('ouvert');
  });

  it('ne se montre pas sans appentis, ni hors du mode corps et pignons', () => {
    expect(cles(contexte({ corpsToit: [MAISON], modeToit: 'corps' }))).not.toContain('appentisOuvert');
    expect(cles(contexte({ corpsToit: [MAISON, GALERIE], modeToit: 'simple' }))).not.toContain('appentisOuvert');
  });
});
