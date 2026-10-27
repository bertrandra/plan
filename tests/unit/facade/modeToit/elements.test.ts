import { describe, it, expect } from 'vitest';
import { appliquerChoix, cibleAjoutee, facadeDeLElement, dupliquerElement, elementProche, groupesDe, listerElements, lireElement, redimensionnerElement, supprimerElement, valeurDuGroupe,
  type CibleElement } from '../../../../src/facade/modeToit/elements.js';
import { appliquerPiece } from '../../../../src/three/gestesToits.js';
import { facettesElementsToit } from '../../../../src/facade/toits/toitFormes.js';
import { elementDeToitValide } from '../../../../src/model/corpsToitEtendu.js';
import { repere } from '../../../../src/facade/toits/toitCorps.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';

const maison = (): ObjetPlan => ({ key: 'b', type: 'polygon', fonction: 'batiment', elevation: 3, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], batiment: { toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' } } } as unknown as ObjetPlan);
const avecTout = (): ObjetPlan => {
  const o = maison();
  for (const id of ['facade:bow-window', 'sur:pignon', 'sur:cheminee', 'sur:jacobine', 'sur:fenetre-toit', 'sur:solaire', 'facade:galerie']) appliquerPiece(o, id);
  return o;
};

describe('les elements du toit', () => {
  it('les gestes de la palette posent fenetre de toit et solaire sur le pan, et le bow-window a pans coupes par defaut', () => {
    const o = avecTout();
    const types = listerElements(o.batiment!.corpsToit!).map((e) => e.cible.type);
    expect(types).toEqual(expect.arrayContaining(['saillie', 'pignon', 'lucarne', 'cheminee', 'fenetre-toit', 'solaire']));
    expect(o.batiment!.corpsToit!.find((c) => c.saillie?.genre === 'bow-window')!.saillie!.forme).toBe('pans');
    expect(o.batiment!.corpsToit![0]!.elementsToit).toHaveLength(2);
  });

  it('lit un element par sa cible, et null quand il n existe plus', () => {
    const o = avecTout();
    expect(lireElement(o.batiment!.corpsToit!, { type: 'solaire', rang: 0, i: 1 })).toMatchObject({ type: 'solaire' });
    expect(lireElement(o.batiment!.corpsToit!, { type: 'solaire', rang: 0, i: 0 })).toBeNull();
    expect(lireElement(o.batiment!.corpsToit!, { type: 'pignon', rang: 9, i: 0 })).toBeNull();
  });

  it('supprime un element sans toucher aux autres ni a la liste d origine', () => {
    const o = avecTout(), avant = JSON.stringify(o.batiment?.corpsToit);
    const sans = supprimerElement(o.batiment!.corpsToit!, { type: 'fenetre-toit', rang: 0, i: 0 });
    expect(sans[0]!.elementsToit).toHaveLength(1);
    expect(JSON.stringify(o.batiment?.corpsToit)).toBe(avant);
    const sansBow = supprimerElement(o.batiment!.corpsToit!, { type: 'saillie', rang: 1, i: 0 });
    expect(sansBow.some((c) => c.saillie?.genre === 'bow-window')).toBe(false);
    // Le dernier element d'un type : la cle disparait (rien d'ecrit pour une liste vide).
    const sansCheminee = supprimerElement(o.batiment!.corpsToit!, { type: 'cheminee', rang: 0, i: 0 });
    expect(sansCheminee[0]!.cheminees).toBeUndefined();
  });

  it('duplique a cote, ou refuse quand il n y a pas de place', () => {
    const o = avecTout();
    const r = dupliquerElement(o.batiment!.corpsToit!, { type: 'solaire', rang: 0, i: 1 })!;
    expect(r.corps[0]!.elementsToit).toHaveLength(3);
    expect(r.cible).toEqual({ type: 'solaire', rang: 0, i: 2 });
    const [a, b] = [r.corps[0]!.elementsToit![1]!, r.corps[0]!.elementsToit![2]!];
    expect(Math.abs(a.sM - b.sM)).toBeGreaterThanOrEqual(2.55);
    const bow = dupliquerElement(o.batiment!.corpsToit!, { type: 'saillie', rang: 1, i: 0 })!;
    expect(bow.corps.filter((c) => c.saillie?.genre === 'bow-window')).toHaveLength(2);
    // Un pignon aussi large que le corps n'a pas de place pour un second.
    const pleine = JSON.parse(JSON.stringify(o.batiment?.corpsToit)) as CorpsToit[];
    pleine[0]!.pignons = [{ pan: 0, debut: 0, fin: 9.9, faitage: 7, profondeur: 3 }];
    expect(dupliquerElement(pleine, { type: 'pignon', rang: 0, i: 0 })).toBeNull();
  });

  it('agrandit et reduit dans les bornes de la maquette', () => {
    const o = avecTout();
    let corps = o.batiment!.corpsToit!;
    for (let k = 0; k < 20; k++) corps = redimensionnerElement(corps, { type: 'solaire', rang: 0, i: 1 }, 1);
    expect((lireElement(corps, { type: 'solaire', rang: 0, i: 1 }) as { echelle: number }).echelle).toBeCloseTo(2.2, 5);
    for (let k = 0; k < 40; k++) corps = redimensionnerElement(corps, { type: 'solaire', rang: 0, i: 1 }, -1);
    expect((lireElement(corps, { type: 'solaire', rang: 0, i: 1 }) as { echelle: number }).echelle).toBeCloseTo(0.5, 5);
    for (let k = 0; k < 40; k++) corps = redimensionnerElement(corps, { type: 'saillie', rang: 1, i: 0 }, 1);
    expect(corps[1]!.saillie!.largeurM).toBeLessThanOrEqual(6);
    for (let k = 0; k < 40; k++) corps = redimensionnerElement(corps, { type: 'pignon', rang: 0, i: 0 }, 1);
    const p = corps[0]!.pignons[0]!;
    expect(p.fin - p.debut).toBeLessThanOrEqual(8.01);
    expect(p.debut).toBeGreaterThanOrEqual(0);
  });

  it('regle les groupes en images : forme, niveau, toit d un bow ; poteaux et retrait d une galerie ; hauteur d un pignon', () => {
    const o = avecTout();
    const bow: CibleElement = { type: 'saillie', rang: 1, i: 0 };
    expect(groupesDe(o.batiment!.corpsToit!, bow).map((g) => g.groupe)).toEqual(['forme', 'niveau', 'toit']);
    let corps = appliquerChoix(o.batiment!.corpsToit!, bow, 'forme', 'arc');
    expect(valeurDuGroupe(corps, bow, 'forme')).toBe('arc');
    corps = appliquerChoix(corps, bow, 'toit', 'plat');
    expect(valeurDuGroupe(corps, bow, 'toit')).toBe('plat');
    corps = appliquerChoix(corps, bow, 'niveau', 'toit');
    expect(corps[1]!.saillie!.hauteurM).toBeUndefined();
    const gal: CibleElement = { type: 'saillie', rang: corps.findIndex((c) => c.saillie?.genre === 'galerie'), i: 0 };
    expect(valeurDuGroupe(corps, gal, 'ouvert')).toBe('poteaux');
    expect(valeurDuGroupe(corps, gal, 'retrait')).toBe('0.5');
    corps = appliquerChoix(corps, gal, 'retrait', '1');
    expect(valeurDuGroupe(corps, gal, 'retrait')).toBe('1');
    corps = appliquerChoix(corps, gal, 'ouvert', 'mur');
    expect(corps[gal.rang]!.ouvert).toBe(false);
    expect(corps[gal.rang]!.saillie!.genre).toBe('appentis');
    expect(corps[gal.rang]!.retraitM).toBe(1);
    const pig: CibleElement = { type: 'pignon', rang: 0, i: 0 };
    expect(valeurDuGroupe(corps, pig, 'hauteur')).toBe('faitage');
    corps = appliquerChoix(corps, pig, 'hauteur', 'bas');
    expect(valeurDuGroupe(corps, pig, 'hauteur')).toBe('bas');
    corps = appliquerChoix(corps, pig, 'hauteur', 'faitage');
    expect(valeurDuGroupe(corps, pig, 'hauteur')).toBe('faitage');
    expect(groupesDe(corps, pig).map((g) => g.groupe)).toEqual(['hauteur', 'saillie']);
    expect(valeurDuGroupe(corps, pig, 'saillie')).toBe('0');
    corps = appliquerChoix(corps, pig, 'saillie', '1');
    expect(corps[0]!.pignons[0]!.saillieM).toBe(1);
    expect(valeurDuGroupe(corps, pig, 'saillie')).toBe('1');
    corps = appliquerChoix(corps, pig, 'saillie', '0');
    expect(corps[0]!.pignons[0]!.saillieM).toBeUndefined();
    expect(groupesDe(corps, { type: 'cheminee', rang: 0, i: 0 })).toEqual([]);
  });

  it('trouve l element le plus proche d un toucher, sinon rien', () => {
    const o = avecTout(), corps = o.batiment!.corpsToit!;
    const bow = corps[1]!;
    const milieu = { x: bow.pts.reduce((t, p) => t + p.x, 0) / 4, y: bow.pts.reduce((t, p) => t + p.y, 0) / 4 };
    expect(elementProche(corps, milieu)).toEqual({ type: 'saillie', rang: 1, i: 0 });
    const h = corps[0]!.cheminees![0]!;
    expect(elementProche(corps, { x: h.x + 0.1, y: h.y })).toEqual({ type: 'cheminee', rang: 0, i: 0 });
    expect(elementProche(corps, { x: 100, y: 100 })).toBeNull();
  });

  it('dit quel element un geste vient d ajouter', () => {
    const o = maison();
    appliquerPiece(o, 'sur:cheminee');
    const avant = JSON.parse(JSON.stringify(o.batiment?.corpsToit)) as CorpsToit[];
    appliquerPiece(o, 'sur:solaire');
    expect(cibleAjoutee(avant, o.batiment!.corpsToit!)).toEqual({ type: 'solaire', rang: 0, i: 0 });
    expect(cibleAjoutee(o.batiment!.corpsToit!, o.batiment!.corpsToit!)).toBeNull();
  });
});

describe('fenetres de toit et panneaux solaires', () => {
  const corps = (): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 7, egouts: [3, 3], pignons: [], ecart: 0 });

  it('se posent sur leur pan, au-dessus de lui, dans le corps', () => {
    const c = { ...corps(), elementsToit: [{ type: 'solaire' as const, pan: 1 as const, sM: 5, dM: 1.5 }, { type: 'fenetre-toit' as const, pan: 0 as const, sM: 2, dM: 1.5 }] };
    const r = repere(c.pts);
    const e = facettesElementsToit(c, r.L, r.W);
    expect(e).toHaveLength(2);
    for (const x of e) for (const q of [...x.cadre, ...x.vitre]) {
      expect(q.s).toBeGreaterThan(0); expect(q.s).toBeLessThan(10);
      expect(q.z).toBeGreaterThan(3 - 0.01); expect(q.z).toBeLessThan(7 + 0.2);
    }
    // Le solaire est sur le pan oppose (t proche de W) : ses points sont du cote de la largeur.
    expect(Math.min(...e[0]!.vitre.map((q) => q.t))).toBeGreaterThan(3);
    expect(Math.max(...e[1]!.vitre.map((q) => q.t))).toBeLessThan(3);
  });

  it('un panneau trop grand reste dans le corps, un toit plat n en porte pas', () => {
    const c = { ...corps(), elementsToit: [{ type: 'solaire' as const, pan: 0 as const, sM: 9.9, dM: 1.5, echelle: 2.2 }] };
    for (const q of facettesElementsToit(c, 10, 6)[0]!.cadre) { expect(q.s).toBeGreaterThanOrEqual(0); expect(q.s).toBeLessThanOrEqual(10); }
    expect(facettesElementsToit({ ...c, faitage: 3 }, 10, 6)).toHaveLength(0);
  });

  it('se relisent bien formes et se refusent mal formes', () => {
    expect(elementDeToitValide({ type: 'solaire', pan: 1, sM: 3, dM: 1, echelle: 1.5 })).toEqual({ type: 'solaire', pan: 1, sM: 3, dM: 1, echelle: 1.5 });
    expect(elementDeToitValide({ type: 'solaire', pan: 2, sM: 3, dM: 1 })).toBeNull();
    expect(elementDeToitValide({ type: 'jacuzzi', pan: 0, sM: 3, dM: 1 })).toBeNull();
    expect(elementDeToitValide({ type: 'fenetre-toit', pan: 0, sM: 3, dM: 1, echelle: -1 })).toEqual({ type: 'fenetre-toit', pan: 0, sM: 3, dM: 1 });
  });
});

describe('la facade ou se regle un element', () => {
  it('celle du pan d un pignon, celle du mur d un bow-window, aucune pour une cheminee', () => {
    const c = { pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 7, egouts: [4, 4] as [number, number], ecart: 0,
      pignons: [{ pan: 1 as const, debut: 1, fin: 4, faitage: 7, profondeur: 3 }], cheminees: [] };
    const bow = { ...c, pignons: [], saillie: { genre: 'bow-window' as const, hote: 0, mur: 3, centreM: 3, largeurM: 2, profondeurM: 0.6, forme: 'rectangle' as const, niveau: 'rdc' as const, toit: 'pan' as const } };
    expect(facadeDeLElement([c, bow], { type: 'pignon', rang: 0, i: 0 })).toEqual({ rang: 0, mur: 2 });
    expect(facadeDeLElement([c, bow], { type: 'saillie', rang: 1, i: 0 })).toEqual({ rang: 0, mur: 3 });
    expect(facadeDeLElement([c, bow], { type: 'cheminee', rang: 0, i: 0 })).toBeNull();
  });
});
