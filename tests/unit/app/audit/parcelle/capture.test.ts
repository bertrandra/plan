import { describe, it, expect } from 'vitest';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { insererSommet } from '../../../../../src/model/sommets.js';
import { transformerPhotos } from '../../../../../src/model/auditParcelle.js';
import type { PhotoCas } from '../../../../../src/model/audit.js';
import type { PtBrut } from '../../../../../src/model/types.js';

// La capture de l'audit de la parcelle et le contour de ses batiments (model/cotesAudit.ts) : les facades notees suivent leur mur
// quand un sommet est ajoute ou retire, et le contour garde passe par le brouillon.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const forme = (pts: PtBrut[]) => ({ pts: pts.map((p) => ({ ...p })), vertexNames: pts.map((_, i) => 'Coin ' + (i + 1)), segmentNames: pts.map((_, i) => 'Cote ' + (i + 1)), frozenVertices: pts.map(() => false) });
const photo = (nom: string) => ({ base64: nom }) as unknown as PhotoCas;

describe('la capture suit le contour de ses batiments', () => {
  it('ses facades suivent leur mur, et rien ne change quand le contour n a pas bouge', () => {
    const c = creerCapture('78650000AE0101', () => new Date('2026-10-28T09:00:00Z'));
    c.ajouterPhotoFacade('maison', 2, photo('nord'));
    const avant = rect(0, 0, 10, 8);
    expect(c.suivreLesContours(new Map([['maison', avant]]))).toBe(true);
    const v = c.version();
    expect(c.suivreLesContours(new Map([['maison', avant]]))).toBe(false);
    expect(c.version()).toBe(v);
    const f = forme(avant);
    insererSommet(f, 0, { x: 5, y: 0 });
    expect(c.suivreLesContours(new Map([['maison', f.pts]]))).toBe(true);
    expect(Object.keys(c.lire().batiments.maison?.facades ?? {})).toEqual(['3']);
  });

  it('le contour garde passe par le brouillon (les photos rangees a part)', () => {
    const c = creerCapture('78650000AE0101', () => new Date('2026-10-28T09:00:00Z'));
    c.ajouterPhotoFacade('maison', 1, photo('est'));
    c.suivreLesContours(new Map([['maison', rect(0, 0, 10, 8)]]));
    expect(transformerPhotos(c.lire(), (ps) => ps.map(() => 'cle')).batiments.maison?.contour).toEqual(rect(0, 0, 10, 8));
  });
});
