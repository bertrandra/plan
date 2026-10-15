import { describe, it, expect, vi } from 'vitest';
import { coteRueDevine, cotesSansMitoyen, cotesMitoyens, coteDuNouvelAcces, devinerCoteRue, pointAdresse, DISTANCE_ADRESSE_MAX_M } from '../../../src/geo/coteRue.js';
import { coteDAcces, clotureDe, reglerCote, longueurDuCote } from '../../../src/model/cloture.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import { pointInPolygon } from '../../../src/geometry/basic.js';
import { planDeDepart } from '../../../src/app/audit/chargement.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';
import { AE101, IDU_AE101, importerAE101, rechercheAE101, ruesAE101, coteAllee, jardinAE101 } from '../../fixtures/cloture/ae101.js';

// Le cote sur rue devine (geo/coteRue.ts) : le point d'adresse sur la voirie d'abord, puis les rues
// lues, sinon le plus long des cotes sans voisine ; rien sans information. Le portail neuf s'y pose,
// par la meme regle sur tous les chemins de creation (coteDuNouvelAcces).

const rect = (x0: number, y0: number, l: number, h: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + h }, { x: x0, y: y0 + h }];
const lat0 = 48.9, lon0 = 2.15, proj = projecteurLocal(lat0, lon0);
const deg = (p: PtBrut) => proj.versDegres(p.x, p.y);
const parcelle = (pts: PtBrut[], adresse: PtBrut | null, idu = 'P'): ObjetPlan => {
  const a = adresse ? deg(adresse) : null;
  return { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts, cadastre: { idu, origineLat: lat0, origineLon: lon0, ...(a ? { adresseLat: a.lat, adresseLon: a.lon } : {}) } } as unknown as ObjetPlan;
};
const voisine = (key: string, pts: PtBrut[]): ObjetPlan => ({ key, type: 'polygon', fonction: 'terrain', pts, cadastre: { idu: key } } as unknown as ObjetPlan);
// Une parcelle de 20 x 30 m, le cote 0 (y = 0) au sud.
const p = rect(0, 0, 20, 30);

describe('coteRueDevine', () => {
  it('prend le cote le plus pres du point d adresse, pose sur la voirie', () => {
    const pc = parcelle(p, { x: 10, y: -4 });
    expect(pointAdresse(pc)!.x).toBeCloseTo(10, 3);
    expect(coteRueDevine(pc, [pc])).toBe(0);
    expect(coteRueDevine(parcelle(p, { x: 24, y: 15 }), [])).toBe(1);
  });

  it('ignore un point d adresse dans la parcelle, ou trop loin, et se rabat sur les voisines', () => {
    const dedans = parcelle(p, { x: 10, y: 10 });
    // Voisines a l'est, au nord et a l'ouest : seul le sud est libre.
    const voisines = [voisine('E', rect(20, 0, 20, 30)), voisine('N', rect(0, 30, 20, 20)), voisine('O', rect(-20, 0, 20, 30))];
    expect(cotesSansMitoyen(dedans, [dedans, ...voisines])).toEqual([true, false, false, false]);
    expect(coteRueDevine(dedans, [dedans, ...voisines])).toBe(0);
    const loin = parcelle(p, { x: 10, y: -DISTANCE_ADRESSE_MAX_M - 5 });
    expect(coteRueDevine(loin, [loin, ...voisines])).toBe(0);
    // Deux cotes libres : le plus long (l'est, 30 m) plutot que le sud (20 m).
    expect(coteRueDevine(dedans, [dedans, voisines[1]!, voisines[2]!])).toBe(1);
  });

  it('ne devine rien sans point d adresse ni voisine', () => {
    const pc = parcelle(p, null);
    expect(cotesSansMitoyen(pc, [pc])).toBeNull();
    expect(coteRueDevine(pc, [pc])).toBeNull();
    expect(coteRueDevine({ key: 'parcelle', type: 'polygon', pts: [] } as unknown as ObjetPlan, [])).toBeNull();
  });

  it('coteDAcces : le cote dit sur rue, sinon le devine, sinon le plus long', () => {
    const pc = parcelle(p, null);
    const cl = clotureDe(pc, true);
    expect(coteDAcces(cl, p, null)).toBe(1);
    expect(coteDAcces(cl, p, 0)).toBe(0);
    reglerCote(cl, 2).limite = 'rue';
    expect(coteDAcces(cl, p, 0)).toBe(2);
  });
});

