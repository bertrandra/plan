import { describe, it, expect, vi } from 'vitest';
import {
  rangerPromenade, creerBrouillonAudit, creerEcrivainBrouillon, stockageMemoire, idPromenade, VERSION_BROUILLON,
  type EtatPromenade, type StockageBrouillon,
} from '../../../src/io/brouillonAudit.js';
import type { CasAudit, PhotoCas } from '../../../src/model/audit.js';

// Le brouillon local de la promenade (io/brouillonAudit.ts, spec-audit §10), sur un stockage simule :
// il garde les cas et leurs photos, se relit apres un rechargement, ne reecrit pas une photo deja
// rangee, et ne casse rien quand le stockage refuse (navigation privee, telephone plein).

const DEBUT = new Date('2026-10-13T09:12:00Z');
const photo = (base64: string): PhotoCas => ({ type: 'image/jpeg', base64, prise: { t: '2026-10-13T09:15:00Z', x: 1, y: 2, lat: 48.9, lon: 2.13, precisionM: 5, azimutDeg: 245, sourceAzimut: 'boussole' } });
function cas(cle: string, photos: PhotoCas[] = [], id = 'c1'): CasAudit {
  return {
    id, cle, statut: 'a_corriger',
    constat: { categorie: 'toit', problemes: ['toit.sens-faitage'], note: 'côté rue', t: '2026-10-13T09:14:00Z', position: { x: 1, y: 2, precisionM: 5 }, photos },
    identite: { cleBdtopo: 'BATIMENT01', idu: '78650000AE0101', adresse: null },
    entrees: { pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }], bdtopo: null, grille: null, voisins: [] },
    sorties: { mode: 'entier', elevation: 6.5, toit: null, corps: null, toitMesure: null, couleurMurs: null, sourceMurs: null },
    attendu: null, historique: [{ t: '2026-10-13T09:14:00Z', texte: 'marqué sur le terrain' }],
  };
}
const etat = (liste: CasAudit[], debut = DEBUT): EtatPromenade => ({ debut, depart: { lon: 2.13, lat: 48.9 }, commune: 'Le Vésinet', cas: liste });

describe('rangerPromenade', () => {
  it('sort les photos des cas sous une cle de la promenade, sans toucher aux cas', () => {
    const c = cas('bati-1', [photo('AAAA'), photo('BBBB')]);
    const { brouillon, photos } = rangerPromenade(etat([c]), new Date('2026-10-13T10:00:00Z'));
    expect(brouillon).toMatchObject({ version: VERSION_BROUILLON, id: idPromenade(DEBUT), debut: DEBUT.toISOString(), misAJour: '2026-10-13T10:00:00.000Z', commune: 'Le Vésinet' });
    const rangees = brouillon.cas[0]!.constat.photos;
    expect(rangees.map((p) => p.cleBrouillon.startsWith(idPromenade(DEBUT) + '/'))).toEqual([true, true]);
    expect(rangees[0]).not.toHaveProperty('base64');
    expect(rangees[0]!.prise?.azimutDeg).toBe(245);
    expect([...photos.values()]).toEqual(['AAAA', 'BBBB']);
    expect(c.constat.photos[0]!.base64).toBe('AAAA');
  });
});

