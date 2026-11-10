import { describe, it, expect } from 'vitest';
import { grilleSimple, mesurerFacade, resumeMesureFacade, typeDeFacade } from '../../../src/model/mesureFacade.js';
import type { OuvertureFacade, TypeOuverture } from '../../../src/model/types.js';

// Ce qui se mesure sur une facade relevee (MD/spec-facades-calage-detection.md §15.1, lot G11). Les
// facades sont celles du banc (tests/fixtures/facades/), dont la verite est connue : les valeurs
// attendues se refont a la main.

const o = (type: TypeOuverture, x: number, y: number, l: number, h: number): OuvertureFacade => ({ type, x, y, l, h });

/** 02-enduit-uni-face : 10 x 5,8 m, deux niveaux de trois baies, porte au milieu. */
const SCENE_02 = [
  o('fenetre', 1.2, 0.9, 1.2, 1.35), o('porte', 4.6, 0, 0.95, 2.15), o('fenetre', 7.4, 0.9, 1.2, 1.35),
  o('fenetre', 1.2, 3.8, 1.2, 1.35), o('fenetre', 4.5, 3.8, 1.1, 1.35), o('fenetre', 7.4, 3.8, 1.2, 1.35),
];
/** 07-voiture-haie-devant : 11 x 5,8 m, un garage a gauche, quatre travees. */
const SCENE_07 = [
  o('garage', 0.8, 0, 2.5, 2.1), o('porte', 4.6, 0, 0.95, 2.15), o('fenetre', 6.6, 0.9, 1.2, 1.35), o('fenetre', 9, 0.9, 1.2, 1.35),
  o('fenetre', 1.4, 3.8, 1.2, 1.35), o('fenetre', 4.5, 3.8, 1.2, 1.35), o('fenetre', 6.6, 3.8, 1.2, 1.35), o('fenetre', 9, 3.8, 1.2, 1.35),
];
/** 11-pignon-ombre-arbre : 7,5 x 3,2 m, un seul niveau. */
const SCENE_11 = [o('fenetre', 0.9, 0.95, 1, 1.15), o('porte-fenetre', 3, 0, 1.4, 2.15), o('fenetre', 5.6, 0.95, 1, 1.15)];

