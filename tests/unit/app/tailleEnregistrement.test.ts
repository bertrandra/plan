// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/shell/dialogs.js', () => ({ showToast: () => {}, showErrBanner: () => {}, showConfirm: () => {} }));

import { creerProjet, type ContexteProjet } from '../../../src/app/projet.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerRegistre, DROITS_OUVERTS } from '../../../src/app/commandes.js';
import { creerEtat } from '../../../src/core/state.js';
import { serializeObjects, serializeMeasures } from '../../../src/io/serialisation.js';
import { texteStatut, texteStatutCourt } from '../../../src/zones/statut.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// « Enregistré à 10:42 (12 Ko) » : la taille de ce qui part a la plateforme, a cote de l'heure,
// pour voir venir sa limite.

function monter(apiSave: ContexteProjet['apiSave']) {
  const etat = creerEtat({}, (o) => o as ObjetPlan[]);
  etat.objects = [{ key: 'parcelle', type: 'polygon', name: 'P'.repeat(3000), pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] } as unknown as ObjetPlan];
  const magasin = creerMagasin(etat);
  const cmd = creerRegistre(DROITS_OUVERTS);
  const ctx = {
    etat, apiSave, apiDelete: vi.fn(),
    serializeObjects, serializeMeasures, initialState: () => [], initialMeasures: () => [],
    withProjectParam: (id: string) => '?p=' + id, cleDernierProjet: 'k', definirRafraichisseurStatut: () => {},
    ouvrirImportCadastre: () => {}, ouvrirDialogueActualisation: () => {}, actualisationEnCours: () => false
  } as unknown as ContexteProjet;
  creerProjet({ apiAvailable: true, meta: { id: 'p1', name: 'Projet' } as never, list: [] }, ctx, magasin, cmd);
  return { magasin, cmd };
}

describe('l etat d enregistrement', () => {
  it('donne la taille de ce qui a ete refuse quand l enregistrement echoue, et l efface au succes suivant', async () => {
    let refuser = true;
    const apiSave = vi.fn(async () => { if (refuser) throw new Error('PAYLOAD_TOO_LARGE'); return { id: 'p1', updatedAt: '2026-10-07T10:42:00' }; });
    const { magasin, cmd } = monter(apiSave);
    cmd.executer('projet.enregistrer');
    await vi.waitFor(() => expect(magasin.store.getState().projet.echec).toMatch(/^Échec de l’enregistrement \(\d+ Ko\)$/));
    const p = magasin.store.getState().projet;
    expect(p.statut).toBe('modifie');
    expect(texteStatut(p)).toBe(p.echec);
    expect(texteStatutCourt(p)).toMatch(/^Échec \(\d+ Ko\)$/);
    refuser = false;
    cmd.executer('projet.enregistrer');
    await vi.waitFor(() => expect(magasin.store.getState().projet.echec).toBe(''));
    expect(texteStatut(magasin.store.getState().projet)).toMatch(/^Enregistré à 10:42 \(\d+ Ko\)$/);
  });

  it('donne la taille du projet enregistre, entre parentheses apres l heure', async () => {
    const etat = creerEtat({}, (o) => o as ObjetPlan[]);
    etat.objects = [{ key: 'parcelle', type: 'polygon', name: 'P'.repeat(3000), pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] } as unknown as ObjetPlan];
    const magasin = creerMagasin(etat);
    const cmd = creerRegistre(DROITS_OUVERTS);
    const ctx = {
      etat, apiSave: vi.fn(async () => ({ id: 'p1', updatedAt: '2026-10-07T10:42:00' })), apiDelete: vi.fn(),
      serializeObjects, serializeMeasures, initialState: () => [], initialMeasures: () => [],
      withProjectParam: (id: string) => '?p=' + id, cleDernierProjet: 'k', definirRafraichisseurStatut: () => {},
      ouvrirImportCadastre: () => {}, ouvrirDialogueActualisation: () => {}, actualisationEnCours: () => false
    } as unknown as ContexteProjet;
    creerProjet({ apiAvailable: true, meta: { id: 'p1', name: 'Projet' } as never, list: [] }, ctx, magasin, cmd);
    cmd.executer('projet.enregistrer');
    await vi.waitFor(() => expect(magasin.store.getState().projet.enregistreA).toMatch(/^Enregistré à \d\d:\d\d \(\d+ Ko\)$/));
    const envoye = (ctx.apiSave as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const ko = Math.round(new TextEncoder().encode(JSON.stringify(envoye)).length / 1024);
    expect(magasin.store.getState().projet.enregistreA).toContain('(' + ko + ' Ko)');
  });
});
