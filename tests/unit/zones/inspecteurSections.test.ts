// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { Inspecteur } from '../../../src/zones/Inspecteur.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { droits } from '../app/ecouteurs/faux.js';
import type { Inspecteur as ServiceInspecteur } from '../../../src/app/inspecteur.js';
import type { ContexteChamps, Section } from '../../../src/ui/champs/types.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Une seule section de l'inspecteur est ouverte a la fois : a l'ouverture, la premiere qui n'est pas
// repliee d'office ; ouvrir une section replie les autres ; le titre replie la section ouverte, ou
// ouvre la premiere ; passer a un autre objet garde la section que l'utilisateur a laissee ouverte.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const rien = () => undefined;
const champ = (cle: string) => ({ type: 'texte', cle, libelle: cle, lire: () => '', ecrire: rien });
const section = (id: string, repliee = false): Section => ({ id, titre: id, ...(repliee ? { repliee } : {}), champs: [champ(id + '.a')] } as unknown as Section);

function monter(sectionsDe: (o: ObjetPlan) => Section[], replier = false) {
  const a = { key: 'a', name: 'A', type: 'polygon', fonction: 'autre', pts: [] } as unknown as ObjetPlan;
  const b = { key: 'b', name: 'B', type: 'polygon', fonction: 'autre', pts: [] } as unknown as ObjetPlan;
  const etat = { objects: [a, b], selectedKey: 'a' } as unknown as EtatApp;
  const magasin = creerMagasin(etat);
  if (replier) (magasin as unknown as { store: { setState: (s: object) => void } }).store.setState({ sectionsRepliees: true });
  let courant = a;
  const service = {
    objet: () => courant, contexte: (o: ObjetPlan) => ({ etat, obj: o, commandeUtilisable: () => true }) as unknown as ContexteChamps,
    titre: () => courant.name, sections: (c: ContexteChamps) => sectionsDe(c.obj as ObjetPlan),
    appliquer: () => true, executer: rien, basculerOuverture: rien
  } as unknown as ServiceInspecteur;
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  const rendre = () => act(() => { racine.render(createElement(Inspecteur, { magasin, commandes: creerRegistre(droits(true)), inspecteur: service })); });
  rendre();
  const ouvertes = () => [...hote.querySelectorAll<HTMLDetailsElement>('details.inspecteurSection')].filter(d => d.open).map(d => d.dataset.section);
  const details = (id: string) => hote.querySelector<HTMLDetailsElement>('details[data-section="' + id + '"]')!;
  /** L'evenement toggle du navigateur suit le changement de `open` ; jsdom ne l'envoie pas. */
  const basculer = (id: string, open: boolean) => act(() => { const d = details(id); d.open = open; d.dispatchEvent(new Event('toggle')); });
  const selectionner = (o: 'a' | 'b') => { courant = o === 'a' ? a : b; rendre(); };
  return { racine, hote, ouvertes, basculer, selectionner, details };
}

describe('les sections de l inspecteur', () => {
  let m: ReturnType<typeof monter> | null = null;
  afterEach(() => { if (m) { const x = m; act(() => x.racine.unmount()); x.hote.remove(); m = null; } });

  it('s ouvrent une a la fois, la premiere non repliee a l ouverture', () => {
    m = monter(() => [section('cotes', true), section('objet'), section('lames'), section('prix', true)]);
    expect(m.ouvertes()).toEqual(['objet']);
    m.basculer('lames', true);
    expect(m.ouvertes()).toEqual(['lames']);
    m.basculer('prix', true);
    expect(m.ouvertes()).toEqual(['prix']);
  });

  it('le titre replie la section ouverte, puis rouvre la premiere', () => {
    m = monter(() => [section('cotes', true), section('objet'), section('lames')]);
    m.basculer('lames', true);
    const titre = m.hote.querySelector<HTMLElement>('[data-controle="inspecteur.replierSections"]')!;
    act(() => titre.click());
    expect(m.ouvertes()).toEqual([]);
    act(() => titre.click());
    expect(m.ouvertes()).toEqual(['objet']);
  });

  it('garde la section laissee ouverte d un objet a l autre, sans en ouvrir une seconde', () => {
    m = monter((o) => o.key === 'a' ? [section('objet'), section('lames')] : [section('facades'), section('objet'), section('lames')]);
    m.basculer('lames', true);
    m.selectionner('b');
    expect(m.ouvertes()).toEqual(['lames']);
  });

  it('ouvre la premiere section de l objet suivant quand il n a pas celle laissee ouverte', () => {
    m = monter((o) => o.key === 'a' ? [section('objet'), section('lames')] : [section('objet'), section('facades')]);
    m.basculer('lames', true);
    m.selectionner('b');
    expect(m.ouvertes()).toEqual(['objet']);
  });

  it('avec la preference « repliees », s ouvrent toutes fermees', () => {
    m = monter(() => [section('objet'), section('lames')], true);
    expect(m.ouvertes()).toEqual([]);
  });
});
