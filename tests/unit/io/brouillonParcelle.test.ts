import { describe, it, expect, vi } from 'vitest';
import { creerBrouillonParcelle, creerBrouillonAudit, rangerCapture, stockageMemoire, type StockageBrouillon } from '../../../src/io/brouillonAudit.js';
import { captureVide, photosDeLaCapture } from '../../../src/model/auditParcelle.js';
import type { PhotoCas } from '../../../src/model/audit.js';

// Le brouillon de l'audit de la parcelle (MD/spec-audit.md §10, §12) : la capture se garde avec ses
// photos, se relit apres un rechargement, ne se mele pas aux promenades, et rien ne casse quand le
// stockage refuse.

const photo = (base64: string): PhotoCas => ({ type: 'image/jpeg', base64, prise: { t: '2026-10-13T09:15:00Z', x: 1, y: 2, lat: 48.9, lon: 2.13, precisionM: 5, azimutDeg: 180, sourceAzimut: 'boussole' } });
function capture() {
  const c = captureVide('78650000AE0101', new Date('2026-10-13T09:00:00Z'));
  c.batiments.maison = { facades: { '2': { photos: [photo('AAAA'), photo('BBBB')] }, '3': { photos: [], inaccessible: true } }, vu: { forme: 'deux-pans', cheminees: { nombre: 1, souches: [{ position: 'faitage' }] } }, photos: [photo('TOIT')] };
  c.cloture = { type: 'mur', hauteurM: 1.8, photos: [photo('CLOT')] };
  c.portail = { nature: 'portail', photos: [] };
  return c;
}

describe('la capture rangee', () => {
  it('sort chaque photo sous une cle de la capture, sans toucher a la capture', () => {
    const c = capture();
    const { entree, photos } = rangerCapture(c);
    expect([...photos.values()].sort()).toEqual(['AAAA', 'BBBB', 'CLOT', 'TOIT']);
    const f = entree.batiments.maison!.facades['2']!.photos[0]!;
    expect(f.cleBrouillon.startsWith('parcelle-78650000AE0101/')).toBe(true);
    expect(f).not.toHaveProperty('base64');
    expect(f.prise?.azimutDeg).toBe(180);
    expect(c.batiments.maison!.facades['2']!.photos[0]!.base64).toBe('AAAA');
  });
});

describe('le brouillon de la parcelle', () => {
  it('relit la capture apres un rechargement, photos et notes comprises', async () => {
    const s = stockageMemoire();
    expect(await creerBrouillonParcelle(s).ecrire(capture())).toBe(true);
    const relu = await creerBrouillonParcelle(s).lire('parcelle-78650000AE0101');
    expect(relu?.photosManquantes).toBe(0);
    expect(relu?.capture).toEqual(capture());
    expect(await creerBrouillonParcelle(s).lire('parcelle-autre')).toBeNull();
  });

  it('ne reecrit pas une photo deja rangee, et efface celle qu on retire', async () => {
    const s = stockageMemoire();
    const ecrire = vi.spyOn(s, 'ecrire');
    const b = creerBrouillonParcelle(s);
    const c = capture();
    await b.ecrire(c);
    const photosEcrites = () => ecrire.mock.calls.filter(([t]) => t === 'photos').length;
    expect(photosEcrites()).toBe(4);
    c.batiments.maison!.facades['2']!.photos = [photo('AAAA')];
    await b.ecrire(c);
    expect(photosEcrites()).toBe(4);
    expect(s.tables.photos.size).toBe(3);
  });

  it('compte une photo perdue et la retire de la capture', async () => {
    const s = stockageMemoire();
    await creerBrouillonParcelle(s).ecrire(capture());
    const cle = [...s.tables.photos.keys()][0]!;
    s.tables.photos.delete(cle);
    const relu = await creerBrouillonParcelle(s).lire('parcelle-78650000AE0101');
    expect(relu?.photosManquantes).toBe(1);
    expect(photosDeLaCapture(relu!.capture)).toHaveLength(3);
  });

  it('jette une capture et ses photos, sans toucher aux promenades', async () => {
    const s = stockageMemoire();
    await creerBrouillonAudit(s).ecrire({ debut: new Date('2026-10-12T08:00:00Z'), depart: null, commune: null, cas: [] });
    await s.ecrire('photos', 'audit-2026-10-12T08:00:00.000Z/x', 'PROM');
    const b = creerBrouillonParcelle(s);
    await b.ecrire(capture());
    await b.jeter('parcelle-78650000AE0101');
    expect(s.tables.parcelles.size).toBe(0);
    expect([...s.tables.photos.keys()]).toEqual(['audit-2026-10-12T08:00:00.000Z/x']);
    // La promenade ne voit pas les captures : elles vivent dans leur propre table.
    expect(await creerBrouillonAudit(s).chercher()).toBeNull();
  });

  it('previent une fois quand le stockage refuse, sans lever', async () => {
    const plein: StockageBrouillon = { ...stockageMemoire(), ecrire: async () => { throw Object.assign(new Error('plein'), { name: 'QuotaExceededError' }); } };
    const surEchec = vi.fn();
    const b = creerBrouillonParcelle(plein, { surEchec });
    expect(await b.ecrire(capture())).toBe(false);
    expect(await b.ecrire(capture())).toBe(false);
    expect(surEchec).toHaveBeenCalledOnce();
    expect(surEchec).toHaveBeenCalledWith('plein');
    expect(await creerBrouillonParcelle(null).lire('x')).toBeNull();
  });
});
