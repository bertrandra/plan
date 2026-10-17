import { describe, it, expect } from 'vitest';
import { propositionsDeLAudit, cochesParDefaut, souchesSurLeCorps, verifications, cleMesure, terrasseVueSurLeCorps } from '../../../../../src/app/audit/parcelle/propositions.js';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { clotureDImport } from '../../../../../src/model/cloture.js';
import type { MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import type { CorpsToit, ObjetPlan, PtBrut, ReleveFacade } from '../../../../../src/model/types.js';
import type { Proposition } from '../../../../../src/regles/decisions.js';
import { IDU_AE101, importerAE101, rechercheAE101, coteAllee } from '../../../../fixtures/cloture/ae101.js';

// Les propositions de l'audit sans Claude (MD/spec-audit.md §13.1, §14) : ce que les mesures et les
// observations proposent, l'avant et l'apres de chacune, ce qui arrive decoche, et quand un batiment
// sera « vérifié sur place ».

const PHOTO = { type: 'image/jpeg' as const, base64: 'AAAA' };
const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
/** Un deux-pans de 10 x 8 m, faitage a 9 m au milieu, et un garage plat de 3 x 6 m. */
const CORPS: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
const PLAT: CorpsToit = { pts: rect(15, 12, 18, 18), posFaitage: 1.5, faitage: 3, egouts: [3, 3], pignons: [], ecart: 0.1 };

function quartier(): ObjetPlan[] {
  return [
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 }, cloture: clotureDImport(rect(0, 0, 20, 30), 0) }),
    obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, bdtopo: { materiauxMurs: '10' }, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS, PLAT] }),
  ];
}

const releve = (cote: number, n: number): ReleveFacade => ({
  cote, largeur: 10, hauteur: 5.82, texture: 'data:image/jpeg;base64,AA', hauteurTexture: 7, distance: 8, sourceDistance: 'gps', releveLe: '2026-10-13T09:00:00Z',
  ouvertures: Array.from({ length: n }, (_, i) => ({ type: 'fenetre' as const, x: 1 + 2 * i, y: 1, l: 1, h: 1.4 })), partieBasse: null,
});

/** La capture : la facade sud photographiee, le toit, les cheminees, la terrasse et les materiaux notes, la cloture et le portail. */
function capture() {
  const c = captureVide('78650000AE0101');
  c.batiments.maison = {
    facades: { '0': { photos: [PHOTO] } },
    vu: { forme: 'deux-pans', cheminees: { nombre: 2, souches: [{ position: 'faitage', materiau: 'brique' }, { position: 'facade' }] }, terrasse: { accessible: true, acrotereM: 1 }, murs: 'brique', couverture: 'ardoise' },
    photos: [],
  };
  c.cloture = { type: 'mur', hauteurM: 1.6, photos: [] };
  c.portail = { nature: 'portail', position: 'gauche', largeurM: 3.5, photos: [] };
  return c;
}

function mesures(m: Partial<MesureFacade> = {}): Map<string, MesureFacade> {
  return new Map([[cleMesure('maison', 0), { cle: 'maison', cote: 0, releve: releve(0, 6), rangReleve: 0, coinsTrouves: true, confiance: 0.8, hauteurM: 5.82, couleur: { couleur: '#c9b49a', pixels: 120, rang: 0 }, ...m }]]);
}

function entrees(objets = quartier(), c = capture(), ms = mesures()) {
  return { objets, liste: listeDeControle(objets, c), capture: c, mesures: ms };
}

