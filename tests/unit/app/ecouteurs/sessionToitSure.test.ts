// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { creerRegistre } from '../../../../src/app/commandes.js';
import { creerMagasin } from '../../../../src/app/magasin.js';
import { brancherToitCatalogue, chargerGestesToits } from '../../../../src/app/ecouteurs/toitCatalogue.js';
import { brancherObjets } from '../../../../src/app/ecouteurs/objets.js';
import { etatToit, modeToitCourant, sessionToit } from '../../../../src/app/toits/modeToit.js';
import { dialogues } from '../../../../src/shell/dialogues.js';
import { affichage3d } from '../../../../src/three/etat3d.js';
import type { Atelier } from '../../../../src/app/atelier.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';
import type { EtatApp } from '../../../../src/core/state.js';

// Une session du mode Toit ne se perd plus sans qu'on le demande (audit de la navigation, 6 novembre 2026) : Annuler du projet annule
// la session, quitter la Vue 3D ou choisir un autre objet pose d'abord la question, Echap a un seul effet, le retour du navigateur vaut
// Echap.

const corps = (): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }], posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 });
const maison = (): ObjetPlan => ({
  key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: corps().pts, elevation: 6,
  batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'saisie' }, corpsToit: [corps()], modeToit: 'corps' }
}) as unknown as ObjetPlan;

// Les ecouteurs du mode (clavier, retour, magasin) se posent sur le document une fois : comme dans l'application, un seul branchement,
// et chaque test repart d'une maison neuve.
let monte: ReturnType<typeof brancher> | null = null;
function monter() {
  monte ??= brancher();
  monte.etat.objects[0] = maison();
  monte.etat.selectedKey = 'm';
  monte.magasin.definirVue('vue3d');
  monte.undo.mockClear(); monte.versLePlan.mockClear(); (monte.a.pushHistory as ReturnType<typeof vi.fn>).mockClear();
  return monte;
}

function brancher() {
  const etat = { objects: [maison(), { key: 'autre', name: 'Abri', type: 'polygon', fonction: 'batiment', pts: [] }], selectedKey: 'm', highlight: { type: null, index: null }, measures: [] } as unknown as EtatApp;
  const magasin = creerMagasin(etat);
  magasin.definirVue('vue3d');
  const undo = vi.fn();
  const a = {
    etat, undo, render: () => { magasin.notifier(); }, pushHistory: vi.fn(), markDirty: vi.fn(), rebuildSelector: vi.fn()
  } as unknown as Atelier;
  const cmd = creerRegistre();
  brancherObjets(a, cmd);
  const versLePlan = vi.fn(() => { magasin.definirVue('plan'); });
  cmd.declarer({ id: 'vue.plan', libelle: 'Plan', groupe: 'vue', executer: versLePlan });
  brancherToitCatalogue(a, { rebatirBatiment: () => {}, rafraichir: () => { magasin.notifier(); }, magasin }, cmd);
  const faitage = () => etat.objects.find((o) => o.key === 'm')?.batiment?.corpsToit?.[0]?.faitage;
  /** Un geste de la session : la pente du corps choisi passe a 45 degres. */
  const geste = () => {
    const b = document.createElement('button');
    Object.assign(b.dataset, { type: 'corps', rang: '0', i: '0' });
    cmd.executer('toit.selection', b);
    const r = document.createElement('button');
    Object.assign(r.dataset, { groupe: 'pente', valeur: '45' });
    cmd.executer('toit.regler', r);
  };
  return { etat, magasin, a, cmd, undo, versLePlan, faitage, geste };
}

const touche = (key: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(e);
  return e;
};

async function ouvrir(m: ReturnType<typeof monter>) {
  await chargerGestesToits();
  expect(m.cmd.executer('toit.modifier')).toBe(true);
  expect(sessionToit()).not.toBeNull();
}

afterEach(() => {
  modeToitCourant()?.abandonner(true);
  dialogues.fermer();
  affichage3d.pleinePage3d = false;
});

