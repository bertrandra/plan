import { describe, it, expect, vi } from 'vitest';
import {
  cadreDe, capDeLaVue, champComplet, champPourLaFacade, facadeTouchee, partieCachee, poseEnsemble, posePieton, reculLibre, suiviPieton,
  CHAMP_ENSEMBLE_DEG, CHAMP_PIETON_MAX_DEG, CHAMP_VISIBLE_DEG, ELEVATION_ENSEMBLE_DEG, MARGE_MUR_M, OEIL_M, PAUSE_GESTE_MS, RECUL_PIETON_M, REGARD_HAUT_DEG,
} from '../../../../../src/app/audit/parcelle/vuePrise.js';
import type { Facade } from '../../../../../src/facade/geometrie.js';

// La Vue 3D de « Photographier en marchant » (app/audit/parcelle/vuePrise.ts) : a hauteur d'homme,
// un peu vers le haut, derriere vous, et qui suit votre position et votre cap.

const facade = (gauche: { x: number; y: number }, droite: { x: number; y: number }): Facade =>
  ({ cote: 0, gauche, droite, largeur: Math.hypot(droite.x - gauche.x, droite.y - gauche.y), hauteur: 6, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' } as Facade);

describe('la pose a hauteur d\'homme', () => {
  it('se tient derriere vous dans l\'axe du cap, a hauteur des yeux, et regarde un peu vers le haut', () => {
    const p = posePieton({ x: 10, y: 3 }, 0);
    expect(p.oeil.x).toBeCloseTo(10);
    expect(p.oeil.y).toBeCloseTo(3 - RECUL_PIETON_M);
    expect(p.hauteurOeil).toBe(OEIL_M);
    expect(p.vise.y).toBeGreaterThan(3);
    const montee = Math.atan2(p.hauteurVise - p.hauteurOeil, p.vise.y - p.oeil.y) * 180 / Math.PI;
    expect(montee).toBeCloseTo(REGARD_HAUT_DEG, 5);
  });

  it('tourne avec le cap : vers l\'est, la camera est a l\'ouest de vous', () => {
    const p = posePieton({ x: 0, y: 0 }, 90);
    expect(p.oeil.x).toBeCloseTo(-RECUL_PIETON_M);
    expect(p.oeil.y).toBeCloseTo(0);
    expect(p.vise.x).toBeGreaterThan(0);
  });
});

describe('ce que l essai d AE 101 a corrige', () => {
  const sud = facade({ x: 5, y: 10 }, { x: 15, y: 10 });
  it('ne recule pas au travers d un mur ou d une cloture derriere vous', () => {
    const cloture = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: -1 }, { x: 0, y: -1 }];
    expect(reculLibre({ x: 10, y: 3 }, 0, 1, [cloture])).toBeCloseTo(3 - MARGE_MUR_M, 6);
    expect(reculLibre({ x: 10, y: 3 }, 0, 1, [])).toBe(RECUL_PIETON_M);
    const p = posePieton({ x: 10, y: 3 }, 0, null, [cloture]);
    expect(p.oeil.y).toBeCloseTo(MARGE_MUR_M, 6);
  });

  it('avec une facade visee, regarde vers le haut de son milieu, dans l axe du cap', () => {
    const p = posePieton({ x: 10, y: 3 }, 0, sud);
    expect(p.oeil.x).toBeCloseTo(10);
    expect(p.vise.x).toBeCloseTo(10);
    expect(p.vise.y).toBeCloseTo(10);
    expect(p.hauteurVise).toBeGreaterThan(sud.hauteur / 2);
    expect(p.hauteurVise).toBeLessThan(sud.hauteur);
  });

  it('elargit le champ pour que la partie au-dessus de l ecran de prise garde le sien', () => {
    expect(champComplet(800, 0)).toBeCloseTo(CHAMP_VISIBLE_DEG, 6);
    const c = champComplet(800, 300);
    expect(c).toBeGreaterThan(CHAMP_VISIBLE_DEG);
    // La partie visible (500 px sur 1 100 de champ complet) garde CHAMP_VISIBLE_DEG.
    const visible = 2 * Math.atan(Math.tan((c * Math.PI) / 360) * 500 / 1100) * 180 / Math.PI;
    expect(visible).toBeCloseTo(CHAMP_VISIBLE_DEG, 6);
  });
});

