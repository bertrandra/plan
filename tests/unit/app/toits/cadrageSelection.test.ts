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
const corps0 = (o: ObjetPlan) => o.batiment!.corpsToit!;
const largeur = (pts: { x: number; z: number }[]) => Math.max(Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.z)) - Math.min(...pts.map((p) => p.z)));

describe('la camera de facade et l element choisi', () => {
  afterEach(() => { vue3d.scene = null; });
  // Une scene minimale : seuls son centre et l'absence de relief comptent ici.
  const scene = () => { vue3d.scene = { cen: { x: 0, y: 0 } } as unknown as typeof vue3d.scene; };

  it('la fenetre de toit choisie : le cadre tient tout son corps, ses poignees et elle, pas elle seule (retour sur la 5.12.0)', () => {
    scene();
    const o = maison(), corps = corps0(o), pan = corps[0]!.elementsToit![0]!.pan;
    const mur = pan === 1 ? 2 : 0;
    const fenetre = { type: 'fenetre-toit' as const, rang: 0, i: 0 };
    const cadre = pointsDeLaVue(o, session(o, mur, fenetre)), entier = pointsDeLaVue(o, session(o, mur, null));
    // Le corps entier, du pied au-dessus du faitage, est dans le cadre (le batiment n'a qu'un corps : autant que sans choix).
    expect(largeur(cadre)).toBeGreaterThanOrEqual(largeur(entier) - 1e-9);
    for (const p of emprisePourCadrer(corps, fenetre).filter((q) => q.z >= 0)) {
      expect(Math.min(...cadre.map((q) => q.x))).toBeLessThanOrEqual(p.x + 1e-9 + MARGE_CADRAGE_M);
    }
  });

  it('une facade du contour (un batiment sans corps) : le batiment entier', () => {
    scene();
    const o = { key: 'c', type: 'polygon', fonction: 'batiment', elevation: 4, pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }],
      batiment: { toit: { forme: 'plat', hauteur: 0.3, angleFaitage: 0, source: 'saisie' } } } as unknown as ObjetPlan;
    const f = facadesDuBatiment(undefined, (o as unknown as { pts: PtBrut[] }).pts)[0]!;
    const s: SessionToit = { cle: o.key, hist: creerHistorique(o), facade: f, derniere: f, vue: 'facade', corpsIsole: null, selection: null, indice: false, vueAvant: null, isole: false, validee: false };
    expect(pointsDeLaVue(o, s)).toHaveLength(8);
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
