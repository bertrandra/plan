// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { creerRegistre, PHRASE_PERMISSION, type Droits } from '../../../../src/app/commandes.js';
import { creerMagasin } from '../../../../src/app/magasin.js';
import { brancherToitCatalogue } from '../../../../src/app/ecouteurs/toitCatalogue.js';
import { batimentVise, batimentsRetouchables, modeToitCourant, prendreFocusDeSortie, sessionToit } from '../../../../src/app/toits/modeToit.js';
import { saillieArmee, desarmerSaillie } from '../../../../src/interaction/choixSaillie.js';
import { poser } from '../../facade/modeToit/poser.js';
import type { Atelier } from '../../../../src/app/atelier.js';
import type { ObjetPlan } from '../../../../src/model/types.js';
import type { EtatApp } from '../../../../src/core/state.js';

// Les entrees de l'atelier du toit (audit de la navigation, 6 novembre 2026, lot C) : le bouton qui l'ouvre dit pourquoi il ne s'ouvre pas,
// au lieu de s'effacer ; « Modifier le toit » est le meme depuis l'inspecteur du plan et depuis la Vue 3D ; « Choisir le mur dans la 3D »
// vit dans l'atelier, sur l'element de facade choisi ; la sortie rend le focus au bouton.

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
const intentionToit = () => sessionToit()?.ctl.etat().intention;

