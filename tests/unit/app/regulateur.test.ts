import { describe, it, expect, vi } from 'vitest';
import { creerRegulateur, brancherRegulateur, DUREE_ACTIVITE_MS, RETARD_ACTIF_MS, RETARD_REPOS_MS, PAUSE_MAX_MS, PAS_SONDE_MS } from '../../../src/app/regulateur.js';

// Le regulateur de charge (app/regulateur.ts) : moins de lectures et des pauses quand l'utilisateur
// travaille ou que le fil principal prend du retard, et un retour progressif au repos.

function horloge() {
  let t = 0;
  const attentes: number[] = [];
  return {
    maintenant: () => t,
    avancer: (ms: number) => { t += ms; },
    // Une attente fait avancer le temps : les boucles d'attente du regulateur se deroulent seules.
    attendre: async (ms: number) => { attentes.push(ms); t += Math.max(ms, 1); },
    attentes,
  };
}

describe('le regulateur de charge', () => {
  it('au repos, toutes les lectures et pas de pause ; au premier geste, une seule', async () => {
    const h = horloge();
    const r = creerRegulateur({ max: 6, maintenant: h.maintenant, attendre: h.attendre });
    expect(r.occupe()).toBe(false);
    expect(r.lecteurs()).toBe(6);
    r.geste();
    expect(r.occupe()).toBe(true);
    expect(r.lecteurs()).toBe(1);
    h.avancer(DUREE_ACTIVITE_MS);
    expect(r.occupe()).toBe(false);
    expect(r.lecteurs()).toBe(6);
  });

  it('recule vite quand le fil prend du retard, revient doucement', () => {
    const h = horloge();
    const r = creerRegulateur({ max: 6, maintenant: h.maintenant, attendre: h.attendre });
    for (let k = 0; k < 10; k++) r.tic(RETARD_REPOS_MS * 3);
    expect(r.lecteurs()).toBe(1);
    expect(r.etat().pause).toBe(PAUSE_MAX_MS);
    // Le retard retombe : une lecture de plus par seconde, la pause se resorbe.
    const remontee: number[] = [];
    for (let s = 0; s < 8; s++) { for (let k = 0; k < 10; k++) { h.avancer(PAS_SONDE_MS); r.tic(0); } remontee.push(r.lecteurs()); }
    // Le retard lisse retombe en quelques mesures, puis une lecture de plus par seconde, jusqu'au maximum.
    expect(remontee.every((n, k) => k === 0 || n - (remontee[k - 1] as number) <= 1 && n >= (remontee[k - 1] as number))).toBe(true);
    expect(remontee.at(-1)).toBe(6);
    expect(r.etat().pause).toBe(0);
  });

  it('pendant un geste, la consigne est d une image : un retard tolere au repos fait reculer', () => {
    const h = horloge();
    const r = creerRegulateur({ max: 6, maintenant: h.maintenant, attendre: h.attendre });
    for (let k = 0; k < 10; k++) r.tic((RETARD_ACTIF_MS + RETARD_REPOS_MS) / 2);
    expect(r.etat().lecteurs).toBe(6);
    r.geste();
    for (let k = 0; k < 10; k++) r.tic((RETARD_ACTIF_MS + RETARD_REPOS_MS) / 2);
    h.avancer(DUREE_ACTIVITE_MS);
    expect(r.lecteurs()).toBe(1);
  });

  it('un lecteur au-dela des lectures permises patiente ; pendant un geste, au moins une image de pause', async () => {
    const h = horloge();
    const r = creerRegulateur({ max: 6, maintenant: h.maintenant, attendre: h.attendre });
    r.geste();
    const debut = h.maintenant();
    await r.tour(3);
    // Il a attendu la fin du geste avant de passer.
    expect(h.maintenant() - debut).toBeGreaterThanOrEqual(DUREE_ACTIVITE_MS);
    r.geste();
    h.attentes.length = 0;
    await r.tour(0);
    expect(h.attentes).toEqual([RETARD_ACTIF_MS]);
  });

  it('calme : attend que l utilisateur lache la souris, sans depasser la limite', async () => {
    const h = horloge();
    const r = creerRegulateur({ max: 6, maintenant: h.maintenant, attendre: h.attendre });
    r.geste();
    await r.calme(500);
    expect(h.maintenant()).toBeGreaterThanOrEqual(500);
    expect(h.maintenant()).toBeLessThan(DUREE_ACTIVITE_MS);
    await r.calme(10000);
    expect(r.occupe()).toBe(false);
  });

  it('se branche sur les gestes de la page, et se debranche', () => {
    vi.useFakeTimers();
    const cible = new EventTarget();
    const r = creerRegulateur({ max: 6 });
    const debrancher = brancherRegulateur(r, cible as unknown as Window);
    cible.dispatchEvent(new Event('pointerdown'));
    expect(r.occupe()).toBe(true);
    debrancher();
    vi.useRealTimers();
  });
});
