// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/shell/dialogs.js', () => ({ showToast: () => {}, showErrBanner: () => {}, showErreur: () => {} }));

import { ortho, basculerOrthophoto, rechargerOrthophoto, type ContexteOrtho } from '../../../src/render/ortho.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// « Recharger le fond IGN » est grise pendant une lecture du fond (`ortho.chargement`). Le menu ne relit l'etat de ses commandes
// qu'a un rendu du plan (la cle des zones, zones/composants/abonnement.ts) : chaque ecriture de `ortho.chargement` doit donc etre
// suivie d'un rendu. La fin d'une bascule posee apres son rendu laissait l'entree grisee, et le garde-fou des cles le signalait
// en developpement (point de fumee 200, le plan recule menu ouvert).

let reponse: 'ok' | 'panne' = 'ok';
beforeEach(() => {
  reponse = 'ok';
  ortho.cache.clear();
  ortho.tuiles = []; ortho.tuilesLarges = []; ortho.couverture = null; ortho.photo = [];
  ortho.actif = false; ortho.couche = 'photo'; ortho.chargement = false;
  vi.stubGlobal('fetch', vi.fn(async () => (reponse === 'panne'
    ? ({ ok: false, status: 503 } as Response)
    : ({ ok: true, status: 200, blob: async () => new Blob(['J'], { type: 'image/jpeg' }) } as Response))));
});

/** Le contexte d'une parcelle geolocalisee ; `rendus` note, a chaque rendu, ce que le menu y lirait. */
function contexte() {
  const parcelle = {
    key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: -20 }, { x: 0, y: -20 }],
    cadastre: { origineLat: 48.89, origineLon: 2.16 }
  } as unknown as ObjetPlan;
  const rendus: { chargement: boolean; tuiles: number }[] = [];
  const ctx = {
    trouverParcelleCloture: () => parcelle, lieuActuel: () => ({ latitude: 48.89, longitude: 2.16 }), markDirty: vi.fn(),
    render: vi.fn(() => { rendus.push({ chargement: ortho.chargement, tuiles: ortho.tuiles.length }); }),
    toScreen: (p: { x: number; y: number }) => p, orthoGroup: () => document.createElementNS('http://www.w3.org/2000/svg', 'g'),
    etat: { objects: [parcelle], voisinageVisible: true, scene: { scale: 1 } }
  } as unknown as ContexteOrtho;
  return { ctx, rendus };
}

/** Ce que le dernier rendu a dit au menu est l'etat reel : rien n'a change depuis sans que le plan le redise. */
const dernierRenduAJour = (rendus: { chargement: boolean }[]) => expect(rendus.at(-1)?.chargement).toBe(ortho.chargement);

describe('« Recharger le fond IGN » suit la lecture du fond par les rendus du plan', () => {
  it('allumer le fond : un rendu dit la lecture en cours, un autre sa fin, apres elle', async () => {
    const { ctx, rendus } = contexte();
    const bascule = basculerOrthophoto(true, ctx, true);
    // La partie synchrone de la bascule : le menu sait deja que le fond se lit.
    expect(ortho.chargement).toBe(true);
    expect(rendus.at(-1)).toEqual({ chargement: true, tuiles: 0 });
    await bascule;
    expect(ortho.actif).toBe(true);
    expect(ortho.chargement).toBe(false);
    expect(rendus.at(-1)?.tuiles).toBeGreaterThan(0);
    dernierRenduAJour(rendus);
  });

  it('un fond qui ne vient pas : eteint et plus en lecture, et le dernier rendu le dit', async () => {
    const { ctx, rendus } = contexte();
    reponse = 'panne';
    await basculerOrthophoto(true, ctx, true);
    expect(ortho.actif).toBe(false);
    expect(ortho.chargement).toBe(false);
    dernierRenduAJour(rendus);
  });

  it('recharger : l entree se grise avant que les tuiles soient oubliees, et se rallume au dernier rendu', async () => {
    const { ctx, rendus } = contexte();
    await basculerOrthophoto(true, ctx, true);
    const avant = ortho.tuiles.length;
    rendus.length = 0;
    const lecture = rechargerOrthophoto(ctx);
    // Le rendu de depart voit la lecture et la photo d'avant, encore a l'ecran.
    expect(rendus[0]).toEqual({ chargement: true, tuiles: avant });
    await lecture;
    expect(ortho.chargement).toBe(false);
    dernierRenduAJour(rendus);
  });
});