describe('les propositions des mesures et des observations', () => {
  it('propose le releve, la hauteur, la couleur, les materiaux, les cheminees, la terrasse, la cloture et le portail', () => {
    // La hauteur a l'egout, la toiture, le materiau des murs et la couverture sont decides par l'arbitrage des sources (arbitrages.ts), pas par cette liste.
    const seules = propositionsDeLAudit(entrees());
    expect(seules.map((x) => x.id)).toEqual(['maison#0:releve', 'maison:couleurMurs', 'maison:terrasse', 'parcelle:cloture', 'parcelle:portail']);
    const arbitrees = propositionsArbitrees(entrees(), {});
    expect(arbitrees.map((x) => x.id)).toEqual(['maison:materiauMurs', 'maison:couverture', 'maison:cheminees']);
    const p = [...seules, ...arbitrees];
    const parId = new Map(p.map((x) => [x.id, x]));
    expect(parId.get('maison#0:releve')).toMatchObject({ objet: 'Façade sud de maison', avant: 'aucun relevé', apres: '6 ouvertures relevées, texture de la photo', source: 'mesure', confiance: 0.8 });
    // La photo seule ne decide pas d'une hauteur (score 2,4 sous 3) : la ligne arrive decochee, avec ses sources.
    const h = propositionsArbitrees(entrees(quartier(), capture(), mesures({ hauteurM: 5 })), {}).find((x) => x.id === 'maison:hauteur');
    expect(h).toMatchObject({ source: 'arbitrage', avant: '6 m', apres: '5 m, Photo de façade', effet: { type: 'hauteur', hauteurM: 5 } });
    // A 18 cm de ce que le projet a, la photo ne propose rien : c'est dans la tolerance de la hauteur (0,5 m).
    expect(propositionsArbitrees(entrees(), {}).some((x) => x.id === 'maison:hauteur')).toBe(false);
    expect(h?.arbitrages?.[0]).toMatchObject({ attribut: 'hauteurEgout', decision: 'manuelle' });
    expect(h?.reserve).toMatch(/Photo de façade seul ne décide pas/);
    expect(cochesParDefaut([h as Proposition]).size).toBe(0);
    expect(parId.get('maison:couleurMurs')).toMatchObject({ avant: '#C9B99A (matériau)', apres: '#c9b49a, lue sur vos photos' });
    expect(parId.get('maison:materiauMurs')).toMatchObject({ source: 'arbitrage', avant: 'Pierre (fichiers fonciers)', apres: 'Brique, vu sur place', effet: { type: 'materiauMurs', materiau: 'brique' } });
    expect(parId.get('maison:materiauMurs')?.arbitrages?.[0]).toMatchObject({ attribut: 'materiauMurs', decision: 'auto' });
    expect(parId.get('maison:couverture')).toMatchObject({ source: 'arbitrage', avant: 'déduite par Plan', apres: 'Ardoise, vue sur place', effet: { type: 'couverture', couverture: 'ardoise' } });
    expect(parId.get('maison:cheminees')).toMatchObject({ source: 'arbitrage', avant: 'aucune cheminée', apres: '2 cheminées · au faîtage, adossée en façade, vues sur place', effet: { type: 'cheminees', corps: 0 } });
    expect(parId.get('maison:cheminees')?.arbitrages?.[0]).toMatchObject({ attribut: 'cheminees', decision: 'auto' });
    expect(parId.get('maison:terrasse')).toMatchObject({ avant: 'toit plat, sans détail', effet: { type: 'terrasse', corps: 1 } });
    expect(parId.get('parcelle:cloture')).toMatchObject({ avant: 'Palissade bois 1,80 m · verticales', apres: 'Mur · 1,6 m, vue sur place' });
    expect(parId.get('parcelle:portail')).toMatchObject({ avant: 'portail 3,50 m', effet: { type: 'portail', cote: 0, nature: 'portail', position: 'gauche', largeurM: 3.5 } });
    expect(cochesParDefaut(p).size).toBe(p.length);
  });

  it('decoche ce qui remplace un choix fait a la main, et le dit', () => {
    const objets = quartier();
    const m = objets[1] as ObjetPlan;
    m.couleurMurs = { source: 'plan' };
    m.toit = { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, couverture: 'tuile' };
    m.facades = [{ ...releve(0, 4), releveLe: '2026-10-01T10:00:00Z' }];
    const p = [...propositionsDeLAudit(entrees(objets)), ...propositionsArbitrees(entrees(objets), {})];
    const parId = new Map(p.map((x) => [x.id, x]));
    expect(parId.get('maison:couleurMurs')?.remplaceChoix).toBe('couleur du plan');
    expect(parId.get('maison:couverture')?.remplaceChoix).toBe('tuiles mécaniques');
    expect(parId.get('maison#0:releve')?.remplaceChoix).toBe('relevé du 01/10/2026 (4 ouvertures)');
    const coches = cochesParDefaut(p);
    for (const id of ['maison:couleurMurs', 'maison:couverture', 'maison#0:releve', 'maison:materiauMurs']) expect(coches.has(id)).toBe(false);
    expect(coches.has('maison:cheminees')).toBe(true);
  });

  it('ne propose pas de hauteur quand les coins n ont pas ete trouves, et decoche le releve', () => {
    const p = propositionsDeLAudit(entrees(quartier(), capture(), mesures({ coinsTrouves: false, confiance: null, hauteurM: null })));
    expect(p.some((x) => x.id === 'maison:hauteur')).toBe(false);
    const r = p.find((x) => x.id === 'maison#0:releve');
    expect(r?.reserve).toMatch(/prédits par la prise de vue/);
    expect(cochesParDefaut(p).has('maison#0:releve')).toBe(false);
  });

  it('ne propose rien de ce qui est deja dans le projet', () => {
    const objets = quartier();
    const m = objets[1] as ObjetPlan;
    m.elevation = 5.85;
    m.couleurMurs = { materiau: 'brique', terrain: { couleur: '#c9b49a', date: '2026-10-01' } };
    m.toit = { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, couverture: 'ardoise' };
    const ids = propositionsDeLAudit(entrees(objets)).map((x) => x.id);
    for (const id of ['maison:hauteur', 'maison:couleurMurs', 'maison:materiauMurs', 'maison:couverture']) expect(ids).not.toContain(id);
  });
});

