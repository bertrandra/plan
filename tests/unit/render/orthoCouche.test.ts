// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/shell/dialogs.js', () => ({ showToast: () => {}, showErrBanner: () => {}, showErreur: () => {} }));

import {
  ortho, urlTuileOrtho, chargerTuileOrtho, chargerOrthophoto, choisirCoucheOrtho, enregistrerConfigOrtho, restaurerOrthoDuProjet,
  tuilesPhotoPourAnalyse, coucheDe, COUCHES_ORTHO, type ContexteOrtho
} from '../../../src/render/ortho.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le fond du plan : la photo aerienne (par defaut) ou le Plan IGN v2, une couche a la fois. La couche, le format et le
// niveau maximal suivent le choix ; le cache est range par couche ; le reglage se range sur la parcelle comme l'opacite,
// et un fichier d'avant (sans couche) s'ouvre sur la photo, sans rien gagner.

const demandees: string[] = [];
beforeEach(() => {
  demandees.length = 0;
  ortho.cache.clear();
  ortho.tuiles = []; ortho.tuilesLarges = []; ortho.couverture = null; ortho.photo = [];
  ortho.actif = false; ortho.couche = 'photo'; ortho.opacite = 0.85; ortho.parcelleOpacite = 0.15; ortho.chargement = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    demandees.push(url);
    const plan = url.includes('PLANIGNV2');
    // Le Plan IGN n'a pas de niveau 20 : il repond 404, comme le vrai service.
    if (plan && url.includes('TILEMATRIX=20&')) return { ok: false, status: 404 } as Response;
    return { ok: true, status: 200, blob: async () => new Blob([plan ? 'P' : 'J'], { type: plan ? 'image/png' : 'image/jpeg' }) } as Response;
  }));
});

function contexte(ortho?: ObjetPlan['ortho']) {
  const parcelle = {
    key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: -20 }, { x: 0, y: -20 }],
    cadastre: { origineLat: 48.89, origineLon: 2.16 }, ...(ortho ? { ortho } : {})
  } as unknown as ObjetPlan;
  const ctx = {
    trouverParcelleCloture: () => parcelle, lieuActuel: () => ({ latitude: 48.89, longitude: 2.16 }), markDirty: vi.fn(), render: vi.fn(),
    toScreen: (p: { x: number; y: number }) => p, orthoGroup: () => document.createElementNS('http://www.w3.org/2000/svg', 'g'),
    etat: { objects: [parcelle], voisinageVisible: true, scene: { scale: 1 } }
  } as unknown as ContexteOrtho;
  return { ctx, parcelle };
}
const niveau = (u: string) => Number(/TILEMATRIX=(\d+)&/.exec(u)?.[1]);

