import { describe, it, expect } from 'vitest';
import { PROBLEMES_AUDIT, CATEGORIES_AUDIT, problemesDe, nomFichierPromenade, fichierPromenade, grilleAuCentimetre, lireFichierPromenade, FichierPromenadeIllisible, type MetaPromenade } from '../../../src/model/audit.js';

// Le modele du mode audit (MD/spec-audit.md) : des codes stables, un fichier par promenade.

describe('le modele du mode audit', () => {
  it('des codes de problemes uniques, chacun dans une categorie connue, et les quatorze du toit', () => {
    const codes = PROBLEMES_AUDIT.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    const categories = new Set(CATEGORIES_AUDIT.map((c) => c.code));
    for (const p of PROBLEMES_AUDIT) expect(categories.has(p.categorie)).toBe(true);
    expect(problemesDe('toit')).toHaveLength(14);
    expect(problemesDe('toit')[0]).toEqual({ code: 'toit.sens-faitage', libelle: 'Sens du faîtage' });
  });

  it('nomme le fichier par la date, l heure et la commune sans accents', () => {
    expect(nomFichierPromenade(new Date(2026, 9, 13, 9, 5), 'Le Vésinet')).toBe('audit-2026-10-13-0905-le-vesinet.json');
    expect(nomFichierPromenade(new Date(2026, 0, 2, 18, 30), null)).toBe('audit-2026-01-02-1830.json');
  });

  it('rassemble les cas dans un seul fichier, et arrondit la grille au centimetre', () => {
    const meta: MetaPromenade = { debut: 'a', fin: 'b', commune: 'X', origine: { lat: 48.9, lon: 2.1 }, emprise: null, code: { version: '2.2.0', commit: null }, regles: { lectureToits: 1, lectureMurs: 2 } };
    const f = fichierPromenade(meta, []);
    expect(f).toEqual({ format: 'plan-audit', version: 2, promenade: meta, cas: [] });
    expect(grilleAuCentimetre({ pas: 0.5, x0: 0, y0: 0, nx: 2, ny: 1, z: [1.23456, null] })!.z).toEqual([1.23, null]);
    expect(grilleAuCentimetre(null)).toBeNull();
  });

  const meta: MetaPromenade = { debut: 'a', fin: 'b', commune: 'X', origine: { lat: 48.9, lon: 2.1 }, emprise: null, code: { version: '2.2.0', commit: null }, regles: { lectureToits: 1, lectureMurs: 2 } };
  const casV1 = (constat: Record<string, unknown>) => ({
    id: 'c1', cle: 'b1', statut: 'a_corriger', identite: { cleBdtopo: null, idu: null, adresse: null },
    entrees: { pts: [], bdtopo: null, grille: null, voisins: [] }, sorties: null, attendu: null, historique: [],
    constat: { categorie: 'toit', problemes: ['toit.forme'], note: 'n', t: 't', position: { x: 1, y: 2, precisionM: 5 }, ...constat },
  });

  it('relit un fichier de version 1 : sa photo unique devient photos[0], le reste ne bouge pas', () => {
    const prise = { t: 't', x: 1, y: 2, lat: 48.9, lon: 2.1, precisionM: 5, azimutDeg: 245, sourceAzimut: 'boussole' };
    const v1 = { format: 'plan-audit', version: 1, promenade: meta, cas: [casV1({ photo: { type: 'image/jpeg', base64: 'AAAA', prise } }), casV1({})] };
    const f = lireFichierPromenade(JSON.parse(JSON.stringify(v1)));
    expect(f.version).toBe(2);
    expect(f.promenade).toEqual(meta);
    expect(f.cas[0]!.constat.photos).toEqual([{ type: 'image/jpeg', base64: 'AAAA', prise }]);
    expect('photo' in f.cas[0]!.constat).toBe(false);
    expect(f.cas[0]!.constat).toMatchObject({ categorie: 'toit', problemes: ['toit.forme'], note: 'n', position: { x: 1, y: 2, precisionM: 5 } });
    expect(f.cas[1]!.constat.photos).toEqual([]);
  });

  it('relit un fichier de version 2 tel quel, et refuse ce qui n est pas une promenade lisible', () => {
    const photos = [{ type: 'image/jpeg', base64: 'A' }, { type: 'image/jpeg', base64: 'B' }];
    const v2 = { format: 'plan-audit', version: 2, promenade: meta, cas: [casV1({ photos })] };
    expect(lireFichierPromenade(JSON.parse(JSON.stringify(v2)))).toEqual(v2);
    expect(() => lireFichierPromenade({ format: 'autre', version: 1 })).toThrow(FichierPromenadeIllisible);
    expect(() => lireFichierPromenade(null)).toThrow(FichierPromenadeIllisible);
    expect(() => lireFichierPromenade({ format: 'plan-audit', version: 3, promenade: meta, cas: [] })).toThrow(/plus récente/);
    expect(() => lireFichierPromenade({ format: 'plan-audit', version: 2, promenade: meta })).toThrow(/incomplet/);
  });
});
