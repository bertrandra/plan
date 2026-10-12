import { describe, it, expect, vi } from 'vitest';
import { creerPromenade } from '../../../../src/app/audit/promenade.js';
import { lireDemandeAudit } from '../../../../src/app/audit/demande.js';
import { entreesDe, sortiesDe, identiteDe, DISTANCE_VOISINS_M } from '../../../../src/app/audit/cas.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// La promenade d'audit : marquer est immediat, la grille et l'adresse completent le cas ensuite, un
// seul fichier rassemble tout.

const rect = (x: number, y: number, l: number, h: number) => [{ x, y }, { x: x + l, y }, { x: x + l, y: y + h }, { x, y: y + h }];
const bati = (key: string, x: number, extra: Record<string, unknown> = {}) => ({ key, fonction: 'batiment', type: 'polygon', pts: rect(x, 0, 8, 6), ...extra }) as unknown as ObjetPlan;
const parcelle = { key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: rect(-5, -5, 30, 20), cadastre: { idu: '78650000AE0101' } } as unknown as ObjetPlan;

describe('la demande du mode audit', () => {
  it('lit ?mode=audit et son depart facultatif', () => {
    expect(lireDemandeAudit('?mode=audit')).toEqual({ depart: null });
    expect(lireDemandeAudit('?mode=audit&depart=2%20all%C3%A9e%20des%20Limites')).toEqual({ depart: '2 allée des Limites' });
    expect(lireDemandeAudit('?mode=devroof')).toBeNull();
    expect(lireDemandeAudit('')).toBeNull();
  });
});

describe('figer un cas', () => {
  it('garde le contour, la BD TOPO, la grille au centimetre et les batiments proches ; les sorties telles quelles', () => {
    const o = bati('b1', 0, { bdtopo: { cleabs: 'BATIMENT0001', materiauxMurs: '01' }, elevation: 6.2, toit: { forme: 'deuxPans' }, corpsToit: [{ faitage: 8 }] });
    const proche = bati('b2', 8 + DISTANCE_VOISINS_M - 1), loin = bati('b3', 40);
    const e = entreesDe(o, [o, proche, loin, parcelle], { pas: 0.5, x0: 0, y0: 0, nx: 1, ny: 1, z: [6.789] });
    expect(e.voisins.map((v) => v.cle)).toEqual(['b2']);
    expect(e.grille!.z).toEqual([6.79]);
    expect(e.bdtopo).toEqual({ cleabs: 'BATIMENT0001', materiauxMurs: '01' });
    const s = sortiesDe(o);
    expect(s).toMatchObject({ mode: 'entier', elevation: 6.2, toit: { forme: 'deuxPans' }, corps: [{ faitage: 8 }], sourceMurs: 'materiau' });
    expect(identiteDe(o, [o, parcelle])).toEqual({ cleBdtopo: 'BATIMENT0001', idu: '78650000AE0101' });
  });
});

describe('la promenade', () => {
  const fige = { identite: { cleBdtopo: 'X', idu: 'Y', adresse: null }, entrees: { pts: [], bdtopo: null, grille: null, voisins: [] }, sorties: sortiesDe(bati('b', 0)) };

  it('marque tout de suite, complete ensuite avec la grille et l adresse, retire, et rassemble un seul fichier', async () => {
    let finGrille!: (g: unknown) => void;
    const p = creerPromenade({
      figer: (cle) => (cle === 'absent' ? null : JSON.parse(JSON.stringify(fige))),
      lireGrille: () => new Promise((r) => { finGrille = r as never; }),
      adresse: async () => '2 allée des Limites',
      maintenant: () => new Date('2026-10-13T09:00:00Z'),
    });
    const f = vi.fn(); p.abonner(f);
    const c = p.marquer('b1', { x: 1.234, y: 5.678 }, 4)!;
    expect(p.estMarque('b1')).toBe(true);
    expect(c.constat).toMatchObject({ categorie: 'toit', problemes: [], position: { x: 1.2, y: 5.7, precisionM: 4 } });
    expect(c.statut).toBe('a_corriger');
    expect(p.marquer('b1', { x: 0, y: 0 }, null)).toBe(c);
    expect(p.marquer('absent', { x: 0, y: 0 }, null)).toBeNull();
    finGrille({ pas: 0.5, x0: 0, y0: 0, nx: 1, ny: 1, z: [1] });
    await p.enCours();
    expect(c.entrees.grille).not.toBeNull();
    expect(c.identite.adresse).toBe('2 allée des Limites');
    p.completer('b1', { categorie: 'toit', problemes: ['toit.sens-faitage', 'toit.pignon-manquant', 'toit.sens-faitage'], note: 'côté rue', photo: { type: 'image/jpeg', base64: 'AAAA' } });
    expect(c.constat.problemes).toEqual(['toit.sens-faitage', 'toit.pignon-manquant']);
    expect(c.constat.photo?.base64).toBe('AAAA');
    p.completer('b1', { photo: null });
    expect(c.constat.photo).toBeUndefined();
    p.marquer('b2', { x: 0, y: 0 }, null);
    p.retirer('b2');
    const fichier = p.fichier({ commune: 'Le Vésinet', origine: { lat: 48.9, lon: 2.13 }, emprise: null, code: { version: '2.2.0', commit: null }, regles: { lectureToits: 1, lectureMurs: 2 } });
    expect(fichier.format).toBe('plan-audit');
    expect(fichier.cas.map((x) => x.cle)).toEqual(['b1']);
    expect(fichier.promenade.debut).toBe('2026-10-13T09:00:00.000Z');
    expect(f).toHaveBeenCalled();
  });

  it('un cas retire avant la fin de sa lecture n est pas ressuscite', async () => {
    let fin!: (g: unknown) => void;
    const p = creerPromenade({ figer: () => JSON.parse(JSON.stringify(fige)), lireGrille: () => new Promise((r) => { fin = r as never; }) });
    const c = p.marquer('b1', { x: 0, y: 0 }, null)!;
    p.retirer('b1');
    fin({ z: [1] });
    await p.enCours();
    expect(p.estMarque('b1')).toBe(false);
    expect(c.entrees.grille).toBeNull();
  });
});