describe('les deux fonds de l IGN', () => {
  it('chaque couche a son adresse, son format et son niveau maximal', () => {
    expect(urlTuileOrtho(19, 3, 4)).toContain('LAYER=ORTHOIMAGERY.ORTHOPHOTOS&');
    expect(urlTuileOrtho(19, 3, 4)).toContain('FORMAT=image/jpeg&');
    const plan = urlTuileOrtho(19, 3, 4, 'plan');
    expect(plan).toBe('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX=19&TILEROW=4&TILECOL=3');
    expect(COUCHES_ORTHO.photo.zoomMax).toBe(20);
    expect(COUCHES_ORTHO.plan.zoomMax).toBe(19);
  });

  it('le cache est range par couche : la meme tuile des deux fonds ne se melange pas', async () => {
    const photo = await chargerTuileOrtho(18, 1, 2);
    const plan = await chargerTuileOrtho(18, 1, 2, 'plan');
    expect(photo).toMatch(/^data:image\/jpeg/);
    expect(plan).toMatch(/^data:image\/png/);
    expect(await chargerTuileOrtho(18, 1, 2)).toBe(photo);
    expect(await chargerTuileOrtho(18, 1, 2, 'plan')).toBe(plan);
    expect(demandees).toHaveLength(2);
    expect([...ortho.cache.keys()].sort()).toEqual(['photo/18/1/2', 'plan/18/1/2']);
  });

  it('le Plan IGN se lit au niveau 19 au plus (le 20 n est jamais demande), la photo au 20', async () => {
    const { ctx } = contexte();
    ortho.couche = 'plan';
    const r = await chargerOrthophoto(ctx);
    expect(r.z).toBe(19);
    expect(demandees.every((u) => u.includes('PLANIGNV2'))).toBe(true);
    expect(demandees.some((u) => niveau(u) === 20)).toBe(false);
    expect(ortho.tuiles.length).toBeGreaterThan(0);
    expect(ortho.tuiles.every((t) => t.dataUri?.startsWith('data:image/png'))).toBe(true);
    demandees.length = 0;
    ortho.couche = 'photo';
    expect((await chargerOrthophoto(ctx)).z).toBe(20);
    expect(demandees.every((u) => u.includes('ORTHOIMAGERY.ORTHOPHOTOS'))).toBe(true);
  });

  it('choisir le Plan IGN remplace les tuiles (jamais les deux), allume le fond et se range sur la parcelle', async () => {
    const { ctx, parcelle } = contexte();
    ortho.actif = true;
    await chargerOrthophoto(ctx);
    const versionPhoto = ortho.version;
    await choisirCoucheOrtho('plan', ctx);
    expect(ortho.couche).toBe('plan');
    expect(ortho.actif).toBe(true);
    expect(ortho.version).toBeGreaterThan(versionPhoto);
    expect(ortho.tuiles.length).toBeGreaterThan(0);
    expect(ortho.tuiles.every((t) => t.dataUri?.startsWith('data:image/png'))).toBe(true);
    expect(parcelle.ortho).toMatchObject({ couche: 'plan', actif: true });
    expect(ctx.markDirty).toHaveBeenCalled();
    // Retour a la photo : la couche disparait du fichier, qui reprend sa forme d'avant.
    await choisirCoucheOrtho('photo', ctx);
    expect(ortho.tuiles.every((t) => t.dataUri?.startsWith('data:image/jpeg'))).toBe(true);
    expect(parcelle.ortho && 'couche' in parcelle.ortho).toBe(false);
  });

  it('un fond eteint s allume au choix d une couche', async () => {
    const { ctx } = contexte({ actif: false, opacite: 0.85, parcelleOpacite: 0.15 });
    await choisirCoucheOrtho('plan', ctx);
    expect(ortho.actif).toBe(true);
    expect(ortho.couche).toBe('plan');
  });

  it('un ancien fichier (sans couche) s ouvre sur la photo, et rouvert ne change rien ni n est « modifie »', async () => {
    expect(coucheDe(undefined)).toBe('photo');
    expect(coucheDe('inconnue')).toBe('photo');
    expect(coucheDe('plan')).toBe('plan');
    const ancien = { actif: true, opacite: 0.6, parcelleOpacite: 0.3 };
    const { ctx, parcelle } = contexte({ ...ancien });
    ortho.couche = 'plan';
    restaurerOrthoDuProjet(ctx);
    expect(ortho.couche).toBe('photo');
    await vi.waitFor(() => expect(ortho.tuiles.length).toBeGreaterThan(0));
    expect(parcelle.ortho).toEqual(ancien);
    expect(ctx.markDirty).not.toHaveBeenCalled();
  });

  it('un projet enregistre avec le Plan IGN le retrouve', async () => {
    const { ctx } = contexte({ actif: true, opacite: 0.85, parcelleOpacite: 0.15, couche: 'plan' });
    restaurerOrthoDuProjet(ctx);
    expect(ortho.couche).toBe('plan');
    await vi.waitFor(() => expect(ortho.tuiles.length).toBeGreaterThan(0));
    expect(ortho.tuiles.every((t) => t.dataUri?.startsWith('data:image/png'))).toBe(true);
    expect(ctx.markDirty).not.toHaveBeenCalled();
  });

  it('un projet aux reglages par defaut ne gagne pas de champ', () => {
    const { ctx, parcelle } = contexte();
    ortho.actif = true;
    enregistrerConfigOrtho(ctx);
    expect(parcelle.ortho).toBeUndefined();
  });

  it('l audit lit toujours la photo, meme sous le Plan IGN', async () => {
    const { ctx } = contexte();
    ortho.actif = true;
    await chargerOrthophoto(ctx);
    const photo = [...ortho.tuiles];
    await choisirCoucheOrtho('plan', ctx);
    const lues = await tuilesPhotoPourAnalyse();
    expect(lues.map((t) => t.dataUri)).toEqual(photo.map((t) => t.dataUri));
    expect(lues.every((t) => t.dataUri?.startsWith('data:image/jpeg'))).toBe(true);
  });

  it('sous le Plan IGN sans photo deja lue, l audit relit la photo, sans toucher au fond affiche', async () => {
    const { ctx } = contexte({ actif: true, opacite: 0.85, parcelleOpacite: 0.15, couche: 'plan' });
    restaurerOrthoDuProjet(ctx);
    await vi.waitFor(() => expect(ortho.tuiles.length).toBeGreaterThan(0));
    const affichees = [...ortho.tuiles];
    const lues = await tuilesPhotoPourAnalyse();
    expect(lues.length).toBeGreaterThan(0);
    expect(lues.every((t) => t.dataUri?.startsWith('data:image/jpeg'))).toBe(true);
    expect(ortho.tuiles).toEqual(affichees);
  });
});
