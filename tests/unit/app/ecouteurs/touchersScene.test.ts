// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ecouterLesTouchers, TOUCHER_MS } from '../../../../src/app/ecouteurs/selection3d.js';
import { poserHote3d } from '../../../../src/three/etat3d.js';

// Le toucher de la scene, celui du mode Toit comme celui de la selection (audit de la camera, 6 novembre 2026) : un clic droit (le
// deplacement), un appui long, un pincement dont un doigt reste immobile ne sont pas des touchers.

function monter() {
  const hote = document.createElement('div'), toile = document.createElement('canvas');
  hote.appendChild(toile);
  document.body.appendChild(hote);
  poserHote3d('vue3d', hote);
  const touchers: { x: number; y: number }[] = [];
  const cible = new EventTarget() as unknown as Document;
  ecouterLesTouchers(cible, (e) => { touchers.push({ x: e.clientX, y: e.clientY }); });
  const pointeur = (type: string, id: number, x: number, y: number, bouton = 0) => {
    const e = new Event(type);
    Object.defineProperties(e, { pointerId: { value: id }, clientX: { value: x }, clientY: { value: y }, button: { value: bouton }, target: { value: toile } });
    (cible as unknown as EventTarget).dispatchEvent(e);
  };
  return { touchers, pointeur };
}

afterEach(() => { vi.useRealTimers(); });

describe('un toucher sur la scene', () => {
  it('bref et immobile : oui ; le bouton droit, un appui long, un glisser : non', () => {
    vi.useFakeTimers();
    const { touchers, pointeur } = monter();
    pointeur('pointerdown', 1, 100, 100); vi.advanceTimersByTime(100); pointeur('pointerup', 1, 102, 101);
    expect(touchers).toHaveLength(1);
    pointeur('pointerdown', 2, 100, 100, 2); vi.advanceTimersByTime(50); pointeur('pointerup', 2, 100, 100, 2);
    pointeur('pointerdown', 3, 100, 100); vi.advanceTimersByTime(TOUCHER_MS + 100); pointeur('pointerup', 3, 100, 100);
    pointeur('pointerdown', 4, 100, 100); vi.advanceTimersByTime(100); pointeur('pointerup', 4, 160, 100);
    expect(touchers).toHaveLength(1);
  });

  it('un pincement dont le doigt immobile se leve le premier n est pas un toucher', () => {
    vi.useFakeTimers();
    const { touchers, pointeur } = monter();
    pointeur('pointerdown', 1, 50, 50);
    pointeur('pointerdown', 2, 100, 100);
    vi.advanceTimersByTime(100);
    pointeur('pointerup', 2, 100, 100);
    pointeur('pointerup', 1, 150, 150);
    expect(touchers).toHaveLength(0);
  });
});
