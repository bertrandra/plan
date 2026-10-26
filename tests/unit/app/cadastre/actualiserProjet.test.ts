// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { valeursParDefaut, estImporte } from '../../../../src/app/cadastre/valeursParDefaut.js';
import { lancerActualisationProjet, ouvrirActualisationProjet, POINTS_ACTUALISATION, POINT_VERIFIES, pointsActualisation, libelleCaseVerifies } from '../../../../src/app/cadastre/actualiserProjet.js';
import { dialogues } from '../../../../src/shell/dialogues.js';
import { actualisation, type ContexteActualisation } from '../../../../src/app/cadastre/actualisationIgn.js';
import { APPARENCES_IGN, apparenceIgnParDefaut } from '../../../../src/geo/cadastreObjets.js';
import { serializeObjects } from '../../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../../src/model/normalisation.js';
import { projecteurLocal } from '../../../../src/geo/projection.js';
import type { ObjetBrut, ObjetPlan, PtBrut, Relief } from '../../../../src/model/types.js';

// « Fichier › Actualiser le projet » (app/cadastre/actualiserProjet.ts) : l'actualisation IGN entiere, chaque
// objet importe ramene d'abord aux valeurs par defaut ; ce qui a ete dessine a la main, intact.

const lat0 = 48.9, lon0 = 2.13, proj = projecteurLocal(lat0, lon0);
const carre = (x: number, y: number, l: number): PtBrut[] => [{ x, y }, { x: x + l, y }, { x: x + l, y: y + l }, { x, y: y + l }];
const anneau = (pts: PtBrut[]) => [...pts, pts[0]!].map(p => { const d = proj.versDegres(p.x, p.y); return [d.lon, d.lat]; });
const texture = { id: 'brick', nom: 'Brique', vignette: '', url: 'https://dl.polyhaven.org/x.jpg' };

function plan(): ObjetPlan[] {
  const terrain = carre(0, 0, 30);
  return normalizeObjects([
    {
      key: 'parcelle', type: 'polygon', name: 'Parcelle AE 101', fonction: 'terrain', pts: terrain,
      fill: '#112233', fillOpacity: 0.3, stroke: '#000000', textureHorizontale: texture, gazon3d: false,
      voisinage3d: { couleurMaisons: '#ff00ff' },
      cadastre: { idu: '78650000AE0101', section: 'AE', numero: '0101', codeInsee: '78650', commune: 'Le Vésinet', origineLat: lat0, origineLon: lon0, geometrieSource: { type: 'Polygon', coordinates: [anneau(terrain)] } },
      relief: { source: 'rge-alti', couche: 'c', dateLecture: '2026-01-01', origine: 'o', precision: 'p', systemeAltimetrique: 'NGF-IGN69', pas: 1, x0: 0.5, y0: 29.5, nx: 2, ny: 2, z: [1, 1, 1, 1], zRef: 1, affichage: { courbes: true, sol3d: false }, maxCellules: 90000 }
    },
    {
      key: 'bati-bat1', type: 'polygon', name: 'Ma maison', fonction: 'batiment', pts: carre(5, 5, 10), elevation: 6, hidden: false,
      fill: '#ff0000', fillOpacity: 1, stroke: '#ff0000', textureVerticale: texture, couleurMurs: { source: 'plan' }, modeToit: 'simple', fenetres3d: { afficher: false },
      toit: { forme: 'deux-pans', pente: 35, faitage: 'long', source: 'bdtopo', couleur: '#123456' },
      corpsToit: [{ pts: carre(5, 5, 10), egouts: [5], faitage: 8, pignons: [] }],
      bdtopo: { couche: 'BDTOPO_V3:batiment', id: 'BAT1', surParcellePrincipale: true },
      toitACheval: { parcelles: ['parcelle', 'p2'], reponse: 'un' }
    },
    // Un abri dessine a la main sur la parcelle, et un batiment voisin hors d'elle.
    { key: 'abri', type: 'polygon', name: 'Abri', fonction: 'batiment', pts: carre(22, 2, 3), elevation: 2.2, fill: '#00ffff' },
    {
      key: 'bati-v9', type: 'polygon', name: 'Voisin', fonction: 'batiment', pts: carre(40, 0, 6), elevation: 5, locked: true, voisinage: true,
      bdtopo: { couche: 'BDTOPO_V3:batiment', id: 'V9', surParcellePrincipale: false }
    },
    { key: 'terrasse', type: 'polygon', name: 'Terrasse', fonction: 'terrasse', pts: carre(16, 16, 4), fill: '#00ff00', textureHorizontale: texture }
  ] as unknown as ObjetBrut[]) as ObjetPlan[];
}

