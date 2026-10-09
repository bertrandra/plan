import { describe, it, expect, beforeEach } from 'vitest';
import { sectionVoisinage3d } from '../../../src/ui/champs/voisinage3d.js';
import { sectionFenetres3d, reinitialiserChoixFenetre } from '../../../src/ui/champs/fenetres3d.js';
import { champsVisibles, type Champ, type ChampBouton, type ChampChoix, type ChampCouleur, type ChampLigne, type ChampNombre, type ContexteChamps } from '../../../src/ui/champs/types.js';
import { ecritLeProjet } from '../../../src/app/ecritures.js';
import { voisinage3dDe } from '../../../src/model/voisinage3d.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les sections « Voisinage (3D) » (parcelle du projet) et « Fenêtres (3D) » (batiment du projet) :
// ou elles existent, ce qu'elles ecrivent, et ce qui ne touche pas au projet.

function contexte(obj: Record<string, unknown>, principale = true): ContexteChamps {
  const o = obj as unknown as ObjetPlan;
  const parcelle = principale && o.fonction === 'terrain' ? o : ({ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [] } as unknown as ObjetPlan);
  return { etat: { objects: [o], highlight: {}, lectureSeule: false }, obj: o, objets: [o], parcelle, elevationOf: () => 6, render: () => {} } as unknown as ContexteChamps;
}
const parcelle = (plus: Record<string, unknown> = {}) => ({ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], ...plus });
const maison = (plus: Record<string, unknown> = {}) => ({ key: 'maison', fonction: 'batiment', type: 'polygon', elevation: 6, pts: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }], ...plus });
const champ = <T extends Champ>(s: { champs: Champ[] } | null, cle: string): T => { const ch = s?.champs.find((x) => x.cle === cle); if (!ch) throw new Error(cle); return ch as T; };
const cles = (s: { champs: Champ[] } | null, c: ContexteChamps) => (s ? champsVisibles(s as never, c).map((x) => x.cle) : []);

describe('section Voisinage (3D)', () => {
  it('existe sur la parcelle du projet seule, repliee, et ne modifie jamais le projet', () => {
    const c = contexte(parcelle());
    const s = sectionVoisinage3d(c)!;
    expect(s.id).toBe('voisinage3d');
    expect(s.repliee).toBe(true);
    expect(sectionVoisinage3d(contexte({ ...parcelle(), key: 'v1' }, false))).toBeNull();
    expect(sectionVoisinage3d(contexte(maison()))).toBeNull();
    s.champs.forEach((ch) => { (ch.type === 'ligne' ? ch.champs : [ch]).forEach((x) => expect(ecritLeProjet(x), x.cle).toBe(false)); });
  });

  it('par defaut : couleur du plan, une couleur de vitre, les trois plages, la cloture grillage affichee', () => {
    const c = contexte(parcelle());
    const s = sectionVoisinage3d(c);
    expect(cles(s, c)).toEqual(['maisonsMode', 'fenetresMode', 'fenetresCouleur', 'largeurFenetres', 'hauteurFenetres', 'entraxeFenetres', 'clotureAfficher', 'clotureType', 'clotureCouleur']);
    expect(champ<ChampChoix>(s, 'maisonsMode').lire(c)).toBe('plan');
    expect(champ<ChampChoix>(s, 'clotureType').lire(c)).toBe('grillage');
    champ<ChampChoix>(s, 'maisonsMode').ecrire(c, 'nuance');
    expect(cles(sectionVoisinage3d(c), c)).toEqual(expect.arrayContaining(['maisonsNombre', 'maisonsCouleur', 'maisonsCouleur2']));
    expect(cles(sectionVoisinage3d(c), c)).not.toContain('maisonsCouleur3');
    champ<ChampChoix>(sectionVoisinage3d(c), 'maisonsNombre').ecrire(c, '3');
    expect(cles(sectionVoisinage3d(c), c)).toContain('maisonsCouleur3');
    champ<ChampChoix>(s, 'fenetresMode').ecrire(c, 'nuance');
    expect(cles(sectionVoisinage3d(c), c)).toContain('fenetresCouleur2');
    expect(c.obj.voisinage3d).toMatchObject({ maisons: { mode: 'nuance', nombre: 3 }, fenetres: { mode: 'nuance' } });
  });

  it('tient le minimum sous le maximum, et la couleur de la cloture suit son type tant qu elle n a pas ete choisie', () => {
    const c = contexte(parcelle());
    const s = sectionVoisinage3d(c);
    const ligne = champ<ChampLigne>(s, 'largeurFenetres');
    const [min, max] = ligne.champs as [ChampNombre, ChampNombre];
    expect(min.ecrire(c, 1.6)).toBeUndefined();
    expect(voisinage3dDe(c.obj).fenetres).toMatchObject({ largeurMin: 1.6, largeurMax: 1.6 });
    max.ecrire(c, 0.8);
    expect(voisinage3dDe(c.obj).fenetres).toMatchObject({ largeurMin: 0.8, largeurMax: 0.8 });
    expect(min.ecrire(c, 9)).toBe(false);
    champ<ChampChoix>(s, 'clotureType').ecrire(c, 'haie');
    expect(voisinage3dDe(c.obj).cloture).toMatchObject({ type: 'haie', couleur: '#4f7a3a' });
    champ<ChampCouleur>(s, 'clotureCouleur').ecrire(c, '#123456');
    champ<ChampChoix>(s, 'clotureType').ecrire(c, 'mur');
    expect(voisinage3dDe(c.obj).cloture).toMatchObject({ type: 'mur', couleur: '#123456' });
    champ<ChampChoix>(s, 'clotureAfficher' as never).ecrire(c, false as never);
    expect(cles(sectionVoisinage3d(c), c)).not.toContain('clotureType');
  });
});

