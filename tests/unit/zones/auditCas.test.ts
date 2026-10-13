// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PhotoCas, PrisePhoto } from '../../../src/model/audit.js';
import type { CouleursPhotos, EtatCouleurPhoto } from '../../../src/app/audit/couleurFacade.js';

// La fiche d'un batiment marque (Z8) a plusieurs photos : des vignettes avec leur prise de vue,
// « Ajouter une photo » jusqu'a six, « Retirer » sous chacune.

const preparerPhoto = vi.fn(async (_f: Blob, prise: PrisePhoto | null): Promise<PhotoCas> => ({ type: 'image/jpeg', base64: 'NOUVELLE', ...(prise ? { prise } : {}) }));
vi.mock('../../../src/app/audit/photo.js', () => ({ preparerPhoto: (f: Blob, p: PrisePhoto | null) => preparerPhoto(f, p) }));

const { AuditCas, textePrise, texteOptique, texteCouleurPhoto } = await import('../../../src/zones/parcours/AuditCas.js');
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

describe('la couleur de la facade sous chaque photo', () => {
  /** Un faux service : l'etat de chaque photo se pose a la main, le doigt est note. */
  function faux(etats: Map<PhotoCas, EtatCouleurPhoto>) {
    const abonnes = new Set<() => void>();
    const touchers: [number, number][] = [];
    const lire = vi.fn(async () => {});
    const couleurs: CouleursPhotos = {
      etat: (_cle, ph) => etats.get(ph) ?? null,
      lire,
      toucher: async (_cle, _ph, x, y) => { touchers.push([x, y]); return true; },
      abonner: (f) => { abonnes.add(f); return () => { abonnes.delete(f); }; },
    };
    return { couleurs, touchers, lire };
  }
  function ficheAvec(etat: (photos: PhotoCas[]) => Map<PhotoCas, EtatCouleurPhoto>) {
    const promenade = creerPromenade({ figer: () => ({ identite: { cleBdtopo: 'X', idu: null, adresse: '2 allée des Limites' }, entrees: { pts: [], bdtopo: null, grille: null, voisins: [] }, sorties: {} as never }) });
    promenade.marquer('b1', { x: 0, y: 0 }, 5);
    for (let i = 0; i < 2; i++) promenade.completer('b1', { ajouterPhoto: { type: 'image/jpeg', base64: 'P' + i, prise: PRISE } });
    const f = faux(etat(promenade.cas('b1')!.constat.photos));
    act(() => racine.render(createElement(AuditCas, { promenade, cle: 'b1', retirer: () => {}, prise: () => PRISE, couleurs: f.couleurs, fermer: () => {} })));
    return { promenade, ...f };
  }

  it('dit la couleur lue, avec sa pastille, ou pourquoi il n y en a pas', () => {
    ficheAvec(([a, b]) => new Map<PhotoCas, EtatCouleurPhoto>([
      [a!, { etat: 'lue', orientation: 'Sud', lecture: { cote: 0, couleur: '#C9B49A', source: 'automatique', photo: 0, pixels: 80 } }],
      [b!, { etat: 'sansMur', raison: 'direction' }],
    ]));
    expect(vignettes()[0]!.textContent).toContain('Façade sud : #C9B49A, lue sur la photo');
    expect(vignettes()[0]!.querySelector<HTMLElement>('.pastilleCouleur')!.style.background).toBeTruthy();
    expect(vignettes()[1]!.textContent).toContain('Sans direction de prise de vue');
    expect(hote.querySelector('.toucherFacade')).toBeNull();
  });

  it('demande de toucher la facade ; le doigt sur la photo donne sa place', async () => {
    const { touchers } = ficheAvec(([, b]) => new Map<PhotoCas, EtatCouleurPhoto>([[b!, { etat: 'toucher', cote: 2, orientation: 'Ouest', raison: 'ambigu' }]]));
    const panneau = hote.querySelector('.toucherFacade')!;
    expect(panneau.textContent).toContain('Touchez la façade ouest sur la photo');
    expect(panneau.textContent).toContain('La lecture automatique n’a pas conclu');
    const bouton = panneau.querySelector<HTMLButtonElement>('button[data-controle="audit.toucherFacade"]')!;
    const img = bouton.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('data:image/jpeg;base64,P1');
    img.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 300, right: 500, bottom: 350, x: 100, y: 50, toJSON: () => ({}) });
    await act(async () => { bouton.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 200, clientY: 200 })); await Promise.resolve(); });
    expect(touchers).toEqual([[0.25, 0.5]]);
    // Au clavier, un clic n'a pas de point : rien n'est lu.
    await act(async () => { bouton.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); await Promise.resolve(); });
    expect(touchers).toHaveLength(1);
  });

  it('« Plus tard » range le panneau ; « Toucher la façade » le rappelle', () => {
    ficheAvec(([, b]) => new Map<PhotoCas, EtatCouleurPhoto>([[b!, { etat: 'toucher', cote: 2, orientation: 'Ouest', raison: 'marche' }]]));
    act(() => hote.querySelector<HTMLButtonElement>('button[data-controle="audit.toucherPlusTard"]')!.click());
    expect(hote.querySelector('.toucherFacade')).toBeNull();
    const rappel = vignettes()[1]!.querySelector<HTMLButtonElement>('button[data-controle="audit.toucherPhoto"]')!;
    expect(rappel.getAttribute('aria-label')).toBe('Toucher la façade sur la photo 2');
    act(() => rappel.click());
    expect(hote.querySelector('.toucherFacade')!.textContent).toContain('sens de la marche');
  });

  it('lance la lecture de la couleur apres une photo prise', async () => {
    const { lire, promenade } = ficheAvec(() => new Map());
    const champ = champPhoto()!;
    Object.defineProperty(champ, 'files', { value: [new File([new Uint8Array([1])], 'p.jpg', { type: 'image/jpeg' })], configurable: true });
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    expect(lire).toHaveBeenCalledWith('b1', promenade.cas('b1')!.constat.photos[2]);
  });

  it('dit la source de la couleur', () => {
    expect(texteCouleurPhoto({ etat: 'lecture' })).toBe('Couleur de la façade : lecture…');
    expect(texteCouleurPhoto({ etat: 'lue', orientation: null, lecture: { cote: 0, couleur: '#AABBCC', source: 'toucher', photo: 0, pixels: 9 } })).toBe('Façade : #AABBCC, lue au toucher');
  });
});
