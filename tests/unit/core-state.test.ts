import { describe, it, expect, vi } from 'vitest';
import { creerEtat } from '../../src/core/state.js';
import type { ObjetPlan, Mesure } from '../../src/model/types.js';

// `normaliser` est injecte : c'est ce qui permet de construire un etat sans embarquer legacy.ts,
// et c'est aussi ce qui rend ce test possible.
const identite = (objs: unknown[]) => objs as ObjetPlan[];

describe('etat de l application', () => {
  it('selectionne la terrasse a l ouverture quand il y en a une', () => {
    // C'est l'objet qu'on vient regarder en arrivant.
    const etat = creerEtat({ objects: [{ key: 'parcelle', name: 'Parcelle' }, { key: 'terrasse', name: 'Terrasse' }] }, identite);
    expect(etat.selectedKey).toBe('terrasse');
  });

  it('retombe sur le premier objet sinon', () => {
    const etat = creerEtat({ objects: [{ key: 'parcelle', name: 'Parcelle' }, { key: 'maison', name: 'Maison' }] }, identite);
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
    // Une vraie cote : elle designe un cote et un point, jamais moins.
    const m1: Mesure = { id: 'm1', refObjKey: 'terrasse', refSegIndex: 0, startEnd: 'A', targetObjKey: 'parcelle', targetPtIndex: 2 };
    const graine = { measures: [m1] };
    const etat = creerEtat(graine, identite);
    expect(etat.measures[0]).toEqual(m1);
    expect(etat.measures[0]).not.toBe(graine.measures[0]);
  });

  it('normalise les objets par la fonction fournie', () => {
    const normaliser = vi.fn((): ObjetPlan[] => [{ key: 'a', name: 'A', type: 'polygon', pts: [], normalise: true } as ObjetPlan]);
    const etat = creerEtat({ objects: [{ key: 'brut', name: 'Brut' }] }, normaliser);
    expect(normaliser).toHaveBeenCalledWith([{ key: 'brut', name: 'Brut' }]);
    expect((etat.objects[0] as { normalise?: boolean }).normalise).toBe(true);
  });

  it('part sur des reglages d affichage previsibles', () => {
    const etat = creerEtat({}, identite);
    expect(etat.terrasseSelectedKey).toBeNull();
    expect(etat.calquesVisibles).toBe(false);
    expect(etat.panelTab).toBe('mesure');
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
