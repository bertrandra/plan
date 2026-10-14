// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AuditParcelle } from '../../../src/zones/parcours/AuditParcelle.js';
import { AuditCas } from '../../../src/zones/parcours/AuditCas.js';
import { creerSessionAuditParcelle } from '../../../src/app/audit/parcelle/controleur.js';
import { creerPromenade } from '../../../src/app/audit/promenade.js';
import { creerEtat } from '../../../src/core/state.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// L'ecran de l'audit de la parcelle (Z8) : la liste de controle par batiment, les gestes qui la
// remplissent, l'ecran de prise ; et « Ce que je vois », le meme composant dans la fiche de la promenade.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const quartier = (): ObjetPlan[] => [
  obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
  obj('voisine', { fonction: 'terrain', pts: rect(20, 0, 40, 30), voisinage: true }),
  obj('maison', { name: 'Maison', fonction: 'batiment', pts: rect(5, 10, 15, 20), elevation: 6 }),
  obj('chezVoisin', { name: 'Voisin', fonction: 'batiment', pts: rect(20, 5, 30, 15), elevation: 6, voisinage: true, bdtopo: { surParcellePrincipale: false } }),
];

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

function ecran(objets: ObjetPlan[] = quartier()) {
  const etat = creerEtat({ objects: objets } as never, (o) => o as never);
  const s = creerSessionAuditParcelle({ etat, idu: '78650000AE0101', ouvrir3d: vi.fn(), signaler: () => {}, stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false }, surligner: () => {}, retirerPosition: () => {} });
  const fermer = vi.fn();
  act(() => racine.render(createElement(AuditParcelle, { session: s, fermer })));
  return { s, fermer };
}
const bouton = (texte: string | RegExp) => [...hote.querySelectorAll('button')].find((b) => (typeof texte === 'string' ? b.textContent === texte || b.getAttribute('aria-label') === texte : texte.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))) as HTMLButtonElement | undefined;
const cliquer = (b: HTMLElement | undefined) => { expect(b).toBeDefined(); act(() => b?.click()); };

describe('la liste de controle', () => {
  it('montre les batiments de la parcelle, la parcelle, puis les mitoyens a part, et le compteur', () => {
    ecran();
    expect(hote.querySelector('.titreParcours')?.textContent).toBe('Audit de la parcelle');
    expect(hote.querySelector('.compteurAudit')?.textContent).toMatch(/^0 façade sur \d+, toit à voir, clôture à faire, portail à faire$/);
    const titres = [...hote.querySelectorAll('.titreBatimentAudit')].map((h) => h.textContent);
    expect(titres).toEqual(['Maison', 'La parcelle', 'Voisinmitoyen']);
    // Les mitoyens sont replies, facultatifs.
    const voisins = hote.querySelector('details.voisinsAudit');
    expect(voisins?.querySelector('summary')?.textContent).toBe('Bâtiments voisins, facultatif (1)');
    expect(voisins?.querySelector('.titreBatimentAudit')?.textContent).toBe('Voisinmitoyen');
    expect(bouton('Lancer l’analyse')?.disabled).toBe(true);
    expect(hote.textContent).toContain('Photographiez au moins une façade pour lancer l’analyse.');
  });

  it('marque une facade inaccessible d une touche, et la rend', () => {
    ecran();
    const b = bouton(/^Marquer inaccessible : Façade sud .* de Maison$/);
    cliquer(b);
    const ligne = [...hote.querySelectorAll('.ligneAudit')].find((li) => li.textContent?.startsWith('Façade sud'));
    expect(ligne?.textContent).toContain('Inaccessible');
    cliquer(bouton(/^Rendre accessible : Façade sud .* de Maison$/));
    expect(ligne?.textContent).toContain('À photographier');
  });

  it('note le toit avec « Ce que je vois », et la ligne passe a « Vu »', () => {
    const { s } = ecran();
    cliquer(bouton('Noter : Toit de Maison'));
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="vu.forme"]')].find((b) => b.textContent === 'Deux pans'));
    expect(s.capture.lire().batiments.maison?.vu).toEqual({ forme: 'deux-pans' });
    expect(hote.textContent).toContain('Vu · Deux pans');
    // Toucher le choix retenu le retire : on n'affirme que ce que l'on a vu.
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="vu.forme"]')].find((b) => b.textContent === 'Deux pans'));
    expect(s.capture.lire().batiments.maison?.vu).toEqual({});
  });

  it('note la cloture cote rue', () => {
    const { s } = ecran();
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="auditParcelle.noter"]')].find((b) => b.textContent?.startsWith('Clôture côté rue')));
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="auditParcelle.typeCloture"]')].find((b) => b.textContent === 'Mur'));
    expect(s.capture.lire().cloture.type).toBe('mur');
    expect(hote.textContent).toContain('Notée · Mur');
    expect(hote.querySelector('.compteurAudit')?.textContent).toContain('clôture notée');
  });

  it('ouvre l ecran de prise sur la facade choisie, et revient a la liste', () => {
    const { s } = ecran();
    cliquer(bouton(/^Photographier : Façade nord .* de Maison$/));
    expect(s.ecran()).toBe('prise');
    expect(hote.querySelector('.auditPrise .titreParcours')?.textContent).toBe('Photo pour la façade nord de Maison (choisie) — 0 photo');
    expect(hote.querySelector<HTMLInputElement>('input[data-controle="auditParcelle.photo"]')?.disabled).toBe(false);
    cliquer(bouton('Liste'));
    expect(s.ecran()).toBe('liste');
  });

  it('dit qu il attend la position sur l ecran de prise, sans facade a viser', () => {
    const { s } = ecran();
    cliquer(bouton('Photographier en marchant'));
    expect(hote.querySelector('.auditPrise .titreParcours')?.textContent).toBe('En attente de votre position…');
    expect(hote.querySelector<HTMLInputElement>('input[data-controle="auditParcelle.photo"]')?.disabled).toBe(true);
    expect(bouton('Ce n’est pas cette façade')?.disabled).toBe(true);
    expect(s.cible()).toBeNull();
  });
});