describe('section Fenêtres (3D)', () => {
  beforeEach(() => reinitialiserChoixFenetre());

  it('existe sur un batiment du projet, pas sur une maison du voisinage ni sur un batiment tout photographie', () => {
    expect(sectionFenetres3d(contexte(maison()))?.id).toBe('fenetres3d');
    expect(sectionFenetres3d(contexte(maison({ voisinage: true })))).toBeNull();
    expect(sectionFenetres3d(contexte(maison({ facades: [0, 1, 2, 3].map((cote) => ({ cote, largeur: 1, hauteur: 6, texture: null, ouvertures: [], distance: null, sourceDistance: null, releveLe: '' })) })))).toBeNull();
    expect(sectionFenetres3d(contexte(parcelle()))).toBeNull();
  });

  it('toutes pareilles par defaut : les dimensions communes ecrivent le projet', () => {
    const c = contexte(maison());
    const s = sectionFenetres3d(c);
    expect(cles(s, c)).toEqual(['mode', 'largeur', 'hauteur', 'appui', 'entraxe', 'couleur']);
    const largeur = champ<ChampNombre>(s, 'largeur');
    expect(ecritLeProjet(largeur)).toBe(true);
    expect(largeur.lire(c)).toBe(1);
    largeur.ecrire(c, 1.4);
    expect(c.obj.fenetres3d).toMatchObject({ mode: 'toutes', largeur: 1.4, hauteur: 1.2 });
    expect(largeur.ecrire(c, 9)).toBe(false);
  });

  it('une par une : la liste part de la disposition automatique, puis se deplace, se taille, s ajoute et se supprime', () => {
    const c = contexte(maison({ bdtopo: { nombreEtages: 2 } }));
    champ<ChampChoix>(sectionFenetres3d(c), 'mode').ecrire(c, 'uneParUne');
    expect(c.obj.fenetres3d?.liste).toHaveLength(28);
    let s = sectionFenetres3d(c);
    expect(cles(s, c)).toContain('fenetre0');
    expect(cles(s, c)).toEqual(expect.arrayContaining(['ajouter', 'automatique', 'enCours', 'type', 'cote', 'x', 'y', 'l', 'h']));
    // La premiere fenetre : deplacee et taillee.
    champ<ChampNombre>(s, 'x').ecrire(c, 2.5);
    champ<ChampNombre>(s, 'l').ecrire(c, 1.8);
    expect(c.obj.fenetres3d?.liste?.[0]).toMatchObject({ x: 2.5, l: 1.8 });
    // Au-dela du mur, la position est ramenee au bord.
    champ<ChampNombre>(s, 'x').ecrire(c, 50);
    expect(c.obj.fenetres3d?.liste?.[0]?.x).toBeCloseTo(12 - 1.8, 9);
    // Une fenetre de plus, a droite de celle en cours, qui devient celle en cours.
    champ<ChampBouton>(s, 'ajouter').executer(c);
    expect(c.obj.fenetres3d?.liste).toHaveLength(29);
    s = sectionFenetres3d(c);
    expect(champ<ChampChoix>(s, 'enCours').lire(c)).toBe('28');
    expect(champ<ChampNombre>(s, 'l').lire(c)).toBe(1);
    // Supprimee par sa ligne.
    const ligne = champ<ChampLigne>(s, 'fenetre28');
    (ligne.champs.find((x) => x.cle === 'supprimer') as ChampBouton).executer(c);
    expect(c.obj.fenetres3d?.liste).toHaveLength(28);
    // Retour a l'automatique : la premiere fenetre retrouve sa place.
    champ<ChampBouton>(sectionFenetres3d(c), 'automatique').executer(c);
    expect(c.obj.fenetres3d?.liste?.[0]?.l).toBe(1);
  });
});
