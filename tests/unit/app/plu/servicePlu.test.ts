// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { creerServicePlu } from '../../../../src/app/plu/servicePlu.js';
import { creerMagasin } from '../../../../src/app/magasin.js';
import { creerEtat } from '../../../../src/core/state.js';
import type { ContexteLecturePlu } from '../../../../src/app/plu/lecturePlu.js';
import type { ClientAnalyse } from '../../../../src/io/analyseClaude.js';
import type { ObjetPlan } from '../../../../src/model/types.js';
import { REGLEMENT } from '../../../fixtures/plu/reglement.js';

// Le service de l'onglet PLU (app/plu/servicePlu.ts) : une lecture rangee sur la parcelle en un pas d'annulation, la validation d'une
// regle, la conformite. La lecture est SYNTHETIQUE (client simule).

function monter(lecture?: ContexteLecturePlu, lectureSeule = false) {
  const etat = creerEtat({}, (o) => o as ObjetPlan[]);
  const parcelle = { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], reglementPlu: structuredClone(REGLEMENT) } as unknown as ObjetPlan;
  etat.objects = [parcelle];
  etat.lectureSeule = lectureSeule;
  const pushHistory = vi.fn(), markDirty = vi.fn();
  const s = creerServicePlu(etat, { pushHistory, markDirty, trouverParcelle: () => parcelle, ...(lecture ? { lecturePlu: lecture } : {}) }, creerMagasin(etat));
  return { s, parcelle, pushHistory, markDirty };
}

describe('creerServicePlu', () => {
  it('valide une regle puis la rend proposee, chaque fois en un pas d’annulation', () => {
    const { s, parcelle, pushHistory, markDirty } = monter();
    s.basculerFaitPlu('f2');
    expect(parcelle.reglementPlu!.faits[1]).toMatchObject({ statut: 'valide', valideLe: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    s.basculerFaitPlu('f1');
    expect(parcelle.reglementPlu!.faits[0]!.statut).toBe('propose');
    expect(parcelle.reglementPlu!.faits[0]).not.toHaveProperty('valideLe');
    expect(pushHistory).toHaveBeenCalledTimes(2);
    expect(markDirty).toHaveBeenCalledTimes(2);
    s.basculerFaitPlu('inconnu');
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it('ne touche a rien en lecture seule', () => {
    const { s, parcelle, pushHistory } = monter(undefined, true);
    s.basculerFaitPlu('f2');
    expect(parcelle.reglementPlu!.faits[1]!.statut).toBe('propose');
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('ne range rien quand la lecture echoue, et rend la main', async () => {
    const lecture = (r: unknown): ContexteLecturePlu => ({ client: () => ({}) as ClientAnalyse, identite: () => ({ projet: null, idu: null, adresse: null }), maintenant: () => new Date(),
      chercher: async () => { if (r instanceof Error) throw r; return []; } });
    const echec = monter(lecture(new Error('réseau')));
    await echec.s.lireReglementPlu();
    expect(echec.parcelle.reglementPlu!.zone).toBe('ULp');
    expect(echec.pushHistory).not.toHaveBeenCalled();
    expect(echec.s.lecturePluEnCours()).toBe(false);
  });
});
