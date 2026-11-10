// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { lancerActualisationProjet, ouvrirActualisationProjet, POINTS_ACTUALISATION, POINT_RETOUCHES } from '../../../../src/app/cadastre/actualiserProjet.js';
import { dialogues } from '../../../../src/shell/dialogues.js';
import { actualiserDepuisIgn, actualisation, type ContexteActualisation } from '../../../../src/app/cadastre/actualisationIgn.js';
import { objetsRetouches } from '../../../../src/app/cadastre/actualisationIgn/toitsEtMurs.js';
import { serializeObjects } from '../../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../../src/model/normalisation.js';
import { projecteurLocal } from '../../../../src/geo/projection.js';
import type { ObjetBrut, ObjetPlan, PtBrut } from '../../../../src/model/types.js';

// La retouche a la main d'un objet de l'IGN a l'actualisation (decision du 27 octobre 2026) : garde tel quel par defaut, la
// version de l'IGN reprise quand la personne le demande, et un batiment repris garde sa cle.

const lat0 = 48.9, lon0 = 2.13, proj = projecteurLocal(lat0, lon0);
const carre = (x: number, y: number, l: number): PtBrut[] => [{ x, y }, { x: x + l, y }, { x: x + l, y: y + l }, { x, y: y + l }];
const anneau = (pts: PtBrut[]) => [...pts, pts[0]!].map(p => { const d = proj.versDegres(p.x, p.y); return [d.lon, d.lat]; });
// La maison retouchee : un coin tire de 2 m par rapport a l'IGN (carre de 10 m en 5,5).
const retouchee = (): PtBrut[] => [{ x: 5, y: 5 }, { x: 17, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }];

function plan(opts: { maisonRetouchee?: boolean; parcelleRetouchee?: boolean } = {}): ObjetPlan[] {
  const terrain = carre(0, 0, 30);
  return normalizeObjects([
    {
      key: 'parcelle', type: 'polygon', name: 'Parcelle AE 101', fonction: 'terrain',
      pts: opts.parcelleRetouchee ? [{ x: 0, y: 0 }, { x: 31, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }] : terrain,
      ...(opts.parcelleRetouchee ? { retoucheMain: { date: '2026-10-20' } } : {}),
      cadastre: { idu: '78650000AE0101', section: 'AE', numero: '0101', codeInsee: '78650', commune: 'Le Vésinet', origineLat: lat0, origineLon: lon0, geometrieSource: { type: 'Polygon', coordinates: [anneau(terrain)] } }
    },
    {
      // Une cle qui n'est pas celle qu'un import d'aujourd'hui lui donnerait (« bati-bat1 ») : c'est elle qui doit rester.
      key: 'maison', type: 'polygon', name: 'Maison', fonction: 'batiment', pts: opts.maisonRetouchee ? retouchee() : carre(5, 5, 10), elevation: 6,
      ...(opts.maisonRetouchee ? { retoucheMain: { date: '2026-10-27' } } : {}),
      batiment: { toit: { forme: 'deux-pans', pente: 35, faitage: 'long', source: 'bdtopo' } },
      bdtopo: { couche: 'BDTOPO_V3:batiment', id: 'BAT1', surParcellePrincipale: true }
    },
    { key: 'terrasse', type: 'polygon', name: 'Terrasse', fonction: 'terrasse', pts: carre(16, 16, 4) }
  ] as unknown as ObjetBrut[]) as ObjetPlan[];
}

/** Le service IGN : la parcelle (carre de 30 m) et le batiment BAT1 (carre de 10 m en 5,5). */
function service(): void {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const corps = url.includes('apicarto.ign.fr/api/cadastre')
      ? { features: [{ type: 'Feature', properties: { contenance: 900, nom_com: 'Le Vésinet' }, geometry: { type: 'Polygon', coordinates: [anneau(carre(0, 0, 30))] } }] }
      : url.includes('batiment')
        ? { features: [{ type: 'Feature', id: 'BAT1', properties: { cleabs: 'BAT1', hauteur: '7', nature: 'Indifférenciée', usage_1: 'Résidentiel', nombre_d_etages: '2' }, geometry: { type: 'Polygon', coordinates: [anneau(carre(5, 5, 10))] } }] }
        : { features: [] };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as unknown as Response);
  }));
}
afterEach(() => vi.unstubAllGlobals());
beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => null) as never; });