/** Le service IGN : la parcelle, le batiment BAT1 a sa place, le reste vide ; `sansBdTopo` : la BD TOPO ne repond pas. */
function service(sansBdTopo = false): string[] {
  const appels: string[] = [];
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    appels.push(url);
    if (sansBdTopo && url.includes('BDTOPO')) return Promise.reject(new Error('hors ligne'));
    const corps = url.includes('apicarto.ign.fr/api/cadastre')
      ? { features: [{ type: 'Feature', properties: { contenance: 900, nom_com: 'Le Vésinet' }, geometry: { type: 'Polygon', coordinates: [anneau(carre(0, 0, 30))] } }] }
      : url.includes('batiment')
        ? { features: [{ type: 'Feature', id: 'BAT1', properties: { cleabs: 'BAT1', hauteur: '7', nature: 'Indifférenciée', usage_1: 'Résidentiel', nombre_d_etages: '2' }, geometry: { type: 'Polygon', coordinates: [anneau(carre(5, 5, 10))] } }] }
        : { features: [] };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as unknown as Response);
  }));
  return appels;
}
afterEach(() => vi.unstubAllGlobals());
// La couleur des toits se lit sur un canevas 2D, que jsdom n'a pas : sans contexte, l'etape passe.
beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => null) as never; });

function contexte(objets: ObjetPlan[], relief: Relief): ContexteActualisation & { etat: { objects: ObjetPlan[] } } {
  const etat = { objects: objets, measures: [], terrasseSelectedKey: 'terrasse' } as unknown as ContexteActualisation['etat'];
  return {
    etat, markDirty: vi.fn(), pushHistory: vi.fn(), rebuildSelector: vi.fn(), render: vi.fn(), syncLieuTitre: vi.fn(),
    restoreState: (i) => { etat.objects = normalizeObjects(i.objects) as ObjetPlan[]; },
    serializeMeasures: () => [], serializeObjects: (o) => serializeObjects(o),
    trouverParcelleCloture: () => etat.objects.find(o => o.key === 'parcelle'),
    lireRelief: vi.fn(async () => relief),
    toitsLidar: vi.fn(async () => ({ lus: 0, ajustes: 0 }) as never),
    couleursMurs: vi.fn(async () => ({ photos: 0, ambigus: 0 }))
  } as ContexteActualisation & { etat: { objects: ObjetPlan[] } };
}

