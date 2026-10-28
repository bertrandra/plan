import { describe, it, expect } from 'vitest';
import { suivreDeformation } from '../../../src/model/contourDeforme.js';
import { oublierLObjet } from '../../../src/model/ouvrages/index.js';
import { insererSommet, supprimerSommet } from '../../../src/model/sommets.js';
import type { Cloture, Mesure, ObjetPlan, Portail, PtBrut, ReleveFacade } from '../../../src/model/types.js';

// Un test par reference du tableau « Les references par numero de cote ou de sommet… » (MD/spec-ouvrages.md, etape 6.3) : elle
// reste sur son cote, son sommet ou sa position quand le contour se deforme (sommet ajoute ou retire, cote raccourci, actualisation
// IGN), et la suppression d'un objet nettoie ce qui le tenait par sa cle.

const rect = (): PtBrut[] => [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
function objet(fonction: string, plus: Partial<ObjetPlan> = {}): ObjetPlan {
  const pts = rect();
  return {
    key: fonction, type: 'polygon', name: fonction, fonction, pts,
    vertexNames: pts.map((_, i) => 'Point ' + (i + 1)), segmentNames: pts.map((_, i) => 'Cote ' + (i + 1)), frozenVertices: pts.map(() => false),
    ...plus,
  } as unknown as ObjetPlan;
}
const pts = (o: ObjetPlan) => (o as ObjetPlan & { pts: PtBrut[] }).pts;
const forme = (o: ObjetPlan) => o as unknown as Parameters<typeof insererSommet>[0];
/** Ajoute un sommet sur le cote 0 (en (6, 0)) et fait suivre. */
function ajouterSurLeCote0(o: ObjetPlan): void { const avant = rect(); insererSommet(forme(o), 0, { x: 6, y: 0 }); suivreDeformation(o, avant, 'geste'); }
/** Retire le sommet 1 (le coin (12, 0)) et fait suivre. */
function retirerLeSommet1(o: ObjetPlan): void { const avant = rect(); supprimerSommet(forme(o), 1); suivreDeformation(o, avant, 'geste'); }
/** Raccourcit le cote 0 par sa droite : le coin (12, 0) vient en (8, 0). */
function raccourcirLeCote0(o: ObjetPlan): void { const avant = rect(); pts(o)[1] = { x: 8, y: 0 }; suivreDeformation(o, avant, 'geste'); }

const portail = (cote: number, x: number, largeur = 3): Portail => ({ nature: 'portail', cote, x, largeur, hauteur: 1.6, ouverture: 'battant-2', sens: 'interieur', refoulement: 'gauche', petitVantail: 'aucun', forme: 'droit', fleche: 0, remplissage: 'plein', materiau: 'aluminium', couleur: '#000', piliers: null, retrait: 0, motorise: false });
const reglage = { type: 'mur', hauteur: 2, couleur: '#fff' } as Cloture['defaut'];
const parcelle = (cl: Partial<Cloture>) => objet('terrain', { key: 'parcelle', cloture: { active: true, defaut: reglage, cotes: [], portails: [], ...cl } as Cloture });

describe('la cloture d une parcelle', () => {
  it('un cote regle a part reste sur son mur ; coupe en deux, les deux parts le gardent', () => {
    const p = parcelle({ cotes: [{ ...reglage, cote: 0, limite: 'rue' }, { ...reglage, cote: 2, mitoyenne: true }] });
    ajouterSurLeCote0(p);
    expect(p.cloture?.cotes.map((c) => [c.cote, c.limite ?? null, c.mitoyenne ?? null])).toEqual([[0, 'rue', null], [1, 'rue', null], [3, null, true]]);
  });

  it('un cote retire : le cote qui suivait descend d un rang', () => {
    const p = parcelle({ cotes: [{ ...reglage, cote: 3, limite: 'rue' }] });
    retirerLeSommet1(p);
    expect(p.cloture?.cotes.map((c) => c.cote)).toEqual([2]);
  });

  it('un portail reste a sa place : sur son mur renumerote, sur la part ou il tombe d un cote coupe', () => {
    const p = parcelle({ portails: [portail(2, 4), portail(0, 8)] });
    ajouterSurLeCote0(p);
    // Le cote 2 devient le 3, ses bouts n'ont pas bouge : meme abscisse. Le portail du cote 0, de 8 a 11 m, tombe sur la part (6, 0)-(12, 0).
    expect(p.cloture?.portails.map((a) => [a.cote, a.x])).toEqual([[3, 4], [1, 2]]);
  });

  it('un cote raccourci : le portail garde sa place, borne au cote, piliers compris', () => {
    const p = parcelle({ portails: [portail(0, 2), { ...portail(0, 8), piliers: { largeur: 0.3, hauteur: 2, parement: 'enduit', chapeau: false } }] });
    raccourcirLeCote0(p);
    expect(p.cloture?.portails.map((a) => a.x)).toEqual([2, 4.7]);
  });

  it('l actualisation IGN : un contour relu qui commence ailleurs garde chaque reglage sur son mur', () => {
    const p = parcelle({ cotes: [{ ...reglage, cote: 0, limite: 'rue' }], portails: [portail(0, 5)] });
    const avant = rect();
    (p as ObjetPlan & { pts: PtBrut[] }).pts = [avant[2], avant[3], avant[0], { x: 12.1, y: 0.05 }] as PtBrut[];
    suivreDeformation(p, avant, 'geometrie');
    expect(p.cloture?.cotes.map((c) => [c.cote, c.limite])).toEqual([[2, 'rue']]);
    expect(p.cloture?.portails[0]?.cote).toBe(2);
    expect(p.cloture?.portails[0]?.x).toBeCloseTo(5, 1);
  });
});

describe('la terrasse', () => {
  it('le cote du sens des lames et les cotes sans rive suivent leur mur', () => {
    const t = objet('terrasse', { construction: { segmentReference: 2, cotesSansRive: [0, 3] } as NonNullable<ObjetPlan['construction']> });
    ajouterSurLeCote0(t);
    expect(t.construction?.segmentReference).toBe(3);
    expect(t.construction?.cotesSansRive).toEqual([0, 1, 4]);
  });
});

describe('l abri', () => {
  it('le cote de reference et le cote adosse suivent leur mur', () => {
    const a = objet('pergola', { pergola: { coteReference: 1, coteMur: 3, adossee: true } });
    ajouterSurLeCote0(a);
    expect([a.pergola?.coteReference, a.pergola?.coteMur]).toEqual([2, 4]);
    const c = objet('carport', { pergola: { coteReference: 3 } });
    retirerLeSommet1(c);
    expect(c.pergola?.coteReference).toBe(2);
  });
});

describe('la piscine', () => {
  it('le cote du petit bain suit son mur', () => {
    const p = objet('piscine', { piscine: { cotePetitBain: 3 } });
    ajouterSurLeCote0(p);
    expect(p.piscine?.cotePetitBain).toBe(4);
  });
});

describe('le bati', () => {
  const releve = (cote: number): ReleveFacade => ({
    cote, largeur: 12, hauteur: 6, texture: null, ouvertures: [{ type: 'fenetre', x: 3, y: 1, l: 1.2, h: 1.4 }, { type: 'porte', x: 9, y: 0, l: 1, h: 2.1 }],
    distance: null, sourceDistance: null, releveLe: '2026-10-28', partieBasse: { debut: 6, fin: 12, hauteur: 3 },
    grille: { niveaux: [{ appuiM: 1, linteauM: 2.4 }], travees: [{ xM: 3.6, largeurM: 1.2 }] },
  }) as ReleveFacade;
  const maison = () => objet('batiment', { batiment: {
    facades: [releve(0), releve(2)],
    fenetres3d: { mode: 'uneParUne', largeur: 1, hauteur: 1.2, appui: 1, entraxe: 3, liste: [{ cote: 0, type: 'fenetre', x: 10, y: 1, l: 1, h: 1.2 }, { cote: 0, type: 'fenetre', x: 1, y: 1, l: 1, h: 1.2 }] },
    corpsToit: [{ pts: rect(), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1, saillie: { genre: 'bow-window', hote: 0, mur: 0, centreM: 3, largeurM: 2, profondeurM: 0.8, forme: 'pans', niveau: 'rdc', toit: 'pan' } }],
    toitFige: true,
  } as unknown as NonNullable<ObjetPlan['batiment']> });

  it('un cote raccourci : le releve suit le mur en proportion (ouvertures, partie basse, grille), la photo etant etiree sur le mur', () => {
    const m = maison();
    raccourcirLeCote0(m);
    const r = m.batiment?.facades?.[0];
    const k = 8 / 12;
    expect(r?.largeur).toBeCloseTo(8);
    expect(r?.ouvertures.map((o) => [o.x, o.l])).toEqual([[3 * k, 1.2 * k], [9 * k, 1 * k]]);
    expect(r?.partieBasse).toEqual({ debut: 6 * k, fin: 12 * k, hauteur: 3 });
    expect(r?.grille?.travees).toEqual([{ xM: 3.6 * k, largeurM: 1.2 * k }]);
    // Le releve d'un mur qui n'a pas change de longueur ne bouge pas.
    expect(m.batiment?.facades?.[1]).toEqual(releve(2));
  });

  it('un cote raccourci : une fenetre reglee une par une garde sa place, bornee au mur', () => {
    const m = maison();
    raccourcirLeCote0(m);
    expect(m.batiment?.fenetres3d?.liste?.map((f) => [f.cote, f.x])).toEqual([[0, 7], [0, 1]]);
  });

  it('un sommet ajoute : la fenetre va sur la part du mur ou elle tombe, a sa place', () => {
    const m = maison();
    ajouterSurLeCote0(m);
    expect(m.batiment?.fenetres3d?.liste?.map((f) => [f.cote, f.x])).toEqual([[1, 4], [0, 1]]);
    expect(m.batiment?.facades?.map((r) => r.cote)).toEqual([0, 3]);
  });

  it('une saillie est rangee sur un corps, pas sur le contour : une deformation ne la touche pas (saillie.hote)', () => {
    const m = maison();
    ajouterSurLeCote0(m);
    expect(m.batiment?.corpsToit?.[0]?.saillie).toMatchObject({ hote: 0, mur: 0, centreM: 3 });
  });
});

describe('supprimer un objet nettoie ce qui le tenait par sa cle', () => {
  it('les cotes, la plage d une piscine, la terrasse d un parasol, la parcelle sous un toit a cheval', () => {
    const terrasse = objet('terrasse', { key: 't1' });
    const piscine = objet('piscine', { key: 'p1', piscine: { plage: 'terrasse', terrasseKey: 't1' } });
    const parasol = { ...objet('parasol', { key: 'u1' }), type: 'circle', parasol: { terrasseLieeKey: 't1' } } as unknown as ObjetPlan;
    const maison = objet('batiment', { key: 'b1', batiment: { toitACheval: { parcelles: ['parcelle', 'v1', 'v2'], reponse: 'un' } } });
    const maison2 = objet('batiment', { key: 'b2', batiment: { toitACheval: { parcelles: ['parcelle', 'v1'] } } });
    const mesure = (id: string, ref: string, cible: string): Mesure => ({ id, refObjKey: ref, refSegIndex: 0, startEnd: 'B', targetObjKey: cible, targetPtIndex: 0 });
    const etat = { objects: [piscine, parasol, maison, maison2], measures: [mesure('a', 't1', 'p1'), mesure('b', 'p1', 't1'), mesure('c', 'p1', 'b1')] };
    expect(oublierLObjet(etat, terrasse.key).map((o) => o.key)).toEqual(['p1', 'u1']);
    expect(piscine.piscine?.terrasseKey).toBeUndefined();
    expect(parasol.parasol?.terrasseLieeKey).toBeNull();
    expect(etat.measures.map((m) => m.id)).toEqual(['c']);
    expect(oublierLObjet(etat, 'v1').map((o) => o.key)).toEqual(['b1', 'b2']);
    expect(maison.batiment?.toitACheval).toEqual({ parcelles: ['parcelle', 'v2'], reponse: 'un' });
    expect(maison2.batiment?.toitACheval).toBeNull();
    // Rien ne tient l'objet : rien ne change, et la liste des cotes reste la meme.
    const cotes = etat.measures;
    expect(oublierLObjet(etat, 'rien')).toEqual([]);
    expect(etat.measures).toBe(cotes);
  });
});
