import { describe, it, expect } from 'vitest';
import { actionsDansLAudit } from '../../../../../src/app/audit/parcelle/discret.js';
import { actionDe, type ActionEtape } from '../../../../../src/model/etapeFacade.js';

// L'audit lit les memes actions que la calibration (lot C), filtrees par le mode d'audit de l'etape : la lecture de Claude en une
// ligne, aucune mesure contre la verite.

const action = (etape: Parameters<typeof actionDe>[0], id: string, type?: ActionEtape['type']): ActionEtape => ({ ...actionDe(etape, id, type), etat: 'ok' });

describe('les actions d une etape dans l audit', () => {
  it('l E8 tient en une ligne : aucune action', () => {
    expect(actionsDansLAudit('lectureIa', [action('lectureIa', 'run'), action('lectureIa', 'angles')])).toEqual([]);
  });

  it('les autres etapes montrent leurs actions, sans la mesure contre la verite', () => {
    const l = [action('ouvertures', 'detecter'), action('ouvertures', 'boites'), action('ouvertures', 'relire'), action('ouvertures', 'verite', 'mesure')];
    expect(actionsDansLAudit('ouvertures', l).map((a) => a.id)).toEqual(['detecter', 'boites', 'relire']);
  });

  it('une mesure lue d un fichier n a pas d actions', () => {
    expect(actionsDansLAudit('calage', undefined)).toEqual([]);
  });
});