describe('les cheminees et la terrasse vues, dans les corps', () => {
  it('pose une souche au faitage et une adossee contre le mur de bout, au-dessus du faitage', () => {
    const s = souchesSurLeCorps(CORPS, [{ position: 'faitage', materiau: 'brique', couronnement: 'mitrons' }, { position: 'facade' }]);
    expect(s[0]).toMatchObject({ x: 8.33, y: 14, position: 'faitage', sommetM: 9.4, materiau: 'brique', couronnement: 'mitrons', conduits: 1, source: 'observation' });
    // Adossee au bout s = L, a l'exterieur : le centre a une demi-profondeur du mur.
    expect(s[1]).toMatchObject({ x: 15.25, y: 14, position: 'facade', largeurM: 0.8, profondeurM: 0.5 });
  });

  it('pose les edicules au milieu de la terrasse quand ils y tiennent', () => {
    const grand: CorpsToit = { ...PLAT, pts: rect(0, 0, 12, 8), posFaitage: 4 };
    const t = terrasseVueSurLeCorps(grand, { edicules: 1, revetement: 'gravillons' });
    expect(t.edicules?.[0]?.sommetM).toBe(5.5);
    expect(t.edicules?.[0]?.pts[0]).toEqual({ x: 4.8, y: 2.8 });
    expect(terrasseVueSurLeCorps({ ...PLAT, pts: rect(15, 12, 17.5, 18) }, { edicules: 1 }).edicules).toBeUndefined();
  });
});

describe('vérifié sur place', () => {
  it('demande toutes les facades vues, le toit vu et toutes les propositions cochees', () => {
    const e = entrees();
    const p = [...propositionsDeLAudit(e), ...propositionsArbitrees(e, {})];
    const tout = new Set(p.map((x) => x.id));
    // Les autres facades de la maison ne sont pas photographiees : elle n'est pas encore verifiee.
    expect(verifications(e.liste, e.capture, p, tout)[0]).toMatchObject({ cle: 'maison', verifie: false });
    const c = capture();
    for (const cote of ['1', '2', '3']) c.batiments.maison!.facades[cote] = { photos: [], inaccessible: true };
    const e2 = entrees(quartier(), c, mesures({ hauteurM: 5 }));
    const p2 = [...propositionsDeLAudit(e2), ...propositionsArbitrees(e2, {})];
    expect(verifications(e2.liste, e2.capture, p2, new Set(p2.map((x) => x.id)))[0]).toEqual({ cle: 'maison', nom: 'maison', verifie: true, raison: null });
    const moins = new Set(p2.map((x) => x.id).filter((id) => id !== 'maison:hauteur'));
    expect(verifications(e2.liste, e2.capture, p2, moins)[0]?.raison).toBe('1 proposition décochée');
    c.batiments.maison!.vu = { murs: 'brique' };
    const e3 = entrees(quartier(), c);
    expect(verifications(e3.liste, e3.capture, [], new Set())[0]?.raison).toBe('toit non vu');
  });

  it('ne retient pas le batiment pour une proposition de Claude que la personne a tranchee', () => {
    const c = capture();
    for (const cote of ['1', '2', '3']) c.batiments.maison!.facades[cote] = { photos: [], inaccessible: true };
    const e = entrees(quartier(), c);
    const p = [...propositionsDeLAudit(e), ...propositionsArbitrees(e, {})];
    const couverture = p.find((x) => x.effet.type === 'couverture')!;
    // Claude voit du zinc la ou la personne a note de l'ardoise ; une cheminee, sans concurrente.
    const zinc = { ...couverture, id: 'maison:claude:couverture', source: 'claude' as const, effet: { type: 'couverture' as const, couverture: 'zinc' as const } };
    const solo = { ...couverture, id: 'maison:claude:materiauMurs', source: 'claude' as const, cible: { type: 'batiment' as const, cle: 'maison' }, effet: { type: 'hauteur' as const, hauteurM: 7 } };
    const mesures = new Set(p.map((x) => x.id));
    expect(verifications(e.liste, e.capture, [...p, zinc], mesures)[0]).toMatchObject({ verifie: true });
    // Decochee aussi, l'ardoise ne tranche plus : la couverture reste a voir.
    const sansArdoise = new Set([...mesures].filter((id) => id !== couverture.id));
    expect(verifications(e.liste, e.capture, [...p, zinc], sansArdoise)[0]?.raison).toBe('2 propositions décochées');
    expect(verifications(e.liste, e.capture, [...p.filter((x) => x.effet.type !== 'hauteur'), solo], new Set(p.filter((x) => x.effet.type !== 'hauteur').map((x) => x.id)))[0]?.raison).toBe('1 proposition décochée');
  });
});

