import { describe, it, expect } from 'vitest';
import { appliquerRenfort, cartesAretes, recalerBoite, recalerCoins, texteBilan, bilanVide } from '../../../../src/facade/detection/renfortRecalage.js';
import { voterRenfort, type ReponseRenfort } from '../../../../src/facade/detection/renfort.js';
import type { Image } from '../../../../src/facade/vision/homographie.js';
import type { Segment } from '../../../../src/facade/vision/segments.js';
import type { OuvertureFacade } from '../../../../src/model/types.js';

// Ce que Plan fait des graines de Claude (F§12 bis) : un coin rattache au croisement de segments le
// plus proche, une boite ajustee sur les profils de contours, une graine que rien ne soutient rejetee.

const PX = 100;

/** Un mur de `l` x `h` metres, enduit clair a peine bruite, avec des baies sombres (metres, y depuis le sol). */
function mur(l: number, h: number, baies: { x: number; y: number; l: number; h: number }[]): Image {
  const L = l * PX, H = h * PX;
  const donnees = new Uint8ClampedArray(L * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const m = (x / PX), z = h - (y + 0.5) / PX;
    const dans = baies.some((b) => m >= b.x && m < b.x + b.l && z >= b.y && z < b.y + b.h);
    const bruit = ((x * 7 + y * 13) % 5) - 2;
    const v = dans ? 60 + bruit : 205 + bruit;
    const k = (y * L + x) * 4;
    donnees[k] = v; donnees[k + 1] = v - (dans ? 0 : 10); donnees[k + 2] = v - (dans ? 0 : 25); donnees[k + 3] = 255;
  }
  return { largeur: L, hauteur: H, donnees };
}

const passe = (manquees: ReponseRenfort['manquees'], ouvertures: ReponseRenfort['ouvertures'] = []): ReponseRenfort => ({
  mur: { indices: [], vu: 'attendu' }, coins: { indices: [], hautGauche: 'indetermine', hautDroit: 'indetermine', basDroit: 'indetermine', basGauche: 'indetermine' },
  ouvertures, manquees, confiance: 'moyenne',
});
const trois = (r: ReponseRenfort) => voterRenfort([r, r, r]);
const boite = (x: number, y: number, l = 1.2, h = 1.3) => ({ indices: [], type: 'fenetre' as const, x, y, l, h });

describe('les boites : profils de contours', () => {
  const img = mur(8, 5, [{ x: 2, y: 1, l: 1.2, h: 1.3 }]);
  const C = cartesAretes(img, PX);

  it('ajuste une graine a 15 cm pres sur les quatre bords de la baie', () => {
    const b = recalerBoite({ x: 2.15, y: 0.88, l: 1.05, h: 1.45 }, C);
    expect(b.soutenus).toBe(4);
    expect(Math.abs(b.x - 2)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(b.y - 1)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(b.l - 1.2)).toBeLessThanOrEqual(0.04);
    expect(Math.abs(b.h - 1.3)).toBeLessThanOrEqual(0.04);
  });

  it('ne trouve rien a soutenir sur un mur nu', () => {
    expect(recalerBoite({ x: 5, y: 2.5, l: 1.2, h: 1.3 }, C).soutenus).toBe(0);
  });
});

