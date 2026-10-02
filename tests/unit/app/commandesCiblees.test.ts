import { describe, it, expect, vi } from 'vitest';
import { creerRegistre, type Droits } from '../../../src/app/commandes.js';
import { brancherCommandesCiblees } from '../../../src/app/ecouteurs/cibles.js';
import { creerExplorateur, type Explorateur } from '../../../src/app/explorateur.js';
import type { Resultats } from '../../../src/app/resultats.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { Magasin } from '../../../src/app/magasin.js';

// Les commandes qui portent sur un objet ou une cote (app/ecouteurs/cibles.ts) : la cible est
// exigee, la permission d'ecrire aussi, et masquer un objet s'annule.

const droits = (ecrire: boolean): Droits => ({
  branchee: () => true, aCapacite: () => true, aPermission: () => ecrire, reste: () => null
});

function monter(ecrire = true) {
  const etat = {
    objects: [{ key: 'a', hidden: false, showName: false }, { key: 'b', hidden: false, showName: true }],
    measures: [{ id: 'm1', startEnd: 'A', displayMode: 'along', show: true }],
    voisinageVisible: true
  } as unknown as EtatApp;
  const explorateur = { definirVisibilite: vi.fn(), definirVisibiliteTous: vi.fn() } as unknown as Explorateur;
  const resultats = { modifierCote: vi.fn(), supprimerCote: vi.fn(), choisirOrigine: vi.fn(), pointer: vi.fn(), arreterPointage: vi.fn(), ajouterCotes: vi.fn() } as unknown as Resultats;
  const cmd = creerRegistre(droits(ecrire));
  brancherCommandesCiblees(cmd, { etat, explorateur, resultats });
  return { cmd, etat, explorateur, resultats };
}

describe('commandes ciblees', () => {
  it('ne font rien sans leur cible', () => {
    const { cmd, explorateur, resultats } = monter();
    expect(cmd.executer('objet.visibilite')).toBe(false);
    expect(cmd.executer('mesure.supprimer', undefined, { objet: 'a' })).toBe(false);
    expect(explorateur.definirVisibilite).not.toHaveBeenCalled();
    expect(resultats.supprimerCote).not.toHaveBeenCalled();
  });

  it('agissent sur la cible donnee', () => {
    const { cmd, explorateur, resultats } = monter();
    expect(cmd.executer('objet.visibilite', undefined, { objet: 'a' })).toBe(true);
    expect(explorateur.definirVisibilite).toHaveBeenCalledWith('a', 'hidden', true);
    cmd.executer('objet.etiquette', undefined, { objet: 'b', valeur: 'showName' });
    expect(explorateur.definirVisibilite).toHaveBeenCalledWith('b', 'showName', false);
    cmd.executer('objet.etiquette', undefined, { objet: 'b', valeur: 'nimporte' });
    expect(explorateur.definirVisibilite).toHaveBeenCalledTimes(2);
    cmd.executer('mesure.supprimer', undefined, { cote: 'm1' });
    expect(resultats.supprimerCote).toHaveBeenCalledWith('m1');
    cmd.executer('mesure.origine', undefined, { valeur: 'B' });
    expect(resultats.choisirOrigine).toHaveBeenCalledWith('B');
  });

  it('« tous » bascule selon l ensemble : une etiquette deja partout se retire', () => {
    const { cmd, explorateur } = monter();
    cmd.executer('objet.etiquettesTous', undefined, { valeur: 'showName' });
    expect(explorateur.definirVisibiliteTous).toHaveBeenCalledWith('showName', true);
    cmd.executer('objet.masquerTous');
    expect(explorateur.definirVisibiliteTous).toHaveBeenCalledWith('hidden', true);
  });

  it('sont refusees sans le droit d ecrire, et le disent', () => {
    const { cmd, explorateur, resultats } = monter(false);
    expect(cmd.etat('objet.visibilite')).toMatchObject({ utilisable: false, raison: 'permission' });
    expect(cmd.executer('objet.visibilite', undefined, { objet: 'a' })).toBe(false);
    expect(cmd.executer('mesure.supprimer', undefined, { cote: 'm1' })).toBe(false);
    expect(explorateur.definirVisibilite).not.toHaveBeenCalled();
    expect(resultats.supprimerCote).not.toHaveBeenCalled();
  });
});

describe('explorateur', () => {
  it('empile un instantane avant de masquer un objet ou ses etiquettes : Annuler le defait', () => {
    const etat = { objects: [{ key: 'a', hidden: false }] } as unknown as EtatApp;
    const ordre: string[] = [];
    const ex = creerExplorateur(etat, {
      render: () => ordre.push('render'), markDirty: () => ordre.push('dirty'),
      pushHistory: () => ordre.push('historique:' + String(etat.objects[0]?.hidden)), redimensionner: () => {}
    }, { notifier: () => {} } as unknown as Magasin);
    ex.definirVisibilite('a', 'hidden', true);
    ex.definirVisibiliteTous('showName', true);
    // L'instantane est pris AVANT l'ecriture : il garde l'objet visible.
    expect(ordre).toEqual(['historique:false', 'dirty', 'render', 'historique:true', 'dirty', 'render']);
  });
});