describe('une session du mode Toit qui ne se perd pas', () => {
  it('Annuler du projet (bouton ou Ctrl+Z depuis une liste) annule le geste de la session, pas l etape du projet', async () => {
    const m = monter();
    await ouvrir(m);
    expect(m.cmd.etat('objet.annuler').utilisable).toBe(false);
    const avant = m.faitage();
    m.geste();
    expect(m.faitage()).not.toBe(avant);
    expect(m.cmd.etat('objet.annuler').utilisable).toBe(true);
    expect(m.cmd.executer('objet.annuler')).toBe(true);
    expect(m.faitage()).toBe(avant);
    expect(m.undo).not.toHaveBeenCalled();
    expect(sessionToit()).not.toBeNull();
    m.cmd.executer('toit.abandonner');
  });

  it('quitter la Vue 3D avec des changements : la question d abord, « Rester » ne quitte rien, « Abandonner » quitte', async () => {
    const m = monter();
    await ouvrir(m);
    m.geste();
    expect(m.cmd.executer('vue.plan')).toBe(false);
    expect(m.versLePlan).not.toHaveBeenCalled();
    const d = dialogues.courant();
    expect(d?.type === 'choix' && [d.tertiaire?.libelle, d.secondaire.libelle, d.principal.libelle]).toEqual(['Rester', 'Abandonner', 'Valider']);
    dialogues.repondreTertiaire();
    expect(sessionToit()).not.toBeNull();
    expect(m.versLePlan).not.toHaveBeenCalled();
    m.cmd.executer('vue.plan');
    const fait = m.faitage();
    dialogues.repondreSecondaire();
    expect(sessionToit()).toBeNull();
    expect(m.versLePlan).toHaveBeenCalledTimes(1);
    expect(m.faitage()).not.toBe(fait);
  });

  it('sans changement, quitter la Vue 3D ferme la session sans question', async () => {
    const m = monter();
    await ouvrir(m);
    expect(m.cmd.executer('vue.plan')).toBe(false);
    expect(dialogues.courant()).toBeNull();
    expect(sessionToit()).toBeNull();
    expect(m.versLePlan).toHaveBeenCalledTimes(1);
  });

  it('choisir un autre objet avec des changements : la selection revient, la question est posee, « Valider » ecrit puis choisit', async () => {
    const m = monter();
    await ouvrir(m);
    m.geste();
    m.etat.selectedKey = 'autre';
    m.a.render();
    await Promise.resolve();
    expect(m.etat.selectedKey).toBe('m');
    expect(dialogues.courant()?.type).toBe('choix');
    dialogues.repondre();
    expect(sessionToit()).toBeNull();
    expect(m.a.pushHistory).toHaveBeenCalledTimes(1);
    expect(m.etat.selectedKey).toBe('autre');
  });

  it('Echap : une touche, un effet ; le dialogue qu il ouvre reste ouvert, et Echap le referme sans rien faire d autre', async () => {
    const m = monter();
    await ouvrir(m);
    m.geste();
    expect(etatToit().selection).not.toBeNull();
    expect(touche('Escape').defaultPrevented).toBe(true);
    expect(etatToit().selection).toBeNull();
    expect(dialogues.courant()).toBeNull();
    touche('Escape');
    expect(dialogues.courant()?.type).toBe('choix');
    // Le dialogue a sa propre touche (zones/Dialogues.tsx) : le mode n'y touche pas.
    expect(touche('Escape').defaultPrevented).toBe(false);
    m.cmd.executer('toit.abandonner');
    dialogues.repondreSecondaire();
    expect(sessionToit()).toBeNull();
  });

  it('en plein ecran, la derniere marche d Echap est la sortie du plein ecran : la session reste', async () => {
    const m = monter();
    await ouvrir(m);
    affichage3d.pleinePage3d = true;
    expect(touche('Escape').defaultPrevented).toBe(false);
    expect(sessionToit()).not.toBeNull();
    expect(dialogues.courant()).toBeNull();
    affichage3d.pleinePage3d = false;
    touche('Escape');
    expect(sessionToit()).toBeNull();
  });

  it('le retour du navigateur vaut Echap, et la session remet son entree d historique tant qu elle dure', async () => {
    const m = monter();
    // Le retour que la session precedente a provoque en retirant son entree arrive d'abord, et il est ignore.
    await new Promise((r) => setTimeout(r, 50));
    const pousser = vi.spyOn(window.history, 'pushState');
    await ouvrir(m);
    expect(pousser).toHaveBeenCalledTimes(1);
    m.geste();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(etatToit().selection).toBeNull();
    expect(sessionToit()).not.toBeNull();
    expect(pousser).toHaveBeenCalledTimes(2);
    m.cmd.executer('toit.abandonner');
    dialogues.repondreSecondaire();
    pousser.mockRestore();
  });
});
