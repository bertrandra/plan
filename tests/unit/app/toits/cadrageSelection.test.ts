import { describe, it, expect, afterEach } from 'vitest';
import { pointsDeLaVue, type SessionToit } from '../../../../src/app/toits/modeToit.js';
import { creerHistorique } from '../../../../src/facade/modeToit/sessionToit.js';
import { facadesDuBatiment } from '../../../../src/facade/modeToit/facadesDesCorps.js';
import { emprisePourCadrer, MARGE_CADRAGE_M } from '../../../../src/facade/modeToit/poignees.js';
import { appliquerPiece } from '../../../../src/three/gestesToits.js';
import { vue3d } from '../../../../src/three/etat3d.js';
import type { ObjetPlan, PtBrut } from '../../../../src/model/types.js';

// Le mode Toit cadre la camera de facade sur l'element choisi (pastille, toucher, pose) ; lache, la facade revient entiere.

const maison = (): ObjetPlan => {
  const o = { key: 'm', type: 'polygon', fonction: 'batiment', elevation: 4, pts: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }],
    batiment: { toit: { forme: 'deux-pans', hauteur: 3.5, angleFaitage: 0, source: 'bdtopo' } } } as unknown as ObjetPlan;
  for (const id of ['sur:fenetre-toit', 'sur:jacobine']) appliquerPiece(o, id);
  return o;
};
const session = (o: ObjetPlan, mur: number, selection: SessionToit['selection']): SessionToit => {
  const f = facadesDuBatiment(o.batiment!.corpsToit, (o as unknown as { pts: PtBrut[] }).pts).find((x) => x.rang === 0 && x.mur === mur)!;
  return { cle: o.key, hist: creerHistorique(o), facade: f, derniere: f, vue: 'facade', corpsIsole: null, selection, indice: false, vueAvant: null, isole: false, validee: false };
};
const largeur = (pts: { x: number; z: number }[]) => Math.max(Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.z)) - Math.min(...pts.map((p) => p.z)));

describe('la camera de facade et l element choisi', () => {
  afterEach(() => { vue3d.scene = null; });
  // Une scene minimale : seuls son centre et l'absence de relief comptent ici.
  const scene = () => { vue3d.scene = { cen: { x: 0, y: 0 } } as unknown as typeof vue3d.scene; };

  it('choisir la fenetre de toit cadre sur elle, devant le mur de son pan ; sans choix, le batiment entier', () => {
    scene();
    const o = maison(), corps = o.batiment!.corpsToit!, pan = corps[0]!.elementsToit![0]!.pan;
    const mur = pan === 1 ? 2 : 0;
    const fenetre = { type: 'fenetre-toit' as const, rang: 0, i: 0 };
    const cadre = pointsDeLaVue(o, session(o, mur, fenetre));
    expect(cadre).toEqual(emprisePourCadrer(corps, fenetre).map((p) => ({ x: p.x - 0, y: 0 + p.z, z: 0 - p.y })));
    const entier = pointsDeLaVue(o, session(o, mur, null));
    expect(largeur(cadre)).toBeLessThan(largeur(entier) / 2);
    expect(largeur(cadre)).toBeGreaterThanOrEqual(2 * MARGE_CADRAGE_M);
  });

  it('devant une autre facade que celle de l element, ou un corps choisi : le batiment entier', () => {
    scene();
    const o = maison(), pan = o.batiment!.corpsToit![0]!.elementsToit![0]!.pan;
    const autre = pan === 1 ? 0 : 2, entier = pointsDeLaVue(o, session(o, autre, null));
    expect(pointsDeLaVue(o, session(o, autre, { type: 'fenetre-toit', rang: 0, i: 0 }))).toEqual(entier);
    expect(pointsDeLaVue(o, session(o, autre, { type: 'corps', rang: 0, i: 0 }))).toEqual(entier);
  });

  it('cadrer ne change ni le batiment ni l historique de la session (pas de Ctrl+Z, pas de « projet modifié »)', () => {
    scene();
    const o = maison(), avant = structuredClone(o), s = session(o, 0, { type: 'lucarne', rang: 0, i: 0 });
    const pile = JSON.stringify(s.hist);
    pointsDeLaVue(o, s);
    expect(o).toEqual(avant);
    expect(JSON.stringify(s.hist)).toBe(pile);
  });
});
