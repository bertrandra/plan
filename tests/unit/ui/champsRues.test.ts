import { describe, it, expect } from 'vitest';
import { sectionRues, libellePart } from '../../../src/ui/champs/rues.js';
import { champsVisibles, type Champ, type ChampChoix, type ChampCurseur, type ContexteChamps } from '../../../src/ui/champs/types.js';
import { ecritLeProjet } from '../../../src/app/administration/ecritures.js';
import { tracerRues } from '../../../src/model/rues.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les reglages des rues dessinees, sous « Rues » dans le menu Affichage (MD/spec-rues.md §8).

const parcelle = () => ({ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }] }) as unknown as ObjetPlan;
const contexte = (o: ObjetPlan, p: ObjetPlan = o): ContexteChamps => ({ etat: { objects: [o], lectureSeule: false }, obj: o, objets: [o], parcelle: p }) as unknown as ContexteChamps;
const champ = <T extends Champ>(c: ContexteChamps, cle: string): T => sectionRues(c)!.champs.find((x) => x.cle === cle) as T;

describe('les reglages des rues dessinees', () => {
  it('n existent que sur la parcelle du projet, et seulement « Rues » cochee', () => {
    const o = parcelle();
    expect(sectionRues(contexte({ ...o, key: 'v1' } as ObjetPlan, o))).toBeNull();
    const c = contexte(o);
    expect(champsVisibles(sectionRues(c)!, c)).toEqual([]);
    tracerRues(o, true);
    expect(champsVisibles(sectionRues(c)!, c).map((x) => x.cle)).toEqual(['partTrottoirs', 'couleursRues']);
  });
  it('sont des preferences d affichage que le projet garde, sans Ctrl+Z, permises en lecture seule', () => {
    const c = contexte(parcelle());
    for (const ch of sectionRues(c)!.champs) {
      expect(ecritLeProjet(ch)).toBe(false);
      expect(ch.sale).toBe(false);
      expect(ch.enregistre).toBe(true);
      expect(ch.historique).toBeFalsy();
      expect(ch.effets).toEqual(['rendu', 'scene3d']);
    }
  });
  it('lisent et ecrivent la part et les couleurs', () => {
    const o = parcelle();
    tracerRues(o, true);
    const c = contexte(o);
    const part = champ<ChampCurseur>(c, 'partTrottoirs');
    expect([part.min, part.max, part.pas, part.lire(c)]).toEqual([10, 30, 5, 20]);
    expect(part.format(20)).toBe('Trottoirs 20 % · Chaussée 60 %');
    expect(libellePart(30)).toBe('Trottoirs 30 % · Chaussée 40 %');
    part.ecrire(c, 25);
    const couleurs = champ<ChampChoix>(c, 'couleursRues');
    expect(couleurs.options(c).map((x) => x.libelle)).toEqual(['Plan', 'Réelles']);
    expect(couleurs.lire(c)).toBe('plan');
    couleurs.ecrire(c, 'reelles');
    expect(o.voisinage3d).toEqual({ rues: { afficher: false, tracer: true, partTrottoirs: 25, couleurs: 'reelles' } });
    expect([part.lire(c), couleurs.lire(c)]).toEqual([25, 'reelles']);
  });
});
