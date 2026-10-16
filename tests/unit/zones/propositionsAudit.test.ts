// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Arbitrage, PropositionsAudit } from '../../../src/zones/parcours/PropositionsAudit.js';
import { creerSessionAuditParcelle } from '../../../src/app/audit/parcelle/controleur.js';
import { creerEtat } from '../../../src/core/state.js';
import { reponse } from '../../fixtures/audit/reponseClaude.js';
import type { ClientAnalyse, DemandeAnalyse } from '../../../src/io/analyseClaude.js';
import type { FabriqueImages } from '../../../src/app/audit/parcelle/entreesAnalyse.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// L'ecran des propositions de l'audit (Z8) apres l'analyse par Claude : ce qu'il a vu sans que le
// projet sache l'ecrire se lit en observations, sans case, sous les propositions ; « prêtes » dit
// combien de propositions et d'observations (essai d'AE 101 : « il ne trouve rien »).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const PHOTO = { type: 'image/jpeg' as const, base64: 'QUJDRA==', prise: { t: '2026-10-13T09:00:00Z', x: 10, y: 2, lat: null, lon: null, precisionM: 5, azimutDeg: 0, sourceAzimut: 'boussole' as const, champDeg: 66 } };
const IMAGES: FabriqueImages = { photo: async (p) => ({ base64: p.base64, mediaType: 'image/jpeg' }), rendu: () => null, ortho: async () => null, carte: () => null };

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

/** Une maison deja en ardoise, enduite, deux cheminees : Claude n'a rien a proposer, mais il voit des pignons et une porte. */
async function session(sortie: unknown) {
  const etat = creerEtat({ objects: [
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101' } }),
    obj('maison', { name: 'Maison', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, couverture: 'ardoise' } }),
  ] } as never, (o) => o as never);
  const demandes: DemandeAnalyse[] = [];
  const client: ClientAnalyse = {
    etat: async () => ({ actif: true, prompt: 1, schema: 1, organisation: null, admin: true }),
    creerBatch: async (d) => { demandes.push(d); return { batch: { id: 'msgbatch_1', etat: 'in_progress', compte: null }, modele: 'modele-simule', prompt: 1, schema: 1 }; },
    etatBatch: async (id) => ({ id, etat: 'ended', compte: null }),
    resultats: async (id) => ({ batch: { id, etat: 'ended', compte: null }, modele: 'modele-simule', prompt: 1, schema: 1, resultats: (demandes[0]?.requetes ?? []).map((q) => ({ id: q.id, statut: 'reussi' as const, passe: q.passe, sortie, erreur: null })) }),
    immediat: async () => { throw new Error('non'); },
  };
  const tours: (() => void)[] = [];
  const s = creerSessionAuditParcelle({
    etat, idu: '78650000AE0101', ouvrir3d: vi.fn(), signaler: () => {}, stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false }, surligner: () => {}, retirerPosition: () => {},
    mesures: { pixels: async () => null, chercherCoins: async () => ({ distorsion: null, coins: null }), jpeg: () => '', limites: () => [] },
    analyse: { client, images: IMAGES, planifier: (f) => { tours.push(f); return () => {}; } },
  });
  const cote = s.liste().batiments[0]!.facades[0]!.cote;
  s.photographier('maison', cote);
  s.rangerPhoto(PHOTO);
  s.lancerAnalyse();
  await s.analyse.accorder(true);
  tours.shift()?.();
  for (let k = 0; k < 6; k++) await new Promise((ok) => setTimeout(ok, 0));
  act(() => racine.render(createElement(PropositionsAudit, { session: s, fermer: vi.fn() })));
  return s;
}

