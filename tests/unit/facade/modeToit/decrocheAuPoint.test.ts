import { describe, it, expect } from 'vitest';
import { reculAimante, traveeDecrochee, DECROCHE_MIN_M } from '../../../../src/facade/modeToit/travees.js';
import { gaucheEnDebut } from '../../../../src/facade/modeToit/decroche.js';
import { appliquerChoix, groupesDe, valeurDuGroupe } from '../../../../src/facade/modeToit/elements.js';
import { axeUtilisable, cotesDe, glisser, poigneesDe } from '../../../../src/facade/modeToit/poignees.js';
import { raisonIndisponible } from '../../../../src/three/gestesToits.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';

// Le decroche au point (demande du proprietaire, novembre 2026 : « je selectionne un point sur l'egout et je recule a droite ou a gauche
// de x cm, et une poignee pour ajuster ») : une travee de mur reculee, du point touche au bout du mur du cote choisi.

const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const maison = (): CorpsToit => ({ pts: rect(0, 0, 10, 6), posFaitage: 3, faitage: 7, egouts: [4, 4], pignons: [], ecart: 0 });

describe('le decroche au point', () => {
  it('recule a droite ou a gauche du point, jusqu au bout du mur, au recul dit', () => {
    const c = maison();
    // Le mur 0 (y = 0) se regarde depuis y < 0 : son debut (x = 0) est a gauche.
    expect(gaucheEnDebut(c, 0)).toBe(true);
    expect(traveeDecrochee(c, 0, 6.2, 'droite', 0.4, true)).toEqual({ mur: 0, de: 6.2, a: 10, nature: 'mur', reculM: 0.4 });
    expect(traveeDecrochee(c, 0, 6.2, 'gauche', 0.4, true)).toEqual({ mur: 0, de: 0, a: 6.2, nature: 'mur', reculM: 0.4 });
    // Le mur 2 (y = 6) va de x = 10 a x = 0 : vu de face (depuis y > 6), son debut est a gauche aussi ; droite = vers la fin.
    expect(gaucheEnDebut(c, 2)).toBe(true);
    expect(traveeDecrochee(c, 2, 3, 'droite', 0.4, gaucheEnDebut(c, 2))).toMatchObject({ mur: 2, de: 3, a: 10 });
    // Un mur dont le debut est a droite : les cotes s'echangent.
    expect(traveeDecrochee(c, 0, 6.2, 'droite', 0.4, false)).toMatchObject({ de: 0, a: 6.2 });
  });

  it('s arrete au bord d une autre travee ou d un pignon du mur', () => {
    const c: CorpsToit = { ...maison(), travees: [{ mur: 0, de: 8, a: 10, nature: 'poteaux' }] };
    expect(traveeDecrochee(c, 0, 5, 'droite', 0.4, true)).toMatchObject({ de: 5, a: 8 });
    // Le point dans une travee : rien.
    expect(traveeDecrochee(c, 0, 9, 'gauche', 0.4, true)).toBeNull();
    // Un pignon sur le long pan du mur 0, de 1 a 3 : un decroche a gauche de 5 s'arrete a son bord droit.
    const p: CorpsToit = { ...maison(), pignons: [{ pan: 0, debut: 1, fin: 3, faitage: 7, profondeur: 2 }] };
    expect(traveeDecrochee(p, 0, 5, 'gauche', 0.4, true)).toMatchObject({ de: 3, a: 5 });
  });

  it('refuse un troncon trop court, borne et aimante le recul', () => {
    const c = maison();
    expect(traveeDecrochee(c, 0, 10 - DECROCHE_MIN_M / 2, 'droite', 0.4, true)).toBeNull();
    expect(traveeDecrochee(c, 0, 5, 'droite', 9, true)!.reculM).toBe(3);
    expect(traveeDecrochee(c, 0, 5, 'droite', 0, true)!.reculM).toBe(0.01);
    expect(reculAimante(0.39)).toBe(0.4);
    expect(reculAimante(0.412)).toBe(0.4);
    expect(reculAimante(0.42)).toBe(0.42);
    expect(reculAimante(-1)).toBe(0);
    expect(reculAimante(5)).toBe(3);
  });

  it('la poignee de profondeur regle le recul au centimetre, aimantee sur 5 cm', () => {
    const corps: CorpsToit[] = [{ ...maison(), travees: [{ mur: 0, de: 6, a: 10, nature: 'mur', reculM: 0.5 }] }];
    const t = { type: 'travee' as const, rang: 0, i: 0 };
    const recul = poigneesDe(corps, t).find((p) => p.id === 'recul');
    expect(recul?.axes).toEqual(['prof']);
    // Vers l'interieur du corps (prof negative), le mur recule davantage ; vers dehors, il revient.
    expect(glisser(corps, t, 'recul', { prof: 0.11 }).corps[0]!.travees![0]!.reculM).toBe(0.4);
    expect(glisser(corps, t, 'recul', { prof: -0.23 }).corps[0]!.travees![0]!.reculM).toBe(0.73);
    expect(glisser(corps, t, 'recul', { prof: 2 }).corps[0]!.travees![0]!.reculM).toBe(0);
    const r = glisser(corps, t, 'recul', { prof: 0.1 }).corps;
    expect(cotesDe(r, t).map((k) => k.texte)).toContain('recul 0,40 m');
    // Une travee ouverte n'a pas de recul a tirer.
    const ouverte: CorpsToit[] = [{ ...maison(), travees: [{ mur: 0, de: 6, a: 10, nature: 'poteaux' }] }];
    expect(poigneesDe(ouverte, t).map((p) => p.id)).toEqual(['gauche', 'droite']);
  });

  it('le groupe « Recul » montre la valeur libre courante, et la garde', () => {
    const corps: CorpsToit[] = [{ ...maison(), travees: [{ mur: 0, de: 6, a: 10, nature: 'mur', reculM: 0.4 }] }];
    const t = { type: 'travee' as const, rang: 0, i: 0 };
    const g = groupesDe(corps, t).find((x) => x.groupe === 'recul');
    expect(g?.valeurs.map((v) => v.valeur)).toEqual(['0', '0.25', '0.4', '0.5', '1']);
    expect(valeurDuGroupe(corps, t, 'recul')).toBe('0.4');
    expect(appliquerChoix(corps, t, 'recul', '0.4')[0]!.travees![0]!.reculM).toBe(0.4);
    // Une valeur rapide : la liste reste la sienne.
    const rapide: CorpsToit[] = [{ ...maison(), travees: [{ mur: 0, de: 6, a: 10, nature: 'mur', reculM: 0.5 }] }];
    expect(groupesDe(rapide, t).find((x) => x.groupe === 'recul')?.valeurs.map((v) => v.valeur)).toEqual(['0', '0.25', '0.5', '1']);
  });

  it('se pose sur la facade regardee d un corps, comme la travee', () => {
    const c = maison();
    const o = { key: 'b', type: 'polygon', fonction: 'batiment', pts: c.pts, batiment: { corpsToit: [c] } } as unknown as ObjetPlan;
    expect(raisonIndisponible(o, 'facade:decroche', null)).toMatch(/Regardez d’abord la façade où poser le décroché/);
    expect(raisonIndisponible(o, 'facade:decroche', { rang: 0, mur: 0 } as never)).toBeNull();
  });

  it('un axe trop court a l ecran s allonge, sans changer de direction', () => {
    expect(axeUtilisable({ x: 3, y: 4 }, 100)).toEqual({ x: 60, y: 80 });
    expect(axeUtilisable({ x: 300, y: 0 }, 100)).toEqual({ x: 300, y: 0 });
    expect(axeUtilisable({ x: 0, y: 0 }, 100)).toEqual({ x: 0, y: 0 });
  });
});
