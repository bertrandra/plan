import { describe, it, expect } from 'vitest';
import { PROBLEMES_AUDIT, CATEGORIES_AUDIT, problemesDe, nomFichierPromenade, fichierPromenade, grilleAuCentimetre, type MetaPromenade } from '../../../src/model/audit.js';

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
    expect(f).toEqual({ format: 'plan-audit', version: 1, promenade: meta, cas: [] });
    expect(grilleAuCentimetre({ pas: 0.5, x0: 0, y0: 0, nx: 2, ny: 1, z: [1.23456, null] })!.z).toEqual([1.23, null]);
    expect(grilleAuCentimetre(null)).toBeNull();
  });
});
