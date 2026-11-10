import { describe, it, expect } from 'vitest';
import { OPTIONS_PIECE, PIECES, piecesDe, appliquerPiece, raisonIndisponible, reprendreLectureAuto, corpsPrincipal, rangDuCorpsChoisi } from '../../../src/three/gestesToits.js';
import { vueIsometrique, EXEMPLES_TOITS } from '../../../src/three/catalogueToits.js';
import type { ObjetPlan } from '../../../src/model/types.js';
import { champsBatiment } from '../../../src/model/champsFonction.js';

// Un batiment rectangulaire de 10 x 6 m, egout a 3 m, toit simple de 2,5 m.
const batiment = (extra: Partial<ObjetPlan> = {}): ObjetPlan => ({
  key: 'b', name: 'Maison', type: 'polygon', fonction: 'batiment', elevation: 3,
  pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }],
  batiment: { toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' } },
  ...extra
} as unknown as ObjetPlan);

describe('le catalogue du toit', () => {
  it('a une image pour chaque forme et chaque lucarne', () => {
    for (const p of PIECES.filter((x) => x.exemple)) {
      const e = EXEMPLES_TOITS.find((x) => x.id === p.exemple);
      expect(e, p.id).toBeDefined();
      expect(vueIsometrique(e!).facettes.length, p.id).toBeGreaterThan(0);
    }
  });
  it('a trois familles non vides', () => {
    for (const f of ['toit', 'sur', 'facade'] as const) expect(piecesDe(f).length).toBeGreaterThan(0);
  });
});

describe('poser un geste', () => {
  it('une forme remet le corps a l echelle du batiment, fige le toit', () => {
    const o = batiment();
    expect(appliquerPiece(o, 'forme:croupes')).toBe(true);
    const c = corpsPrincipal(o)!;
    const xs = c.pts.map((p) => p.x), ys = c.pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6, 1);
    expect(Math.min(...c.egouts)).toBeCloseTo(3, 1);
    expect(c.faitage).toBeCloseTo(5.5, 1);
    expect(o.batiment?.toitFige).toBe(true);
    expect(o.batiment?.modeToit).toBe('corps');
  });
  it('le quatre-pans se pose aussi en trois pans : une croupe au debut ou a la fin du faitage, un pignon a l autre bout', () => {
    const debut = batiment(), fin = batiment(), quatre = batiment();
    expect(appliquerPiece(debut, 'forme:croupes-debut')).toBe(true);
    expect(appliquerPiece(fin, 'forme:croupes-fin')).toBe(true);
    expect(appliquerPiece(quatre, 'forme:croupes')).toBe(true);
    const [h0, h1] = corpsPrincipal(quatre)!.croupes!;
    expect(h0).toBeGreaterThan(0);
    expect(corpsPrincipal(debut)!.croupes).toEqual([h0, 0]);
    expect(corpsPrincipal(fin)!.croupes).toEqual([0, h1]);
    // Le reste du corps est celui du quatre-pans : meme emprise, memes hauteurs ; le toit simple se dit en croupes.
    expect(corpsPrincipal(debut)!.faitage).toBe(corpsPrincipal(quatre)!.faitage);
    expect(debut.batiment?.toit?.forme).toBe('croupes');
  });
  it('les trois pans sont des options sous la vignette du quatre-pans, pas des vignettes a eux', () => {
    const ids = OPTIONS_PIECE['forme:croupes']!.map((v) => v.id);
    expect(ids).toEqual(['forme:croupes-debut', 'forme:croupes-fin']);
    expect(piecesDe('toit').map((p) => p.id)).not.toContain('forme:croupes-debut');
    for (const id of ids) expect(PIECES.find((p) => p.id === id)).toBeDefined();
  });
  it('une cheminee se pose sur un batiment sans corps, en creant le corps', () => {
    const o = batiment();
    expect(appliquerPiece(o, 'sur:cheminee')).toBe(true);
    expect(corpsPrincipal(o)!.cheminees?.length).toBe(1);
  });
  it('une lucarne s ajoute au corps', () => {
    const o = batiment();
    const id = piecesDe('sur').find((p) => p.exemple)!.id;
    expect(appliquerPiece(o, id)).toBe(true);
    expect(corpsPrincipal(o)!.lucarnes?.length).toBe(1);
  });
  it('une galerie neuve est un appentis ouvert adosse a un mur', () => {
    const o = batiment();
    expect(raisonIndisponible(o, 'facade:galerie')).toBeNull();
    expect(appliquerPiece(o, 'facade:galerie')).toBe(true);
    expect(o.batiment?.corpsToit).toHaveLength(2);
    const g = o.batiment!.corpsToit![1]!;
    expect(g.ouvert).toBe(true);
    expect(g.saillie?.genre).toBe('galerie');
    expect(g.posFaitage).toBe(0);
    expect(o.batiment?.toitFige).toBe(true);
    // Le corps principal reste le premier, et reste le principal.
    expect(corpsPrincipal(o)).toBe(o.batiment!.corpsToit![0]);
  });
  it('un appentis ferme est ferme', () => {
    const o = batiment();
    appliquerPiece(o, 'facade:appentis-ferme');
    expect(o.batiment!.corpsToit![1]!.ouvert).toBe(false);
  });
  it('deux elements se posent sur deux murs differents', () => {
    const o = batiment();
    appliquerPiece(o, 'facade:bow-rectangle');
    appliquerPiece(o, 'facade:bow-arc');
    const [a, b] = [o.batiment!.corpsToit![1]!.saillie!, o.batiment!.corpsToit![2]!.saillie!];
    expect(a.mur).not.toBe(b.mur);
  });
  it('refuse un geste inconnu', () => {
    expect(appliquerPiece(batiment(), 'forme:nexistepas')).toBe(false);
  });
});