describe('le brouillon sur un stockage', () => {
  it('se relit apres un rechargement : cas, debut, photos', async () => {
    const stockage = stockageMemoire();
    const avant = creerBrouillonAudit(stockage);
    expect(await avant.ecrire(etat([cas('bati-1', [photo('AAAA')]), cas('bati-2', [], 'c2')]))).toBe(true);

    // Un autre onglet, une autre instance : seul le stockage est partage.
    const apres = creerBrouillonAudit(stockage);
    const b = await apres.chercher();
    expect(b?.cas.map((c) => c.cle)).toEqual(['bati-1', 'bati-2']);
    expect(b?.depart).toEqual({ lon: 2.13, lat: 48.9 });
    const r = await apres.rouvrir(b!);
    expect(r.debut.toISOString()).toBe(DEBUT.toISOString());
    expect(r.photosManquantes).toBe(0);
    expect(r.cas[0]!.constat.photos).toEqual([photo('AAAA')]);
    expect(r.cas[0]!.constat.note).toBe('côté rue');
    // La promenade en cours n'est pas proposee a elle-meme.
    expect(await apres.chercher(b!.id)).toBeNull();
  });

  it('n ecrit une photo qu une fois, et efface celle retiree du cas', async () => {
    const stockage = stockageMemoire();
    const ecrire = vi.spyOn(stockage, 'ecrire');
    const brouillon = creerBrouillonAudit(stockage);
    const c = cas('bati-1', [photo('AAAA')]);
    await brouillon.ecrire(etat([c]));
    await brouillon.ecrire(etat([{ ...c, constat: { ...c.constat, note: 'autre' } }]));
    expect(ecrire.mock.calls.filter(([t]) => t === 'photos')).toHaveLength(1);
    expect(stockage.tables.photos.size).toBe(1);
    await brouillon.ecrire(etat([{ ...c, constat: { ...c.constat, photos: [photo('BBBB')] } }]));
    expect([...stockage.tables.photos.values()]).toEqual([JSON.stringify('BBBB')]);
  });

  it('une promenade sans cas n a pas de brouillon ; jeter efface aussi ses photos, pas celles des autres', async () => {
    const stockage = stockageMemoire();
    const brouillon = creerBrouillonAudit(stockage);
    const autre = new Date('2026-10-12T15:00:00Z');
    await brouillon.ecrire(etat([cas('bati-1', [photo('AAAA')])]));
    await brouillon.ecrire(etat([cas('bati-9', [photo('ZZZZ')])], autre));
    expect(stockage.tables.promenades.size).toBe(2);
    await brouillon.jeter(idPromenade(DEBUT));
    expect([...stockage.tables.promenades.keys()]).toEqual([idPromenade(autre)]);
    expect(stockage.tables.photos.size).toBe(1);
    await brouillon.ecrire(etat([], autre));
    expect(stockage.tables.promenades.size).toBe(0);
    expect(stockage.tables.photos.size).toBe(0);
  });

  it('propose le plus recent, et ignore une entree d une autre version ou sans cas', async () => {
    const stockage = stockageMemoire();
    let heure = '2026-10-12T10:00:00Z';
    const brouillon = creerBrouillonAudit(stockage, { maintenant: () => new Date(heure) });
    await brouillon.ecrire(etat([cas('a')], new Date('2026-10-12T09:00:00Z')));
    heure = '2026-10-13T10:00:00Z';
    await brouillon.ecrire(etat([cas('b')], new Date('2026-10-13T09:00:00Z')));
    await stockage.ecrire('promenades', 'audit-futur', { version: 99, id: 'audit-futur', debut: '2026-10-14T09:00:00Z', misAJour: '2026-10-14T09:00:00Z', cas: [{}] });
    await stockage.ecrire('promenades', 'audit-vide', { version: VERSION_BROUILLON, id: 'audit-vide', debut: '2026-10-14T09:00:00Z', misAJour: '2026-10-14T09:00:00Z', cas: [] });
    expect((await brouillon.chercher())?.cas[0]?.cle).toBe('b');
  });

  it('compte une photo perdue a la reouverture, sans perdre le cas', async () => {
    const stockage = stockageMemoire();
    const brouillon = creerBrouillonAudit(stockage);
    await brouillon.ecrire(etat([cas('bati-1', [photo('AAAA'), photo('BBBB')])]));
    const premiere = [...stockage.tables.photos.keys()][0]!;
    stockage.tables.photos.delete(premiere);
    const r = await creerBrouillonAudit(stockage).rouvrir((await brouillon.chercher())!);
    expect(r.photosManquantes).toBe(1);
    expect(r.cas[0]!.constat.photos.map((p) => p.base64)).toEqual(['BBBB']);
  });
});

describe('un stockage qui refuse', () => {
  const refus = (erreur: unknown): StockageBrouillon => ({
    lire: () => Promise.reject(erreur), ecrire: () => Promise.reject(erreur), effacer: () => Promise.reject(erreur), cles: () => Promise.reject(erreur),
  });

  it('telephone plein : l ecriture echoue sans exception, prevenu une seule fois', async () => {
    const surEchec = vi.fn();
    const brouillon = creerBrouillonAudit(refus(Object.assign(new Error('plein'), { name: 'QuotaExceededError' })), { surEchec });
    expect(await brouillon.ecrire(etat([cas('a', [photo('AAAA')])]))).toBe(false);
    expect(await brouillon.ecrire(etat([cas('a')]))).toBe(false);
    expect(surEchec.mock.calls).toEqual([['plein']]);
  });

  it('navigation privee : rien a proposer, ni a jeter, sans exception', async () => {
    const surEchec = vi.fn();
    const brouillon = creerBrouillonAudit(refus(new Error('SecurityError')), { surEchec });
    expect(await brouillon.chercher()).toBeNull();
    await brouillon.jeter('audit-x');
    expect(surEchec).toHaveBeenCalledWith('indisponible');
  });

  it('un stockage qui ne repond jamais : la recherche abandonne au bout du delai', async () => {
    const muet: StockageBrouillon = { lire: () => new Promise(() => {}), ecrire: () => new Promise(() => {}), effacer: () => new Promise(() => {}), cles: () => new Promise(() => {}) };
    expect(await creerBrouillonAudit(muet, { delaiLectureMs: 10 }).chercher()).toBeNull();
  });

  it('sans stockage du tout : indisponible, et rien ne casse', async () => {
    const brouillon = creerBrouillonAudit(null);
    expect(brouillon.disponible).toBe(false);
    expect(await brouillon.chercher()).toBeNull();
    expect(await brouillon.ecrire(etat([cas('a')]))).toBe(false);
  });
});

describe('l ecriture au fil de l eau', () => {
  it('une rafale de changements ne fait qu une ecriture ; vider ecrit tout de suite', async () => {
    vi.useFakeTimers();
    try {
      const stockage = stockageMemoire();
      const brouillon = creerBrouillonAudit(stockage);
      const ecrire = vi.spyOn(brouillon, 'ecrire');
      let liste = [cas('a')];
      const ecrivain = creerEcrivainBrouillon(brouillon, () => etat(liste), 500);
      ecrivain.programmer(); ecrivain.programmer(); ecrivain.programmer();
      expect(ecrire).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(600);
      expect(ecrire).toHaveBeenCalledOnce();
      liste = [cas('a'), cas('b', [], 'c2')];
      ecrivain.programmer();
      await ecrivain.vider();
      expect(ecrire).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(600);
      expect(ecrire).toHaveBeenCalledTimes(2);
      expect((await brouillon.chercher())?.cas).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });
});