describe('les valeurs par defaut d un objet importe', () => {
  it('ramene couleurs, textures et reglages d apparence a l import, et laisse le toit a relire', () => {
    const [parcelle, bati, , , terrasse] = serializeObjects(plan()) as ObjetBrut[];
    const p = valeursParDefaut(parcelle!), b = valeursParDefaut(bati!);
    expect([p.fill, p.fillOpacity, p.stroke]).toEqual([APPARENCES_IGN.parcelle.fill, 1, APPARENCES_IGN.parcelle.stroke]);
    expect(p.textureHorizontale).toBeNull();
    expect('gazon3d' in p || 'voisinage3d' in p).toBe(false);
    expect([b.fill, b.fillOpacity]).toEqual([APPARENCES_IGN.batimentPropriete.fill, APPARENCES_IGN.batimentPropriete.fillOpacity]);
    expect(b.textureVerticale).toBeNull();
    expect('couleurMurs' in b || 'modeToit' in b || 'fenetres3d' in b).toBe(false);
    expect(b.toit).toMatchObject({ source: 'bdtopo', forme: 'deux-pans' });
    expect(b.toit).not.toHaveProperty('couleur');
    expect(b.corpsToit).toBeNull();
    // Le nom et le masquage sont des choix d'organisation du plan : ils restent.
    expect(b.name).toBe('Ma maison');
    // Un objet dessine a la main rend tel quel.
    expect(valeursParDefaut(terrasse!)).toBe(terrasse);
    expect(estImporte(terrasse!)).toBe(false);
  });

  it('reconnait chaque famille importee, voisinage compris', () => {
    expect(apparenceIgnParDefaut({ key: 'p2', fonction: 'terrain', cadastre: { idu: 'X' } })).toBe(APPARENCES_IGN.parcelleVoisine);
    expect(apparenceIgnParDefaut({ key: 'limite-1', fonction: 'limite' })).toBe(APPARENCES_IGN.limite);
    expect(apparenceIgnParDefaut({ fonction: 'batiment', bdtopo: { couche: 'BDTOPO_V3:batiment', surParcellePrincipale: false } })).toBe(APPARENCES_IGN.batimentVoisin);
    expect(apparenceIgnParDefaut({ fonction: 'massif', bdtopo: { couche: 'BDTOPO_V3:haie' } })).toBe(APPARENCES_IGN.haie);
    expect(apparenceIgnParDefaut({ fonction: 'massif', bdtopo: { couche: 'BDTOPO_V3:zone_de_vegetation' } })).toBe(APPARENCES_IGN.vegetation);
    expect(apparenceIgnParDefaut({ fonction: 'arbre', bdtopo: { couche: 'estimation' } })).toBe(APPARENCES_IGN.arbreEstime);
    expect(apparenceIgnParDefaut({ key: 'massif', fonction: 'massif' })).toBeNull();
  });
});