describe('rallumer les regles', () => {
  it('rend le batiment a la lecture automatique', () => {
    const o = batiment();
    appliquerPiece(o, 'forme:pavillon');
    reprendreLectureAuto(o);
    expect(o.batiment?.toitFige).toBeUndefined();
    expect(o.batiment?.corpsToit).toBeUndefined();
    expect(o.batiment?.modeToit).toBeUndefined();
  });
});

describe('un element de mur se pose sur la facade regardee', () => {
  it('un bow-window va sur le mur choisi, pas sur un mur libre', () => {
    const o = batiment();
    appliquerPiece(o, 'forme:deux-pans');
    expect(appliquerPiece(o, 'facade:bow-rectangle', { rang: 0, mur: 1 })).toBe(true);
    expect(o.batiment?.corpsToit?.at(-1)?.saillie?.mur).toBe(1);
  });
});

describe('le pignon sur la facade choisie', () => {
  it('refuse un cote court et un toit sans pignon, le dit, et se pose du cote du mur choisi', () => {
    const o = batiment();
    appliquerPiece(o, 'forme:deux-pans');
    expect(raisonIndisponible(o, 'sur:pignon', { rang: 0, mur: 1 })).toBe('Pas de pignon sur cette façade.');
    expect(raisonIndisponible(o, 'sur:pignon', { rang: 0, mur: 3 })).toBe('Pas de pignon sur cette façade.');
    expect(raisonIndisponible(o, 'sur:pignon', { rang: 0, mur: 0 })).toBeNull();
    // Un refus ne pose rien.
    expect(appliquerPiece(o, 'sur:pignon', { rang: 0, mur: 1 })).toBe(false);
    expect(o.batiment!.corpsToit![0]!.pignons).toHaveLength(0);
    // Le long pan d'en face : le pignon est du pan 1.
    expect(appliquerPiece(o, 'sur:pignon', { rang: 0, mur: 2 })).toBe(true);
    expect(o.batiment!.corpsToit![0]!.pignons[0]!.pan).toBe(1);
    const plat = batiment();
    appliquerPiece(plat, 'forme:plat');
    expect(raisonIndisponible(plat, 'sur:pignon', { rang: 0, mur: 0 })).toBe('Pas de pignon sur cette façade.');
    // Sans facade choisie, rien ne change : le geste d'avant.
    expect(raisonIndisponible(o, 'sur:pignon')).toBeNull();
  });
});