describe('ce qui manque', () => {
  it('rend deux facades de meme orientation sans cle React en double', () => {
    // Une maison en L : deux murs regardent l'est, et leurs lignes de « Ce qui manque » ont le meme texte.
    const L: PtBrut[] = [{ x: 5, y: 10 }, { x: 15, y: 10 }, { x: 15, y: 15 }, { x: 10, y: 15 }, { x: 10, y: 20 }, { x: 5, y: 20 }];
    const objets = [quartier()[0]!, obj('maison', { name: 'Maison', fonction: 'batiment', pts: L, elevation: 6 })];
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { s } = ecran(objets);
      // La liste « Ce qui manque » n'apparait qu'une fois une facade photographiee.
      act(() => { s.capture.ajouterPhotoFacade('maison', 0, { type: 'image/jpeg', base64: 'AAAA' }); });
      const lignes = [...hote.querySelectorAll('.manquesAudit li')].map((li) => li.textContent);
      expect(lignes.filter((t) => t === 'façade est de Maison : pas de photo')).toHaveLength(2);
      expect(erreurs.mock.calls.filter((c) => c.some((a) => typeof a === 'string' && /same key/.test(a)))).toEqual([]);
    } finally {
      erreurs.mockRestore();
    }
  });
});

describe('« Ce que je vois » dans la fiche de la promenade', () => {
  it('est le meme composant, facultatif, et s ecrit dans le cas', () => {
    const promenade = creerPromenade({ figer: () => ({ identite: { cleBdtopo: 'X', idu: null, adresse: '2 allée des Limites' }, entrees: { pts: [], bdtopo: null, grille: null, voisins: [] }, sorties: {} as never }) });
    promenade.marquer('b1', { x: 0, y: 0 }, 5);
    act(() => racine.render(createElement(AuditCas, { promenade, cle: 'b1', retirer: () => {}, prise: () => null, fermer: () => {} })));
    expect(hote.querySelector('.sectionVu summary')?.textContent).toBe('Ce que je vois (facultatif)');
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="vu.cheminees"]')].find((b) => b.textContent === '2'));
    expect(promenade.cas('b1')?.vu).toEqual({ cheminees: { nombre: 2, souches: [{}, {}] } });
    expect(hote.querySelectorAll('.soucheVue')).toHaveLength(2);
    // Revenir a rien retire la section du cas : le fichier n'ecrit pas de section vide.
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="vu.cheminees"]')].find((b) => b.textContent === '2'));
    expect(promenade.cas('b1')).not.toHaveProperty('vu');
  });
});