// Les cotes mitoyens : au moins 1 m de limite commune avec une voisine (model/mitoyennete.ts), hors
// des coins ; ce que l'utilisateur a dit d'un cote l'emporte.
describe('cotesMitoyens', () => {
  it('compte mitoyen un cote qui partage au moins 1 m avec une voisine, meme sur moins de la moitie', () => {
    const pc = parcelle(p, null);
    // Une voisine de 8 m au fond du cote est (30 m) : 8 m communs, le reste sur un chemin.
    const fond = voisine('F', rect(20, 22, 15, 8));
    expect(cotesMitoyens(pc, [pc, fond])).toEqual([false, true, false, false]);
  });

  it('ne compte pas une voisine qui touche seulement le coin d un cote', () => {
    const pc = parcelle(p, null);
    // Voisines a l'est et a l'ouest (un trace decale de 30 cm) : le sud et le nord les touchent a chaque coin, sans les longer.
    const v = [voisine('E', rect(20, 0, 20, 30)), voisine('O', rect(-20.3, -0.3, 20, 30.6))];
    expect(cotesMitoyens(pc, [pc, ...v])).toEqual([false, true, false, true]);
  });

  it('suit ce que l utilisateur a dit d un cote, sans voisine connue', () => {
    const pc = parcelle(p, null);
    expect(cotesMitoyens(pc, [pc])).toBeNull();
    const cl = clotureDe(pc, true);
    reglerCote(cl, 1).limite = 'separative';
    reglerCote(cl, 2).mitoyenne = true;
    expect(cotesMitoyens(pc, [pc])).toEqual([false, true, true, false]);
  });
});

describe('le cote sur rue devine, preuves croisees', () => {
  it('au point d adresse pose au coin, prend le cote sans voisine plutot que le mitoyen', () => {
    // Le point au coin sud-est, plus pres de l'est (mitoyen) que du sud (libre).
    const pc = parcelle(p, { x: 20.5, y: 0.4 });
    expect(coteRueDevine(pc, [pc])).toBe(1);
    const est = voisine('E', rect(20, 0, 20, 30));
    expect(devinerCoteRue(pc, [pc, est])).toEqual({ cote: 0, raison: 'adresse' });
  });

  it('ne devine jamais sur rue un cote dit separatif, et prend celui dit sur rue', () => {
    const pc = parcelle(p, { x: 10, y: -4 });
    const cl = clotureDe(pc, true);
    reglerCote(cl, 0).limite = 'separative';
    expect(coteRueDevine(pc, [pc])).not.toBe(0);
    reglerCote(cl, 3).limite = 'rue';
    expect(coteDuNouvelAcces(pc, [pc])).toBe(3);
  });

  it('sans point d adresse, prend le cote que longe une rue lue, celle de l adresse d abord', () => {
    const pc = parcelle(p, null);
    // Une rue au sud a 6 m, une autre a l'est a 5 m : l'adresse dit la rue du sud.
    pc.ruesVoisinage = { recupereLe: '', rayonM: 250, rues: [{ nom: 'Rue du Sud', troncons: [[{ x: -50, y: -6 }, { x: 70, y: -6 }]] }, { nom: 'Avenue de l’Est', troncons: [[{ x: 25, y: -50 }, { x: 25, y: 80 }]] }] };
    expect(devinerCoteRue(pc, [pc])).toEqual({ cote: 1, raison: 'rue', rue: 'Avenue de l’Est' });
    (pc.cadastre as Record<string, unknown>).adresse = '3 rue du Sud 78110 Le Vésinet';
    expect(devinerCoteRue(pc, [pc])).toEqual({ cote: 0, raison: 'rue', rue: 'Rue du Sud' });
    // Une rue trop loin ne dit rien.
    pc.ruesVoisinage = { recupereLe: '', rayonM: 250, rues: [{ nom: 'Rue du Sud', troncons: [[{ x: -50, y: -40 }, { x: 70, y: -40 }]] }] };
    expect(devinerCoteRue(pc, [pc])).toBeNull();
  });

  it('coteDAcces : sans rien de devine, le plus long des cotes que l utilisateur n a pas dits separatifs', () => {
    const pc = parcelle(p, null);
    const cl = clotureDe(pc, true);
    reglerCote(cl, 1).limite = 'separative';
    reglerCote(cl, 3).mitoyenne = true;
    expect(coteDAcces(cl, p, null)).toBe(0);
  });
});

