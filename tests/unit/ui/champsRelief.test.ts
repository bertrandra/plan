import { describe, it, expect } from 'vitest';
import { sectionRelief, texteDenivele, parcelleCalee, EQUIDISTANCES, texteGrille, grilleSurParcelleSeule } from '../../../src/ui/champs/relief.js';
import { champsVisibles, type Champ, type ChampBouton, type ChampChoix, type ChampLecture, type ChampNombre, type ContexteChamps } from '../../../src/ui/champs/types.js';
import { champActif, champAnnulable, ecritLeProjet } from '../../../src/app/administration/ecritures.js';
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

  it('avec relief : la source, la pente, le denivele, les reglages techniques replies et les deux commandes', () => {
    const c = contexte({ relief: grille() });
    // « Relief » et « Courbes de niveau » ne sont qu'au menu Affichage : un geste n'existe qu'a un endroit.
    expect(cles(c)).toEqual(['source', 'pente', 'denivele', 'grille', 'paysage', 'pointsMax', 'zRef', 'actualiser', 'supprimer']);
    const s = sectionRelief(c)!;
    expect(s.champs.filter(ch => ch.repli).map(ch => ch.cle)).toEqual(['grille', 'paysage', 'pointsMax', 'zRef']);
    expect(new Set(s.champs.filter(ch => ch.repli).map(ch => ch.repli))).toEqual(new Set(['Réglages techniques']));
    // L'equidistance ne se montre qu'avec les courbes, que le menu Affichage montre.
    c.obj.relief!.affichage = { courbes: true };
    expect(cles(c)).toEqual(['source', 'pente', 'denivele', 'grille', 'paysage', 'pointsMax', 'zRef', 'equidistance', 'actualiser', 'supprimer']);
    expect(champ<ChampLecture>(c, 'source').valeur(c)).toBe('LiDAR HD, 1 m · acquis en 2021 · de l’ordre de 10 cm (IGN)');
    expect(champ<ChampLecture>(c, 'zRef').valeur(c)).toBe('100,25 m NGF-IGN69');
    expect(champ<ChampLecture>(c, 'pente').valeur(c)).toBe('5,0 % vers le O');
    // Les cellules dans la parcelle vont de x = 1,5 a 9,5 : de 100,08 a 100,48.
    expect(champ<ChampLecture>(c, 'denivele').valeur(c)).toBe('0,40 m (de 100,1 à 100,5)');
    expect(texteDenivele(grille(), c.obj)).toBe('0,40 m (de 100,1 à 100,5)');
    expect(champ<ChampBouton>(c, 'actualiser').agit).toEqual({ commande: 'relief.actualiser' });
    expect(champ<ChampBouton>(c, 'actualiser').repli).toBeUndefined();
    expect(champ<ChampBouton>(c, 'supprimer').agit).toEqual({ commande: 'relief.supprimer' });
  });

  it('l equidistance s ecrit dans relief.affichage sans modifier le projet', () => {
    const c = contexte({ relief: grille() });
    c.obj.relief!.affichage = { courbes: true };
    const equi = champ<ChampChoix>(c, 'equidistance');
    expect(equi.sale).toBe(false);
    expect(ecritLeProjet(equi)).toBe(false);
    expect(champAnnulable(equi)).toBe(false);
    expect(equi.lire(c)).toBe('0');
    expect(equi.options(c)).toEqual(EQUIDISTANCES);
    // L'equidistance automatique se lit en note : 0,40 m de denivele → 10 cm.
    expect(equi.note?.(c)).toBe('10 cm');
    equi.ecrire(c, '0.25');
    expect(c.obj.relief?.affichage).toEqual({ courbes: true, equidistance: 0.25 });
    expect(equi.lire(c)).toBe('0.25');
    expect(equi.note?.(c)).toBe('');
    equi.ecrire(c, '0');
    expect(c.obj.relief?.affichage).toEqual({ courbes: true });
  });

  it('reste en lecture seule : l equidistance reste libre, les boutons suivent la commande', () => {
    const c = contexte({ relief: grille() }, true, { 'relief.supprimer': false });
    c.obj.relief!.affichage = { courbes: true };
    c.etat.lectureSeule = true;
    expect(champActif(champ<ChampChoix>(c, 'equidistance'), c)).toBe(true);
    expect(champActif(champ<ChampBouton>(c, 'supprimer'), c)).toBe(false);
  });
});

