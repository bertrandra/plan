// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { attente } from '../../../src/shell/attente.js';
import { Attente } from '../../../src/zones/Attente.js';
import { chargement, finChargementApresRendu } from '../../../src/shell/chargement.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('un message vide : la roue seule, sans carte ni texte (l ouverture d un fichier lourd)', () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    act(() => { racine.render(createElement(Attente)); });
    act(() => { attente.poser('a', ''); });
    const statut = hote.querySelector('[role="status"].attente');
    expect(statut!.getAttribute('aria-label')).toBe('Chargement');
    expect(statut!.querySelector('.attenteRoue')).not.toBeNull();
    expect(statut!.querySelector('.attenteCarte')).toBeNull();
    expect(statut!.textContent).toBe('');
    act(() => { attente.poser('a', null); });
    act(() => { racine.unmount(); });
  });
});

describe('la roue du chargement (index.html, shell/chargement.ts)', () => {
  it('est dans la page avant le programme, avec son style en ligne et sans message', () => {
    const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');
    expect(html).toMatch(/<div id="chargementInitial" role="status" aria-label="Chargement"><span><\/span><\/div>/);
    expect(html).toMatch(/#chargementInitial span\{[^}]*animation:chargementTourne/);
    expect(html).toMatch(/prefers-reduced-motion: reduce\)\{ #chargementInitial span/);
  });
  it('se retire, se remet une seule fois, et se retire apres l image suivante', async () => {
    document.body.innerHTML = '<div id="chargementInitial"><span></span></div>';
    chargement(false);
    expect(document.getElementById('chargementInitial')).toBeNull();
    chargement(true); chargement(true);
    expect(document.querySelectorAll('#chargementInitial')).toHaveLength(1);
    expect(document.getElementById('chargementInitial')!.getAttribute('aria-label')).toBe('Chargement');
    finChargementApresRendu();
    expect(document.getElementById('chargementInitial')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 60));
    expect(document.getElementById('chargementInitial')).toBeNull();
  });
});
