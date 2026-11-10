import { describe, it, expect } from 'vitest';
import { sectionReleve } from '../../../src/ui/champs/facade.js';
import { champsVisibles, type Champ, type ChampLecture, type ContexteChamps } from '../../../src/ui/champs/types.js';
import { versMemoire } from '../../../src/model/champsFonction.js';
import type { ObjetPlan, ReleveFacade } from '../../../src/model/types.js';

// L'inspecteur lit la Facade validee et la facade objet (MD/spec-facade-calage-audit.md §3.3, lot F5) : sur la ligne d'un mur, ses
// dimensions et leur source, sa forme lue, sa texture calee, l'ecart de la photo en alerte ; ses ouvertures, par niveau.

const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
function contexte(r: ReleveFacade): ContexteChamps {
  const o = versMemoire({ key: 'maison', fonction: 'batiment', type: 'polygon', elevation: 6, pts, batiment: { facades: [r] } }) as unknown as ObjetPlan;
  return { etat: { objects: [o], highlight: {}, lectureSeule: false }, obj: o, objets: [o], elevationOf: () => 6, render: () => {} } as unknown as ContexteChamps;
}
const ligne = (c: ContexteChamps) => sectionReleve(c).champs.find((x) => x.cle === 'facade0') as { champs: Champ[] };
const lecture = (c: ContexteChamps, cle: string) => champsVisibles({ id: 'ligne', titre: '', champs: ligne(c).champs }, c).find((x: Champ) => x.cle === cle) as ChampLecture | undefined;
const fen = (x: number, niveau: number, plus: object = {}) => ({ type: 'fenetre' as const, x, y: niveau ? 3.6 : 1, l: 1.2, h: 1.3, niveau, ...plus });
const releve = (plus: Partial<ReleveFacade> = {}): ReleveFacade => ({
  cote: 0, largeur: 10, hauteur: 6, texture: null, distance: null, sourceDistance: null, releveLe: '2026-10-29T08:00:00.000Z',
  ouvertures: [fen(1, 0), { type: 'porte', x: 4, y: 0, l: 1, h: 2.1, niveau: 0 }, fen(1, 1), fen(7, 1)], ...plus,
});

describe('la Facade dans l inspecteur', () => {
  it('un releve d avant : ses ouvertures par niveau, et pas de ligne de Facade', () => {
    const c = contexte(releve());
    expect(lecture(c, 'facade')).toBeUndefined();
    expect(lecture(c, 'ouvertures')?.valeur(c)).toBe('Rez-de-chaussée : 1 fenêtre, 1 porte · Étage 1 : 2 fenêtres');
  });

  it('une Facade validee : ses dimensions, sa forme lue, sa texture calee, son parement, et l ecart de la photo en alerte', () => {
    const verifiees = releve().ouvertures.map((o, i) => ({ ...o, id: 'o' + (i + 1), verifieeLe: '2026-10-29' }));
    const c = contexte(releve({
      ouvertures: verifiees,
      dimensions: { largeurM: 10, egoutM: 6, faitageM: 9.4, source: 'lidar', ecartPhoto: { largeur: 0.03, egout: 0.14 } },
      forme: { gabarit: [{ u: 0, v: 1 }, { u: 0.5, v: 1.57 }, { u: 1, v: 1 }], silhouetteLue: 'triangle', pointes: [{ u: 0.5, v: 1.55, source: 'deterministe' }], source: 'photo' },
      surface: { principale: 'enduit', source: 'ia' },
      textureCalee: { pxParM: 118.4, cadre: { x0: 0, y0: 200, x1: 1184, y1: 910 } },
    }));
    const f = lecture(c, 'facade');
    expect(f?.valeur(c)).toBe('10,00 × 6,00 m (LiDAR) · faîtage 9,40 m · haut : triangle, 1 pointe · texture à 118 px/m · parement : enduit');
    expect(f?.note?.(c)).toBe('La photo s’écarte du plan (égout à 14 %) : le plan et le LiDAR sont gardés.');
    expect(lecture(c, 'ouvertures')?.valeur(c)).toBe('Rez-de-chaussée : 1 fenêtre, 1 porte · Étage 1 : 2 fenêtres (toutes vérifiées)');
  });
});
