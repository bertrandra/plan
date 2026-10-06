import { describe, it, expect } from 'vitest';
import { sectionRelief, texteDenivele, parcelleCalee, EQUIDISTANCES } from '../../../src/ui/champs/relief.js';
import { champsVisibles, type Champ, type ChampBouton, type ChampCase, type ChampChoix, type ChampLecture, type ContexteChamps } from '../../../src/ui/champs/types.js';
import { champActif, champAnnulable, ecritLeProjet } from '../../../src/app/ecritures.js';
import { lectureRelief } from '../../../src/core/lectureRelief.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// La section « Relief » de l'inspecteur (ui/champs/relief.ts, MD/spec-relief.md §5.1, §8) : sur la
// parcelle du projet seule, le constat et le bouton sans relief, la mesure avouee et les preferences
// d'affichage avec. Les preferences ne modifient pas le projet ; les boutons sont des commandes.

/** Une grille plane z = 100 + 0,05·x au pas de 1 m : le sol monte vers l'est, donc descend a 5 % vers l'ouest. */
function grille(): Relief {
  const nx = 12, ny = 10, z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((100 + 0.05 * (0.5 + i)) * 100) / 100);
  return { source: 'lidar-hd', couche: 'test', dateLecture: '2026-10-06', dateDonnees: '2021-05-04', origine: 'LiDAR HD', precision: 'de l’ordre de 10 cm (IGN)', systemeAltimetrique: 'NGF-IGN69', pas: 1, x0: 0.5, y0: 9.5, nx, ny, z, zRef: 100.25 };
}

function contexte(plus: Record<string, unknown> = {}, principale = true, commandes: Record<string, boolean> = {}): ContexteChamps & { executees: string[] } {
  const obj = {
    key: principale ? 'parcelle' : 'v1', name: 'Parcelle', fonction: 'terrain', type: 'polygon',
    pts: [{ x: 1, y: 1 }, { x: 10, y: 1 }, { x: 10, y: 8 }, { x: 1, y: 8 }],
    ...plus
  } as unknown as ObjetPlan;
  const parcelle = principale ? obj : ({ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [] } as unknown as ObjetPlan);
  const executees: string[] = [];
  return {
    etat: { objects: [obj], highlight: {}, lectureSeule: false }, obj, objets: [obj], parcelle, executees,
    executerCommande: (id: string) => { executees.push(id); },
    commandeUtilisable: (id: string) => commandes[id] ?? true
  } as unknown as ContexteChamps & { executees: string[] };
}
const cles = (c: ContexteChamps) => { const s = sectionRelief(c); return s ? champsVisibles(s, c).map(ch => ch.cle) : []; };
const champ = <T extends Champ>(c: ContexteChamps, cle: string): T => {
  const ch = sectionRelief(c)?.champs.find(x => x.cle === cle);
  if (!ch) throw new Error(cle);
  return ch as T;
};

