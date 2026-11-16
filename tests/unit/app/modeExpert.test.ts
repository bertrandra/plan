import { describe, it, expect } from 'vitest';
import { creerRegistre, PHRASE_MODE_EXPERT } from '../../../src/app/commandes.js';
import { EXPOSITION, MODE_EXPERT } from '../../../src/app/exposition.js';
import { CONTROLES } from '../../../src/app/controlesInterface.js';
import { lireModeExpert, ecrireModeExpert, controleMontre, brancherModeExpert, CLE_MODE_EXPERT } from '../../../src/app/modeExpert.js';
import { creerMagasin, OPTIONS_PAR_DEFAUT } from '../../../src/app/magasin.js';
import { champsVisibles, type Champ, type ContexteChamps, type Section } from '../../../src/ui/champs/types.js';
import type { EtatApp } from '../../../src/core/state.js';

// Le mode expert (lot 3 de la simplification de l'interface) : une preference de l'appareil, eteinte par defaut, qui cache les
// formats techniques, les constantes de calcul et les reglages fins de la 3D, et les rend tous quand on l'allume.

function stockage(depart: Record<string, string> = {}) {
  const m = new Map(Object.entries(depart));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

describe('le mode expert', () => {
  it('est eteint par defaut, et quand le stockage est refuse', () => {
    expect(OPTIONS_PAR_DEFAUT.modeExpert).toBe(false);
    expect(lireModeExpert(stockage())).toBe(false);
    expect(lireModeExpert(null)).toBe(false);
    expect(lireModeExpert({ getItem: () => { throw new Error('refuse'); } })).toBe(false);
    expect(lireModeExpert(stockage({ [CLE_MODE_EXPERT]: 'oui' }))).toBe(true);
  });

  it('s ecrit dans le navigateur, et un stockage refuse ne leve pas', () => {
    const s = stockage();
    ecrireModeExpert(true, s);
    expect(s.m.get(CLE_MODE_EXPERT)).toBe('oui');
    ecrireModeExpert(false, s);
    expect(s.m.get(CLE_MODE_EXPERT)).toBe('non');
    expect(() => ecrireModeExpert(true, { setItem: () => { throw new Error('refuse'); } })).not.toThrow();
  });

  it('se pose au branchement, suit chaque bascule et redessine les zones, sans toucher au projet', () => {
    const s = stockage({ [CLE_MODE_EXPERT]: 'oui' });
    const etat = { objects: [], dirty: false } as unknown as EtatApp;
    const magasin = creerMagasin(etat);
    brancherModeExpert(magasin, s);
    expect(magasin.store.getState().options.modeExpert).toBe(true);
    const v = magasin.version();
    magasin.definirOption('modeExpert', false);
    expect(s.m.get(CLE_MODE_EXPERT)).toBe('non');
    expect(magasin.version()).toBeGreaterThan(v);
    expect(etat.dirty).toBe(false);
  });

  it('ne nomme que des commandes exposees, et ne cache ni le PDF, ni le PNG, ni le devis', () => {
    for (const id of Object.keys(MODE_EXPERT)) expect(EXPOSITION[id], id).toBeDefined();
    for (const id of ['export.pdf', 'export.png', 'export.ouvrirDevis', 'export.dossier', 'projet.enregistrer']) expect(MODE_EXPERT[id]).toBeUndefined();
  });

  it('efface ses commandes du registre tant qu il est eteint, avec ou sans plateforme, et les rend allume', () => {
    let simple = true;
    const r = creerRegistre(undefined, undefined, () => simple);
    for (const id of ['export.dxf', 'export.png']) r.declarer({ id, libelle: id, groupe: 'export', executer: () => {} });
    expect(r.etat('export.dxf')).toEqual({ utilisable: false, raison: 'capacite', message: PHRASE_MODE_EXPERT });
    expect(r.effacee('export.dxf')).toBe(true);
    expect(r.executer('export.dxf')).toBe(false);
    expect(r.etat('export.png').utilisable).toBe(true);
    simple = false;
    expect(r.etat('export.dxf').utilisable).toBe(true);
    expect(r.executer('export.dxf')).toBe(true);
  });

  it('sans predicat (tests, calibration), le registre ne cache rien', () => {
    const r = creerRegistre();
    r.declarer({ id: 'export.glb', libelle: 'GLB', groupe: 'export', executer: () => {} });
    expect(r.etat('export.glb').utilisable).toBe(true);
  });

  it('cache les champs et les sections expert de l inspecteur, et seulement en mode simple', () => {
    const lecture = (cle: string, expert?: boolean): Champ => ({ type: 'lecture', cle, libelle: cle, valeur: () => cle, ...(expert ? { expert } : {}) });
    const section: Section = { id: 's', titre: 's', champs: [lecture('a'), lecture('b', true)] };
    const sectionExpert: Section = { id: 'e', titre: 'e', expert: true, champs: [lecture('c')] };
    const c = (modeSimple?: boolean) => ({ ...(modeSimple === undefined ? {} : { modeSimple }) }) as ContexteChamps;
    expect(champsVisibles(section, c(true)).map((x) => x.cle)).toEqual(['a']);
    expect(champsVisibles(sectionExpert, c(true))).toEqual([]);
    expect(champsVisibles(section, c(false)).map((x) => x.cle)).toEqual(['a', 'b']);
    expect(champsVisibles(sectionExpert, c()).map((x) => x.cle)).toEqual(['c']);
  });

  it('cache les controles d interface fins du catalogue, et eux seulement', () => {
    const fins = Object.entries(CONTROLES).filter(([, c]) => c.expert).map(([k]) => k);
    expect(fins).toEqual(expect.arrayContaining(['vue3d.objetsOpaques', 'vue3d.facadesSansOmbres', 'vue3d.intensite', 'vue3d.appoint']));
    const simple = { options: { ...OPTIONS_PAR_DEFAUT, modeExpert: false } };
    const expert = { options: { ...OPTIONS_PAR_DEFAUT, modeExpert: true } };
    expect(controleMontre(simple, 'vue3d.objetsOpaques')).toBe(false);
    expect(controleMontre(simple, 'vue3d.ombres')).toBe(true);
    expect(controleMontre(simple, 'inconnu')).toBe(true);
    for (const k of fins) expect(controleMontre(expert, k)).toBe(true);
  });
});