describe('la cloture et le portail vus sur place, sans portail dans le projet', () => {
  it('AE 101 : posent le portail et la cloture cote rue, pas sur le plus long cote, mitoyen', () => {
    // Un projet sans portail (cree avant la cloture d'import, ou portail retire) : le cote sur rue se
    // devine comme pour un portail neuf, ici au point d'adresse.
    const objets = importerAE101({ recherche: rechercheAE101('adresse') });
    const parcelle = objets[0] as ObjetPlan;
    delete parcelle.cloture;
    const c = captureVide(IDU_AE101);
    c.cloture = { type: 'mur', hauteurM: 1.6, photos: [] };
    c.portail = { nature: 'portail', position: 'centre', largeurM: 3.5, photos: [] };
    const p = new Map(propositionsDeLAudit(entrees(objets, c, new Map())).map((x) => [x.id, x]));
    const allee = coteAllee(parcelle);
    expect(p.get('parcelle:cloture')?.effet).toMatchObject({ type: 'cloture', cote: allee });
    expect(p.get('parcelle:portail')?.effet).toMatchObject({ type: 'portail', cote: allee, nature: 'portail' });
  });

  describe('le releve que l audit a pose tout seul (depuisAudit)', () => {
    it('est deja ecrit quand il vient de la meme mesure : la ligne n est plus proposee', () => {
      const objets = quartier();
      (objets[1] as ObjetPlan).facades = [{ ...releve(0, 6), depuisAudit: true }];
      expect(propositionsDeLAudit(entrees(objets)).some((x) => x.id === 'maison#0:releve')).toBe(false);
    });

    it('n est pas un choix de la personne : une mesure plus recente le remplace, et le dit', () => {
      const objets = quartier();
      (objets[1] as ObjetPlan).facades = [{ ...releve(0, 4), releveLe: '2026-10-01T10:00:00Z', depuisAudit: true }];
      const r = propositionsDeLAudit(entrees(objets)).find((x) => x.id === 'maison#0:releve');
      expect(r).toMatchObject({ avant: 'relevé automatique du 01/10/2026 (4 ouvertures)', remplaceChoix: null });
      expect(cochesParDefaut([r as Proposition]).has('maison#0:releve')).toBe(true);
    });

    it('un releve fait a la main reste un choix : decoche, avec ce qu il remplacerait', () => {
      const objets = quartier();
      (objets[1] as ObjetPlan).facades = [{ ...releve(0, 4), releveLe: '2026-10-01T10:00:00Z' }];
      const r = propositionsDeLAudit(entrees(objets)).find((x) => x.id === 'maison#0:releve');
      expect(r?.remplaceChoix).toBe('relevé du 01/10/2026 (4 ouvertures)');
    });
  });
});