describe('le cap de la vue', () => {
  const sud = facade({ x: 5, y: 10 }, { x: 15, y: 10 });
  it('suit les capteurs quand ils en donnent un', () => {
    expect(capDeLaVue({ x: 10, y: 3 }, 45, sud)).toBe(45);
  });
  it('dos a la facade visee, la regarde quand meme : la vue epuree ne montrait que le ciel', () => {
    expect(capDeLaVue({ x: 10, y: 3 }, 180, sud)).toBeCloseTo(0);
    expect(capDeLaVue({ x: 10, y: 3 }, 120, null)).toBe(120);
  });
  it('sans boussole ni marche, regarde la facade visee', () => {
    expect(capDeLaVue({ x: 10, y: 3 }, null, sud)).toBeCloseTo(0);
    expect(capDeLaVue({ x: 10, y: 20 }, null, sud)).toBeCloseTo(180);
  });
  it('sans rien, regarde le nord', () => {
    expect(capDeLaVue({ x: 10, y: 3 }, null, null)).toBe(0);
  });
});

describe('la facade touchee', () => {
  const lignes = [
    { cote: 0, statut: 'aPhotographier', facade: facade({ x: 5, y: 10 }, { x: 15, y: 10 }) },
    { cote: 1, statut: 'aPhotographier', facade: facade({ x: 15, y: 10 }, { x: 15, y: 20 }) },
    { cote: 2, statut: 'mitoyenne', facade: facade({ x: 15, y: 20 }, { x: 5, y: 20 }) },
  ];
  it('est celle dont le mur passe le plus pres du doigt', () => {
    expect(facadeTouchee(lignes, { x: 14.5, y: 16 })?.cote).toBe(1);
    expect(facadeTouchee(lignes, { x: 8, y: 10.2 })?.cote).toBe(0);
  });
  it('n\'est jamais une facade mitoyenne', () => {
    expect(facadeTouchee(lignes, { x: 9, y: 19.9 })?.cote).not.toBe(2);
    expect(facadeTouchee([lignes[2]!], { x: 9, y: 19.9 })).toBeNull();
  });
});

describe('le suivi pendant la prise', () => {
  it('pose la camera a chaque position tant que l\'ecran est ouvert, et pas apres', () => {
    const poser = vi.fn(() => true);
    const s = suiviPieton({ poser }, () => 0);
    expect(s.suivre({ x: 0, y: 0 }, 0, null)).toBe(false);
    s.activer(true);
    expect(s.suivre({ x: 0, y: 0 }, 0, null)).toBe(true);
    expect(s.suivre({ x: 0, y: 1 }, 30, null)).toBe(true);
    expect(poser).toHaveBeenCalledTimes(2);
    s.activer(false);
    expect(s.suivre({ x: 0, y: 2 }, 30, null)).toBe(false);
  });

  it('rend la camera quand l ecran se ferme, et coupe le glissement sous le doigt', () => {
    const vue = { poser: vi.fn(() => true), liberer: vi.fn(), arreter: vi.fn(), cadrer: vi.fn() };
    const s = suiviPieton(vue, () => 0);
    s.activer(true);
    s.cadrer({ haut: 600, gauche: 16 });
    expect(vue.cadrer).toHaveBeenCalledWith({ haut: 600, gauche: 16 });
    s.lacher();
    expect(vue.arreter).toHaveBeenCalled();
    s.activer(false);
    expect(vue.liberer).toHaveBeenCalledTimes(1);
    s.activer(false);
    expect(vue.liberer).toHaveBeenCalledTimes(1);
  });

  it('attend apres un geste du doigt, puis reprend tout seul', () => {
    let t = 1000;
    const poser = vi.fn(() => true);
    const s = suiviPieton({ poser }, () => t);
    s.activer(true);
    s.lacher();
    expect(s.suivre({ x: 0, y: 0 }, 0, null)).toBe(false);
    expect(s.suivre({ x: 0, y: 0 }, 0, null, true)).toBe(true);
    t += PAUSE_GESTE_MS + 1;
    expect(s.suivre({ x: 0, y: 0 }, 0, null)).toBe(true);
  });
});