describe('les entrees du mode Toit', () => {
  it('plusieurs batiments, aucun choisi, ou une terrasse : le bouton dit quoi faire ; un batiment du projet : il s ouvre', () => {
    const { etat, cmd } = monter();
    etat.objects.push({ ...maison(), key: 'abri', name: 'Abri de jardin' });
    for (const id of ['toit.modifier', 'toit.ajouter']) {
      const e = cmd.etat(id);
      expect(e.utilisable).toBe(false);
      expect('message' in e && e.message).toMatch(/Choisissez d’abord un bâtiment/);
    }
    etat.selectedKey = 't';
    const t = cmd.etat('toit.modifier');
    expect('message' in t && t.message).toMatch(/retouche un bâtiment/);
    etat.selectedKey = 'm';
    expect(cmd.etat('toit.modifier').utilisable).toBe(true);
    expect(cmd.etat('toit.ajouter').utilisable).toBe(true);
  });

  it('une seule maison sur la parcelle : inutile de la designer, l entree la vise et la choisit en ouvrant', () => {
    const { etat, cmd } = monter();
    expect(batimentVise(etat.objects, null)?.key).toBe('m');
    expect(batimentVise(etat.objects, 't')?.key).toBe('m');
    expect(cmd.etat('toit.modifier').utilisable).toBe(true);
    cmd.executer('toit.modifier');
    expect(sessionToit()?.cle).toBe('m');
    expect(etat.selectedKey).toBe('m');
    expect(intentionToit()).toBe('modifier');
  });

  it('« Ajouter » ouvre la meme session sur le catalogue ; le commutateur change d intention, une piece posee ramene a « Modifier »', () => {
    const { etat, cmd } = monter();
    cmd.executer('toit.ajouter');
    expect(sessionToit()?.cle).toBe('m');
    expect(intentionToit()).toBe('ajouter');
    const bouton = (d: Record<string, string>) => { const b = document.createElement('button'); Object.assign(b.dataset, d); return b; };
    cmd.executer('toit.intention', bouton({ intention: 'modifier' }));
    expect(intentionToit()).toBe('modifier');
    cmd.executer('toit.intention', bouton({ intention: 'nimporte' }));
    expect(intentionToit()).toBe('modifier');
    cmd.executer('toit.intention', bouton({ intention: 'ajouter' }));
    // Un toit d'un seul tenant ne recoit pas de piece : il se decoupe d'abord, d'un geste dit (« Découper ce toit »), dans l'intention
    // d'ajout aussi. Un panneau solaire se pose ensuite d'un coup : on revient regler ce qu'on vient d'ajouter.
    expect(cmd.etat('toit.poser').utilisable).toBe(true);
    expect(sessionToit()?.ctl.raisonDePiece('sur:solaire')).toMatch(/découpé en corps/);
    cmd.executer('toit.decouper');
    expect(intentionToit()).toBe('ajouter');
    cmd.executer('toit.poser', bouton({ piece: 'sur:solaire' }));
    expect((etat.objects[0] as ObjetPlan).batiment?.corpsToit?.[0]?.elementsToit?.length ?? 0).toBeGreaterThan(0);
    expect(intentionToit()).toBe('modifier');
  });

  it('plusieurs batiments : l entree les nomme, « Modifier ce batiment » ouvre sur celui qu on touche ; un voisin ne se vise pas', () => {
    const { etat, cmd } = monter();
    etat.objects.push({ ...maison(), key: 'abri', name: 'Abri de jardin' });
    expect(batimentsRetouchables(etat.objects).map((o) => o.key)).toEqual(['m', 'abri']);
    expect(batimentVise(etat.objects, null)).toBeUndefined();
    expect(cmd.etat('toit.modifierCe').utilisable).toBe(true);
    const b = document.createElement('button'); b.dataset.cle = 'abri';
    cmd.executer('toit.modifierCe', b);
    expect(sessionToit()?.cle).toBe('abri');
    expect(etat.selectedKey).toBe('abri');
    // En session, les entrees n'ont plus rien a offrir.
    expect(cmd.etat('toit.modifierCe').utilisable).toBe(false);
  });

  it('en lecture seule, les deux entrees restent visibles, grisees avec la raison du droit', () => {
    const lecture: Droits = { branchee: () => true, aCapacite: () => true, aPermission: () => false, reste: () => null };
    const { etat, cmd } = monter(lecture);
    etat.selectedKey = 'm';
    for (const id of ['toit.modifier', 'toit.ajouter']) expect(cmd.etat(id)).toEqual({ utilisable: false, raison: 'permission', message: PHRASE_PERMISSION });
  });

  it('« Choisir le mur dans la 3D » ne sert que sur un element de facade choisi dans le mode, et l arme', () => {
    const { etat, cmd } = monter();
    const o = etat.objects[0] as ObjetPlan;
    poser(o, 'facade:bow-window');
    etat.selectedKey = 'm';
    expect(cmd.etat('toit.murSur3d').utilisable).toBe(false);
    cmd.executer('toit.modifier');
    expect(sessionToit()).not.toBeNull();
    const rang = o.batiment!.corpsToit!.findIndex((c) => !!c.saillie);
    const b = document.createElement('button');
    Object.assign(b.dataset, { type: 'saillie', rang: String(rang), i: '0' });
    cmd.executer('toit.selection', b);
    // Toucher un mur se fait dans la Vue 3D : l'atelier ouvert sur le plan ne l'offre pas.
    expect(cmd.etat('toit.murSur3d').utilisable).toBe(false);
    // La 3D attachee a la session (ce que fait l'ouverture de la scene ; ici sans moteur 3D) : l'element s'arme.
    (sessionToit() as { en3d: boolean }).en3d = true;
    expect(cmd.executer('toit.murSur3d')).toBe(true);
    expect(saillieArmee()).toEqual({ cle: 'm', rang });
  });

  it('la sortie du mode, le focus dans le panneau : le bouton qui l ouvre le reprend, une fois', () => {
    const { etat, cmd } = monter();
    etat.selectedKey = 'm';
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
  it('le parcours simple : la hauteur du faitage par pas et « Tourner » ecrivent le toit simple, puis le corps ; chaque geste se defait', () => {
    const { etat, cmd } = monter();
    const o = etat.objects[0] as ObjetPlan;
    const bouton = (d: Record<string, string>) => { const b = document.createElement('button'); Object.assign(b.dataset, d); return b; };
    // Hors session, rien a regler.
    expect(cmd.etat('toit.faitage').utilisable).toBe(false);
    expect(cmd.etat('toit.sens').utilisable).toBe(false);
    cmd.executer('toit.modifier');
    // Sans corps encore : le toit simple du batiment (comme les champs de l'inspecteur), saisi et fige.
    expect(cmd.etat('toit.faitage').utilisable).toBe(true);
    cmd.executer('toit.faitage', bouton({ sens: '1' }));
    expect(o.batiment?.toit?.hauteur).toBe(2.6);
    expect(o.batiment?.toitFige).toBe(true);
    cmd.executer('toit.faitage', bouton({ sens: '-1' }));
    cmd.executer('toit.faitage', bouton({ sens: '-1' }));
    expect(o.batiment?.toit?.hauteur).toBe(2.4);
    cmd.executer('toit.sens');
    expect(o.batiment?.toit?.angleFaitage).toBe(90);
    expect(o.batiment?.corpsToit).toBeUndefined();
    cmd.executer('toit.annuler');
    expect(o.batiment?.toit?.angleFaitage).toBe(0);
    // La forme en place, touchee, decoupe le toit en corps : les memes boutons reglent alors ce corps, par la poignee du faitage et le sens.
    cmd.executer('toit.poser', bouton({ piece: 'forme:deux-pans' }));
    const c0 = o.batiment?.corpsToit?.[0];
    expect(c0).toBeDefined();
    const f0 = c0?.faitage ?? 0;
    cmd.executer('toit.faitage', bouton({ sens: '1' }));
    expect(o.batiment?.corpsToit?.[0]?.faitage).toBeCloseTo(f0 + 0.1, 6);
    expect(o.batiment?.corpsToit?.[0]?.egouts).toEqual(c0?.egouts);
    const avant = JSON.stringify(o.batiment?.corpsToit?.[0]?.pts);
    cmd.executer('toit.sens');
    expect(JSON.stringify(o.batiment?.corpsToit?.[0]?.pts)).not.toBe(avant);
    cmd.executer('toit.annuler');
    expect(JSON.stringify(o.batiment?.corpsToit?.[0]?.pts)).toBe(avant);
    // Un toit plat : ni hauteur de faitage, ni sens.
    cmd.executer('toit.poser', bouton({ piece: 'forme:plat' }));
    expect(cmd.etat('toit.faitage').utilisable).toBe(false);
    expect(cmd.etat('toit.sens').utilisable).toBe(false);
    // « Annuler » du pied (abandonner) rend le batiment tel qu'il etait a l'entree.
    modeToitCourant()?.abandonner(true);
    expect(o.batiment?.corpsToit).toBeUndefined();
    expect(o.batiment?.toit).toEqual({ forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'saisie' });
    expect(o.batiment?.toitFige).toBeUndefined();
  });
});
