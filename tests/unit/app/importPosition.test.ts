// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { creerImportCadastre, PRECISION_POSITION_MAX_M, type ContexteImportCadastre } from '../../../src/app/importCadastre.js';
import { geocoderInverseBAN, BAN_INVERSE_URL } from '../../../src/geo/apiIgn.js';
import { SansPosition, type PositionGps } from '../../../src/shell/geolocalisation.js';
import { ImportCadastre } from '../../../src/zones/parcours/ImportCadastre.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { PtBrut } from '../../../src/model/types.js';

// L'import depuis une adresse part de la position de l'appareil : sur le terrain, la parcelle est
// celle sous les pieds. Precise, elle choisit la parcelle ; approximative, elle propose l'adresse ;
// refusee a l'ouverture, elle se tait ; une adresse tapee entre-temps a la priorite.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lat = 48.9, lon = 2.15, proj = projecteurLocal(lat, lon);
const carre = (x0: number, y0: number, l: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + l }, { x: x0, y: y0 + l }];
const feature = (id: string, pts: PtBrut[], props: Record<string, unknown>) => ({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]!].map(p => { const d = proj.versDegres(p.x, p.y); return [d.lon, d.lat]; })] } });
const reponse = (corps: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as unknown as Response);

let racine: Root | null = null;
afterEach(() => { act(() => racine?.unmount()); racine = null; document.body.innerHTML = ''; vi.unstubAllGlobals(); });

/** Le cadastre : quatre parcelles de 20 m autour du point ; le reste vide. */
function servir(): string[] {
  const appels: string[] = [];
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    appels.push(url);
    const u = new URL(url);
    if (u.hostname === 'apicarto.ign.fr' && u.pathname.includes('cadastre')) {
      return reponse({ features: [[-20, -20], [0, -20], [-20, 0], [0, 0]].map(([x, y], k) => feature('p' + k, carre(x!, y!, 20), { idu: 'I' + k, section: 'AE', numero: String(k + 1), code_insee: '78650', nom_com: 'Le Vesinet', contenance: 400 })) });
    }
    return reponse({ features: [] });
  }));
  return appels;
}

function contexte(position: () => Promise<PositionGps>): ContexteImportCadastre {
  return {
    apiSave: vi.fn(), appliquerProjetImporte: vi.fn(), withProjectParam: (id) => id, apiDisponible: true, cleDernierProjet: 'k',
    lirePosition: position,
    geocoderInverse: vi.fn(async () => ({ label: '2 allee des Limites 78110 Le Vesinet', score: 0.9, genre: 'housenumber', citycode: '78650', ville: 'Le Vesinet', lon: lon + 0.001, lat }))
  };
}
const ici = (precisionM: number) => async (): Promise<PositionGps> => ({ lat: lat + 0.00003, lon: lon + 0.00004, precisionM });