describe('les grilles et le plafond de points', () => {
  it('Grille : le pas, le nombre de points (toujours), l etendue, et la regle avec le plafond du relief', () => {
    const c = contexte({ relief: grille() });
    expect(texteGrille(grille())).toBe('Pas de 1 m · 120 points (12 × 10) · 12 m × 10 m');
    expect(texteGrille({ ...grille(), pas: 5, nx: 290, ny: 311 })).toBe('Pas de 5 m · 90\u202f190 points (290 × 311) · 1,45 km × 1,55 km');
    const g = champ<ChampLecture>(c, 'grille');
    expect(g.valeur(c)).toBe(texteGrille(grille()));
    expect(g.note!(c)).toMatch(/^Le pas s’élargit avec l’étendue lue \(0,5, 1, 2, 5, 10, 20, 30 m\) pour rester sous 400\u202f000 points/);
    const c2 = contexte({ relief: { ...grille(), maxCellules: 100000 } });
    expect(champ<ChampLecture>(c2, 'grille').note!(c2)).toContain('sous 100\u202f000 points');
  });

  it('Maillage secondaire : « Actif » avec son pas et ses points, sinon « Inactif », et previent du sol plat au-dela', () => {
    const paysage = { source: 'lidar-hd' as const, pas: 5, x0: -100, y0: 100, nx: 40, ny: 40, z: Array.from({ length: 1600 }, () => 100) };
    const avec = contexte({ relief: { ...grille(), paysage } });
    const l = champ<ChampLecture>(avec, 'paysage');
    expect(l.valeur(avec)).toBe('Actif · Pas de 5 m · 1\u202f600 points (40 × 40) · 200 m × 200 m');
    expect(l.note!(avec)).toBe('Sol 3D du voisinage ; les quantités lisent la grille de la parcelle.');
    const sans = contexte({ relief: grille() });
    expect(l.valeur(sans)).toBe('Inactif');
    expect(l.note!(sans)).toBe('');
    const voisine = { key: 'v', fonction: 'terrain', type: 'polygon', cadastre: { idu: 'B' }, pts: [{ x: 300, y: 300 }, { x: 320, y: 300 }, { x: 320, y: 320 }] } as unknown as ObjetPlan;
    expect(grilleSurParcelleSeule(grille(), sans.obj, [sans.obj])).toBe(false);
    expect(grilleSurParcelleSeule(grille(), sans.obj, [sans.obj, voisine])).toBe(true);
    expect(grilleSurParcelleSeule({ ...grille(), paysage }, sans.obj, [sans.obj, voisine])).toBe(false);
    sans.etat.objects.push(voisine);
    expect(l.note!(sans)).toBe('Le sol 3D est plat au-delà de la parcelle.');
  });

  it('Points max : lit le plafond (400 000 par defaut), l ecrit borne, et ecrit le projet (annulable, refuse en lecture seule)', () => {
    const r = grille();
    const c = contexte({ relief: r });
    const n = champ<ChampNombre>(c, 'pointsMax');
    expect(n.lire(c)).toBe(400000);
    n.ecrire(c, 150000);
    expect(r.maxCellules).toBe(150000);
    n.ecrire(c, 5);
    expect(r.maxCellules).toBe(10000);
    n.ecrire(c, 5e9);
    expect(r.maxCellules).toBe(1000000);
    expect(ecritLeProjet(n)).toBe(true);
    expect(champAnnulable(n)).toBe(true);
  });
});