describe('l application aux ouvertures du releve', () => {
  const img = mur(8, 5, [{ x: 2, y: 1, l: 1.2, h: 1.3 }, { x: 5, y: 1, l: 1.2, h: 1.3 }]);
  const C = cartesAretes(img, PX);
  const detectee = (x: number, confiance: number): OuvertureFacade => ({ type: 'fenetre', x, y: 1, l: 1.2, h: 1.3, confiance, source: 'detectee' });

  it('ajoute une baie manquee recalee, source claude, et rejette celle que rien ne soutient', () => {
    const r = appliquerRenfort({ ouvertures: [detectee(2, 0.9)], decochees: [], vote: trois(passe([boite(5.12, 0.9), boite(1, 3.2)])), cartes: C, largeurM: 8, hauteurM: 5 });
    expect(r.ouvertures).toHaveLength(2);
    const ajoutee = r.ouvertures.find((o) => o.source === 'claude')!;
    expect(Math.abs(ajoutee.x - 5)).toBeLessThanOrEqual(0.03);
    expect(ajoutee.confiance).toBeGreaterThanOrEqual(0.7);
    expect(r.bilan).toMatchObject({ graines: 2, pleines: 1, rejetees: 1 });
    expect(texteBilan(r.bilan)).toBe('1 ouverture ajoutée');
  });

  it('ne retire que les baies peu sures, decochees, et corrige le type et les details', () => {
    const vote = trois(passe([], [
      { indices: [], numero: 1, decision: 'retirer', raison: 'ombre', type: 'indetermine', volets: 'indetermine', coffre: 'indetermine', balcon: 'indetermine', forme: 'indetermine' },
      { indices: [], numero: 2, decision: 'retirer', raison: 'ombre', type: 'indetermine', volets: 'indetermine', coffre: 'indetermine', balcon: 'indetermine', forme: 'indetermine' },
      { indices: [], numero: 3, decision: 'garder', raison: 'sans-objet', type: 'porte-fenetre', volets: 'roulant', coffre: 'oui', balcon: 'oui', forme: 'cintree' },
    ]));
    const r = appliquerRenfort({ ouvertures: [detectee(0.5, 0.55), detectee(2, 0.95), detectee(5, 0.9)], decochees: [], vote, cartes: C, largeurM: 8, hauteurM: 5 });
    expect(r.retirees.map((o) => o.x)).toEqual([0.5]);
    expect(r.decochees.map((o) => o.x)).toEqual([0.5]);
    expect(r.bilan).toMatchObject({ retirees: 1, retraitsRefuses: 1, typesCorriges: 1, detailsAjoutes: 1 });
    expect(r.ouvertures.find((o) => o.x === 5)).toMatchObject({ type: 'porte-fenetre', source: 'claude', details: { volets: 'roulant', allege: 'balcon', forme: 'cintre' } });
  });

  it('confirme une baie devinee du meme type au meme endroit, et ne touche pas a ce que le doigt a pose', () => {
    const devinee: OuvertureFacade = { type: 'fenetre', x: 5, y: 1, l: 1.2, h: 1.3, confiance: 0.4, source: 'devinee' };
    const ajoutee: OuvertureFacade = { type: 'fenetre', x: 2, y: 1, l: 1.2, h: 1.3, source: 'ajoutee' };
    const vote = trois(passe([boite(5.05, 1)], [{ indices: [], numero: 1, decision: 'retirer', raison: 'tache', type: 'porte', volets: 'indetermine', coffre: 'indetermine', balcon: 'indetermine', forme: 'indetermine' }]));
    const r = appliquerRenfort({ ouvertures: [ajoutee], decochees: [devinee], vote, cartes: C, largeurM: 8, hauteurM: 5 });
    expect(r.ouvertures.map((o) => [o.x, o.source])).toEqual([[2, 'ajoutee'], [5, 'devinee']]);
    expect(r.decochees).toEqual([]);
    expect(r.bilan.confirmees).toBe(1);
  });

  it('laisse une graine en pointille sans image pour la soutenir', () => {
    const r = appliquerRenfort({ ouvertures: [], decochees: [], vote: trois(passe([boite(5, 1)])), cartes: null, largeurM: 8, hauteurM: 5 });
    expect(r.ouvertures).toEqual([]);
    expect(r.decochees[0]).toMatchObject({ source: 'claude', confiance: 0.4 });
    expect(texteBilan(bilanVide())).toBe(null);
  });
});

describe('les coins : le croisement de segments le plus proche', () => {
  // Un mur de 10 x 6 m vu de face sur une photo de 1 000 x 750 px (80 px/m) : ses quatre aretes.
  const seg = (x1: number, y1: number, x2: number, y2: number): Segment => ({ x1, y1, x2, y2, longueur: Math.hypot(x2 - x1, y2 - y1), force: 40 });
  const aretes = [seg(100, 100, 900, 100), seg(900, 100, 900, 580), seg(900, 580, 100, 580), seg(100, 580, 100, 100)];
  const vrais = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 580 }, { x: 100, y: 580 }];
  const image = { largeur: 1000, hauteur: 750 };

  it('rattache une graine a 20 px de son coin au croisement des deux aretes', () => {
    const r = recalerCoins([{ x: 118, y: 112 }, null, { x: 880, y: 600 }, null], aretes, 10, 6, image, vrais);
    expect(r[0]!.point).toEqual({ x: 100, y: 100 });
    expect(r[1]).toBe(null);
    expect(r[2]!.point).toEqual({ x: 900, y: 580 });
  });

  it('rejette une graine que rien ne soutient, et ignore les segments trop courts', () => {
    const joints = [seg(300, 300, 315, 300), seg(300, 300, 300, 312)];
    expect(recalerCoins([{ x: 305, y: 305 }, null, null, null], [...aretes, ...joints], 10, 6, image, vrais)[0]).toBe(null);
    expect(recalerCoins([{ x: 110, y: 110 }, null, null, null], [], 10, 6, image, vrais)[0]).toBe(null);
  });
});
