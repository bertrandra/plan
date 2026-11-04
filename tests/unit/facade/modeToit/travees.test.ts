import { describe, it, expect } from 'vitest';
import { contourAvecReculs, reculEn, segmentsDuMurBas, traveeNeuve } from '../../../../src/facade/modeToit/travees.js';
import { retourDAngle } from '../../../../src/facade/modeToit/decroche.js';
import { appliquerChoix, groupesDe, listerElements, supprimerElement, valeurDuGroupe } from '../../../../src/facade/modeToit/elements.js';
import { glisser, poigneesDe } from '../../../../src/facade/modeToit/poignees.js';
import { appliquerPiece } from '../../../../src/three/gestesToits.js';
import { boutsLies, facettesCorps } from '../../../../src/three/toitCorps3d.js';
import { facettesBowWindow } from '../../../../src/facade/modeToit/saillies.js';
import type { CorpsToit, ObjetPlan, SaillieFacade } from '../../../../src/model/types.js';

// Le schema 14 (decisions du proprietaire du 4 novembre 2026) : un mur en travees (un troncon recule sous un toit continu, un porche
// ouvert sur poteaux avec garde-corps), le retour d'un auvent a l'angle par deux corps lies, un bow-window sans toit propre.

const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const maison = (): CorpsToit => ({ pts: rect(0, 0, 10, 6), posFaitage: 3, faitage: 7, egouts: [4, 4], pignons: [], ecart: 0 });
// Un auvent devant le mur y = 0 : son mur haut contre la maison (le faitage sur pts[0]-pts[1]), sa rive basse a y = -2.
const auvent = (): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -2 }, { x: 0, y: -2 }], posFaitage: 0, faitage: 3.2, egouts: [3.2, 2.4], pignons: [], ecart: 0, ouvert: true });
const aire = (pts: readonly { x: number; y: number }[]) => Math.abs(pts.reduce((t, p, i) => { const q = pts[(i + 1) % pts.length]!; return t + p.x * q.y - q.x * p.y; }, 0)) / 2;

