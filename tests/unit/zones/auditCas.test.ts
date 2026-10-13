// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PhotoCas, PrisePhoto } from '../../../src/model/audit.js';

// La fiche d'un batiment marque (Z8) a plusieurs photos : des vignettes avec leur prise de vue,
// « Ajouter une photo » jusqu'a six, « Retirer » sous chacune.

const preparerPhoto = vi.fn(async (_f: Blob, prise: PrisePhoto | null): Promise<PhotoCas> => ({ type: 'image/jpeg', base64: 'NOUVELLE', ...(prise ? { prise } : {}) }));
vi.mock('../../../src/app/audit/photo.js', () => ({ preparerPhoto: (f: Blob, p: PrisePhoto | null) => preparerPhoto(f, p) }));

const { AuditCas, textePrise, texteOptique } = await import('../../../src/zones/parcours/AuditCas.js');
const { creerPromenade } = await import('../../../src/app/audit/promenade.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PRISE: PrisePhoto = {
  t: '2026-10-13T09:00:00Z', x: 1, y: 2, lat: 48.9, lon: 2.13, precisionM: 5, azimutDeg: 245, sourceAzimut: 'boussole',
  inclinaisonDeg: 4, roulisDeg: 3, focale35: 26, champDeg: 69.4, sourceFocale: 'exif', modeleAppareil: 'iPhone 13',
};

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); preparerPhoto.mockClear(); });

function fiche(nPhotos: number) {
  const promenade = creerPromenade({ figer: () => ({ identite: { cleBdtopo: 'X', idu: null, adresse: '2 allée des Limites' }, entrees: { pts: [], bdtopo: null, grille: null, voisins: [] }, sorties: {} as never }) });
  promenade.marquer('b1', { x: 0, y: 0 }, 5);
  for (let i = 0; i < nPhotos; i++) promenade.completer('b1', { ajouterPhoto: { type: 'image/jpeg', base64: 'P' + i, prise: PRISE } });
  act(() => racine.render(createElement(AuditCas, { promenade, cle: 'b1', retirer: () => {}, prise: () => PRISE, fermer: () => {} })));
  return promenade;
}
const vignettes = () => hote.querySelectorAll('.photosAudit li');
const champPhoto = () => hote.querySelector<HTMLInputElement>('input[data-controle="audit.photo"]');

describe('la fiche a plusieurs photos', () => {
  it('montre six vignettes avec leur prise de vue, et n en propose pas de septieme', () => {
    fiche(6);
    expect(vignettes()).toHaveLength(6);
    expect(hote.textContent).toContain('Photos (6 sur 6)');
    expect(vignettes()[0]!.textContent).toContain('Prise à ± 5 m, vers 245° (OSO), boussole');
    expect(vignettes()[0]!.textContent).toContain('Objectif 26 mm (69°), lu dans la photo · visée 4° vers le haut, penchée de 3° à droite');
    expect(champPhoto()).toBeNull();
    expect(hote.textContent).toContain('Six photos au plus');
  });

  it('retire la photo choisie, et propose d en ajouter une autre', () => {
    const p = fiche(6);
    const retirer = vignettes()[1]!.querySelector<HTMLButtonElement>('button[data-controle="audit.retirerPhoto"]')!;
    expect(retirer.getAttribute('aria-label')).toBe('Retirer la photo 2');
    act(() => retirer.click());
    expect(p.cas('b1')!.constat.photos.map((x) => x.base64)).toEqual(['P0', 'P2', 'P3', 'P4', 'P5']);
    expect(vignettes()).toHaveLength(5);
    expect(champPhoto()).not.toBeNull();
    expect(hote.textContent).toContain('Ajouter une photo');
  });

  it('ajoute la photo prise a la suite, avec la prise de vue relevee au retour de l appareil', async () => {
    const p = fiche(0);
    expect(hote.textContent).toContain('Prendre une photo');
    const champ = champPhoto()!;
    Object.defineProperty(champ, 'files', { value: [new File([new Uint8Array([1])], 'p.jpg', { type: 'image/jpeg' })], configurable: true });
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    expect(preparerPhoto).toHaveBeenCalledOnce();
    expect(preparerPhoto.mock.calls[0]![1]).toBe(PRISE);
    expect(p.cas('b1')!.constat.photos.map((x) => x.base64)).toEqual(['NOUVELLE']);
    expect(vignettes()).toHaveLength(1);
  });
});

describe('le texte de prise sous une photo', () => {
  it('dit la source de la focale et l attitude ; rien pour une photo de version 1', () => {
    expect(textePrise(PRISE)).toBe('Prise à ± 5 m, vers 245° (OSO), boussole');
    expect(texteOptique({ ...PRISE, sourceFocale: 'appareil' })).toBe('Objectif 26 mm (69°), retenu pour iPhone 13 · visée 4° vers le haut, penchée de 3° à droite');
    expect(texteOptique({ ...PRISE, sourceFocale: 'defaut', focale35: 27.2, champDeg: 67, inclinaisonDeg: -6, roulisDeg: -1 })).toBe('Champ estimé à 67° (focale inconnue) · visée 6° vers le bas');
    expect(texteOptique({ ...PRISE, inclinaisonDeg: 1, roulisDeg: -5 })).toBe('Objectif 26 mm (69°), lu dans la photo · visée d’aplomb, penchée de 5° à gauche');
    const v1: PrisePhoto = { t: PRISE.t, x: 1, y: 2, lat: null, lon: null, precisionM: 5, azimutDeg: 245, sourceAzimut: 'boussole' };
    expect(texteOptique(v1)).toBe('');
  });
});
