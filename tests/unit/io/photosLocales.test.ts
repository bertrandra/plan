import { describe, it, expect, vi } from 'vitest';
import { sortirLesPhotos, rentrerLesPhotos, cleDePhoto, magasinMemoire, type MagasinPhotos } from '../../../src/io/photosLocales.js';
import { creerDepotPlateforme } from '../../../src/io/depotPlateforme.js';
import type { Session } from '../../../src/plateforme/session.js';
import type { ObjetBrut } from '../../../src/model/types.js';

// Les photos de releve gardees sur l'appareil (io/photosLocales.ts) : la plateforme refuse les
// contenus embarques (EMBEDDED_ASSET_REJECTED), le document ne porte que la cle de la photo.

const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(90000);
const releve = (texture: string | null, plus: Record<string, unknown> = {}) => ({ cote: 0, largeur: 8, hauteur: 6, texture, ouvertures: [{ x: 1, y: 1, l: 1, h: 1, type: 'fenetre' }], distance: 6, sourceDistance: 'cadrage', releveLe: '2026-10-10', ...plus });
const maison = (facades: unknown[]): ObjetBrut => ({ key: 'm', type: 'polygon', fonction: 'batiment', pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }], facades } as unknown as ObjetBrut);
const facadesDe = (o: ObjetBrut | undefined) => (o as unknown as { facades: Record<string, unknown>[] }).facades;
/** Toutes les chaines d'une valeur JSON. */
const chaines = (v: unknown): string[] => { const out: string[] = []; JSON.stringify(v, (_k, x: unknown) => { if (typeof x === 'string') out.push(x); return x; }); return out; };

describe('sortirLesPhotos et rentrerLesPhotos', () => {
  it('range la photo sous une cle tiree de son contenu, laisse les mesures, et ne touche pas a l original', async () => {
    const magasin = magasinMemoire();
    const objets = [maison([releve(PHOTO), releve(null, { cote: 1 })]), { key: 'p', type: 'polygon', pts: [] } as unknown as ObjetBrut];
    const r = await sortirLesPhotos(objets, magasin);
    expect(r.sorties).toBe(1);
    expect(r.perdues).toBe(0);
    const [f0, f1] = facadesDe(r.objets[0]);
    expect(f0).toMatchObject({ texture: null, photoLocale: cleDePhoto(PHOTO), ouvertures: [{ x: 1 }] });
    expect(f1).toEqual(releve(null, { cote: 1 }));
    expect(r.objets[1]).toBe(objets[1]);
    expect(facadesDe(objets[0])[0]!.texture).toBe(PHOTO);
    expect(await magasin.lire(cleDePhoto(PHOTO))).toBe(PHOTO);
    // Plus rien que la plateforme refuserait : ni data:, ni chaine de plus de 64 Kio.
    chaines(r.objets).forEach((c) => { expect(c).not.toMatch(/^\s*data:/i); expect(c.length).toBeLessThanOrEqual(65536); });
    // Relu sur le meme appareil, la photo revient ; sur un autre, le releve garde ses mesures sans elle.
    const relu = await rentrerLesPhotos(JSON.parse(JSON.stringify(r.objets)) as ObjetBrut[], magasin);
    expect(relu.manquantes).toBe(0);
    expect(facadesDe(relu.objets[0])[0]).toMatchObject({ texture: PHOTO, photoLocale: cleDePhoto(PHOTO) });
    const ailleurs = await rentrerLesPhotos(JSON.parse(JSON.stringify(r.objets)) as ObjetBrut[], magasinMemoire());
    expect(ailleurs.manquantes).toBe(1);
    expect(facadesDe(ailleurs.objets[0])[0]).toMatchObject({ texture: null, photoLocale: cleDePhoto(PHOTO), ouvertures: [{ x: 1 }] });
  });

  it('la cle est stable et distingue deux photos ; un magasin en panne n empeche pas l enregistrement', async () => {
    expect(cleDePhoto(PHOTO)).toBe(cleDePhoto(PHOTO));
    expect(cleDePhoto(PHOTO)).toMatch(/^p[0-9a-f]{32}$/);
    expect(cleDePhoto(PHOTO + 'B')).not.toBe(cleDePhoto(PHOTO));
    const enPanne: MagasinPhotos = { lire: async () => { throw new Error('bloque'); }, ecrire: async () => { throw new Error('bloque'); } };
    const r = await sortirLesPhotos([maison([releve(PHOTO)])], enPanne);
    expect(r.perdues).toBe(1);
    expect(facadesDe(r.objets[0])[0]!.texture).toBeNull();
    expect((await rentrerLesPhotos(r.objets, enPanne)).manquantes).toBe(1);
  });
});

describe('le depot de la plateforme', () => {
  it('envoie le document sans la photo, et la rend a l ouverture sur le meme appareil', async () => {
    const magasin = magasinMemoire();
    let stocke: unknown = null;
    const appeler = vi.fn(async (id: string, options: { corps?: { document: unknown } } = {}) => {
      if (id === 'createProject') { stocke = options.corps!.document; return { id: 'p1', name: 'Maison', updated_at: 'x', deleted_at: null }; }
      return { id: 'p1', name: 'Maison', updated_at: 'x', deleted_at: null, schema_version: 2, document: JSON.parse(JSON.stringify(stocke)) };
    });
    const depot = creerDepotPlateforme({ appeler } as unknown as Session, magasin);
    const objets = [maison([releve(PHOTO)])];
    await depot.enregistrer({ name: 'Maison', objects: objets });
    chaines(stocke).forEach((c) => expect(c).not.toMatch(/^\s*data:/i));
    expect(facadesDe(objets[0])[0]!.texture).toBe(PHOTO);
    const p = await depot.ouvrir('p1');
    expect(facadesDe(p.objects[0])[0]!.texture).toBe(PHOTO);
  });
});
