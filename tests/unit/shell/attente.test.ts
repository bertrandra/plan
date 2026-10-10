// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { attente } from '../../../src/shell/attente.js';
import { Attente } from '../../../src/zones/Attente.js';

// La roue d'attente au centre de l'ecran (shell/attente.ts, zones/Attente.tsx) : pendant la creation
// d'un plan depuis une adresse et l'actualisation IGN, avec le texte de l'etape.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { attente.poser('a', null); attente.poser('b', null); });

describe('attente', () => {
  it('montre la derniere etape declaree, et s efface quand le dernier travail se retire', () => {
    expect(attente.etat().message).toBeNull();
    attente.poser('a', 'Recherche de la parcelle…');
    expect(attente.etat().message).toBe('Recherche de la parcelle…');
    attente.poser('b', 'Actualisation IGN : le relief du terrain…');
    expect(attente.etat().message).toBe('Actualisation IGN : le relief du terrain…');
    // Une nouvelle etape du premier travail repasse devant.
    attente.poser('a', 'Forme des toits sur le LiDAR HD…');
    expect(attente.etat().message).toBe('Forme des toits sur le LiDAR HD…');
    attente.poser('a', null);
    expect(attente.etat().message).toBe('Actualisation IGN : le relief du terrain…');
    attente.poser('b', null);
    expect(attente.etat().message).toBeNull();
  });

  it('ne previent ses abonnes que d un changement, et rend le meme etat tant que rien ne bouge', () => {
    let n = 0;
    const fin = attente.abonner(() => { n++; });
    const avant = attente.etat();
    attente.poser('a', null);
    expect(n).toBe(0);
    expect(attente.etat()).toBe(avant);
    attente.poser('a', 'x');
    expect(n).toBe(1);
    fin();
    attente.poser('a', null);
    expect(n).toBe(1);
  });

  it('la zone dessine la roue et le texte au centre, et rien quand rien n attend', () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    act(() => { racine.render(createElement(Attente)); });
    expect(hote.querySelector('.attente')).toBeNull();
    act(() => { attente.poser('a', 'Création du projet…'); });
    const statut = hote.querySelector('[role="status"].attente');
    expect(statut).not.toBeNull();
    expect(statut!.querySelector('.attenteRoue')!.getAttribute('aria-hidden')).toBe('true');
    expect(statut!.textContent).toBe('Création du projet…');
    act(() => { attente.poser('a', null); });
    expect(hote.querySelector('.attente')).toBeNull();
    act(() => { racine.unmount(); });
  });
});
