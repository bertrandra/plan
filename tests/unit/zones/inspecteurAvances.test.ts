// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { Inspecteur } from '../../../src/zones/Inspecteur.js';
import { creerMagasin, brancherModeExpert } from '../../../src/app/magasin.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { droits } from '../app/ecouteurs/faux.js';
import type { Inspecteur as ServiceInspecteur } from '../../../src/app/inspecteur.js';
import type { Champ, ContexteChamps, Section } from '../../../src/ui/champs/types.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Audit de l'inspecteur, decision B1 : au pied d'une section, le rappel des reglages que le mode simple cache, et de quoi les montrer.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const rien = () => undefined;

function monter(sections: Section[], modeExpert = false, classe = 'large') {
  const obj = { key: 'a', name: 'A', type: 'polygon', fonction: 'autre', pts: [] } as unknown as ObjetPlan;
  const etat = { objects: [obj], selectedKey: 'a', highlight: {} } as unknown as EtatApp;
  const magasin = creerMagasin(etat);
  (magasin as unknown as { definirClasse?: (c: string) => void }).definirClasse?.(classe);
  // Le mode expert se branche comme au demarrage : chaque bascule redessine les zones (sans toucher au stockage du navigateur).
  const ecrits: string[] = [];
  brancherModeExpert(magasin, { getItem: () => (modeExpert ? 'oui' : 'non'), setItem: (_k, v) => { ecrits.push(v); } });
  const service = {
    objet: () => obj,
    contexte: (o: ObjetPlan) => ({ etat, obj: o, objets: [o], commandeUtilisable: () => true, modeSimple: !magasin.store.getState().options.modeExpert }) as unknown as ContexteChamps,
    titre: () => obj.name, sections: () => sections, appliquer: () => true, executer: rien, basculerOuverture: rien
  } as unknown as ServiceInspecteur;
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  act(() => { racine.render(createElement(Inspecteur, { magasin, commandes: creerRegistre(droits(true)), inspecteur: service })); });
  const rappels = () => [...hote.querySelectorAll<HTMLElement>('[data-controle="inspecteur.reglagesAvances"]')];
  return { hote, magasin, etat, ecrits, rappels, fermer: () => { act(() => racine.unmount()); hote.remove(); } };
}

const lecture = (cle: string, expert = false): Champ => ({ type: 'lecture', cle, libelle: cle, valeur: () => cle, ...(expert ? { expert } : {}) });
const sections = (): Section[] => [
  { id: 'objet', titre: 'Objet', champs: [lecture('a')] },
  { id: 'structure', titre: 'Structure', champs: [lecture('b'), lecture('c', true), lecture('d', true), { ...lecture('e', true), visible: () => false }, { ...lecture('f', true), resteMontre: () => true }] },
  { id: 'parametres', titre: 'Paramètres de calcul', expert: true, champs: [lecture('k')] }
];

describe('le rappel des reglages avances, au pied d une section (B1)', () => {
  let m: ReturnType<typeof monter> | null = null;
  afterEach(() => { m?.fermer(); m = null; });

  it('en mode simple : le nombre de reglages caches, et le bouton qui allume le mode expert', () => {
    m = monter(sections());
    // « Structure » en cache deux : le troisieme ne se montrerait pas non plus en expert, le quatrieme reste montre (une valeur
    // reglee, une alerte). La section entiere du mode expert se dit au pied du panneau.
    expect(m.rappels().map(x => x.querySelector('span')!.textContent)).toEqual(['2 réglages avancés', 'Paramètres de calcul : 1 réglage avancé']);
    expect(m.rappels()[0]!.closest('details')?.dataset.section).toBe('structure');
    expect(m.rappels()[1]!.closest('.inspecteurPied')).not.toBeNull();
    expect(m.hote.querySelector('.champ[data-cle="c"]')).toBeNull();
    expect(m.hote.querySelector('.champ[data-cle="f"]')).not.toBeNull();
    const bouton = m.rappels()[0]!.querySelector('button')!;
    expect(bouton.textContent).toBe('Mode expert');
    act(() => { bouton.click(); });
    // Le mode expert est allume, la preference ecrite : tout se montre, et plus aucun rappel.
    expect(m.magasin.store.getState().options.modeExpert).toBe(true);
    expect(m.ecrits).toEqual(['oui']);
    expect(m.hote.querySelector('.champ[data-cle="c"]')).not.toBeNull();
    expect(m.hote.querySelector('details[data-section="parametres"]')).not.toBeNull();
    expect(m.rappels().length).toBe(0);
    // Une preference de l'appareil : le projet n'est pas marque modifie.
    expect((m.etat as unknown as { dirty?: boolean }).dirty ?? false).toBe(false);
  });

  it('en mode expert : aucun rappel', () => {
    m = monter(sections(), true);
    expect(m.rappels().length).toBe(0);
  });

  it('une section qui ne cache rien n a pas de pied', () => {
    m = monter([{ id: 'objet', titre: 'Objet', champs: [lecture('a')] }]);
    expect(m.rappels().length).toBe(0);
  });
});