describe('la vue d ensemble, pour choisir une facade (second essai d AE 101)', () => {
  const maison = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
  it('cadre les contours donnes : leur centre et leur rayon', () => {
    const c = cadreDe([maison], 9, null);
    expect(c?.centre).toEqual({ x: 6, y: 4 });
    expect(c?.rayon).toBeCloseTo(Math.hypot(6, 4), 6);
    expect(cadreDe([], 9, 0)).toBeNull();
  });

  it('regarde le batiment d en haut, en grand angle, et de plus loin sur un ecran etroit', () => {
    const c = { centre: { x: 6, y: 4 }, rayon: 7.2, hauteur: 9, azimutDeg: 0 };
    const large = poseEnsemble(c, 0, 1.6), etroit = poseEnsemble(c, 0, 0.7);
    expect(large.champ).toBe(CHAMP_ENSEMBLE_DEG);
    expect(large.vise).toEqual(c.centre);
    // Regard vers le nord : la camera est au sud du batiment, assez haut.
    expect(large.oeil.x).toBeCloseTo(6, 6);
    expect(large.oeil.y).toBeLessThan(4);
    const recul = 4 - large.oeil.y;
    const montee = Math.atan2(large.hauteurOeil - large.hauteurVise, recul) * 180 / Math.PI;
    expect(montee).toBeCloseTo(ELEVATION_ENSEMBLE_DEG, 6);
    // La sphere qui entoure le batiment tient dans la partie visible.
    const d = Math.hypot(recul, large.hauteurOeil - large.hauteurVise);
    expect(Math.asin(Math.hypot(c.rayon, c.hauteur / 2) / d) * 180 / Math.PI).toBeLessThan(CHAMP_ENSEMBLE_DEG / 2);
    expect(4 - etroit.oeil.y).toBeGreaterThan(recul);
  });

  it('tourne avec la direction du regard : vers l ouest, la camera est a l est', () => {
    const p = poseEnsemble({ centre: { x: 0, y: 0 }, rayon: 5, hauteur: 6, azimutDeg: null }, 270, 1);
    expect(p.oeil.x).toBeGreaterThan(0);
    expect(p.oeil.y).toBeCloseTo(0, 6);
  });

  it('garde la direction de la camera quand on ne lui en donne pas (le doigt l a tournee)', () => {
    const vue = { poser: vi.fn<(pose: unknown) => boolean>(() => true), azimut: () => 90, rapportVisible: () => 1 };
    const s = suiviPieton(vue, () => 0);
    expect(s.ensemble({ centre: { x: 0, y: 0 }, rayon: 5, hauteur: 6, azimutDeg: null })).toBe(false);
    s.activer(true);
    expect(s.ensemble({ centre: { x: 0, y: 0 }, rayon: 5, hauteur: 6, azimutDeg: null })).toBe(true);
    const pose = vue.poser.mock.calls[0]?.[0] as { oeil: { x: number; y: number } };
    expect(pose.oeil.x).toBeLessThan(0);
  });
});

describe('la vue a hauteur d homme montre la facade entiere', () => {
  it('elargit le champ pour une facade large et proche, jamais au-dela du maximum', () => {
    const sud = facade({ x: 0, y: 10 }, { x: 10, y: 10 });
    expect(champPourLaFacade({ x: 5, y: -30 }, sud, 0.7)).toBe(CHAMP_VISIBLE_DEG);
    const proche = champPourLaFacade({ x: 5, y: 2 }, sud, 0.7);
    expect(proche).toBeGreaterThan(CHAMP_VISIBLE_DEG);
    expect(proche).toBeLessThanOrEqual(CHAMP_PIETON_MAX_DEG);
    expect(champPourLaFacade({ x: 5, y: 9 }, sud, 0.7)).toBe(CHAMP_PIETON_MAX_DEG);
    // Sans mesure de l'ecran, la pose garde le champ par defaut.
    expect(posePieton({ x: 5, y: 2 }, 0, sud).champ).toBeUndefined();
    expect(posePieton({ x: 5, y: 2 }, 0, sud, [], 0.7).champ).toBeGreaterThan(CHAMP_VISIBLE_DEG);
  });
});

describe('ce que l ecran de l audit cache de la vue', () => {
  const canevas = { left: 0, right: 1000, bottom: 800, width: 1000, height: 800 };
  it('une carte en bas cache le bas, un panneau a droite cache la droite', () => {
    expect(partieCachee(canevas, null)).toEqual({ bas: 0, droite: 0 });
    expect(partieCachee(canevas, { haut: 600, gauche: 180 })).toEqual({ bas: 200, droite: 0 });
    expect(partieCachee(canevas, { haut: 64, gauche: 620 })).toEqual({ bas: 0, droite: 380 });
  });
  it('jamais plus de 60 % de la vue', () => {
    expect(partieCachee(canevas, { haut: 0, gauche: 0 }).bas).toBe(480);
    expect(partieCachee(canevas, { haut: 0, gauche: 460 }).droite).toBe(540);
  });
});