describe('les observations de Claude dans l ecran des propositions', () => {
  it('montre les pignons, les ouvertures manquees et la porte vue, sans case, et compte ce qui est pret', async () => {
    const vu = reponse({
      couverture: { indices: [], valeur: 'ardoise' }, cheminees: { indices: [], nombre: 'indetermine', souches: [] },
      bouts: { indices: [{ image: 1, vu: 'deux murs pignons' }], gauche: 'pignon', droite: 'pignon' },
      facades: [{ ...reponse().facades[0]!, materiau: 'indetermine', ouvertures: { niveaux: 2, parNiveau: [3, 3], manquees: 1, enTrop: 0 }, ecart: 'une porte d’entrée que le modèle n’a pas' }],
    });
    const s = await session(vu);
    expect(s.analyse.etat()).toBe('prete');
    const bloc = hote.querySelector('section.observationsClaude');
    expect(bloc).not.toBeNull();
    expect(bloc?.querySelectorAll('input').length).toBe(0);
    const lignes = [...hote.querySelectorAll('.ligneObservation')].map((li) => li.textContent ?? '');
    expect(lignes.some((t) => t.startsWith('Pignons aux deux bouts du faîtage') && t.includes('vu sur : photo de la façade sud de Maison'))).toBe(true);
    expect(lignes.some((t) => t.startsWith('Façade sud : 1 ouverture non détectée par Plan'))).toBe(true);
    expect(lignes.some((t) => t.startsWith('Façade sud : une porte d’entrée que le modèle n’a pas'))).toBe(true);
    expect(hote.querySelector('.nomObservations')?.textContent).toBe('Maison');
    const n = lignes.length;
    expect(hote.querySelector('.etatAnalyse')?.textContent).toContain('Propositions de Claude prêtes : 0 proposition et ' + n + ' observations');
    expect(hote.textContent).toContain('Aucune proposition à cocher : lisez plus bas ce que Claude a vu.');
  });
});

describe('les sources d un attribut arbitre dans l ecran des propositions', () => {
  const a = {
    attribut: 'boutsToit', libelle: 'Bouts du faîtage', decision: 'manuelle' as const, raison: 'Les sources se contredisent (3,15 contre 2,4, il faut ×1,5) : Photo de façade : croupe + croupe ; LiDAR HD : pignon + pignon.', avant: 'pignon + pignon', regles: ['MARGE_AUTO_MIN', 'GAIN_CROUPES'],
    groupes: [
      { valeur: 'croupe + croupe', score: 3.15, retenu: true, lignes: [{ source: 'photo', libelle: 'Photo de façade', valeur: 'croupe + croupe', confiance: 0.9, score: 3.15, regle: 'regles/toits/silhouettes.json' }] },
      { valeur: 'pignon + pignon', score: 2.4, retenu: false, lignes: [{ source: 'lidar', libelle: 'LiDAR HD', valeur: 'pignon + pignon', confiance: 0.79, score: 2.4, regle: 'GAIN_CROUPES' }] },
    ],
  };

  it('dit la décision et sa raison, puis chaque source : ce qu’elle dit, sa confiance, son score, sa règle, et si son groupe est retenu', () => {
    act(() => racine.render(createElement(Arbitrage, { a })));
    expect(hote.querySelector('summary')?.textContent).toBe('À arbitrer · Bouts du faîtage (aujourd’hui : pignon + pignon)');
    expect(hote.querySelector('.raisonArbitrage')?.textContent).toMatch(/^Les sources se contredisent/);
    const lignes = [...hote.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    expect(lignes).toEqual([
      ['Photo de façade', 'croupe + croupe', '90 %', '3,15', 'regles/toits/silhouettes.json', 'Retenu (3,15)'],
      ['LiDAR HD', 'pignon + pignon', '79 %', '2,4', 'GAIN_CROUPES', 'Écarté (2,4)'],
    ]);
    expect(hote.querySelector('table')?.getAttribute('aria-label')).toBe('Sources : Bouts du faîtage');
  });

  it('une décision automatique se dit automatique ; une confiance absente s’écrit « — »', () => {
    act(() => racine.render(createElement(Arbitrage, { a: { ...a, decision: 'auto', groupes: [{ ...a.groupes[0]!, lignes: [{ ...a.groupes[0]!.lignes[0]!, confiance: null, regle: undefined as never }] }] } })));
    expect(hote.querySelector('.decisionArbitrage')?.textContent).toBe('Décision automatique');
    expect([...hote.querySelectorAll('tbody td')].map((td) => td.textContent).slice(2, 5)).toEqual(['—', '3,15', '—']);
  });
});
