import { describe, it, expect, vi } from 'vitest';
import { creerEtat } from '../../src/core/state.js';

// `normaliser` est injecte : c'est ce qui permet de construire un etat sans embarquer legacy.ts,
// et c'est aussi ce qui rend ce test possible.
const identite = (objs: unknown[]) => objs as Record<string, unknown>[];

describe('etat de l application', () => {
  it('selectionne la terrasse a l ouverture quand il y en a une', () => {
    // C'est l'objet qu'on vient regarder en arrivant.
    const etat = creerEtat({ objects: [{ key: 'parcelle' }, { key: 'terrasse' }] }, identite);
    expect(etat.selectedKey).toBe('terrasse');
  });

  it('retombe sur le premier objet sinon', () => {
    const etat = creerEtat({ objects: [{ key: 'parcelle' }, { key: 'maison' }] }, identite);
    expect(etat.selectedKey).toBe('parcelle');
  });

  it('accepte un projet vide sans rien selectionner', () => {
    const etat = creerEtat({}, identite);
    expect(etat.selectedKey).toBeNull();
    expect(etat.objects).toEqual([]);
    expect(etat.measures).toEqual([]);
  });

  it('copie les mesures plutot que de garder les references de la graine', () => {
    // Sinon une modification du plan remonterait dans l'objet charge depuis le serveur.
    const graine = { measures: [{ id: 'm1' }] };
    const etat = creerEtat(graine, identite);
    expect(etat.measures[0]).toEqual({ id: 'm1' });
    expect(etat.measures[0]).not.toBe(graine.measures[0]);
  });

  it('normalise les objets par la fonction fournie', () => {
    const normaliser = vi.fn(() => [{ key: 'a', normalise: true }]);
    const etat = creerEtat({ objects: [{ key: 'brut' }] }, normaliser);
    expect(normaliser).toHaveBeenCalledWith([{ key: 'brut' }]);
    expect(etat.objects[0].normalise).toBe(true);
  });

  it('part sur des reglages d affichage previsibles', () => {
    const etat = creerEtat({}, identite);
    expect(etat.appMode).toBe('plan');
    expect(etat.panelTab).toBe('edition');
    expect(etat.grilleVisible).toBe(true);
    expect(etat.voisinageVisible).toBe(true);
    expect(etat.showNorth).toBe(true);
    expect(etat.dirty).toBe(false);
    expect(etat.undoStack.vide).toBe(true);
    expect(etat.parasol.minutes).toBe(900);
    expect(etat.parasol.dateStr).toMatch(/^\d{4}-06-21$/);
  });

  it('donne a chaque etat sa propre pile et sa propre scene', () => {
    // Deux etats doivent pouvoir coexister - c'est la raison de ne pas utiliser des `let` de
    // module (spec §6.1).
    const a = creerEtat({}, identite);
    const b = creerEtat({}, identite);
    a.undoStack.empiler({ objects: [], measures: [] });
    a.scene.scale = 99;
    expect(b.undoStack.vide).toBe(true);
    expect(b.scene.scale).not.toBe(99);
  });
});
