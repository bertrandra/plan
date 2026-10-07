// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const ui = vi.hoisted(() => ({ toasts: [] as string[], confirmer: true, questions: [] as string[] }));
vi.mock('../../../../src/shell/dialogs.js', () => ({
  showToast: (m: string) => { ui.toasts.push(m); }, showErrBanner: () => {},
  showConfirm: (m: string, oui: () => void) => { ui.questions.push(m); if (ui.confirmer) oui(); }
}));

import { creerRegistre } from '../../../../src/app/commandes.js';
import { brancherVoisinage } from '../../../../src/app/ecouteurs/voisinage.js';
import { fauxAtelier, droits } from './faux.js';
import type { Mesure, ObjetPlan } from '../../../../src/model/types.js';

// « Fichier › Supprimer le voisinage » : tous les objets marques voisinage partent, avec les cotes
// qui s'y appuient, en une etape d'annulation, apres confirmation.

const carre = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }];
const obj = (key: string, voisinage = false) => ({ key, type: 'polygon', name: key, pts: carre, fonction: 'terrain', voisinage }) as unknown as ObjetPlan;

function monter(ecrire = true) {
  const a = fauxAtelier({
    objects: [obj('parcelle'), obj('t'), obj('v1', true), obj('v2', true)],
    measures: [{ id: 'm1', refObjKey: 'parcelle', targetObjKey: 't' }, { id: 'm2', refObjKey: 'parcelle', targetObjKey: 'v1' }] as unknown as Mesure[],
    selectedKey: 'v2'
  });
  a.restoreState = vi.fn((s) => { a.etat.objects = s.objects as ObjetPlan[]; a.etat.measures = s.measures as Mesure[]; });
  const cmd = creerRegistre(droits(ecrire));
  brancherVoisinage(a, { buildThreeScene: vi.fn() }, cmd);
  ui.toasts.length = 0; ui.questions.length = 0; ui.confirmer = true;
  return { a, cmd };
}

describe('projet.supprimerVoisinage', () => {
  it('retire tout le voisinage et ses cotes, en une etape, apres confirmation', () => {
    const { a, cmd } = monter();
    cmd.executer('projet.supprimerVoisinage');
    expect(ui.questions[0]).toContain('2 objets');
    expect(a.pushHistory).toHaveBeenCalledTimes(1);
    expect(a.etat.objects.map(o => o.key)).toEqual(['parcelle', 't']);
    expect(a.etat.measures.map(m => m.id)).toEqual(['m1']);
    expect(a.etat.selectedKey).toBe('parcelle');
    expect(a.markDirty).toHaveBeenCalled();
    expect(ui.toasts[0]).toContain('Voisinage supprimé : 2 objets');
    // Plus de voisinage : la commande se grise.
    expect(cmd.etat('projet.supprimerVoisinage').utilisable).toBe(false);
  });

  it('ne touche a rien si la personne renonce', () => {
    const { a, cmd } = monter();
    ui.confirmer = false;
    cmd.executer('projet.supprimerVoisinage');
    expect(a.pushHistory).not.toHaveBeenCalled();
    expect(a.etat.objects).toHaveLength(4);
  });

  it('est refusee en lecture seule', () => {
    expect(monter(false).cmd.etat('projet.supprimerVoisinage')).toMatchObject({ utilisable: false, raison: 'permission' });
  });
});
