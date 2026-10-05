// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { brancherMenuVitrine, copierTexte, TOLERANCE_GLISSER_PX } from '../../../src/app/menuVitrine.js';

// Le clic droit de la vitrine : rafraichir, copier l'adresse. Le bouton droit sert aussi a deplacer
// la scene : un clic droit qui a glisse n'ouvre rien.

let debrancher: (() => void) | null = null;
afterEach(() => { debrancher?.(); debrancher = null; document.body.innerHTML = ''; vi.unstubAllGlobals(); });

const appui = (x: number, y: number) => document.dispatchEvent(Object.assign(new MouseEvent('pointerdown', { bubbles: true, button: 2, clientX: x, clientY: y })));
const menuContextuel = (x: number, y: number) => {
  const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y });
  document.dispatchEvent(e);
  return e;
};
const entrees = () => [...document.querySelectorAll('#menuVitrine [role=menuitem]')].map((b) => b.textContent);

describe('le menu du clic droit de la vitrine', () => {
  it('s ouvre sur un clic droit, a la place de celui du navigateur', () => {
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier: vi.fn() });
    appui(100, 100);
    const e = menuContextuel(101, 100);
    expect(e.defaultPrevented).toBe(true);
    expect(entrees()).toEqual(['Rafraîchir', 'Copier l’adresse']);
  });

  it('ne s ouvre pas apres un glisser du bouton droit (deplacement de la scene)', () => {
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier: vi.fn() });
    appui(100, 100);
    menuContextuel(100 + TOLERANCE_GLISSER_PX + 20, 100);
    expect(document.getElementById('menuVitrine')).toBe(null);
  });

  it('Rafraichir recharge la vitrine', () => {
    const recharger = vi.fn();
    debrancher = brancherMenuVitrine({ recharger, copier: vi.fn() });
    menuContextuel(10, 10);
    (document.querySelector('#menuVitrine [role=menuitem]') as HTMLButtonElement).click();
    expect(recharger).toHaveBeenCalledOnce();
    expect(document.getElementById('menuVitrine')).toBe(null);
  });

  it('Copier l adresse copie l adresse de la vitrine, parametres compris, et le dit', async () => {
    const copier = vi.fn().mockResolvedValue(true);
    const url = 'https://plan.raillard.org/?mode=demo&file=2&x=1024&y=768';
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier, adresse: () => url });
    menuContextuel(10, 10);
    (document.querySelectorAll('#menuVitrine [role=menuitem]')[1] as HTMLButtonElement).click();
    await Promise.resolve(); await Promise.resolve();
    expect(copier).toHaveBeenCalledWith(url);
    expect(entrees()).toContain('Adresse copiée');
  });

  it('montre l adresse a copier a la main si le presse-papiers est refuse', async () => {
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier: vi.fn().mockResolvedValue(false), adresse: () => 'https://x/?mode=demo' });
    menuContextuel(10, 10);
    (document.querySelectorAll('#menuVitrine [role=menuitem]')[1] as HTMLButtonElement).click();
    await Promise.resolve(); await Promise.resolve();
    expect((document.querySelector('.menuVitrineAdresse') as HTMLInputElement).value).toBe('https://x/?mode=demo');
  });

  it('se ferme par Echap, et par un clic ailleurs', () => {
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier: vi.fn() });
    menuContextuel(10, 10);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('menuVitrine')).toBe(null);
    menuContextuel(10, 10);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(document.getElementById('menuVitrine')).toBe(null);
  });
});

describe('copier un texte', () => {
  it('passe par le presse-papiers quand il est permis', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await copierTexte('abc')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('abc');
  });

  it('retombe sur la copie par selection quand il est refuse (cadre sans clipboard-write)', async () => {
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('refus')) }, configurable: true });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    expect(await copierTexte('abc')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBe(null);
  });
});

describe('les reglages du clic droit : date du soleil, rotation automatique', () => {
  const reglages = () => {
    const r = { d: '2026-06-21', v: null as number | null };
    return {
      r,
      api: {
        date: () => r.d, poserDate: vi.fn((d: string) => { r.d = d; }),
        rotation: () => r.v, poserRotation: vi.fn((v: number | null) => { r.v = v; })
      }
    };
  };

  it('montre la date du soleil dans un calendrier, et la pose', () => {
    const { api } = reglages();
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier: vi.fn(), reglages: api });
    menuContextuel(10, 10);
    const champ = document.getElementById('menuVitrineDate') as HTMLInputElement;
    expect(champ.type).toBe('date');
    expect(champ.value).toBe('2026-06-21');
    champ.value = '2026-12-21';
    champ.dispatchEvent(new Event('change'));
    expect(api.poserDate).toHaveBeenCalledWith('2026-12-21');
  });

  it('lance la rotation a un tour par minute, puis a la vitesse saisie, et l arrete', () => {
    const { api } = reglages();
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier: vi.fn(), reglages: api });
    menuContextuel(10, 10);
    const actif = document.getElementById('menuVitrineRotation') as HTMLInputElement;
    const vitesse = document.getElementById('menuVitrineVitesse') as HTMLInputElement;
    expect(actif.checked).toBe(false);
    actif.checked = true; actif.dispatchEvent(new Event('change'));
    expect(api.poserRotation).toHaveBeenLastCalledWith(1);
    vitesse.value = '-2.5'; vitesse.dispatchEvent(new Event('input'));
    expect(api.poserRotation).toHaveBeenLastCalledWith(-2.5);
    actif.checked = false; actif.dispatchEvent(new Event('change'));
    expect(api.poserRotation).toHaveBeenLastCalledWith(null);
  });

  it('saisir une vitesse coche la rotation ; un clic dans le menu ne le ferme pas', () => {
    const { api } = reglages();
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier: vi.fn(), reglages: api });
    menuContextuel(10, 10);
    const vitesse = document.getElementById('menuVitrineVitesse') as HTMLInputElement;
    vitesse.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(document.getElementById('menuVitrine')).not.toBe(null);
    vitesse.value = '3'; vitesse.dispatchEvent(new Event('input'));
    expect((document.getElementById('menuVitrineRotation') as HTMLInputElement).checked).toBe(true);
    expect(api.poserRotation).toHaveBeenLastCalledWith(3);
  });
});
