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

/** Un service factice : la grille de parcelles et de batiments, le cadastre pagine, le reste vide. */
function servir(): string[] {
  const appels: string[] = [];
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    appels.push(url);
    const u = new URL(url);
    if (u.hostname === 'apicarto.ign.fr' && u.pathname.includes('cadastre')) {
      const tout = parcelles(), start = parseInt(u.searchParams.get('_start') ?? '0', 10), limit = parseInt(u.searchParams.get('_limit') ?? '60', 10);
      return reponse({ features: tout.slice(start, start + limit), totalFeatures: tout.length });
    }
    if (u.hostname === 'apicarto.ign.fr') return reponse({ features: [] });
    if ((u.searchParams.get('TYPENAMES') ?? '').includes('batiment')) return reponse({ features: batiments(), numberMatched: batiments().length });
    return reponse({ features: [] });
  }));
  // `location.href` est ecrit apres l'enregistrement : un objet suffit sous Node.
  vi.stubGlobal('location', { href: '' });
  const memoire: Record<string, string> = {};
  vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => { memoire[k] = v; }, getItem: (k: string) => memoire[k] ?? null });
  return appels;
}
const adresse = { label: 'Adresse', score: 1, genre: 'housenumber', citycode: '78650', ville: 'Le Vesinet', lon, lat };
type Sauve = { objects: { voisinage?: boolean; key: string; affichage?: { voisinage?: boolean } }[] };

describe('le voisinage etendu au curseur, a l etape 3', () => {
  it('se lit une fois a 200 m, se compte au rayon du curseur sans reseau, et part a la creation', async () => {
    const appels = servir();
    const ctx = contexte();
    const i = creerImportCadastre(ctx, vi.fn());
    await i.choisirAdresse(adresse);
    expect(i.etat().etape).toBe(2);
    i.allerA(3);
    expect(i.voisinageEtenduRetenu()).toBeNull();
    expect(i.etat().rayonEtendu).toBe(50);

    await i.basculerVoisinageEtendu(true);
    expect(i.etat().etenduMax!.rayonM).toBe(200);
    const a50 = i.voisinageEtenduRetenu()!;
    expect(a50.rayonM).toBe(50);
    const avant = appels.length;
    i.reglerRayonEtendu(120);
    const a120 = i.voisinageEtenduRetenu()!;
    expect(a120.parcelles.length).toBeGreaterThan(a50.parcelles.length);
    expect(a120.batiments.length).toBeGreaterThan(a50.batiments.length);
    i.reglerRayonEtendu(5);
    expect(i.etat().rayonEtendu).toBe(10);
    i.reglerRayonEtendu(120);
    expect(appels.length).toBe(avant);
    expect(a120.parcelles.some(c => c.idu === i.etat().principale!.idu)).toBe(false);

    // L'option d'affichage pilote l'apercu.
    expect(i.apercu().etendu!.rayonM).toBe(120);
    i.basculerAfficherEtendu(false);
    expect(i.apercu().etendu).toBeNull();

    // Une autre principale : le choix reste, la lecture est refaite autour d'elle.
    const autre = i.etat().adjacentes[0]!;
    await i.choisirPrincipale(autre);
    expect(i.etat().voisinageEtendu).toBe(true);
    expect(i.etat().etenduMax).not.toBeNull();

    await i.creerProjet('Test');
    const objets = (ctx.sauve[0] as Sauve).objects;
    expect(objets.filter(o => o.voisinage).length).toBeGreaterThan(20);
    expect(objets.find(o => o.key === 'parcelle')!.affichage).toEqual({ voisinage: false });
  });

  it('ne lit rien et n ajoute rien quand la case est decochee', async () => {
    servir();
    const ctx = contexte();
    const i = creerImportCadastre(ctx, vi.fn());
    await i.choisirAdresse(adresse);
    i.allerA(3);
    i.reglerRayonEtendu(150);
    expect(i.etat().etenduMax).toBeNull();
    await i.creerProjet('Test');
    expect((ctx.sauve[0] as Sauve).objects.some(o => o.voisinage)).toBe(false);
  });
});

describe('l import direct, sans les etapes 2 et 3', () => {
  it('reste a l etape 1 avec un resume, compte le voisinage avant de creer, et se memorise', async () => {
    servir();
    const ctx = contexte();
    const i = creerImportCadastre(ctx, vi.fn());
    expect(i.etat().importDirect).toBe(false);
    i.basculerImportDirect(true);
    await i.basculerVoisinageEtendu(true);   // avant la parcelle : rien a lire encore
    expect(i.etat().etenduMax).toBeNull();
    i.reglerRayonEtendu(80);
    await i.choisirAdresse(adresse);
    expect(i.etat().etape).toBe(1);
    expect(i.etat().resumePret).toBe(true);
    const compte = i.voisinageEtenduRetenu()!;
    expect(compte.rayonM).toBe(80);
    expect(compte.parcelles.length).toBeGreaterThan(5);
    // « Ajuster » mene aux etapes 2 et 3 ; revenir a l'adresse efface le resume.
    i.allerA(2);
    i.allerA(1);
    expect(i.etat().resumePret).toBe(false);
    await i.choisirAdresse(adresse);
    await i.creerProjet(i.nomParDefaut());
    const objets = (ctx.sauve[0] as Sauve).objects;
    expect(objets.filter(o => o.voisinage).length).toBe(compte.parcelles.length + compte.batiments.length);
    // Le choix suit l'utilisateur : un nouvel import le retrouve.
    expect(creerImportCadastre(contexte(), vi.fn()).etat().importDirect).toBe(true);
  });
});
