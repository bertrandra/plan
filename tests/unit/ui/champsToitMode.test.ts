import { describe, it, expect } from 'vitest';
import { sectionToit } from '../../../src/ui/champs/facade.js';
import { champsVisibles, type Champ, type ChampLecture, type ContexteChamps } from '../../../src/ui/champs/types.js';
import type { CorpsToit, ObjetPlan, ToitMesure, VolumeToit } from '../../../src/model/types.js';
import { decrireCorps } from '../../../src/ui/champs/facade.js';
import type { ChampCarte } from '../../../src/ui/champs/types.js';
import { versMemoire } from '../../../src/model/champsFonction.js';

// La section « Toit » de l'inspecteur d'un batiment : elle lit le toit (resume, hauteur a l'egout, couverture, ce que la 3D dessine) et
// ouvre l'atelier du toit, ou tout se regle (« Toit en 3D », la couverture et la hauteur y sont depuis le 28 novembre 2026 :
// tests/unit/facade/modeToit/reglagesBatiment.test.ts).

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
const cles = (c: ContexteChamps) => champsVisibles(sectionToit(), c).map((x: Champ) => x.cle);
const champ = <T extends Champ>(_c: ContexteChamps, cle: string): T => { const ch = sectionToit().champs.find((x) => x.cle === cle); if (!ch) throw new Error(cle); return ch as T; };

describe('la section « Toit » de l inspecteur : une lecture, et le bouton de l atelier', () => {
  it('le toit se resume et s ouvre dans l atelier du toit ; aucun reglage du toit ne s ecrit ici', () => {
    const c = contexte({ toitMesure: mesure, volumesToit: volumes, bdtopo: { materiauxToiture: '2' } });
    expect(cles(c)).toEqual(expect.arrayContaining(['toitResume', 'toitEgout', 'toitCouverture', 'toitModifier']));
    // La source (« Toit en 3D »), la couverture, la hauteur et la forme : dans l'atelier du toit seulement (decision du 28 novembre 2026).
    const ecrivent = sectionToit().champs.filter((x) => 'ecrire' in x).map((x) => x.cle);
    expect(ecrivent).toEqual([]);
    for (const cle of ['toitMode', 'toitCouleur', 'toitMateriau', 'toitPose', 'toitForme', 'toitHauteur', 'toitFaitage']) expect(sectionToit().champs.map((x) => x.cle)).not.toContain(cle);
    expect(champ<ChampLecture>(c, 'toitResume').valeur(c)).toBe('Toit à deux pans · faîtage à 9,0 m');
    expect((champ(c, 'toitModifier') as Champ & { agit: unknown }).agit).toEqual({ commande: 'toit.modifier' });
  });

  it('dit la hauteur a l egout et d ou elle vient', () => {
    const c = contexte({ batiment: { egoutChoisi: 'saisie' } });
    expect(champ<ChampLecture>(c, 'toitEgout').valeur(c)).toBe('6,00 m');
    expect(champ<ChampLecture>(c, 'toitEgout').note?.(c)).toBe('saisie');
  });

  it('dit la couverture : le materiau deduit ou choisi, et une pose autre que les rangs droits ; rien sur un toit-terrasse', () => {
    const deduit = contexte({ bdtopo: { materiauxToiture: '2' } });
    expect(champ<ChampLecture>(deduit, 'toitCouverture').valeur(deduit)).toBe('Automatique (ardoise)');
    const choisie = contexte({ batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, couverture: 'ardoise', pose: 'losange' } } });
    expect(champ<ChampLecture>(choisie, 'toitCouverture').valeur(choisie)).toBe('Ardoise, en losange');
    const plat = contexte({ batiment: { toit: { forme: 'plat', hauteur: 0, angleFaitage: 0 } } });
    expect(cles(plat)).not.toContain('toitCouverture');
  });

  it('montre ce que la 3D dessine : la mesure en surface, les toits par corps', () => {
    const c = contexte({ toitMesure: mesure, volumesToit: volumes, batiment: { modeToit: 'mesure' } });
    expect(cles(c)).toContain('toitMesure');
    expect(champ<ChampLecture>(c, 'toitMesure').valeur(c)).toBe('égout 4,2 m · faîte 7,8 m · 27 × 19 cellules à 0,50 m · LiDAR HD de l’IGN');
    expect(cles(c)).not.toContain('toitCorps');
    const v = contexte({ toitMesure: mesure, volumesToit: volumes });
    expect(cles(v)).toContain('toitCorps');
    expect(champ<ChampLecture>(v, 'toitCorps').valeur(v)).toContain('Corps 8,0 × 8,0 m : deux pans · égout 6,0 m');
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
    expect(cles(c)).toEqual(expect.arrayContaining(['toitCarte', 'toitCorpsLus']));
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
    c.obj.batiment!.modeToit = 'mesure';
    expect(cles(c)).toContain('toitCarte');
    expect(cles(c)).not.toContain('toitCorpsLus');
  });
});
