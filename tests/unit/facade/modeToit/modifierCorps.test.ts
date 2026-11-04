import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appliquerChoix, groupesDe, valeurDuGroupe, listerElements } from '../../../../src/facade/modeToit/elements.js';
import { coupeParDefaut, corpsAFusionner, decrocherCorps, fusionnerCorps, raisonSansDecroche, scinderCorps } from '../../../../src/facade/modeToit/decroche.js';
import { appliquerPiece, formeEnPlace, raisonIndisponible } from '../../../../src/three/gestesToits.js';
import { repere } from '../../../../src/facade/toits/toitCorps.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';

// Modifier ce qui existe avec les gestes de l'ajout (decision du proprietaire, 4 novembre 2026) : la nature d'un corps a un pan, sa pente,
// le sens de son faitage, son debord ; le type et le pan d'une lucarne ; decrocher, couper, reunir des corps.

const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const deuxPans = (): CorpsToit => ({ pts: rect(0, 0, 10, 6), posFaitage: 3, faitage: 7, egouts: [4, 4], pignons: [], ecart: 0 });
const appentis = (): CorpsToit => ({ pts: rect(0, -3, 6, 0), posFaitage: 3, faitage: 3.5, egouts: [2.4, 2.4], pignons: [], ecart: 0 });
const corpsDe = (c: CorpsToit[]) => ({ type: 'corps' as const, rang: c.length - 1, i: 0 });
const AE101 = JSON.parse(readFileSync(new URL('../../../fixtures/toits/vesinet-ae101.json', import.meta.url), 'utf8')) as { corpsAvecFaits: CorpsToit[] };

describe('modifier un corps existant', () => {
  it('un corps a un pan passe ouvert sur poteaux, puis ferme ; rien n est enfonce tant que rien n est dit', () => {
    const l = [deuxPans(), appentis()], t = corpsDe(l);
    expect(groupesDe(l, t).map((g) => g.groupe)).toEqual(['ouvert', 'pente', 'debord']);
    expect(valeurDuGroupe(l, t, 'ouvert')).toBeNull();
    const ouvert = appliquerChoix(l, t, 'ouvert', 'poteaux');
    expect(ouvert[1]!.ouvert).toBe(true);
    expect(ouvert[1]!.pts).toEqual(l[1]!.pts);
    expect(groupesDe(ouvert, t).map((g) => g.groupe)).toEqual(['ouvert', 'retrait', 'pente', 'debord']);
    expect(appliquerChoix(ouvert, t, 'retrait', '0.5')[1]!.retraitM).toBe(0.5);
    expect(appliquerChoix(ouvert, t, 'ouvert', 'mur')[1]!.ouvert).toBe(false);
    // La liste d'origine ne bouge pas : la session empile un instantane propre.
    expect(l[1]!.ouvert).toBeUndefined();
  });

  it('un corps seul est une pastille : il se modifie comme les autres', () => {
    expect(listerElements([deuxPans()]).map((e) => e.libelle)).toEqual(['Corps principal']);
  });

  it('la pente monte le faitage depuis l egout le plus bas ; le pignon qui montait au faitage le suit', () => {
    const c = { ...deuxPans(), pignons: [{ pan: 0 as const, debut: 1, fin: 3, faitage: 7, profondeur: 3 }] };
    const l = appliquerChoix([c], { type: 'corps', rang: 0, i: 0 }, 'pente', '45');
    expect(l[0]!.faitage).toBe(7);
    const p = appliquerChoix([c], { type: 'corps', rang: 0, i: 0 }, 'pente', '25');
    expect(p[0]!.faitage).toBeCloseTo(4 + Math.tan((25 * Math.PI) / 180) * 3, 2);
    expect(p[0]!.pignons[0]!.faitage).toBe(p[0]!.faitage);
    expect(valeurDuGroupe(p, { type: 'corps', rang: 0, i: 0 }, 'pente')).toBe('25');
  });

  it('le faitage tourne dans la largeur, et revient ; impossible quand un pignon se compte le long du faitage', () => {
    const t = { type: 'corps' as const, rang: 0, i: 0 };
    const l = appliquerChoix([deuxPans()], t, 'sens', 'court');
    expect(repere(l[0]!.pts).L).toBeCloseTo(6, 6);
    expect(l[0]!.posFaitage).toBe(5);
    expect(valeurDuGroupe(l, t, 'sens')).toBe('court');
    expect(repere(appliquerChoix(l, t, 'sens', 'long')[0]!.pts).L).toBeCloseTo(10, 6);
    const avecPignon = [{ ...deuxPans(), pignons: [{ pan: 0 as const, debut: 1, fin: 3, faitage: 7, profondeur: 3 }] }];
    expect(groupesDe(avecPignon, t).map((g) => g.groupe)).not.toContain('sens');
  });

  it('le debord s ecrit dans les bords du corps ; celui du dessin (0,35 m) est enfonce quand rien n est dit', () => {
    const t = { type: 'corps' as const, rang: 0, i: 0 };
    expect(valeurDuGroupe([deuxPans()], t, 'debord')).toBe('0.35');
    const l = appliquerChoix([deuxPans()], t, 'debord', '0.6');
    expect(l[0]!.bords?.debordEgoutM).toBe(0.6);
  });

  it('une lucarne change de type et de pan, a la meme place', () => {
    const c: CorpsToit = { ...deuxPans(), lucarnes: [{ type: 'jacobine', pan: 0, debutM: 4, finM: 5.4, faitageM: 6, profondeurM: 1.2, source: 'observation' }] };
    const t = { type: 'lucarne' as const, rang: 0, i: 0 };
    expect(groupesDe([c], t).map((g) => g.groupe)).toEqual(['lucarne', 'pan']);
    const l = appliquerChoix([c], t, 'lucarne', 'capucine');
    expect(l[0]!.lucarnes![0]).toMatchObject({ type: 'capucine', debutM: 4, finM: 5.4 });
    const p = appliquerChoix(l, t, 'pan', '1');
    expect(p[0]!.lucarnes![0]!.pan).toBe(1);
    expect(valeurDuGroupe(p, t, 'pan')).toBe('1');
  });

  it('la vignette de la forme en place est celle du corps choisi', () => {
    const o = { key: 'b', type: 'polygon', fonction: 'batiment', pts: rect(0, 0, 10, 6), batiment: { corpsToit: [deuxPans(), appentis()] } } as unknown as ObjetPlan;
    expect(formeEnPlace(o, 0)).toBe('forme:deux-pans');
    expect(formeEnPlace(o, 1)).toBe('forme:appentis');
    // Sans choix et plusieurs corps, une forme remplacerait tout : rien n'est dit en place.
    expect(formeEnPlace(o, null)).toBeNull();
  });
});