describe('Actualiser le projet', () => {
  it('relit tout, recree les batiments de la parcelle, ramene les autres objets importes aux valeurs par defaut et laisse intact le reste du dessin', async () => {
    service();
    const relief: Relief = { source: 'lidar-hd', couche: 'l', dateLecture: '2026-10-11', origine: 'LiDAR HD', precision: 'p', systemeAltimetrique: 'NGF-IGN69', pas: 0.5, x0: 0.25, y0: 29.75, nx: 2, ny: 2, z: [2, 2, 2, 2], zRef: 2 };
    const ctx = contexte(plan(), relief);
    await lancerActualisationProjet(ctx);
    expect(actualisation.enCours()).toBe(false);
    expect(ctx.pushHistory).toHaveBeenCalledTimes(1);
    const parcelle = ctx.etat.objects.find(o => o.key === 'parcelle')!;
    const bati = ctx.etat.objects.find(o => o.key === 'bati-bat1')!;
    const terrasse = ctx.etat.objects.find(o => o.key === 'terrasse')!;
    // La parcelle : apparence d'import, gazon par defaut, relief relu sur toutes les parcelles (pas de voisine ici : la parcelle seule), affichage par defaut, plafond garde.
    expect(parcelle.fill).toBe(APPARENCES_IGN.parcelle.fill);
    expect(parcelle.gazon3d).toBeUndefined();
    expect(parcelle.textureHorizontale ?? null).toBeNull();
    expect(parcelle.relief?.zRef).toBe(2);
    expect(parcelle.relief?.affichage ?? null).toBeNull();
    expect(parcelle.relief?.maxCellules).toBe(90000);
    // Les batiments de la parcelle : supprimes, puis recrees depuis la BD TOPO comme a un import —
    // nom, hauteur, apparence et toit d'aujourd'hui ; l'abri dessine dessus disparait avec eux.
    expect(bati.fill).toBe(APPARENCES_IGN.batimentPropriete.fill);
    expect(bati.elevation).toBe(7);
    expect(bati.couleurMurs).toBeUndefined();
    expect(bati.modeToit).toBeUndefined();
    expect(bati.textureVerticale ?? null).toBeNull();
    expect(bati.toit?.source).toBe('bdtopo');
    expect(bati.toit?.couleur).toBeUndefined();
    expect(bati.name).toBe('Résidentiel (2 niv.)');
    expect((bati.bdtopo as { surParcellePrincipale?: boolean }).surParcellePrincipale).toBe(true);
    // La reponse a la question du toit a cheval est un choix de la personne : elle suit le batiment.
    expect(bati.toitACheval).toEqual({ parcelles: ['parcelle', 'p2'], reponse: 'un' });
    expect(ctx.etat.objects.some(o => o.key === 'abri')).toBe(false);
    expect(ctx.etat.objects.filter(o => o.fonction === 'batiment').map(o => o.key).sort()).toEqual(['bati-bat1', 'bati-v9']);
    expect(ctx.toitsLidar).toHaveBeenCalledTimes(1);
    expect(ctx.couleursMurs).toHaveBeenCalledTimes(1);
    // Ce qui a ete dessine : tel quel.
    expect(terrasse.fill).toBe('#00ff00');
    expect(terrasse.textureHorizontale?.id).toBe('brick');
  });

  it('garde les batiments de la parcelle si la BD TOPO ne repond pas', async () => {
    service(true);
    const relief: Relief = { source: 'lidar-hd', couche: 'l', dateLecture: '2026-10-11', origine: 'LiDAR HD', precision: 'p', systemeAltimetrique: 'NGF-IGN69', pas: 0.5, x0: 0.25, y0: 29.75, nx: 2, ny: 2, z: [2, 2, 2, 2], zRef: 2 };
    const ctx = contexte(plan(), relief);
    await lancerActualisationProjet(ctx);
    expect(ctx.etat.objects.filter(o => o.fonction === 'batiment').map(o => o.key).sort()).toEqual(['abri', 'bati-bat1', 'bati-v9']);
    expect(ctx.etat.objects.find(o => o.key === 'abri')?.fill).toBe('#00ffff');
  });

  it('dit ce qu il fait avant de le faire', () => {
    expect(POINTS_ACTUALISATION.join(' ')).toMatch(/Supprimés puis recréés.*bâtiments de la parcelle.*Relu à l’IGN.*valeurs par défaut.*Conservés : le reste de ce que vous avez dessiné.*Ctrl\+Z/);
    expect(pointsActualisation(0)).toBe(POINTS_ACTUALISATION);
    expect(pointsActualisation(2).at(-2)).toBe(POINT_VERIFIES);
    expect(pointsActualisation(2).at(-1)).toBe('Ctrl+Z rend le projet d’avant.');
  });
});