function contexte(objets: ObjetPlan[]): ContexteActualisation & { etat: { objects: ObjetPlan[] } } {
  const etat = { objects: objets, measures: [], terrasseSelectedKey: 'terrasse' } as unknown as ContexteActualisation['etat'];
  return {
    etat, markDirty: vi.fn(), pushHistory: vi.fn(), rebuildSelector: vi.fn(), render: vi.fn(), syncLieuTitre: vi.fn(),
    restoreState: (i) => { etat.objects = normalizeObjects(i.objects) as ObjetPlan[]; },
    serializeMeasures: () => [], serializeObjects: (o) => serializeObjects(o),
    trouverParcelleCloture: () => etat.objects.find(o => o.key === 'parcelle'),
    lireRelief: vi.fn(async () => null as never),
    toitsLidar: vi.fn(async () => ({ lus: 0, ajustes: 0 }) as never),
    couleursMurs: vi.fn(async () => ({ photos: 0, ambigus: 0 }))
  } as ContexteActualisation & { etat: { objects: ObjetPlan[] } };
}
const empreinte = (o: ObjetPlan | undefined) => JSON.stringify(serializeObjects(o ? [o] : []));
/** Les sommets d'un objet, arrondis au centimetre et tries : l'ordre et le sens du contour relu ne disent rien ici. */
const sommets = (o: ObjetPlan | undefined) => (o && o.type !== 'circle' ? o.pts : []).map(p => Math.round(p.x * 100) / 100 + ',' + Math.round(p.y * 100) / 100).sort();
const batiments = (ctx: { etat: { objects: ObjetPlan[] } }) => ctx.etat.objects.filter(o => o.fonction === 'batiment');

describe('l actualisation IGN et un objet retouche a la main', () => {
  it('garde le batiment retouche tel quel par defaut, sans en ajouter un a cote', async () => {
    service();
    const objets = plan({ maisonRetouchee: true });
    const avant = empreinte(objets.find(o => o.key === 'maison'));
    const ctx = contexte(objets);
    await actualiserDepuisIgn({ portee: 'tout', voisinage: { actif: false } }, ctx);
    expect(actualisation.enCours()).toBe(false);
    expect(empreinte(ctx.etat.objects.find(o => o.key === 'maison'))).toBe(avant);
    expect(batiments(ctx).map(o => o.key)).toEqual(['maison']);
  });

  it('reprend la version de l IGN quand on le demande : contour de l IGN, marque retire, meme cle', async () => {
    service();
    const ctx = contexte(plan({ maisonRetouchee: true }));
    await actualiserDepuisIgn({ portee: 'tout', voisinage: { actif: false }, reprendre: ['maison'] }, ctx);
    const maison = ctx.etat.objects.find(o => o.key === 'maison');
    expect(sommets(maison)).toEqual(sommets({ type: 'polygon', pts: carre(5, 5, 10) } as ObjetPlan));
    expect(maison?.retoucheMain).toBeUndefined();
    expect(maison?.elevation).toBe(7);
    expect(batiments(ctx).map(o => o.key)).toEqual(['maison']);
  });

  it('garde la parcelle retouchee, meme quand seule la parcelle est relue ; la reprend sur demande', async () => {
    service();
    const ctx = contexte(plan({ parcelleRetouchee: true }));
    await actualiserDepuisIgn({ portee: 'parcelle', voisinage: { actif: false } }, ctx);
    const p = ctx.etat.objects.find(o => o.key === 'parcelle');
    expect(sommets(p)).toContain('31,0');
    expect(p?.retoucheMain).toEqual({ date: '2026-10-20' });
    service();
    await actualiserDepuisIgn({ portee: 'parcelle', voisinage: { actif: false }, reprendre: ['parcelle'] }, ctx);
    const q = ctx.etat.objects.find(o => o.key === 'parcelle');
    expect(sommets(q)).toEqual(sommets({ type: 'polygon', pts: carre(0, 0, 30) } as ObjetPlan));
    expect(q?.retoucheMain).toBeUndefined();
  });
});