describe('decrocher, couper, reunir', () => {
  it('le decroche recule la partie droite du mur regarde ; le faitage reste ou il est', () => {
    const l = decrocherCorps([deuxPans()], 0, 0)!;
    expect(l).toHaveLength(2);
    const [g, d] = l as [CorpsToit, CorpsToit];
    expect(repere(g.pts).L + repere(d.pts).L).toBeCloseTo(10, 6);
    expect(repere(d.pts).W).toBeCloseTo(5.5, 6);
    // Le faitage reste sur la meme ligne : 3 m du mur d'avant, donc 2,5 m du mur recule.
    expect(d.posFaitage).toBeCloseTo(2.5, 6);
    expect(d.faitage).toBe(7);
    expect(raisonSansDecroche([deuxPans()], 0, 1)).toMatch(/long mur/);
  });

  it('un decroche demande la facade regardee', () => {
    const o = { key: 'b', type: 'polygon', fonction: 'batiment', pts: rect(0, 0, 10, 6), batiment: { corpsToit: [deuxPans()] } } as unknown as ObjetPlan;
    expect(raisonIndisponible(o, 'corps:decroche', null)).toMatch(/Regardez/);
    expect(raisonIndisponible(o, 'corps:decroche', { rang: 0, mur: 0 })).toBeNull();
    expect(appliquerPiece(o, 'corps:decroche', { rang: 0, mur: 0 })).toBe(true);
    expect(o.batiment?.corpsToit).toHaveLength(2);
    expect(o.batiment?.toitFige).toBe(true);
  });

  it('AE 101 : la facade aux deux pignons se decroche au bord du pignon de gauche ; l auvent reste un corps, sa rive basse droite', () => {
    const corps = AE101.corpsAvecFaits;
    // Le mur 2 du corps principal porte les deux pignons du fait (pan 1) ; vu de face, la gauche est son debut.
    expect(coupeParDefaut(corps[0]!, 2, 'droite')).toBeCloseTo(3.7, 2);
    const l = decrocherCorps(corps, 0, 2)!;
    expect(l).toHaveLength(corps.length + 1);
    const pignons = l[0]!.pignons.length + l[l.length - 1]!.pignons.length;
    expect(pignons).toBe(2);
    const auvent = corps.findIndex((c) => c.posFaitage <= 0.01 && !c.baie);
    // La rive basse (pts[2], pts[3]) ne bouge pas ; le mur haut recule de 50 cm, le faitage et les egouts restent.
    expect(l[auvent]!.pts.slice(2)).toEqual(corps[auvent]!.pts.slice(2));
    expect(repere(l[auvent]!.pts).W).toBeCloseTo(repere(corps[auvent]!.pts).W + 0.5, 1);
    expect(l[auvent]!.faitage).toBe(corps[auvent]!.faitage);
  });

  it('couper puis reunir rend le rectangle d avant', () => {
    const c = { ...deuxPans(), pignons: [{ pan: 0 as const, debut: 1, fin: 3, faitage: 7, profondeur: 3 }, { pan: 1 as const, debut: 7, fin: 9, faitage: 7, profondeur: 3 }] };
    const coupes = scinderCorps([c], 0)!;
    expect(coupes).toHaveLength(2);
    expect(corpsAFusionner(coupes, 0)).toBe(1);
    const reunis = fusionnerCorps(coupes, 0)!;
    expect(reunis).toHaveLength(1);
    const r = repere(reunis[0]!.pts);
    expect(r.L).toBeCloseTo(10, 6);
    expect(r.W).toBeCloseTo(6, 6);
    expect(reunis[0]!.pignons.map((g) => [g.pan, g.debut, g.fin]).sort()).toEqual([[0, 1, 3], [1, 7, 9]]);
  });

  it('deux corps qui ne font pas un rectangle ne se reunissent pas', () => {
    const l = [deuxPans(), { ...deuxPans(), pts: rect(10, 1, 14, 6) }];
    expect(corpsAFusionner(l, 0)).toBeNull();
    expect(corpsAFusionner([deuxPans(), { ...deuxPans(), faitage: 8 , pts: rect(10, 0, 14, 6) }], 0)).toBeNull();
  });
});
