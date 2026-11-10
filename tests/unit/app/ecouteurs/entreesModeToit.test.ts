// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { creerRegistre, PHRASE_PERMISSION, type Droits } from '../../../../src/app/commandes.js';
import { creerMagasin } from '../../../../src/app/magasin.js';
import { brancherToitCatalogue, chargerGestesToits } from '../../../../src/app/ecouteurs/toitCatalogue.js';
import { modeToitCourant, prendreFocusDeSortie, sessionToit } from '../../../../src/app/toits/modeToit.js';
import { saillieArmee, desarmerSaillie } from '../../../../src/interaction/choixSaillie.js';
import { appliquerPiece } from '../../../../src/three/gestesToits.js';
import type { Atelier } from '../../../../src/app/atelier.js';
import type { ObjetPlan } from '../../../../src/model/types.js';
import type { EtatApp } from '../../../../src/core/state.js';

// Les entrees du mode Toit (audit de la navigation, 6 novembre 2026, lot C) : le bouton qui l'ouvre dit pourquoi il ne s'ouvre pas, au lieu
// de s'effacer ; « Modifier la toiture en 3D » existe depuis l'inspecteur du plan ; « Choisir le mur dans la 3D » vit dans le panneau du
// mode, sur l'element de facade choisi ; la sortie rend le focus au bouton.

const maison = (): ObjetPlan => ({
  key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], elevation: 3,
  batiment: { toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'saisie' } }
}) as unknown as ObjetPlan;

function monter(droits?: Droits) {
  const terrasse = { key: 't', name: 'Terrasse', type: 'polygon', fonction: 'terrasse', pts: [] } as unknown as ObjetPlan;
  const etat = { objects: [maison(), terrasse], selectedKey: null, highlight: { type: null, index: null }, measures: [] } as unknown as EtatApp;
  const magasin = creerMagasin(etat);
  magasin.definirVue('vue3d');
  const a = { etat, undo: vi.fn(), render: () => { magasin.notifier(); }, pushHistory: vi.fn(), markDirty: vi.fn() } as unknown as Atelier;
  const cmd = creerRegistre(droits);
  brancherToitCatalogue(a, { rebatirBatiment: () => {}, rafraichir: () => { magasin.notifier(); }, magasin }, cmd);
  return { etat, cmd };
}

afterEach(() => { modeToitCourant()?.abandonner(true); desarmerSaillie(); });

describe('les entrees du mode Toit', () => {
  it('sans batiment choisi, ou une terrasse : le bouton dit quoi faire ; un batiment du projet : il s ouvre', () => {
    const { etat, cmd } = monter();
    for (const id of ['toit.modifier', 'toit.modifierEn3d']) {
      const e = cmd.etat(id);
      expect(e.utilisable).toBe(false);
      expect('message' in e && e.message).toMatch(/Choisissez d’abord un bâtiment/);
    }
    etat.selectedKey = 't';
    const t = cmd.etat('toit.modifier');
    expect('message' in t && t.message).toMatch(/retouche un bâtiment/);
    etat.selectedKey = 'm';
    expect(cmd.etat('toit.modifier').utilisable).toBe(true);
    expect(cmd.etat('toit.modifierEn3d').utilisable).toBe(true);
  });

  it('en lecture seule, les deux entrees restent visibles, grisees avec la raison du droit', () => {
    const lecture: Droits = { branchee: () => true, aCapacite: () => true, aPermission: () => false, reste: () => null };
    const { etat, cmd } = monter(lecture);
    etat.selectedKey = 'm';
    for (const id of ['toit.modifier', 'toit.modifierEn3d']) expect(cmd.etat(id)).toEqual({ utilisable: false, raison: 'permission', message: PHRASE_PERMISSION });
  });

  it('« Choisir le mur dans la 3D » ne sert que sur un element de facade choisi dans le mode, et l arme', async () => {
    const { etat, cmd } = monter();
    const o = etat.objects[0] as ObjetPlan;
    appliquerPiece(o, 'facade:bow-window');
    etat.selectedKey = 'm';
    await chargerGestesToits();
    expect(cmd.etat('toit.murSur3d').utilisable).toBe(false);
    cmd.executer('toit.modifier');
    expect(sessionToit()).not.toBeNull();
    const rang = o.batiment!.corpsToit!.findIndex((c) => !!c.saillie);
    const b = document.createElement('button');
    Object.assign(b.dataset, { type: 'saillie', rang: String(rang), i: '0' });
    cmd.executer('toit.selection', b);
    expect(cmd.executer('toit.murSur3d')).toBe(true);
    expect(saillieArmee()).toEqual({ cle: 'm', rang });
  });

  it('la sortie du mode, le focus dans le panneau : le bouton qui l ouvre le reprend, une fois', async () => {
    const { etat, cmd } = monter();
    etat.selectedKey = 'm';
    await chargerGestesToits();
    cmd.executer('toit.modifier');
    const panneau = document.createElement('div');
    panneau.className = 'panneauToit';
    const valider = document.createElement('button');
    panneau.appendChild(valider);
    document.body.appendChild(panneau);
    valider.focus();
    cmd.executer('toit.valider');
    expect(prendreFocusDeSortie()).toBe(true);
    expect(prendreFocusDeSortie()).toBe(false);
    panneau.remove();
  });
});