describe('Actualiser le projet et un objet retouche a la main', () => {
  it('garde le batiment retouche au bit pres par defaut', async () => {
    service();
    const objets = plan({ maisonRetouchee: true });
    const avant = empreinte(objets.find(o => o.key === 'maison'));
    const ctx = contexte(objets);
    await lancerActualisationProjet(ctx);
    expect(empreinte(ctx.etat.objects.find(o => o.key === 'maison'))).toBe(avant);
    expect(batiments(ctx).map(o => o.key)).toEqual(['maison']);
  });

  it('le remplace par la BD TOPO quand on le demande, sous sa cle, sans marque', async () => {
    service();
    const ctx = contexte(plan({ maisonRetouchee: true }));
    await lancerActualisationProjet(ctx, 'garder', ['maison']);
    expect(batiments(ctx).map(o => o.key)).toEqual(['maison']);
    const maison = ctx.etat.objects.find(o => o.key === 'maison');
    expect(sommets(maison)).toEqual(sommets({ type: 'polygon', pts: carre(5, 5, 10) } as ObjetPlan));
    expect(maison?.retoucheMain).toBeUndefined();
    expect(maison?.name).toBe('Résidentiel (2 niv.)');
  });

  it('un batiment ordinaire recree depuis la BD TOPO garde lui aussi sa cle', async () => {
    service();
    const ctx = contexte(plan());
    await lancerActualisationProjet(ctx);
    expect(batiments(ctx).map(o => o.key)).toEqual(['maison']);
  });

  it('pose une case decochee par objet retouche ; cochee, l objet est repris', async () => {
    service();
    const ctx = contexte(plan({ maisonRetouchee: true, parcelleRetouchee: true }));
    expect(objetsRetouches(ctx.etat.objects).map(r => r.cle)).toEqual(['parcelle', 'maison']);
    ouvrirActualisationProjet(ctx);
    const d = dialogues.courant();
    expect(d?.type).toBe('choix');
    if (d?.type !== 'choix') return;
    expect(d.points).toContain(POINT_RETOUCHES);
    expect(d.cases?.map(c => [c.libelle, c.cochee])).toEqual([
      ['Reprendre la version de l’IGN pour « Parcelle AE 101 », retouché à la main le 20/10/2026', false],
      ['Reprendre la version de l’IGN pour « Maison », retouché à la main le 27/10/2026', false]
    ]);
    d.cases?.[1]?.changer(true);
    dialogues.repondre();
    for (let i = 0; i < 400 && (actualisation.enCours() || !(ctx.toitsLidar as ReturnType<typeof vi.fn>).mock.calls.length); i++) await new Promise(r => setTimeout(r, 5));
    for (let i = 0; i < 400 && actualisation.enCours(); i++) await new Promise(r => setTimeout(r, 5));
    expect(ctx.etat.objects.find(o => o.key === 'maison')?.retoucheMain).toBeUndefined();
    expect(ctx.etat.objects.find(o => o.key === 'parcelle')?.retoucheMain).toEqual({ date: '2026-10-20' });
    // Sans objet retouche : le dialogue de toujours.
    ouvrirActualisationProjet(contexte(plan()));
    const d2 = dialogues.courant();
    expect(d2?.type === 'choix' && d2.cases).toBeUndefined();
    expect(d2?.type === 'choix' ? d2.points : []).toEqual(POINTS_ACTUALISATION);
    dialogues.fermer();
  });
});

describe('l actualisation IGN et une hauteur a l egout choisie (MD/spec-flux-batiment.md, flux du batiment, point 4)', () => {
  const avecHauteur = (marque: 'saisie' | 'audit' | null) => {
    const objets = plan();
    const maison = objets.find(o => o.key === 'maison')!;
    maison.elevation = 5.4;
    if (marque) maison.batiment = { ...maison.batiment, egoutChoisi: marque };
    return objets;
  };

  it('la BD TOPO du jour remplace une hauteur lue, pas une hauteur saisie ou validee', async () => {
    for (const [marque, attendue] of [[null, 7], ['saisie', 5.4], ['audit', 5.4]] as const) {
      service();
      const ctx = contexte(avecHauteur(marque));
      await actualiserDepuisIgn({ portee: 'tout', voisinage: { actif: false } }, ctx);
      const maison = ctx.etat.objects.find(o => o.key === 'maison');
      expect(maison?.elevation, String(marque)).toBe(attendue);
      expect(maison?.batiment?.egoutChoisi ?? null).toBe(marque);
    }
  });

  it('« Actualiser le projet » recree le batiment avec la hauteur choisie', async () => {
    service();
    const ctx = contexte(avecHauteur('saisie'));
    await actualiserDepuisIgn({ portee: 'tout', voisinage: { actif: false }, recreerBatiments: true, parDefaut: true }, ctx);
    const [maison] = batiments(ctx);
    expect(maison?.key).toBe('maison');
    expect(maison?.elevation).toBe(5.4);
    expect(maison?.batiment?.egoutChoisi).toBe('saisie');
  });
});

