import { describe, it, expect } from 'vitest';
import { construireNoteCalculPDF, enAscii, noteExportable } from '../../../src/export/noteCalculPdf.js';
import { sectionsObjet } from '../../../src/ui/champs/objet.js';
import type { ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan, Pergola } from '../../../src/model/types.js';

const abri = (p: Pergola): ObjetPlan => ({
  key: 'a', name: 'Carport 1', type: 'polygon', fonction: 'carport',
  pts: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 5 }, { x: 0, y: 5 }], pergola: p
});

describe('note de calcul en PDF', () => {
  it('transcrit en ASCII ce que la police ne sait pas ecrire', () => {
    expect(enAscii('Région 45 × 145 mm — 0,60 kN/m² ≤ φ')).toBe('Region 45 x 145 mm - 0,60 kN/m2 <= phi');
  });

  it('n\'existe pas tant que les regions ne sont pas choisies', () => {
    expect(noteExportable(abri({}))).toBe(false);
    expect(construireNoteCalculPDF(abri({}), { appVersion: '9.9.9' })).toBeNull();
  });

  it('produit un PDF en ASCII avec ses sections', () => {
    const o = abri({ calcul: { zoneNeige: 'C1', zoneVent: 2, altitude: 300 } });
    expect(noteExportable(o)).toBe(true);
    const res = construireNoteCalculPDF(o, { appVersion: '9.9.9', nomProjet: 'Maison', date: new Date(2026, 9, 5) })!;
    expect(res.pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(res.pages).toBeGreaterThanOrEqual(1);
    expect([...res.pdf].every(ch => ch === '\n' || (ch >= ' ' && ch <= '~'))).toBe(true);
    for (const t of ['Note de calcul de pre-dimensionnement', '1. Ouvrage', '5. Verification des pieces', '8. Limites de cette note', '05/10/2026']) {
      expect(res.pdf).toContain(t);
    }
  });
});

describe('section Note de calcul de l\'inspecteur', () => {
  const contexte = (o: ObjetPlan) => ({ obj: o, objets: [o], elevationOf: () => 2.3 }) as unknown as ContexteChamps;

  it('demande les regions avant de calculer', () => {
    const s = sectionsObjet(contexte(abri({}))).find(x => x.id === 'noteCalcul')!;
    expect(s.champs.find(c => c.cle === 'calcul-manque')).toBeDefined();
    expect(s.champs.find(c => c.cle === 'calcul-chevron')).toBeUndefined();
  });

  it('ecrit les hypotheses dans l\'objet et montre les pieces verifiees', () => {
    const o = abri({});
    const c = contexte(o);
    const champs = () => sectionsObjet(c).find(x => x.id === 'noteCalcul')!.champs;
    const neige = champs().find(x => x.cle === 'zoneNeige')!, vent = champs().find(x => x.cle === 'zoneVent')!;
    if (neige.type !== 'choix' || vent.type !== 'choix') throw new Error('choix attendus');
    neige.ecrire(c, 'B1'); vent.ecrire(c, '3');
    expect(o.pergola?.calcul).toEqual({ zoneNeige: 'B1', zoneVent: 3 });
    expect(champs().map(x => x.cle)).toEqual(expect.arrayContaining(['calcul-neige', 'calcul-vent', 'calcul-chevron', 'calcul-poutre', 'calcul-poteau', 'calcul-ancrage', 'calcul-urbanisme', 'calcul-pdf']));
    neige.ecrire(c, '');
    expect(o.pergola?.calcul).toEqual({ zoneVent: 3 });
  });
});