// AE 101, la parcelle de reference : chaque facon de creer le portail le pose sur l'allee des
// Limites, jamais sur le cote le plus long, mitoyen d'AE 100.
describe('AE 101 (2 allee des Limites, Le Vesinet) : le portail neuf cote rue', () => {
  const portail = (objets: ObjetPlan[]) => clotureDe(objets[0]!).portails.map((a) => a.cote);
  const ref = importerAE101({ recherche: rechercheAE101('adresse') })[0]!;
  const allee = coteAllee(ref);
  const pts = (ref as ObjetPlan & { pts: PtBrut[] }).pts;
  const plusLong = pts.map((_, i) => longueurDuCote(pts, i)).reduce((m, l, i, t) => (l > (t[m] ?? 0) ? i : m), 0);

  it('la fixture : l allee longe un cote court, le plus long est mitoyen', () => {
    expect(allee).not.toBe(plusLong);
    const avecVoisines = importerAE101({ recherche: null, retenir: true });
    expect(cotesMitoyens(avecVoisines[0]!, avecVoisines)?.[plusLong]).toBe(true);
    expect(cotesSansMitoyen(avecVoisines[0]!, avecVoisines)).toEqual(pts.map((_, i) => i === allee));
  });

  it('import depuis l adresse tapee, avec ou sans voisines cochees', () => {
    expect(portail(importerAE101({ recherche: rechercheAE101('adresse') }))).toEqual([allee]);
    expect(portail(importerAE101({ recherche: rechercheAE101('adresse'), retenir: true }))).toEqual([allee]);
  });

  it('import depuis la position de l appareil, dans le jardin : le point de l adresse la plus proche, pas celui de l appareil', () => {
    const objets = importerAE101({ recherche: rechercheAE101('position') });
    expect(pointInPolygon(pointAdresse(objets[0]!)!, pts)).toBe(false);
    expect(portail(objets)).toEqual([allee]);
  });

  it('import depuis la position sans adresse connue : les mitoyennes connues, meme non cochees', () => {
    expect(portail(importerAE101({ recherche: rechercheAE101('positionSansAdresse'), connaitre: true }))).toEqual([allee]);
  });

  it('plan sans point d adresse ni voisine : les rues lues', () => {
    const objets = importerAE101({ recherche: null });
    const p0 = objets[0]!;
    delete p0.cloture;
    // Rien de connu : le plus long, comme avant.
    expect(coteDuNouvelAcces(p0, objets)).toBe(plusLong);
    p0.ruesVoisinage = ruesAE101(p0);
    expect(devinerCoteRue(p0, objets)).toMatchObject({ cote: allee, raison: 'rue', rue: 'Allee des Limites' });
    expect(coteDuNouvelAcces(p0, objets)).toBe(allee);
  });

  it('mode audit : la parcelle sous les pieds, ses voisines lues sans etre posees', async () => {
    const j = jardinAE101();
    const depart = await planDeDepart(j.lon, j.lat, { interrogerCadastre: vi.fn(async () => AE101.parcelles as never) });
    const p0 = depart?.objets[0];
    expect((p0?.cadastre as { idu: string }).idu).toBe(IDU_AE101);
    expect(clotureDe(p0!).portails.map((a) => a.cote)).toEqual([coteAllee(p0!)]);
  });
});