describe('l import depuis la position de l appareil', () => {
  it('precise : cherche la parcelle sous le point de l appareil, filtre par la commune de l adresse', async () => {
    const appels = servir();
    const i = creerImportCadastre(contexte(ici(8)), vi.fn());
    await i.utiliserMaPosition(true);
    const e = i.etat();
    expect(e.position).toEqual({ etat: 'trouvee', adresse: '2 allee des Limites 78110 Le Vesinet', precisionM: 8 });
    // Le point de l'appareil, pas celui de l'adresse (decale de 0,001 degre).
    expect(e.geo).toMatchObject({ genre: 'position', lon: lon + 0.00004, lat: lat + 0.00003, citycode: '78650' });
    expect(e.principale).not.toBeNull();
    expect(appels.some(u => u.includes('code_insee=78650'))).toBe(true);
  });

  it('approximative a l ouverture : propose l adresse sans choisir de parcelle ; d un geste, la prend', async () => {
    const appels = servir();
    const i = creerImportCadastre(contexte(ici(PRECISION_POSITION_MAX_M + 400)), vi.fn());
    await i.utiliserMaPosition(true);
    expect(i.etat().position).toMatchObject({ etat: 'approximative', adresse: '2 allee des Limites 78110 Le Vesinet', precisionM: 450 });
    expect(i.etat().geo).toBeNull();
    expect(appels.filter(u => u.includes('apicarto'))).toEqual([]);
    await i.utiliserMaPosition(false);
    expect(i.etat().position.etat).toBe('trouvee');
    expect(i.etat().principale).not.toBeNull();
  });

  it('refusee : se tait a l ouverture, le dit apres un geste', async () => {
    servir();
    const refus = async (): Promise<PositionGps> => { throw new SansPosition('refusee'); };
    const i = creerImportCadastre(contexte(refus), vi.fn());
    await i.utiliserMaPosition(true);
    expect(i.etat().position.etat).toBe('aucune');
    await i.utiliserMaPosition(false);
    expect(i.etat().position.etat).toBe('refusee');
    const sansGps = creerImportCadastre(contexte(async () => { throw new SansPosition('delai'); }), vi.fn());
    await sansGps.utiliserMaPosition(false);
    expect(sansGps.etat().position.etat).toBe('indisponible');
  });

  it('laisse la priorite a une adresse tapee pendant la lecture de la position', async () => {
    const appels = servir();
    let rendre: (p: PositionGps) => void = () => {};
    const i = creerImportCadastre(contexte(() => new Promise<PositionGps>((ok) => { rendre = ok; })), vi.fn());
    const lecture = i.utiliserMaPosition(true);
    i.saisirAdresse('12 rue');
    rendre({ lat, lon, precisionM: 5 });
    await lecture;
    expect(i.etat().geo).toBeNull();
    expect(i.etat().position.etat).toBe('aucune');
    expect(appels.filter(u => u.includes('apicarto'))).toEqual([]);
    // Deja tape : l'ouverture ne demande meme pas la position.
    const lire = vi.fn(ici(5));
    const j = creerImportCadastre(contexte(lire), vi.fn());
    j.saisirAdresse('12 rue');
    await j.utiliserMaPosition(true);
    expect(lire).not.toHaveBeenCalled();
  });

  it('montre le bouton, l etat de la position, et recopie l adresse dans le champ', async () => {
    servir();
    const i = creerImportCadastre(contexte(ici(PRECISION_POSITION_MAX_M + 100)), vi.fn());
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    racine = createRoot(hote);
    act(() => racine!.render(createElement(ImportCadastre, { importe: i })));
    expect(hote.querySelector('[data-controle="cadastre.maPosition"]')).not.toBeNull();
    await act(async () => { await i.utiliserMaPosition(true); });
    expect(hote.textContent).toContain('Position approximative (à 150 m près)');
    expect(hote.querySelector<HTMLInputElement>('[data-controle="cadastre.adresse"]')!.value).toBe('2 allee des Limites 78110 Le Vesinet');
  });
});

describe('geocoderInverseBAN', () => {
  it('lit l adresse la plus proche d un point, ou rien', async () => {
    const appels: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      appels.push(url);
      return reponse(url.includes('lat=48.900000') ? { features: [{ properties: { label: '1 rue X 78110 Le Vesinet', score: 0.95, type: 'housenumber', citycode: '78650', city: 'Le Vesinet' }, geometry: { type: 'Point', coordinates: [2.1501, 48.9001] } }] } : { features: [] });
    }));
    expect(await geocoderInverseBAN(2.15, 48.9)).toEqual({ label: '1 rue X 78110 Le Vesinet', score: 0.95, genre: 'housenumber', citycode: '78650', ville: 'Le Vesinet', lon: 2.1501, lat: 48.9001 });
    expect(appels[0]!.startsWith(BAN_INVERSE_URL + '?lon=2.150000&lat=48.900000')).toBe(true);
    expect(await geocoderInverseBAN(2.15, 47)).toBe(null);
  });
});
