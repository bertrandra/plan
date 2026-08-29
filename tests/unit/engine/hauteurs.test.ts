import { describe, it, expect } from 'vitest';
import { hauteurAppuiMm, hauteurFinieMm, elevationOf } from '../../../src/engine/hauteurs.js';
import { defaultConstruction } from '../../../src/engine/construction.js';

// La hauteur finie decide d'une marche, d'un seuil de porte, d'un garde-corps. Elle etait calculee
// au milieu du bloc terrasse et n'avait aucun test : ceux-ci fixent l'empilement, mode par mode.

/** Une terrasse valide, avec les reglages de construction demandes. */
function terrasse(reglages: Record<string, unknown> = {}) {
  return { fonction: 'terrasse', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    construction: { ...defaultConstruction(), ...reglages } };
}

describe('hauteur d appui', () => {
  it('est nulle sur vis arasees : la vis est dans le sol, elle ne souleve rien', () => {
    expect(hauteurAppuiMm({ typePose: 'vis-fondation', depassementVis: 0, hauteurVis: 40 })).toBe(0);
  });

  it('ne compte que le depassement de tete, pas la longueur enterree', () => {
    // hauteurVis = 40 cm enterres ; seuls les 3 cm qui depassent soulevent la structure.
    expect(hauteurAppuiMm({ typePose: 'vis-fondation', depassementVis: 3, hauteurVis: 40 })).toBe(30);
  });

  it('compte toute la hauteur d un plot, qui est pose sur le sol', () => {
    expect(hauteurAppuiMm({ typePose: 'plots', hauteurPlot: 12 })).toBe(120);
  });

  it('prend 10 cm quand la hauteur de plot manque, 0 quand le depassement manque', () => {
    // Les deux defauts ne sont pas symetriques, et c'est voulu : un plot a toujours une hauteur,
    // une vis peut legitimement etre arasee.
    expect(hauteurAppuiMm({ typePose: 'plots' })).toBe(100);
    expect(hauteurAppuiMm({ typePose: 'vis-fondation' })).toBe(0);
  });
});

describe('hauteur finie', () => {
  it('empile solive et lame sur vis arasees sans lambourde', () => {
    // 0 (appui) + 70 (solive 45x70) + 0 (pas de lambourde) + 25 (lame)
    expect(hauteurFinieMm(terrasse())).toBe(95);
  });

  it('ajoute la lambourde quand elle est demandee', () => {
    expect(hauteurFinieMm(terrasse({ avecLambourde: true }))).toBe(165);
  });

  it('suit la section de solive choisie', () => {
    expect(hauteurFinieMm(terrasse({ soliveSection: '63x175' }))).toBe(200);
  });

  it('sur plots sans solives, les lambourdes portent seules', () => {
    // 100 (plot) + 0 (pas de solive) + 70 (lambourde, toujours presente sur plots) + 25 (lame)
    expect(hauteurFinieMm(terrasse({ typePose: 'plots', plotAvecSolives: false }))).toBe(195);
  });

  it('sur plots avec solives, la solive s ajoute a la lambourde', () => {
    expect(hauteurFinieMm(terrasse({ typePose: 'plots', plotAvecSolives: true }))).toBe(265);
  });

  it('sur plots, la lambourde compte meme sans la case cochee', () => {
    // Le mode plots implique la lambourde : un projet ou la case est restee decochee ne doit pas
    // annoncer une terrasse 70 mm trop basse.
    expect(hauteurFinieMm(terrasse({ typePose: 'plots', avecLambourde: false })))
      .toBe(hauteurFinieMm(terrasse({ typePose: 'plots', avecLambourde: true })));
  });

  it('suit l epaisseur de lame, et retient 25 mm a defaut', () => {
    expect(hauteurFinieMm(terrasse({ epaisseurLame: 45 }))).toBe(115);
    expect(hauteurFinieMm(terrasse({ epaisseurLame: 0 }))).toBe(95);
  });

  it('donne sa construction par defaut a un objet qui n en a pas', () => {
    const nu = { fonction: 'terrasse', type: 'polygon', pts: [] } as Record<string, unknown>;
    expect(hauteurFinieMm(nu)).toBe(95);
    expect(nu.construction).toBeDefined();
  });
});

describe('elevation d un objet', () => {
  it('vient de la construction pour une terrasse, jamais du champ manuel', () => {
    // Les deux sources ne peuvent pas se desynchroniser : la construction gagne toujours.
    const t = terrasse();
    (t as Record<string, unknown>).elevation = 9;
    expect(elevationOf(t)).toBeCloseTo(0.095, 6);
  });

  it('rend les metres, la construction comptant en millimetres', () => {
    expect(elevationOf(terrasse({ typePose: 'plots', hauteurPlot: 20 }))).toBeCloseTo(0.295, 6);
  });

  it('prend le champ manuel pour tout le reste', () => {
    expect(elevationOf({ fonction: 'batiment', elevation: 6.2 })).toBe(6.2);
  });

  it('accepte une elevation nulle saisie a la main', () => {
    // `0` est une valeur, pas une absence : un batiment mis a plat doit le rester.
    expect(elevationOf({ fonction: 'batiment', elevation: 0 })).toBe(0);
  });

  it('retombe sur l ordre de grandeur de la fonction quand rien n est saisi', () => {
    expect(elevationOf({ fonction: 'batiment' })).toBe(2.5);
    expect(elevationOf({ fonction: 'arbre' })).toBe(3);
  });

  it('traite une terrasse sans polygone comme un objet ordinaire', () => {
    // Une terrasse dessinee en cercle, ou a moins de trois points, n'a pas de construction a
    // interroger : elle retombe sur le champ manuel plutot que sur un calcul sans objet.
    expect(elevationOf({ fonction: 'terrasse', type: 'circle', elevation: 0.4 })).toBe(0.4);
    expect(elevationOf({ fonction: 'terrasse', type: 'polygon', pts: [{ x: 0, y: 0 }] })).toBe(0);
  });
});