describe('mesurer une facade relevee', () => {
  it('lit fenetres, appui depuis le plancher, entraxe, part vitree, niveaux et porte (scene 02)', () => {
    const m = mesurerFacade({ largeur: 10, hauteur: 5.8, ouvertures: SCENE_02 });
    expect(m.baies).toBe(6);
    expect(m.parType).toEqual({ fenetre: 5, 'porte-fenetre': 0, porte: 1, garage: 0 });
    // Les fenetres d'etage sont a 3,80 m du sol, a 0,90 m de leur plancher (un niveau de 2,90 m).
    expect(m.fenetre).toEqual({ n: 5, largeurM: 1.2, hauteurM: 1.35, appuiM: 0.9 });
    expect(m.hauteurNiveauM).toBe(2.9);
    expect(m.niveaux.map((n) => [n.etage, n.baies, n.fenetres])).toEqual([[0, 3, 2], [1, 3, 3]]);
    expect(m.baiesParNiveau).toEqual([3, 3]);
    // Centres 1,80, 5,075 et 8,00 au rez-de-chaussee, 1,80, 5,05 et 8,00 a l'etage : 3,275, 2,925, 3,25, 2,95.
    expect(m.entraxeM).toBe(3.1);
    // Cinq fenetres (7,965 m²) sur 58 m² ; avec la porte, 10,01 m².
    expect(m.partVitree).toBeCloseTo(0.137, 3);
    expect(m.partBaies).toBeCloseTo(0.173, 3);
    expect(m.porte).toMatchObject({ position: 'centre', alignee: true });
    expect(m.porte?.xM).toBeCloseTo(5.075, 1);
    expect(m.porte?.part).toBeCloseTo(0.5075, 2);
    expect(m.garage).toBeNull();
    expect(m.aveugle).toBe(false);
    expect(m.type).toBeNull();
  });

  it('compte le garage, quatre travees et une porte sous une fenetre d etage (scene 07)', () => {
    const m = mesurerFacade({ largeur: 11, hauteur: 5.8, ouvertures: SCENE_07 }, { surRue: true });
    expect(m.garage).toEqual({ n: 1, largeurM: 2.5 });
    expect(m.baiesParNiveau).toEqual([4, 4]);
    expect(m.fenetre).toMatchObject({ n: 6, largeurM: 1.2, hauteurM: 1.35, appuiM: 0.9 });
    // Sans le garage : porte 5,075, 7,20, 9,60 au rez-de-chaussee ; 2,00, 5,10, 7,20, 9,60 a l'etage.
    expect(m.entraxeM).toBe(2.4);
    expect(m.porte).toMatchObject({ position: 'centre', alignee: true });
    expect(m.type).toBe('rue');
  });

  it('un seul niveau : la hauteur d etage par defaut, la porte-fenetre comptee comme vitree (scene 11)', () => {
    const m = mesurerFacade({ largeur: 7.5, hauteur: 3.2, ouvertures: SCENE_11 }, { pignon: true });
    expect(m.hauteurNiveauM).toBeNull();
    expect(m.niveaux).toHaveLength(1);
    expect(m.fenetre).toEqual({ n: 2, largeurM: 1, hauteurM: 1.15, appuiM: 0.95 });
    expect(m.entraxeM).toBe(2.35);
    expect(m.partVitree).toBeCloseTo((2 * 1.15 + 1.4 * 2.15) / 24, 3);
    expect(m.partVitree).toBe(m.partBaies);
    expect(m.porte).toBeNull();
    expect(m.type).toBe('pignon');
  });

  it('un pignon aveugle cote voisin', () => {
    const m = mesurerFacade({ largeur: 8, hauteur: 5.5, ouvertures: [] }, { pignon: true, coteVoisin: true, surRue: null });
    expect(m).toMatchObject({ aveugle: true, baies: 0, fenetre: null, entraxeM: null, partVitree: 0, porte: null, garage: null, type: 'pignon', coteVoisin: true });
    expect(m.baiesParNiveau).toEqual([]);
    expect(resumeMesureFacade(m)).toBe('aveugle · pignon · cote voisin');
  });

  it('lit la grille du releve quand il la porte, et les rangs de ses ouvertures', () => {
    const grille = grilleSimple(SCENE_02);
    const avecRangs = SCENE_02.map((x) => ({ ...x, niveau: x.y > 3 ? 1 : 0 }));
    expect(mesurerFacade({ largeur: 10, hauteur: 5.8, ouvertures: avecRangs, grille })).toEqual(mesurerFacade({ largeur: 10, hauteur: 5.8, ouvertures: SCENE_02 }));
    // Un rang hors de la grille fournie est ignore : la rangee qui recouvre l'ouverture le remplace.
    const faux = SCENE_02.map((x) => ({ ...x, niveau: 7 }));
    expect(mesurerFacade({ largeur: 10, hauteur: 5.8, ouvertures: faux, grille }).baiesParNiveau).toEqual([3, 3]);
  });

  it('retire de la surface du mur ce qui est au-dessus de l egout de la partie basse', () => {
    const m = mesurerFacade({ largeur: 10, hauteur: 6, ouvertures: [o('fenetre', 1, 1, 1, 1)], partieBasse: { debut: 6, fin: 10, hauteur: 3 } });
    expect(m.surfaceMurM2).toBe(48);
    expect(m.partVitree).toBeCloseTo(1 / 48, 3);
  });

  it('place la porte a gauche ou a droite, et sans fenetre au-dessus', () => {
    const m = mesurerFacade({ largeur: 9, hauteur: 3, ouvertures: [o('porte', 0.5, 0, 0.9, 2.1), o('fenetre', 6, 0.9, 1.2, 1.3)] });
    expect(m.porte).toMatchObject({ position: 'gauche', alignee: false });
    const d = mesurerFacade({ largeur: 9, hauteur: 3, ouvertures: [o('porte', 7.5, 0, 0.9, 2.1)] });
    expect(d.porte?.position).toBe('droite');
  });

  it('le type : la rue l emporte, puis le pignon, puis l arriere ; sans rien, inconnu', () => {
    expect(typeDeFacade({ surRue: true, pignon: true })).toBe('rue');
    expect(typeDeFacade({ pignon: true, surRue: false })).toBe('pignon');
    expect(typeDeFacade({ surRue: false, pignon: false })).toBe('arriere');
    expect(typeDeFacade({ pignon: false })).toBeNull();
    expect(typeDeFacade({})).toBeNull();
  });

  it('se resume en une ligne', () => {
    const m = mesurerFacade({ largeur: 11, hauteur: 5.8, ouvertures: SCENE_07 }, { surRue: true });
    expect(resumeMesureFacade(m)).toBe('fenetres 120x135 appui 90 · entraxe 240 · vitre 15 % · niveaux 4+4 · etage 290 · porte centre alignee · garage 250 · rue');
  });
});