describe('un geste n agit que sur le corps choisi', () => {
  // Deux corps : le grand (10 x 6) et une aile de 4 x 3 posee contre lui, chacun a ses hauteurs.
  const deuxCorps = (): ObjetPlan => {
    const o = batiment();
    appliquerPiece(o, 'forme:deux-pans');
    const aile = { ...JSON.parse(JSON.stringify(o.batiment!.corpsToit![0])), pts: [{ x: 10, y: 1 }, { x: 14, y: 1 }, { x: 14, y: 4 }, { x: 10, y: 4 }], faitage: 4, egouts: [2.5, 2.5], posFaitage: 1.5, pignons: [] };
    champsBatiment(o).corpsToit = [...o.batiment!.corpsToit!, aile];
    return o;
  };
  it('une forme ne change que le corps choisi, a son emprise et ses hauteurs ; l autre reste tel quel', () => {
    const o = deuxCorps(), grand = JSON.stringify(o.batiment!.corpsToit![0]);
    expect(appliquerPiece(o, 'forme:croupes', null, 1)).toBe(true);
    expect(JSON.stringify(o.batiment!.corpsToit![0])).toBe(grand);
    const c = o.batiment!.corpsToit![1]!;
    const xs = c.pts.map((p) => p.x), ys = c.pts.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(10, 1);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(3, 1);
    expect(Math.min(...c.egouts)).toBeCloseTo(2.5, 1);
    expect(c.croupes?.some((v) => v > 0)).toBe(true);
  });
  it('les trois pans ne changent que le corps choisi, la croupe au bout demande', () => {
    const o = deuxCorps(), grand = JSON.stringify(o.batiment!.corpsToit![0]);
    expect(appliquerPiece(o, 'forme:croupes-fin', null, 1)).toBe(true);
    expect(JSON.stringify(o.batiment!.corpsToit![0])).toBe(grand);
    const [h0, h1] = o.batiment!.corpsToit![1]!.croupes!;
    expect(h0).toBe(0);
    expect(h1).toBeGreaterThan(0);
  });
  it('un element du toit va sur le corps choisi, pas sur le corps principal', () => {
    const o = deuxCorps();
    expect(appliquerPiece(o, 'sur:cheminee', null, 1)).toBe(true);
    expect(o.batiment!.corpsToit![1]!.cheminees).toHaveLength(1);
    expect(o.batiment!.corpsToit![0]!.cheminees ?? []).toHaveLength(0);
  });
  it('un element de facade s adosse au corps choisi, meme si l on regarde la facade d un autre', () => {
    const o = deuxCorps();
    expect(appliquerPiece(o, 'facade:galerie', { rang: 0, mur: 0 }, 1)).toBe(true);
    expect(o.batiment!.corpsToit![2]!.saillie?.hote).toBe(1);
  });
  it('un element choisi (une saillie) renvoie a son corps porteur', () => {
    const o = deuxCorps();
    appliquerPiece(o, 'facade:galerie', null, 1);
    expect(appliquerPiece(o, 'sur:cheminee', null, 2)).toBe(true);
    expect(o.batiment!.corpsToit![1]!.cheminees).toHaveLength(1);
  });
  it('sans choix, rien ne change : la facade regardee, sinon le corps principal', () => {
    const o = deuxCorps();
    expect(appliquerPiece(o, 'sur:cheminee')).toBe(true);
    expect(o.batiment!.corpsToit![0]!.cheminees).toHaveLength(1);
  });
});

describe('rangDuCorpsChoisi', () => {
  const c = { pts: [], posFaitage: 0, faitage: 5, egouts: [3, 3], pignons: [], ecart: 0 };
  it('rend le corps lui-meme, l hote d une saillie, et rien hors des corps', () => {
    const corps = [c, { ...c, saillie: { hote: 0 } }] as unknown as Parameters<typeof rangDuCorpsChoisi>[0];
    expect(rangDuCorpsChoisi(corps, 0)).toBe(0);
    expect(rangDuCorpsChoisi(corps, 1)).toBe(0);
    expect(rangDuCorpsChoisi(corps, 5)).toBeNull();
    expect(rangDuCorpsChoisi(corps, null)).toBeNull();
  });
});
