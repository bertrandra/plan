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
  /** `execCommand('copy')` tel qu'un navigateur le joue : il declenche l'evenement `copy`. */
  const copieDuNavigateur = (declenche: boolean) => vi.fn(() => {
    if (!declenche) return true; // le cas trompeur : vrai, sans rien copier
    const donnees = new Map<string, string>();
    const e = new Event('copy', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(e, 'clipboardData', { value: { setData: (t: string, v: string) => donnees.set(t, v) } });
    document.dispatchEvent(e);
    (copieDuNavigateur as unknown as { dernier: Map<string, string> }).dernier = donnees;
    return true;
  });

  it('copie par l evenement copy, dans le clic : ce qui marche aussi dans un iframe sans permission', async () => {
    const exec = copieDuNavigateur(true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    const writeText = vi.fn();
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await copierTexte('https://p.r/?mode=demo')).toBe(true);
    expect((copieDuNavigateur as unknown as { dernier: Map<string, string> }).dernier.get('text/plain')).toBe('https://p.r/?mode=demo');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('ne croit pas execCommand sur parole : sans evenement copy, il passe au presse-papiers moderne', async () => {
    Object.defineProperty(document, 'execCommand', { value: copieDuNavigateur(false), configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await copierTexte('abc')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('abc');
  });

  it('dit non quand rien n a copie : l adresse sera montree a copier a la main', async () => {
    Object.defineProperty(document, 'execCommand', { value: copieDuNavigateur(false), configurable: true });
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('refus')) }, configurable: true });
    expect(await copierTexte('abc')).toBe(false);
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

describe('au doigt : l appui long ouvre le menu', () => {
  /** Un evenement de pointeur au doigt (jsdom n'a pas PointerEvent). */
  const doigt = (type: string, x: number, y: number, id = 1) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: id } });
    document.body.dispatchEvent(e);
    return e;
  };
  afterEach(() => { vi.useRealTimers(); });

  it('s ouvre apres un appui immobile d une demi-seconde, en feuille', async () => {
    vi.useFakeTimers();
    const { DUREE_APPUI_LONG_MS } = await import('../../../src/app/menuVitrine.js');
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier: vi.fn() });
    doigt('pointerdown', 100, 200);
    vi.advanceTimersByTime(DUREE_APPUI_LONG_MS - 50);
    expect(document.getElementById('menuVitrine')).toBe(null);
    vi.advanceTimersByTime(60);
    const m = document.getElementById('menuVitrine');
    expect(m?.classList.contains('menuVitrine--feuille')).toBe(true);
    expect(entrees()).toEqual(['Rafraîchir', 'Copier l’adresse']);
  });

  it('ne s ouvre pas si le doigt glisse (il fait tourner la scene)', async () => {
    vi.useFakeTimers();
    const { TOLERANCE_DOIGT_PX } = await import('../../../src/app/menuVitrine.js');
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier: vi.fn() });
    doigt('pointerdown', 100, 200);
    doigt('pointermove', 100 + TOLERANCE_DOIGT_PX + 5, 200);
    vi.advanceTimersByTime(1000);
    expect(document.getElementById('menuVitrine')).toBe(null);
  });

  it('ne s ouvre pas si le doigt se leve avant, ni a deux doigts (pincer)', () => {
    vi.useFakeTimers();
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier: vi.fn() });
    doigt('pointerdown', 100, 200);
    doigt('pointerup', 100, 200);
    vi.advanceTimersByTime(1000);
    expect(document.getElementById('menuVitrine')).toBe(null);
    doigt('pointerdown', 100, 200, 1);
    doigt('pointerdown', 200, 300, 2);
    vi.advanceTimersByTime(1000);
    expect(document.getElementById('menuVitrine')).toBe(null);
  });

  it('coupe le menu natif d Android apres l appui long, sans en ouvrir un second', () => {
    vi.useFakeTimers();
    debrancher = brancherMenuVitrine({ recharger: vi.fn(), copier: vi.fn() });
    doigt('pointerdown', 100, 200);
    vi.advanceTimersByTime(600);
    const e = menuContextuel(100, 200);
    expect(e.defaultPrevented).toBe(true);
    expect(document.querySelectorAll('#menuVitrine').length).toBe(1);
  });
});