describe('les travees d un mur (schema 14)', () => {
  it('un troncon recule : le pied du corps rentre de son recul, le toit ne change pas', () => {
    const c: CorpsToit = { ...maison(), travees: [{ mur: 0, de: 4, a: 10, nature: 'mur', reculM: 0.5 }] };
    const pied = contourAvecReculs(c);
    expect(aire(pied.pts)).toBeCloseTo(60 - 6 * 0.5, 6);
    expect(pied.cotes.some((k) => k.mur === -1)).toBe(true);
    expect(reculEn(c, 0, 7)).toBe(0.5);
    expect(reculEn(c, 0, 2)).toBe(0);
    // Sans recul, le rectangle tel quel.
    expect(contourAvecReculs(maison()).pts).toEqual(maison().pts);
  });

  it('le mur bas d un appentis se lit troncon par troncon, sa nature d avant ailleurs', () => {
    // Le mur bas de cet auvent est le mur 2 (de pts[2] a pts[3], s de 10 a 0) : la travee de 0 a 4 sur ce mur est s de 6 a 10.
    const c: CorpsToit = { ...auvent(), travees: [{ mur: 2, de: 0, a: 4, nature: 'garde-corps' }] };
    expect(segmentsDuMurBas(c, 'poteaux')).toEqual([{ s0: 0, s1: 6, nature: 'poteaux' }, { s0: 6, s1: 10, nature: 'garde-corps' }]);
    expect(traveeNeuve(c, 2, 5)).toMatchObject({ mur: 2, de: 5, a: 10, nature: 'garde-corps' });
    expect(traveeNeuve(maison(), 0, 5)).toMatchObject({ nature: 'mur', reculM: 0.5 });
  });

  it('un garde-corps ajoute des lisses et des barreaux entre les poteaux', () => {
    const sans = facettesCorps(auvent(), null, false).murs.length;
    const avec = facettesCorps({ ...auvent(), travees: [{ mur: 2, de: 0, a: 4, nature: 'garde-corps' }] }, null, false).murs.length;
    expect(avec).toBeGreaterThan(sans + 20);
    const ouvert = facettesCorps({ ...auvent(), travees: [{ mur: 2, de: 0, a: 10, nature: 'ouvert' }] }, null, false).murs.length;
    expect(ouvert).toBeLessThan(sans);
  });

  it('une travee se choisit, se regle et se retire au Mode Toit ; ses bords se tirent', () => {
    const corps = [{ ...maison(), travees: [{ mur: 0, de: 4, a: 10, nature: 'mur' as const, reculM: 0.5 }] }];
    const t = { type: 'travee' as const, rang: 0, i: 0 };
    expect(listerElements(corps).some((e) => e.cible.type === 'travee' && e.libelle === 'Mur reculé')).toBe(true);
    expect(groupesDe(corps, t).map((g) => g.groupe)).toEqual(['nature', 'recul']);
    expect(valeurDuGroupe(corps, t, 'recul')).toBe('0.5');
    expect(appliquerChoix(corps, t, 'recul', '1')[0]!.travees![0]!.reculM).toBe(1);
    const gc = appliquerChoix(corps, t, 'nature', 'garde-corps');
    expect(gc[0]!.travees![0]).toEqual({ mur: 0, de: 4, a: 10, nature: 'garde-corps' });
    expect(groupesDe(gc, t).map((g) => g.groupe)).toEqual(['nature']);
    expect(supprimerElement(corps, t)[0]).not.toHaveProperty('travees');
    expect(poigneesDe(corps, t).map((p) => p.id)).toEqual(['gauche', 'droite']);
    expect(glisser(corps, t, 'gauche', { long: -1 }).corps[0]!.travees![0]!.de).toBe(3);
  });

  it('la piece « Travée » se pose sur le mur regarde, au bord du pignon qui avance', () => {
    const c = { ...maison(), pignons: [{ pan: 0 as const, debut: 0, fin: 3.7, faitage: 7, profondeur: 3 }] };
    const o = { key: 'b', type: 'polygon', fonction: 'batiment', pts: c.pts, batiment: { corpsToit: [c] } } as unknown as ObjetPlan;
    expect(appliquerPiece(o, 'facade:travee', { rang: 0, mur: 0 })).toBe(true);
    expect(o.batiment!.corpsToit![0]!.travees).toEqual([{ mur: 0, de: 3.7, a: 10, nature: 'mur', reculM: 0.5 }]);
    expect(o.batiment!.toitFige).toBe(true);
  });
});

describe('le retour d un auvent a l angle', () => {
  it('pose un second appentis lie, en equerre : meme toit, les deux bouts lies, aucun lie sans lui', () => {
    const l = retourDAngle([maison(), auvent()], 1, 'droite')!;
    expect(l).toHaveLength(3);
    const b = l[2]!;
    expect([b.faitage, ...b.egouts]).toEqual([3.2, 3.2, 2.4]);
    expect(boutsLies(l[1]!, l).filter(Boolean)).toHaveLength(1);
    expect(boutsLies(b, l).filter(Boolean)).toHaveLength(1);
    expect(boutsLies(auvent(), [maison(), auvent()])).toEqual([false, false]);
    // Deja lie de ce cote : rien de plus.
    expect(retourDAngle(l, 1, 'droite')).toBeNull();
    expect(retourDAngle([maison()], 0, 'droite')).toBeNull();
  });
});

describe('un bow-window sans toit propre', () => {
  it('ferme ses murs a sa hauteur, sans pan de couverture', () => {
    const s: SaillieFacade = { genre: 'bow-window', hote: 0, mur: 0, centreM: 3, largeurM: 2.4, profondeurM: 0.8, forme: 'pans', niveau: 'rdc', toit: 'aucun' };
    const c: CorpsToit = { pts: rect(1.8, -0.8, 4.2, 0), posFaitage: 0, faitage: 2.7, egouts: [2.7, 2.7], pignons: [], ecart: 0, saillie: s };
    const f = facettesBowWindow(c);
    expect(f.pans).toHaveLength(0);
    expect(f.murs.length).toBeGreaterThan(1);
  });
});
