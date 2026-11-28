import { describe, it, expect } from 'vitest';
import { poserSelectionAccueil, confirmerSelection, suivreSelectionAccueil, selectionEstDAccueil, lacherSelectionAccueil, type EtatSelectionAccueil } from '../../../src/core/selectionAccueil.js';
import { creerEtat } from '../../../src/core/state.js';
import type { ObjetBrut, ObjetPlan } from '../../../src/model/types.js';

// La selection posee d'office a l'ouverture n'entre pas en Vue 3D (demande du proprietaire, 22 novembre 2026) : rien de choisi par la
// personne, rien de choisi en 3D, et le retour au plan n'invente rien. Une selection qu'elle a faite, ou dont elle s'est servie, reste.

const etat = (cle: string | null): EtatSelectionAccueil => { const e: EtatSelectionAccueil = { selectedKey: cle }; poserSelectionAccueil(e); return e; };

describe('la selection d accueil', () => {
  it('l ouverture d un projet ne choisit plus rien (audit UX de la 5.45.0, constat 3)', () => {
    const tel = (objs: ObjetBrut[]) => objs as unknown as ObjetPlan[];
    const avec = creerEtat({ objects: [{ key: 'parcelle' }, { key: 'terrasse' }] as unknown as ObjetBrut[] }, tel);
    expect([avec.selectedKey, avec.selectionAccueil]).toEqual([null, null]);
    const sans = creerEtat({ objects: [{ key: 'parcelle' }] as unknown as ObjetBrut[] }, tel);
    expect([sans.selectedKey, sans.selectionAccueil]).toEqual([null, null]);
    const vide = creerEtat({ objects: [] }, tel);
    expect([vide.selectedKey, vide.selectionAccueil]).toEqual([null, null]);
  });

  it('jamais choisie : entrer en Vue 3D la lache, une fois pour toutes', () => {
    const e = etat('terrasse');
    expect(selectionEstDAccueil(e)).toBe(true);
    expect(lacherSelectionAccueil(e)).toBe(true);
    expect(e.selectedKey).toBeNull();
    // Le retour au plan, puis une seconde entree : rien n'est invente, rien n'est relache.
    expect(lacherSelectionAccueil(e)).toBe(false);
    expect(e.selectedKey).toBeNull();
  });

  it('une selection faite par la personne est gardee, meme si elle redit celle de l ouverture', () => {
    const autre = etat('terrasse');
    autre.selectedKey = 'maison';
    suivreSelectionAccueil(autre);
    expect(lacherSelectionAccueil(autre)).toBe(false);
    expect(autre.selectedKey).toBe('maison');

    // Partie sur la maison puis revenue a la terrasse : elle l'a choisie, ce n'est plus la selection d'accueil.
    const revenue = etat('terrasse');
    revenue.selectedKey = 'maison'; suivreSelectionAccueil(revenue);
    revenue.selectedKey = 'terrasse'; suivreSelectionAccueil(revenue);
    expect(selectionEstDAccueil(revenue)).toBe(false);
    expect(lacherSelectionAccueil(revenue)).toBe(false);
    expect(revenue.selectedKey).toBe('terrasse');

    // Une ligne de l'explorateur, un champ de l'inspecteur ecrit, un glisser de l'objet : la personne s'en est servie.
    const utilisee = etat('terrasse');
    confirmerSelection(utilisee);
    expect(lacherSelectionAccueil(utilisee)).toBe(false);
    expect(utilisee.selectedKey).toBe('terrasse');
  });

  it('desselectionnee par la personne avant d entrer : rien a lacher, rien de choisi', () => {
    const e = etat('terrasse');
    e.selectedKey = null; suivreSelectionAccueil(e);
    expect(lacherSelectionAccueil(e)).toBe(false);
    expect(e.selectedKey).toBeNull();
  });

  it('sans selection a l ouverture, rien ne se passe', () => {
    const e = etat(null);
    expect(selectionEstDAccueil(e)).toBe(false);
    expect(lacherSelectionAccueil(e)).toBe(false);
  });
});
