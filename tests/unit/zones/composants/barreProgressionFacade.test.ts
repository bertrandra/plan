// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BarreProgressionFacade, type EtapeAffichee } from '../../../../src/zones/composants/BarreProgressionFacade.js';
import { creerRegistre } from '../../../../src/app/commandes.js';
import type { IdEtape } from '../../../../src/model/etapeFacade.js';

// La barre de progression de la facade (MD/spec-facade-calage-audit.md §4 ter.5) : huit segments lus sur les etats de
// l'orchestrateur, une forme et un mot par etat, les segments ouvrables lies a la commande `facade.etape`.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

const etapes: EtapeAffichee[] = [
  { id: 'preparation', etat: 'ok', resume: 'Mur de 9 × 5 m.' },
  { id: 'prises', etat: 'ok', resume: '2 photos du mur.' },
  { id: 'redressement', etat: 'ok', resume: '2 photos redressées.' },
  { id: 'assemblage', etat: 'a-confirmer', resume: 'La photo 2 reste hors de l’assemblage.' },
  { id: 'calage', etat: 'echec', resume: 'Aucun mur sur l’assemblage.' },
  { id: 'diagnostic', etat: 'saute', resume: 'Lot F4.' },
];

function monter(props: Partial<Parameters<typeof BarreProgressionFacade>[0]> = {}) {
  const ouvertes: string[] = [];
  const commandes = creerRegistre();
  commandes.declarer({ id: 'facade.etape', libelle: 'Ouvrir', groupe: 'facade', executer: (s) => { ouvertes.push(s?.dataset.etape ?? ''); } });
  act(() => { racine.render(createElement(BarreProgressionFacade, { etapes, enCours: null, ouverte: null, ouvrable: () => true, commandes, arreter: null, ...props })); });
  return { ouvertes };
}

describe('la barre de progression de la facade', () => {
  it('montre huit segments, le pire etat de chacun, en mot et en forme', () => {
    monter();
    const segments = [...hote.querySelectorAll('ol.barreFacadeSegments > li')];
    expect(segments).toHaveLength(8);
    expect(segments.map((s) => s.className.replace('barreFacadeSegment ', '').replace(' courant', ''))).toEqual(['ok', 'a-confirmer', 'echec', 'a-venir', 'a-venir', 'a-venir', 'a-venir', 'a-venir']);
    const boutons = [...hote.querySelectorAll('button[data-commande="facade.etape"]')];
    expect(boutons.map((b) => b.getAttribute('aria-label'))[2]).toBe('É5 Mur, en échec, point de validation V1');
    // Une forme par etat : la coche, le point d'exclamation, la croix ; un segment a venir n'a qu'une pastille.
    expect(segments[0]?.querySelector('svg')).not.toBeNull();
    expect(segments[5]?.querySelector('.barreFacadePastille')).not.toBeNull();
    // Le segment courant au repos : le premier qui demande un geste.
    expect(segments.findIndex((s) => s.getAttribute('aria-current') === 'step')).toBe(1);
    expect(hote.querySelector('.barreFacadeRuban')?.textContent).toBe('É3–É4 · Image · à confirmer');
  });

  it('ouvre une etape par la commande, et dit pourquoi elle echoue avec son geste de repli', () => {
    const { ouvertes } = monter();
    act(() => { (hote.querySelectorAll('button[data-commande="facade.etape"]')[2] as HTMLButtonElement).click(); });
    expect(ouvertes).toEqual(['calage']);
    monter({ ouverte: 'calage' as IdEtape });
    const lignes = [...hote.querySelectorAll('.barreFacadeLigne')].map((p) => p.textContent);
    expect(lignes[0]).toBe('É5 Calage du mur (Mur), en échec');
    expect(lignes[1]).toMatch(/^Aucun mur sur l’assemblage\. À la main : tirer les bouts, l’égout et le sol\.$/);
  });

  it('le segment « Forme » ouvre le diagnostic (V2) qui attend la personne, pas la silhouette qui ne doute que du mur', () => {
    const forme: EtapeAffichee[] = [...etapes.filter((e) => e.id !== 'calage' && e.id !== 'diagnostic'),
      { id: 'calage', etat: 'a-confirmer', resume: 'Mur à confirmer.' }, { id: 'silhouette', etat: 'a-confirmer', resume: 'Triangle. Dépend du mur à confirmer (É5).', herite: 'calage' },
      { id: 'diagnostic', etat: 'a-confirmer', resume: 'Un pignon de plus.' }];
    const { ouvertes } = monter({ etapes: forme });
    act(() => { (hote.querySelector('button[data-commande="facade.etape"][data-etape="diagnostic"]') as HTMLButtonElement | null)?.click(); });
    expect(ouvertes).toEqual(['diagnostic']);
  });

  it('dit « confirmé par vous » d un mur confirme (V1), avec sa forme', () => {
    monter({ etapes: etapes.map((e) => (e.id === 'calage' ? { ...e, etat: 'confirme' as const, resume: 'Mur confirmé par vous.' } : e)) });
    const mur = hote.querySelector('button[data-commande="facade.etape"][data-etape="calage"]');
    expect(mur?.getAttribute('aria-label')).toBe('É5 Mur, confirmé par vous, point de validation V1');
    expect(hote.querySelectorAll('ol.barreFacadeSegments > li')[2]?.className).toMatch(/confirme/);
  });

  it('avance pendant un calcul, se dit en cours, et propose d arreter', () => {
    const arreter = vi.fn();
    monter({ enCours: 'calage', arreter, etapes: etapes.slice(0, 4) });
    const courant = hote.querySelector('li[aria-current="step"]');
    expect(courant?.className).toContain('en-cours');
    expect(hote.querySelector('.barreFacadeLigne')?.textContent).toBe('É5 Calage du mur (Mur), en cours…');
    act(() => { (hote.querySelector('[data-controle="barreFacade.arreter"]') as HTMLButtonElement).click(); });
    expect(arreter).toHaveBeenCalledTimes(1);
  });

  it('ne fait que se lire sans registre, ou pour un segment que l ecran n ouvre pas', () => {
    monter({ commandes: null });
    expect(hote.querySelectorAll('button[data-commande]')).toHaveLength(0);
    expect(hote.querySelectorAll('[role="img"]')).toHaveLength(8);
    monter({ ouvrable: (s) => s.validation !== null });
    expect(hote.querySelectorAll('button[data-commande]')).toHaveLength(4);
  });
});