describe('l actualisation IGN et les releves rangés par mur (MD/spec-flux-batiment.md, flux du batiment, point 8)', () => {
  it('un contour du jour qui commence a un autre sommet : le releve et les cotes restent sur leur mur', async () => {
    service();
    const objets = plan();
    const maison = objets.find(o => o.key === 'maison') as ObjetPlan & { pts: PtBrut[] };
    // Le releve sur le mur sud (y = 5), quel que soit son rang dans le contour du jour.
    const sud = (pts: PtBrut[]) => pts.findIndex((p, i) => { const q = pts[(i + 1) % pts.length]!; return Math.abs(p.y - 5) < 0.05 && Math.abs(q.y - 5) < 0.05; });
    maison.pts = [maison.pts[1]!, maison.pts[2]!, maison.pts[3]!, maison.pts[0]!];
    const rang = sud(maison.pts);
    maison.batiment = { ...maison.batiment, facades: [{ cote: rang, ouvertures: [] } as never] };
    const ctx = contexte(objets);
    let cotes: unknown[] = [];
    ctx.serializeMeasures = () => [{ id: 'c1', refObjKey: 'maison', refSegIndex: rang, startEnd: 'B', targetObjKey: 'terrasse', targetPtIndex: 0, show: true, displayMode: 'along' }];
    const restaurer = ctx.restoreState;
    ctx.restoreState = (i) => { cotes = i.measures; restaurer(i); };
    await actualiserDepuisIgn({ portee: 'tout', voisinage: { actif: false } }, ctx);
    const relue = ctx.etat.objects.find(o => o.key === 'maison') as ObjetPlan & { pts: PtBrut[] };
    const rangDuJour = sud(relue.pts);
    expect(rangDuJour).not.toBe(rang);
    expect(relue.batiment?.facades?.map(f => f.cote)).toEqual([rangDuJour]);
    expect((cotes[0] as { refSegIndex: number }).refSegIndex).toBe(rangDuJour);
  });
});

describe('le LiDAR bat l IGN (decision du 28 octobre 2026)', () => {
  const lue = (pts: PtBrut[]) => {
    const objets = plan();
    const m = objets.find(o => o.key === 'maison') as ObjetPlan & { pts: PtBrut[] };
    m.pts = pts;
    m.elevation = 6.3;
    m.batiment = { ...m.batiment, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar', couverture: 'ardoise' }, toitLidarLu: 7 };
    return objets;
  };

  it('un contour recale au LiDAR, de meme forme a la BD TOPO : contour, hauteur et toit lus restent ; les attributs sont relus', async () => {
    service();
    const recale = carre(5, 5, 10).map(p => ({ x: p.x + 1, y: p.y - 0.75 }));
    const ctx = contexte(lue(recale));
    await actualiserDepuisIgn({ portee: 'tout', voisinage: { actif: false } }, ctx);
    const m = ctx.etat.objects.find(o => o.key === 'maison') as ObjetPlan & { pts: PtBrut[] };
    expect(m.pts).toEqual(recale);
    expect(m.elevation).toBe(6.3);
    expect(m.batiment?.toit?.source).toBe('lidar');
    expect(m.batiment?.toitLidarLu).toBe(7);
    expect((m.bdtopo as { nombreEtages?: number }).nombreEtages).toBe(2);
  });

  it('un contour change a l IGN meme : le contour du jour est pris et se relira, la hauteur mesuree et la couverture restent', async () => {
    service();
    const ctx = contexte(lue([{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 12 }, { x: 5, y: 12 }]));
    await actualiserDepuisIgn({ portee: 'tout', voisinage: { actif: false } }, ctx);
    const m = ctx.etat.objects.find(o => o.key === 'maison');
    expect(sommets(m)).toEqual(sommets({ type: 'polygon', pts: carre(5, 5, 10) } as unknown as ObjetPlan));
    expect(m?.elevation).toBe(6.3);
    expect(m?.batiment?.toitLidarLu ?? null).toBeNull();
    expect(m?.batiment?.toit?.source).toBe('bdtopo');
    expect(m?.batiment?.toit?.couverture).toBe('ardoise');
  });
});
