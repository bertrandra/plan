import { describe, it, expect } from 'vitest';
import { creerEtat } from '../../../src/core/state.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { DEMO_TEMOIN_OBJECTS, DEMO_MEASURES } from '../../../src/model/demo.js';
import { computeBOM } from '../../../src/engine/bom.js';
import { computeTerrasseLayers } from '../../../src/engine/layers.js';
import { computeDebitLames, computeDebitsBois } from '../../../src/engine/debit.js';
import { solDuProjet } from '../../../src/engine/sol.js';
import { ENTETES_CSV, construireListeAchatCSV, construireListeAchatPDF, nomFichierListeAchat } from '../../../src/export/listeAchat.js';
import type { ObjetBrut, ObjetPlan, ObjetPolygone } from '../../../src/model/types.js';

// La liste d'achat (export/listeAchat.ts) : les memes nombres que la Nomenclature, ligne a ligne, aux arrondis qu'elle affiche.

const JOUR = new Date('2026-11-16T10:00:00');
function demo(): ObjetPlan[] {
  return creerEtat({ objects: JSON.parse(JSON.stringify(DEMO_TEMOIN_OBJECTS)), measures: DEMO_MEASURES } as Parameters<typeof creerEtat>[0],
    (b: ObjetBrut[]) => normalizeObjects(b) as ObjetPlan[]).objects;
}
/** Le CSV relu : une ligne par cellule, sans le BOM ni les guillemets. */
function relire(t: string): string[][] {
  expect(t.startsWith('﻿')).toBe(true);
  return t.slice(1).split('\r\n').filter(Boolean).map((l) => (l.match(/("([^"]|"")*"|[^;]*)(;|$)/g) ?? []).slice(0, ENTETES_CSV.length).map((c) => c.replace(/;$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')));
}
const fr2 = (v: number) => v.toFixed(2).replace('.', ',');

describe('la liste d achat', () => {
  it('le CSV redonne chaque ligne de la Nomenclature de la demonstration, aux memes nombres', () => {
    const objets = demo();
    const [entetes, ...lignes] = relire(construireListeAchatCSV(objets, ['terrasse', 'table']));
    expect(entetes).toEqual(ENTETES_CSV);
    let attendues = 0;
    for (const t of objets.filter((o) => o.key === 'terrasse' || o.key === 'table') as ObjetPolygone[]) {
      const couches = computeTerrasseLayers(t, objets);
      const bom = computeBOM(t, couches, solDuProjet(objets));
      for (const l of bom) {
        const ligne = lignes.find((x) => x[1] === t.name && x[2] === l.label);
        // Une ligne qui n'achete rien (quantite nulle, aucun prix) n'est pas sur la liste ; toutes les autres y sont.
        if (!(l.qte > 0) || (!l.prixBas && !l.prixHaut && (l.prixReel === null || l.prixReel === undefined))) { expect(ligne).toBeUndefined(); continue; }
        attendues++;
        expect(ligne, l.label).toBeDefined();
        expect(ligne![5]).toBe(l.qte.toFixed(l.unite === 'u' ? 0 : 2).replace('.', ','));
        expect(ligne![6]).toBe(l.unite);
        expect(ligne![7]).toBe(l.prixBas ? fr2(l.prixBas) : '');
        expect(ligne![8]).toBe(l.prixHaut ? fr2(l.prixHaut) : '');
        expect(ligne![9]).toBe(l.prixReel !== null && l.prixReel !== undefined ? fr2(l.prixReel) : '');
      }
      // Les barres : celles des tables de debit, longueur par longueur.
      const debits = [{ poste: 'lames', d: computeDebitLames(t, couches) }, ...computeDebitsBois(t, couches).map((g) => ({ poste: g.cle, d: g.debit }))];
      for (const { poste, d } of debits) {
        const label = bom.find((x) => x.poste === poste)!.label;
        const ligne = lignes.find((x) => x[1] === t.name && x[2] === label)!;
        const total = ligne[4]!.split(' ; ').reduce((s, b) => { const [n, L] = b.split(' × '); return s + Number(n) * parseFloat(L!.replace(',', '.')); }, 0);
        expect(total).toBeCloseTo(d.achatMl, 6);
        expect(ligne[4]!.split(' ; ').map((b) => Number(b.split(' × ')[0])).reduce((a, b) => a + b, 0)).toBe(Object.values(d.achats).reduce((a, b) => a + b, 0));
      }
    }
    expect(lignes.length).toBe(attendues);
    // Rangee par rayon, dans l'ordre du chantier.
    expect([...new Set(lignes.map((l) => l[0]))]).toEqual(['Plots et appuis', 'Structure', 'Bois et lames', 'Visserie et fixations', 'Finitions']);
  });

  it('dit d ou vient le prix reel : saisi, ou pris par defaut', () => {
    const lignes = relire(construireListeAchatCSV(demo(), ['terrasse']));
    expect(lignes.find((l) => l[2] === 'Vis de fondation')![10]).toBe('saisi');
    expect(lignes.find((l) => /^Lames/.test(l[2]!))![10]).toBe('estimé (prix par défaut)');
    expect(lignes.find((l) => l[2] === 'Visserie / fixations')![10]).toBe('non saisi');
  });

  it('le PDF : une case par ligne et par longueur de barre, en WinAnsi ; rien a acheter, pas de PDF', () => {
    const r = construireListeAchatPDF(demo(), ['terrasse', 'table'], { appVersion: '5.32.0', maintenant: JOUR, nomProjet: 'Parcelle AE 101' })!;
    expect(r.pdf).toMatch(/WinAnsiEncoding/);
    expect([...r.pdf].every((c) => c.charCodeAt(0) < 256)).toBe(true);
    const cases = (r.pdf.match(/ re S\n/g) ?? []).length;
    const lignes = relire(construireListeAchatCSV(demo(), ['terrasse', 'table'])).slice(1);
    const barres = lignes.reduce((s, l) => s + (l[4] ? l[4].split(' ; ').length : 0), 0);
    expect(cases).toBe(lignes.length + barres);
    expect(construireListeAchatPDF(demo(), [], { appVersion: '5.32.0', maintenant: JOUR })).toBeNull();
    expect(nomFichierListeAchat('Parcelle AE 101', JOUR, 'csv')).toBe('liste-achat-parcelle-ae-101-20261116.csv');
  });
});
