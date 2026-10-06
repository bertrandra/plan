import { describe, it, expect, vi, afterEach } from 'vitest';
import { creerImportCadastre, type ContexteImportCadastre } from '../../../src/app/importCadastre.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { PtBrut } from '../../../src/model/types.js';

// L'etape 3 de l'import depuis une adresse : le voisinage etendu se choisit (100 ou 200 m), se lit
// a l'IGN, se montre dans l'apercu selon l'option d'affichage, et part avec la creation du plan.

const lat = 48.9, lon = 2.15, proj = projecteurLocal(lat, lon);
const carre = (x0: number, y0: number, l: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + l }, { x: x0, y: y0 + l }];
const feature = (id: string, pts: PtBrut[], props: Record<string, unknown>) => ({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]!].map(p => { const d = proj.versDegres(p.x, p.y); return [d.lon, d.lat]; })] } });
const reponse = (corps: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as unknown as Response);
/** Une grille de parcelles de 20 m autour de l'adresse, de -160 a +160 m, et un batiment dans chacune. */
const parcelles = () => { const out: unknown[] = []; for (let x = -160; x <= 140; x += 20) for (let y = -160; y <= 140; y += 20) out.push(feature('p' + x + '_' + y, carre(x, y, 20), { idu: 'I' + x + '_' + y, section: 'AE', numero: String(out.length + 1), code_insee: '78650', nom_com: 'Le Vesinet', contenance: 400 })); return out; };
const batiments = () => { const out: unknown[] = []; for (let x = -160; x <= 140; x += 20) for (let y = -160; y <= 140; y += 20) out.push(feature('b' + x + '_' + y, carre(x + 5, y + 5, 8), { cleabs: 'B' + x + '_' + y, hauteur: '6,5' })); return out; };

afterEach(() => vi.unstubAllGlobals());

function contexte(): ContexteImportCadastre & { sauve: unknown[] } {
  const sauve: unknown[] = [];
  return { sauve, apiSave: vi.fn(async (p: unknown) => { sauve.push(p); return { id: 'x' }; }), appliquerProjetImporte: vi.fn(), withProjectParam: (id) => '/?projet=' + id, apiDisponible: true, cleDernierProjet: 'k' };
}

describe('le voisinage etendu a l etape 3', () => {
  it('se lit, se montre selon l option d affichage, se remet a zero avec la principale, et part a la creation', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = new URL(url);
      if (u.hostname === 'apicarto.ign.fr' && u.pathname.includes('cadastre')) {
        const tout = parcelles(), start = parseInt(u.searchParams.get('_start') ?? '0', 10), limit = parseInt(u.searchParams.get('_limit') ?? '60', 10);
        // Le premier appel (rayon de 12 m autour de l'adresse) doit trouver la parcelle sous l'adresse.
        return reponse({ features: tout.slice(start, start + limit), totalFeatures: tout.length });
      }
      if (u.hostname === 'apicarto.ign.fr') return reponse({ features: [] });
      if ((u.searchParams.get('TYPENAMES') ?? '').includes('batiment')) return reponse({ features: batiments(), numberMatched: batiments().length });
      return reponse({ features: [] });
    }));
    // `location.href` est ecrit apres l'enregistrement : un objet suffit sous Node.
    vi.stubGlobal('location', { href: '' });
    vi.stubGlobal('localStorage', { setItem: () => undefined, getItem: () => null });
    const ctx = contexte();
    const i = creerImportCadastre(ctx, vi.fn());
    await i.choisirAdresse({ label: 'Adresse', score: 1, genre: 'housenumber', citycode: '78650', ville: 'Le Vesinet', lon, lat });
    expect(i.etat().etape).toBe(2);
    i.allerA(3);
    expect(i.etat().rayonEtendu).toBe(0);
    expect(i.apercu().etendu).toBeNull();

    await i.choisirRayonEtendu(100);
    const lu = i.etat().etendu!;
    expect(lu.rayonM).toBe(100);
    expect(lu.parcelles.length).toBeGreaterThan(20);
    expect(lu.parcelles.some(c => c.idu === i.etat().principale!.idu)).toBe(false);
    expect(lu.batiments.length).toBeGreaterThan(20);
    expect(i.apercu().etendu!.rayonM).toBe(100);
    i.basculerAfficherEtendu(false);
    expect(i.apercu().etendu).toBeNull();
    i.basculerAfficherEtendu(true);

    await i.choisirRayonEtendu(200);
    expect(i.etat().etendu!.parcelles.length).toBeGreaterThan(lu.parcelles.length);

    // Une autre principale rend le voisinage caduc.
    const autre = i.etat().adjacentes[0]!;
    await i.choisirPrincipale(autre);
    expect(i.etat().rayonEtendu).toBe(0);
    expect(i.etat().etendu).toBeNull();

    await i.choisirRayonEtendu(100);
    i.basculerAfficherEtendu(false);
    await i.creerProjet('Test');
    const objets = (ctx.sauve[0] as { objects: { voisinage?: boolean; key: string; affichage?: { voisinage?: boolean } }[] }).objects;
    expect(objets.filter(o => o.voisinage).length).toBeGreaterThan(40);
    expect(objets.find(o => o.key === 'parcelle')!.affichage).toEqual({ voisinage: false });
  });
});
