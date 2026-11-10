// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TextesDossier } from '../../../src/zones/parcours/TextesDossier.js';
import { creerServiceDossier } from '../../../src/app/declaration/serviceDossier.js';
import { brancherDossier } from '../../../src/app/declaration/commandesDossier.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import type { PointRelecture } from '../../../src/export/typesRelecture.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le dossier dans le dialogue de la declaration (lot L5) : chaque piece ecrite, sa zone de texte et ses commandes, la piece en valeur ;
// la relecture, ses gravites et ses gestes ; les photographies de l'audit en vignettes.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root, hote: HTMLElement;
const attendre = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const rect = (x: number, y: number, L: number, l: number) => [{ x, y }, { x: x + L, y }, { x: x + L, y: y + l }, { x, y: y + l }];

function monter(points: PointRelecture[]) {
  const etat = { objects: [
    { key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 30, 20), cadastre: { idu: '78650000AB0123' } },
    { key: 'p', name: 'Pergola 1', type: 'polygon', fonction: 'pergola', pts: rect(2, 2, 4, 3), pergola: { debord: 0.2 } },
  ] as ObjetPlan[] };
  const magasin = creerMagasin({} as Parameters<typeof creerMagasin>[0]);
  const dossier = creerServiceDossier({
    etat, pushHistory: () => {}, markDirty: () => {}, notifier: () => magasin.notifier(), toast: () => {}, maintenant: () => new Date('2026-10-30T10:00:00Z'),
    ramenerEnJpeg: async (image) => ({ image, largeur: 1, hauteur: 1 }),
    photosDeLAudit: async () => [{ image: 'data:image/jpeg;base64,QUJD', legende: 'Clôture, photo 1' }],
    relire: async () => points,
  });
  const commandes = creerRegistre();
  brancherDossier(commandes, dossier);
  act(() => racine.render(createElement(TextesDossier, { dossier, commandes, magasin, fermer: () => {} })));
  return { etat };
}

beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

describe('TextesDossier', () => {
  it('montre trois pieces, la description calculee, et valide le texte ecrit', async () => {
    const { etat } = monter([]);
    await attendre();
    expect([...hote.querySelectorAll('.pieceDossier[data-piece]')].map((p) => p.getAttribute('data-piece'))).toEqual(['description', 'notice', 'insertion', 'DP7', 'DP8']);
    const zone = hote.querySelector<HTMLTextAreaElement>('[data-piece="description"] textarea')!;
    expect(zone.value).toMatch(/^Construction de une pergola/);
    // Sans serveur, « Rediger » est grise avec sa raison, ecrite sous le groupe.
    expect(hote.querySelector<HTMLButtonElement>('[data-piece="notice"] [data-commande="export.redigerTexte"]')!.disabled).toBe(true);
    expect(hote.querySelector('[data-piece="notice"] .raisonDossier')?.textContent).toMatch(/connectez-vous/);
    act(() => { hote.querySelector<HTMLButtonElement>('[data-piece="description"] [data-commande="export.validerTexte"]')!.click(); });
    expect(etat.objects[0]!.dossier?.textes[0]).toMatchObject({ piece: 'description', valide: { texte: zone.value.trim() } });
    expect(hote.querySelector('[data-piece="description"] .etatPieceDossier')?.textContent).toMatch(/Texte validé le 30\/10\/2026/);
  });

  it('montre la relecture avec ses gravites, et les photos de l audit en vignettes qui se choisissent', async () => {
    const { etat } = monter([{ cle: 'cerfa.signature', gravite: 'a-completer', cerfa: true, texte: 'la signature du déclarant' },
      { cle: 'texte.notice.brouillon', gravite: 'alerte', cerfa: false, texte: 'Le brouillon « notice » est périmé.', geste: { commande: 'export.redigerTexte', valeur: 'notice', libelle: 'Rédiger de nouveau' } }]);
    await attendre();
    const lignes = [...hote.querySelectorAll('.pointsRelecture li')];
    expect(lignes.map((l) => l.getAttribute('data-gravite'))).toEqual(['a-completer', 'alerte']);
    expect(lignes[0]!.textContent).toMatch(/À compléterReste à compléter : la signature du déclarant\./);
    expect(lignes[1]!.querySelector('button')?.getAttribute('data-commande')).toBe('export.redigerTexte');
    const vignette = hote.querySelector<HTMLButtonElement>('[data-piece="DP7"] .vignetteDossier')!;
    expect(vignette.getAttribute('data-valeur')).toBe('DP7:audit:0');
    act(() => { vignette.click(); });
    await attendre();
    expect(etat.objects[0]!.dossier?.photos?.[0]).toMatchObject({ piece: 'DP7', image: 'data:image/jpeg;base64,QUJD' });
    expect(hote.querySelector('[data-piece="DP7"] img.photoDossier')).not.toBeNull();
  });
});
