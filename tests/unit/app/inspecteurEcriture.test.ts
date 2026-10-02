import { describe, it, expect, vi } from 'vitest';
import { creerInspecteur, type ContexteInspecteur } from '../../../src/app/inspecteur.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { champActif, champAnnulable } from '../../../src/app/ecritures.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { Champ, ContexteChamps } from '../../../src/ui/champs/types.js';

// L'inspecteur applique deux garde-fous a tout champ qui ecrit le projet (app/ecritures.ts) :
// un instantane d'annulation, regroupe pour un geste continu, et le refus en lecture seule.

function monter(lectureSeule = false) {
  const obj = { key: 'a', name: 'A', type: 'polygon', hauteur: 1 } as unknown as ContexteChamps['obj'];
  const etat = { objects: [obj], selectedKey: 'a', lectureSeule } as unknown as EtatApp;
  const pushHistory = vi.fn(), markDirty = vi.fn();
  const ctx = { pushHistory, markDirty, render: () => {} } as unknown as ContexteInspecteur;
  const inspecteur = creerInspecteur(etat, ctx, creerMagasin(etat), creerRegistre());
  const c = { etat, obj } as unknown as ContexteChamps;
  return { inspecteur, c, obj: obj as unknown as { hauteur: number }, pushHistory, markDirty };
}
const hauteur: Champ = { type: 'nombre', cle: 'hauteur', libelle: 'Hauteur', lire: () => 0, ecrire: () => {} };
const affichage: Champ = { type: 'case', cle: 'cotes', libelle: 'Cotes', sale: false, lire: () => true, ecrire: () => {} };

describe('ecritures de l inspecteur', () => {
  it('rend annulable tout champ qui ecrit le projet, sauf historique: false', () => {
    expect(champAnnulable(hauteur)).toBe(true);
    expect(champAnnulable({ ...hauteur, historique: false })).toBe(false);
    expect(champAnnulable(affichage)).toBe(false);
  });

  it('empile un instantane par geste : les ecritures rapprochees d un meme champ n en font qu un', () => {
    vi.useFakeTimers();
    const m = monter();
    for (const v of [2, 3, 4]) m.inspecteur.appliquer(hauteur, m.c, () => { m.obj.hauteur = v; });
    expect(m.pushHistory).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    m.inspecteur.appliquer(hauteur, m.c, () => { m.obj.hauteur = 5; });
    expect(m.pushHistory).toHaveBeenCalledTimes(2);
    // Un autre champ ouvre un autre geste.
    m.inspecteur.appliquer({ ...hauteur, cle: 'largeur' }, m.c, () => {});
    expect(m.pushHistory).toHaveBeenCalledTimes(3);
    // Un reglage d'affichage n'empile rien.
    m.inspecteur.appliquer(affichage, m.c, () => {});
    expect(m.pushHistory).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('refuse en lecture seule ce qui ecrit le projet, pas les reglages d affichage', () => {
    const m = monter(true);
    expect(m.inspecteur.appliquer(hauteur, m.c, () => { m.obj.hauteur = 9; })).toBe(false);
    expect(m.obj.hauteur).toBe(1);
    expect(m.pushHistory).not.toHaveBeenCalled();
    expect(m.markDirty).not.toHaveBeenCalled();
    expect(m.inspecteur.appliquer(affichage, m.c, () => {})).toBe(true);
    expect(champActif(hauteur, m.c)).toBe(false);
    expect(champActif(affichage, m.c)).toBe(true);
  });
});