describe('section Relief', () => {
  it('existe sur la parcelle du projet seule', () => {
    expect(sectionRelief(contexte())?.id).toBe('relief');
    expect(sectionRelief(contexte({}, false))).toBeNull();
  });

  it('sans relief : le constat « terrain plat » et le bouton Lire, lie a la commande', () => {
    const c = contexte({ cadastre: { origineLat: 48.8, origineLon: 2.3 } });
    expect(cles(c)).toEqual(['plat', 'lire']);
    expect(champ<ChampLecture>(c, 'plat').valeur(c)).toBe('Terrain plat (pas de relief lu)');
    const b = champ<ChampBouton>(c, 'lire');
    expect(b.agit).toEqual({ commande: 'relief.lire' });
    expect(b.explication).toBeUndefined();
    b.executer(c);
    expect(c.executees).toEqual(['relief.lire']);
  });

  it('dit pourquoi le bouton est grise quand le plan n est pas cale par le cadastre', () => {
    const c = contexte({}, true, { 'relief.lire': false });
    expect(parcelleCalee(c.obj)).toBe(false);
    const b = champ<ChampBouton>(c, 'lire');
    expect(b.explication).toMatch(/calé par le cadastre/);
    expect(champActif(b, c)).toBe(false);
  });

  it('montre « Lecture… » pendant la lecture', () => {
    const c = contexte();
    const b = champ<ChampBouton>(c, 'lire');
    expect(b.texte?.(c)).toBe('Lire le relief');
    lectureRelief.definir(true);
    try { expect(b.texte?.(c)).toBe('Lecture…'); } finally { lectureRelief.definir(false); }
  });

  it('avec relief : la source, le zero, la pente, le denivele, les preferences et les deux commandes', () => {
    const c = contexte({ relief: grille() });
    expect(cles(c)).toEqual(['source', 'zRef', 'pente', 'denivele', 'courbes', 'equidistance', 'sol3d', 'actualiser', 'supprimer']);
    expect(champ<ChampLecture>(c, 'source').valeur(c)).toBe('LiDAR HD, 1 m · acquis en 2021 · de l’ordre de 10 cm (IGN)');
    expect(champ<ChampLecture>(c, 'zRef').valeur(c)).toBe('100,25 m NGF-IGN69');
    expect(champ<ChampLecture>(c, 'pente').valeur(c)).toBe('5,0 % vers le O');
    // Les cellules dans la parcelle vont de x = 1,5 a 9,5 : de 100,08 a 100,48.
    expect(champ<ChampLecture>(c, 'denivele').valeur(c)).toBe('0,40 m (de 100,1 à 100,5)');
    expect(texteDenivele(grille(), c.obj)).toBe('0,40 m (de 100,1 à 100,5)');
    expect(champ<ChampBouton>(c, 'actualiser').agit).toEqual({ commande: 'relief.actualiser' });
    expect(champ<ChampBouton>(c, 'supprimer').agit).toEqual({ commande: 'relief.supprimer' });
  });

  it('les preferences d affichage s ecrivent dans relief.affichage sans modifier le projet', () => {
    const c = contexte({ relief: grille() });
    const courbes = champ<ChampCase>(c, 'courbes'), sol = champ<ChampCase>(c, 'sol3d'), equi = champ<ChampChoix>(c, 'equidistance');
    for (const ch of [courbes, sol, equi]) {
      expect(ch.sale).toBe(false);
      expect(ecritLeProjet(ch)).toBe(false);
      expect(champAnnulable(ch)).toBe(false);
    }
    expect(courbes.lire(c)).toBe(true);
    expect(sol.lire(c)).toBe(true);
    expect(equi.lire(c)).toBe('0');
    expect(equi.options(c)).toEqual(EQUIDISTANCES);
    // L'equidistance automatique se lit en note : 0,40 m de denivele → 10 cm.
    expect(equi.note?.(c)).toBe('10 cm');
    courbes.ecrire(c, false);
    sol.ecrire(c, false);
    equi.ecrire(c, '0.25');
    expect(c.obj.relief?.affichage).toEqual({ courbes: false, sol3d: false, equidistance: 0.25 });
    expect(equi.lire(c)).toBe('0.25');
    expect(equi.note?.(c)).toBe('');
    equi.ecrire(c, '0');
    expect(c.obj.relief?.affichage).toEqual({ courbes: false, sol3d: false });
    expect(courbes.effets).toEqual(['rendu']);
    expect(sol.effets).toEqual(['scene3d']);
  });

  it('reste en lecture seule : les preferences restent libres, les boutons suivent la commande', () => {
    const c = contexte({ relief: grille() }, true, { 'relief.supprimer': false });
    c.etat.lectureSeule = true;
    expect(champActif(champ<ChampCase>(c, 'courbes'), c)).toBe(true);
    expect(champActif(champ<ChampBouton>(c, 'supprimer'), c)).toBe(false);
  });
});
