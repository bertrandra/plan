// « Trouver les semblables » et « Coller au bord » sur une facade de synthese : six fenetres identiques (cadre clair, vitre sombre,
// meneau), une septieme plus grande de 8 %, sur un enduit bruite.
import { describe, expect, it } from 'vitest';
import { caler } from '../src/bords.js';
import { semblables, type Boite } from '../src/semblables.js';
import type { Gris } from '../src/fusionAlignement.js';

function facade(): { g: Gris; fenetres: Boite[] } {
  const l = 900, h = 500, v = new Float32Array(l * h), vu = new Uint8Array(l * h).fill(1);
  let s = 11;
  const alea = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let i = 0; i < v.length; i++) v[i] = 170 + alea() * 16;
  const fenetres: Boite[] = [];
  const poser = (x0: number, y0: number, e = 1) => {
    const L = Math.round(70 * e), H = Math.round(110 * e), c = Math.round(6 * e);
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
      const cadre = x < c || y < c || x >= L - c || y >= H - c || Math.abs(x - L / 2) < c / 2 || Math.abs(y - H * 0.35) < c / 2;
      v[(y0 + y) * l + x0 + x] = cadre ? 235 + alea() * 8 : 45 + alea() * 12 + (y < H * 0.35 ? 10 : 0);
    }
    fenetres.push({ x0: x0, y0: y0, x1: x0 + L, y1: y0 + H });
  };
  for (const [x, y] of [[60, 60], [200, 60], [340, 60], [60, 300], [200, 300], [340, 300]] as const) poser(x, y);
  poser(600, 280, 1.08);
  return { g: { l, h, v, vu }, fenetres };
}

describe('trouver les semblables', () => {
  it('d’une fenêtre dessinée, retrouve les six autres, la plus grande comprise, au pixel près', () => {
    const { g, fenetres } = facade();
    const modele = fenetres[0] as Boite;
    const r = semblables(g, modele, [modele]);
    expect(r.length).toBe(6);
    for (const f of fenetres.slice(1)) {
      const t = r.find((x) => Math.abs(x.boite.x0 - f.x0) < 12 && Math.abs(x.boite.y0 - f.y0) < 12);
      expect(t, `fenetre en ${f.x0}, ${f.y0}`).toBeDefined();
      expect(Math.abs((t as { boite: Boite }).boite.x0 - f.x0)).toBeLessThanOrEqual(3);
      expect(Math.abs((t as { boite: Boite }).boite.y1 - f.y1)).toBeLessThanOrEqual(6);
    }
  });
  it('une place déjà prise par un objet n’est pas proposée', () => {
    const { g, fenetres } = facade();
    expect(semblables(g, fenetres[0] as Boite, fenetres).length).toBe(0);
  });
});

describe('coller au bord', () => {
  it('un rectangle tracé à 5 pixels près se cale sur le cadre', () => {
    const { g, fenetres } = facade();
    const f = fenetres[1] as Boite;
    const c = caler(g, { x0: f.x0 - 5, y0: f.y0 + 4, x1: f.x1 + 4, y1: f.y1 - 5 });
    // Le bord de l'image est entre deux pixels : le cote se pose a un pixel pres.
    expect(Math.abs(c.x0 - f.x0)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.y0 - f.y0)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.x1 - f.x1)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.y1 - f.y1)).toBeLessThanOrEqual(1);
  });
  it('sur un enduit sans bord, rien ne bouge', () => {
    const { g } = facade();
    const b = { x0: 500, y0: 40, x1: 560, y1: 120 };
    expect(caler(g, b)).toEqual(b);
  });
});
