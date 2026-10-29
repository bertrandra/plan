import { describe, it, expect, vi } from 'vitest';
import { validerLaSession, type SessionToit } from '../../../../src/app/toits/modeToit.js';
import { toitsDepuisLidar, type ObjetAToit } from '../../../../src/app/toits/toitsLidar.js';
import { glisser } from '../../../../src/facade/modeToit/poignees.js';
import { annuler, creerHistorique, ecrireLeGeste, empiler } from '../../../../src/facade/modeToit/sessionToit.js';
import { hauteurToitEn, plansDuToit } from '../../../../src/facade/toits/toit.js';
import { projecteurLocal } from '../../../../src/geo/projection.js';
import { niveauActuel, origineActuelle } from '../../../../src/model/protections.js';
import { hauteurAuPointLePlusHaut } from '../../../../src/model/volumesToit.js';
import { reprendreLectureAuto } from '../../../../src/three/gestesToits.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../../src/model/types.js';

// La poignee « Hauteur à l'égout » du mode Toit (MD/spec-mode-toit-3d.md, poignees ; MD/spec-flux-batiment.md, « Le toit a la main ») :
// le besoin du proprietaire (28 octobre 2026) — l'IGN dit 3,5 m, le LiDAR lit 8 m (un arbre, un toit voisin), la 3D montre 8 m ; la
// personne corrige a la main, et aucune lecture ne revient dessus.

const proj = projecteurLocal(48.9, 2.13);
const rect: PtBrut[] = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
const lu: CorpsToit = { pts: rect, posFaitage: 4, faitage: 11, egouts: [8, 8], pignons: [], ecart: 0.1 };
const maison = (): ObjetPlan => ({
  key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', bdtopo: { id: 'B1', hauteur: 3.5 }, pts: rect, elevation: 8,
  batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, corpsToit: [structuredClone(lu)], toitLidarLu: 7 },
}) as unknown as ObjetPlan;
const session = (o: ObjetPlan): SessionToit => ({ cle: o.key, hist: creerHistorique(o), facade: null, derniere: null, vue: 'facade', corpsIsole: null, selection: null, indice: false, vueAvant: null, isole: false, validee: false, silhouette: true });

/** Un lecteur LiDAR qui mesure toujours le meme deux-pans de 3 m sur un egout de 8 m : la lecture fausse que la personne corrige. */
function lecteurA8m() {
  return vi.fn(async (pts: readonly PtBrut[]) => {
    const plans = plansDuToit(pts, { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 });
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y), out = [];
    for (let x = Math.min(...xs) + 0.75; x < Math.max(...xs) - 0.7; x += 0.5) for (let y = Math.min(...ys) + 0.75; y < Math.max(...ys) - 0.7; y += 0.5) out.push({ x, y, z: 8 + hauteurToitEn(plans, { x, y }) });
    return out;
  });
}

/** La personne tire la poignee de l'egout de 4,5 m vers le bas, puis valide la session. */
function corriger(o: ObjetPlan): SessionToit {
  const s = session(o);
  const r = glisser(o.batiment!.corpsToit!, { type: 'facade', rang: 0, i: 0, mur: 0 }, 'egout', { vert: -4.5 });
  ecrireLeGeste(o, r.corps, r.elevation);
  empiler(s.hist, o);
  return s;
}

describe('la poignee de l egout du mode Toit', () => {
  it('descend le corps, ecrit l elevation comme le champ « Élévation », et Valider en fait une seule etape', () => {
    const o = maison(), s = corriger(o), a = { pushHistory: vi.fn(), markDirty: vi.fn() };
    expect(validerLaSession(a, o, s)).toBe(true);
    expect(a.pushHistory).toHaveBeenCalledTimes(1);
    const c = o.batiment!.corpsToit![0]!;
    expect(c.egouts).toEqual([3.5, 3.5]);
    expect(c.faitage).toBeCloseTo(6.5, 5);
    expect(o.elevation).toBe(3.5);
    expect(o.batiment?.egoutChoisi).toBe('saisie');
    expect(o.batiment?.toitFige).toBe(true);
    // La DP2 (« Existant H ») lit le toit que montre la 3D : les corps, a leur nouvelle hauteur.
    expect(hauteurAuPointLePlusHaut(o)).toBeCloseTo(6.5, 5);
  });

  it('apres validation, le toit et la hauteur sont au niveau 1 : la personne', () => {
    const o = maison(), s = corriger(o);
    validerLaSession({ pushHistory: vi.fn(), markDirty: vi.fn() }, o, s);
    expect(niveauActuel(o, 'toit')).toBe(1);
    expect(niveauActuel(o, 'hauteur')).toBe(1);
    expect(origineActuelle(o, 'hauteur')).toBe('egoutSaisi');
  });

  it('la relecture LiDAR ne revient pas dessus ; « Règles » rallumees rendent le toit a la lecture, pas la hauteur', async () => {
    const o = maison(), s = corriger(o);
    validerLaSession({ pushHistory: vi.fn(), markDirty: vi.fn() }, o, s);
    const objets = [{ key: 'parcelle', fonction: 'terrain', pts: [{ x: -5, y: -5 }, { x: 25, y: -5 }, { x: 25, y: 25 }, { x: -5, y: 25 }] }, o] as unknown as ObjetAToit[];
    await toitsDepuisLidar(objets, proj, { lire: lecteurA8m(), dalles: async () => true });
    expect(o.batiment!.corpsToit![0]!.egouts).toEqual([3.5, 3.5]);
    expect(o.elevation).toBe(3.5);
    // Le toit rendu a la lecture se relit (corps a 8 m), mais la hauteur choisie reste : deux groupes (decision du 28 octobre 2026).
    reprendreLectureAuto(o);
    await toitsDepuisLidar(objets, proj, { lire: lecteurA8m(), dalles: async () => true });
    expect(o.batiment?.toit?.source).toBe('lidar');
    expect(o.elevation).toBe(3.5);
  });

  it('annuler dans la session rend l egout, l elevation et la marque d avant', () => {
    const o = maison(), s = corriger(o);
    expect(annuler(s.hist, o)).toBe(true);
    expect(o.batiment!.corpsToit![0]!.egouts).toEqual([8, 8]);
    expect(o.elevation).toBe(8);
    expect(o.batiment?.egoutChoisi).toBeUndefined();
    expect(o.batiment?.toitFige).toBeUndefined();
  });
});
