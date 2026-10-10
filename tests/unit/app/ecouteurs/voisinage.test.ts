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

describe('projet.lireRues', () => {
  const calee = () => ({ ...obj('parcelle'), cadastre: { origineLat: 48.9, origineLon: 2.13 } }) as unknown as ObjetPlan;
  const rues = { recupereLe: '2026-10-10T08:00:00Z', rayonM: 250, rues: [{ nom: 'Allee des Limites', troncons: [[{ x: 0, y: -10 }, { x: 40, y: -10 }]] }] };
  function monterRues(parcelle: ObjetPlan, ecrire = true, lire = vi.fn(async () => rues)) {
    const a = fauxAtelier({ objects: [parcelle], measures: [], selectedKey: 'parcelle' });
    const cmd = creerRegistre(droits(ecrire));
    brancherVoisinage(a, { buildThreeScene: vi.fn(), lireRues: lire }, cmd);
    ui.toasts.length = 0;
    return { a, cmd, lire };
  }
  it('lit les rues autour du centre de la parcelle et les range sur elle, en une etape', async () => {
    const { a, cmd, lire } = monterRues(calee());
    cmd.executer('projet.lireRues');
    await vi.waitFor(() => expect(ui.toasts).toHaveLength(1));
    expect(lire).toHaveBeenCalledWith({ lat: 48.9, lon: 2.13 }, expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    expect(a.pushHistory).toHaveBeenCalledTimes(1);
    expect(a.etat.objects[0]!.ruesVoisinage).toEqual(rues);
    expect(a.markDirty).toHaveBeenCalled();
    expect(ui.toasts[0]).toBe('1 rue lue à moins de 250 m.');
  });
  it('un echec ne laisse ni etape ni rues, et le dit', async () => {
    const { a, cmd } = monterRues(calee(), true, vi.fn(async () => { throw new Error('Le service ne repond pas (8 s). Reessaie.'); }));
    cmd.executer('projet.lireRues');
    await vi.waitFor(() => expect(ui.toasts).toHaveLength(1));
    expect(a.pushHistory).not.toHaveBeenCalled();
    expect(a.etat.objects[0]!.ruesVoisinage).toBeUndefined();
    expect(ui.toasts[0]).toContain('ne repond pas');
  });
  it('n est pas utilisable sans calage cadastral, ni en lecture seule', () => {
    expect(monterRues(obj('parcelle')).cmd.etat('projet.lireRues').utilisable).toBe(false);
    expect(monterRues(calee(), false).cmd.etat('projet.lireRues').utilisable).toBe(false);
    expect(monterRues(calee()).cmd.etat('projet.lireRues').utilisable).toBe(true);
  });
});
