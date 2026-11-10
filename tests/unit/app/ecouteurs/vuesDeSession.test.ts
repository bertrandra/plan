// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { creerRegistre } from '../../../../src/app/commandes.js';
import { creerMagasin } from '../../../../src/app/magasin.js';
import { brancherToitCatalogue, chargerGestesToits } from '../../../../src/app/ecouteurs/toitCatalogue.js';
import { etatToit, modeToitCourant, sessionToit } from '../../../../src/app/toits/modeToit.js';
import { dialogues } from '../../../../src/shell/dialogues.js';
import type { Atelier } from '../../../../src/app/atelier.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';
import type { EtatApp } from '../../../../src/core/state.js';

// Le corps choisi au mode Toit (audit de la navigation, 6 novembre 2026, lot B) : une seule ligne « Corps · Façade », la pastille
// « Bâtiment entier » et la pastille enfoncee qui se lache, et Ctrl+Z / Ctrl+Y qui rendent l'element choisi de l'etat ou il a ete pris
// (jamais un rang qui designerait un autre element apres l'annulation).

const corps = (): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }], posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 });
const maison = (): ObjetPlan => ({
  key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: corps().pts, elevation: 6,
  batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'saisie' }, corpsToit: [corps()], modeToit: 'corps' }
}) as unknown as ObjetPlan;

let monte: ReturnType<typeof brancher> | null = null;
function brancher() {
  const etat = { objects: [maison()], selectedKey: 'm', highlight: { type: null, index: null }, measures: [] } as unknown as EtatApp;
  const magasin = creerMagasin(etat);
  magasin.definirVue('vue3d');
  const a = { etat, undo: vi.fn(), render: () => { magasin.notifier(); }, pushHistory: vi.fn(), markDirty: vi.fn() } as unknown as Atelier;
  const cmd = creerRegistre();
  brancherToitCatalogue(a, { rebatirBatiment: () => {}, rafraichir: () => { magasin.notifier(); }, magasin }, cmd);
  return { etat, cmd };
}
async function monter() {
  monte ??= brancher();
  monte.etat.objects[0] = maison();
  monte.etat.selectedKey = 'm';
  await chargerGestesToits();
  expect(monte.cmd.executer('toit.modifier')).toBe(true);
  return monte;
}

const bouton = (dataset: Record<string, string>) => { const b = document.createElement('button'); Object.assign(b.dataset, dataset); return b; };
const choisirCorps = (cmd: ReturnType<typeof brancher>['cmd'], rang: number) => cmd.executer('toit.selection', bouton({ type: 'corps', rang: String(rang), i: '0' }));

afterEach(() => {
  modeToitCourant()?.abandonner(true);
  dialogues.fermer();
});

describe('le corps choisi au mode Toit', () => {
  it('une seule ligne dit le corps des gestes ; retoucher sa pastille, ou « Bâtiment entier », revient au batiment entier', async () => {
    const { cmd } = await monter();
    expect(etatToit().designation).toBe('Touchez un mur du bâtiment pour choisir sa façade.');
    choisirCorps(cmd, 0);
    expect(etatToit().selection).toEqual({ type: 'corps', rang: 0, i: 0 });
    expect(etatToit().designation).toBe('Corps principal · touchez un de ses murs pour choisir sa façade');
    expect(etatToit().rangCorps).toBe(0);
    choisirCorps(cmd, 0);
    expect(etatToit().selection).toBeNull();
    choisirCorps(cmd, 0);
    cmd.executer('toit.selection', bouton({}));
    expect(etatToit().selection).toBeNull();
    expect(etatToit().rangCorps).toBeNull();
  });

  it('choisir la facade d un autre corps : le corps choisi devient le sien', async () => {
    const { cmd } = await monter();
    choisirCorps(cmd, 0);
    cmd.executer('toit.scinder');
    expect(sessionToit()?.selection).toEqual({ type: 'corps', rang: 1, i: 0 });
    cmd.executer('toit.facade', bouton({ rang: '0', mur: '0' }));
    expect(etatToit().selection).toEqual({ type: 'corps', rang: 0, i: 0 });
    expect(etatToit().designation).toMatch(/^Corps principal · /);
    expect(etatToit().rangCorps).toBe(0);
  });

  it('Ctrl+Z rend l element choisi d avant le pas defait, Ctrl+Y celui d apres : jamais un rang decale', async () => {
    const { cmd } = await monter();
    choisirCorps(cmd, 0);
    cmd.executer('toit.scinder');
    // Couper a choisi la nouvelle partie (rang 1) ; on revient au batiment entier, puis on annule la coupe.
    cmd.executer('toit.selection', bouton({}));
    cmd.executer('toit.annuler');
    expect(sessionToit()?.selection).toEqual({ type: 'corps', rang: 0, i: 0 });
    cmd.executer('toit.retablir');
    expect(sessionToit()?.selection).toBeNull();
  });

  it('un reglage annule : le corps sur lequel il avait ete fait est de nouveau choisi', async () => {
    const { cmd } = await monter();
    choisirCorps(cmd, 0);
    cmd.executer('toit.regler', bouton({ groupe: 'pente', valeur: '45' }));
    cmd.executer('toit.selection', bouton({}));
    expect(etatToit().selection).toBeNull();
    cmd.executer('toit.annuler');
    expect(etatToit().selection).toEqual({ type: 'corps', rang: 0, i: 0 });
  });
});

describe('Ctrl+Z et Ctrl+Y ne rendent la camera que si ce qu on regarde change (decision du proprietaire, 6 novembre 2026)', () => {
  it('meme vue, meme facade, meme element : la camera reste ; sinon elle revient', async () => {
    const { laCameraSuitLePas } = await import('../../../../src/app/toits/modeToit.js');
    const libre = { vue: 'libre' as const, facade: null, selection: null };
    expect(laCameraSuitLePas(libre, libre)).toBe(false);
    expect(laCameraSuitLePas(libre, { ...libre, vue: 'facade' })).toBe(true);
    expect(laCameraSuitLePas(libre, { ...libre, selection: { type: 'corps', rang: 0, i: 0 } })).toBe(true);
    const facade = { vue: 'facade' as const, facade: { rang: 0, mur: 1 }, selection: { type: 'corps' as const, rang: 0, i: 0 } };
    expect(laCameraSuitLePas(facade, { ...facade, facade: { rang: 0, mur: 1 }, selection: { type: 'corps', rang: 0, i: 0 } })).toBe(false);
    expect(laCameraSuitLePas(facade, { ...facade, facade: { rang: 0, mur: 2 } })).toBe(true);
  });
});
