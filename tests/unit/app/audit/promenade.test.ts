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
    p.completer('b1', { categorie: 'toit', problemes: ['toit.sens-faitage', 'toit.pignon-manquant', 'toit.sens-faitage'], note: 'côté rue', ajouterPhoto: { type: 'image/jpeg', base64: 'AAAA' } });
    expect(c.constat.problemes).toEqual(['toit.sens-faitage', 'toit.pignon-manquant']);
    expect(c.constat.photos.map((x) => x.base64)).toEqual(['AAAA']);
    p.completer('b1', { retirerPhoto: 0 });
    expect(c.constat.photos).toEqual([]);
    p.marquer('b2', { x: 0, y: 0 }, null);
    p.retirer('b2');
    const fichier = p.fichier({ commune: 'Le Vésinet', origine: { lat: 48.9, lon: 2.13 }, emprise: null, code: { version: '2.2.0', commit: null }, regles: { lectureToits: 1, lectureMurs: 2 } });
    expect(fichier.format).toBe('plan-audit');
    expect(fichier.cas.map((x) => x.cle)).toEqual(['b1']);
    expect(fichier.promenade.debut).toBe('2026-10-13T09:00:00.000Z');
    expect(f).toHaveBeenCalled();
  });

  it('garde jusqu a six photos par cas, dans l ordre, et en retire une par son rang', () => {
    const p = creerPromenade({ figer: () => JSON.parse(JSON.stringify(fige)) });
    const c = p.marquer('b1', { x: 0, y: 0 }, null)!;
    for (let i = 1; i <= 7; i++) p.completer('b1', { ajouterPhoto: { type: 'image/jpeg', base64: 'P' + i } });
    expect(c.constat.photos.map((x) => x.base64)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    p.completer('b1', { retirerPhoto: 1 });
    expect(c.constat.photos.map((x) => x.base64)).toEqual(['P1', 'P3', 'P4', 'P5', 'P6']);
    p.completer('b1', { ajouterPhoto: { type: 'image/jpeg', base64: 'P8' } });
    expect(c.constat.photos.map((x) => x.base64)).toEqual(['P1', 'P3', 'P4', 'P5', 'P6', 'P8']);
    const f = p.fichier({ commune: null, origine: { lat: 48.9, lon: 2.13 }, emprise: null, code: { version: '2.2.0', commit: null }, regles: { lectureToits: 1, lectureMurs: 2 } });
    expect(f.version).toBe(2);
    // Le fichier est une copie : une photo retiree ensuite n'en part pas.
    p.completer('b1', { retirerPhoto: 0 });
    expect(f.cas[0]!.constat.photos).toHaveLength(6);
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

  it('reprend un audit du brouillon : son debut, ses cas d abord, des numeros sans doublon', () => {
    const p = creerPromenade({ figer: () => JSON.parse(JSON.stringify(fige)), maintenant: () => new Date('2026-10-14T08:00:00Z') });
    p.marquer('b1', { x: 0, y: 0 }, null);
    p.marquer('neuf', { x: 0, y: 0 }, null);
    const repris = (cle: string, id: string) => ({ ...JSON.parse(JSON.stringify(fige)), id, cle, statut: 'a_corriger', constat: { categorie: 'toit', problemes: [], note: 'repris', t: '', position: { x: 0, y: 0, precisionM: null }, photos: [] }, attendu: null, historique: [] });
    const f = vi.fn(); p.abonner(f);
    p.reprendre(new Date('2026-10-13T09:00:00Z'), [repris('b1', 'c1'), repris('b7', 'c4')]);
    expect(f).toHaveBeenCalled();
    expect(p.debut.toISOString()).toBe('2026-10-13T09:00:00.000Z');
    expect(p.liste().map((c) => c.cle)).toEqual(['b1', 'b7', 'neuf']);
    expect(p.cas('b1')!.constat.note).toBe('repris');
    const ids = p.liste().map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
    expect(p.marquer('b9', { x: 0, y: 0 }, null)!.id).toBe('c5');
  });

  it('relit une fois la grille et l adresse qui manquent a un cas repris, quand son batiment est la', async () => {
    const lireGrille = vi.fn(async () => ({ pas: 0.5, x0: 0, y0: 0, nx: 1, ny: 1, z: [3] }));
    const adresse = vi.fn(async () => '3 rue des Lilas');
    const p = creerPromenade({ figer: () => JSON.parse(JSON.stringify(fige)), lireGrille, adresse });
    const repris = { ...JSON.parse(JSON.stringify(fige)), id: 'c1', cle: 'b1', statut: 'a_corriger', constat: { categorie: 'toit', problemes: [], note: '', t: '', position: { x: 0, y: 0, precisionM: null }, photos: [] }, attendu: null, historique: [] };
    p.reprendre(new Date(), [repris]);
    p.relireManquants(() => false);
    expect(lireGrille).not.toHaveBeenCalled();
    p.relireManquants(() => true);
    p.relireManquants(() => true);
    await p.enCours();
    expect(lireGrille).toHaveBeenCalledOnce();
    expect(p.cas('b1')!.entrees.grille).not.toBeNull();
    expect(p.cas('b1')!.identite.adresse).toBe('3 rue des Lilas');
  });
});