// Le 100 % protege (lot L12, MD/spec-regles-toits.md §1, MD/spec-audit.md §14.5) : un batiment
// verifie sur place n'est ni recree, ni relu, ni ramene aux valeurs par defaut - sauf si on le demande.
describe('Actualiser le projet et les batiments verifies sur place', () => {
  const relief: Relief = { source: 'lidar-hd', couche: 'l', dateLecture: '2026-10-11', origine: 'LiDAR HD', precision: 'p', systemeAltimetrique: 'NGF-IGN69', pas: 0.5, x0: 0.25, y0: 29.75, nx: 2, ny: 2, z: [2, 2, 2, 2], zRef: 2 };
  const planVerifie = () => { const objets = plan(); objets.find(o => o.key === 'bati-bat1')!.verifieSurPlace = { date: '2026-10-13' }; return objets; };
  const empreinte = (o: ObjetPlan | undefined) => JSON.stringify(serializeObjects(o ? [o] : []));

  it('garde le batiment verifie tel quel, au bit pres, et ne le recree pas a cote', async () => {
    service();
    const objets = planVerifie();
    const avant = empreinte(objets.find(o => o.key === 'bati-bat1'));
    const ctx = contexte(objets, relief);
    await lancerActualisationProjet(ctx);
    const bati = ctx.etat.objects.find(o => o.key === 'bati-bat1');
    // Ni valeurs par defaut, ni BD TOPO, ni LiDAR, ni couleurs : la maison verifiee est celle d'avant.
    expect(empreinte(bati)).toBe(avant);
    expect(bati?.elevation).toBe(6);
    expect(bati?.couleurMurs).toEqual({ source: 'plan' });
    // Le batiment frais BAT1 de la BD TOPO n'est pas ajoute a cote d'elle ; l'abri, lui, part comme avant.
    expect(ctx.etat.objects.filter(o => o.fonction === 'batiment').map(o => o.key).sort()).toEqual(['bati-bat1', 'bati-v9']);
    // La lecture LiDAR est appelee sans les batiments verifies.
    expect((ctx.toitsLidar as ReturnType<typeof vi.fn>).mock.calls[0]?.[2]).toEqual({ verifies: 'garder' });
    // Le reste du projet est bien actualise.
    expect(ctx.etat.objects.find(o => o.key === 'parcelle')?.fill).toBe(APPARENCES_IGN.parcelle.fill);
  });

  it('le recalcule comme les autres quand on le demande', async () => {
    service();
    const ctx = contexte(planVerifie(), relief);
    await lancerActualisationProjet(ctx, 'relire');
    const bati = ctx.etat.objects.find(o => o.key === 'bati-bat1');
    expect(bati?.elevation).toBe(7);
    expect(bati?.verifieSurPlace).toBeUndefined();
    expect(bati?.fill).toBe(APPARENCES_IGN.batimentPropriete.fill);
    expect((ctx.toitsLidar as ReturnType<typeof vi.fn>).mock.calls[0]?.[2]).toEqual({ verifies: 'relire' });
  });

  it('pose la question avec une case decochee, qui relit les batiments verifies si on la coche', async () => {
    service();
    const ctx = contexte(planVerifie(), relief);
    ouvrirActualisationProjet(ctx);
    const d = dialogues.courant();
    expect(d?.type).toBe('choix');
    if (d?.type !== 'choix') return;
    expect(d.points).toContain(POINT_VERIFIES);
    expect(d.case).toMatchObject({ libelle: 'Recalculer aussi « Ma maison », vérifié sur place le 13/10/2026', cochee: false });
    d.case?.changer(true);
    dialogues.repondre();
    for (let i = 0; i < 200 && !(ctx.toitsLidar as ReturnType<typeof vi.fn>).mock.calls.length; i++) await new Promise(r => setTimeout(r, 5));
    expect((ctx.toitsLidar as ReturnType<typeof vi.fn>).mock.calls[0]?.[2]).toEqual({ verifies: 'relire' });
    for (let i = 0; i < 200 && actualisation.enCours(); i++) await new Promise(r => setTimeout(r, 5));
    // Sans batiment verifie : ni point de plus, ni case.
    ouvrirActualisationProjet(contexte(plan(), relief));
    const d2 = dialogues.courant();
    expect(d2?.type === 'choix' && d2.case).toBeUndefined();
    expect(d2?.type === 'choix' ? d2.points : []).toEqual(POINTS_ACTUALISATION);
    dialogues.fermer();
    expect(libelleCaseVerifies([{ name: 'A', verifieSurPlace: { date: '2026-10-13' } }, { name: 'B' }] as ObjetPlan[])).toBe('Recalculer aussi les 2 bâtiments vérifiés sur place');
  });
});
