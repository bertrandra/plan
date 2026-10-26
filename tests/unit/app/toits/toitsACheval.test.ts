import { describe, it, expect, beforeEach } from 'vitest';
import { batimentsEnDoute, questionACheval, repondreACheval, poserQuestionsToitsACheval } from '../../../../src/app/toits/toitsACheval.js';
import { toitAChevalApresCalcul } from '../../../../src/app/toits/toitsLidar.js';
import { reconstruireCorps } from '../../../../src/facade/toits/toitCorps.js';
import { toitMesureDepuisGrille } from '../../../../src/model/toitMesure.js';
import { pointInPolygon } from '../../../../src/geometry/basic.js';
import { dialogues } from '../../../../src/shell/dialogues.js';
import type { GrilleRelief } from '../../../../src/model/relief.js';
import type { ObjetPlan, PtBrut } from '../../../../src/model/types.js';

// La question posee quand un batiment a cheval sur deux parcelles laisse un doute sur sa toiture
// (MD/spec-toit-ign.md §13.8) : une longere de 16 m, un seul faitage mesure, la limite au milieu.

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const pts = rect(0, 0, 16, 8);
/** Un deux-pans continu, faitage a 8 m en y = 4, egouts a 5 m. */
function mesure() {
  const pas = 0.5, x0 = -0.75, y0 = 8.75, nx = 37, ny = 21;
  const z: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * pas, y = y0 - j * pas;
    z.push(x > 0 && x < 16 && y > 0 && y < 8 ? 8 - 0.75 * Math.abs(y - 4) : 0);
  }
  const g: GrilleRelief = { pas, x0, y0, nx, ny, z };
  return { g, m: toitMesureDepuisGrille(g, pts)! };
}
function plan(): ObjetPlan[] {
  const { m } = mesure();
  const b = { key: 'b1', name: 'Longère', fonction: 'batiment', type: 'polygon', pts, bdtopo: { surParcellePrincipale: true }, toitMesure: m, corpsToit: reconstruireCorps(m, pts) };
  return [
    { key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: rect(-5, -5, 13, 20), cadastre: { section: 'AE', numero: '0101' } },
    { key: 'p102', fonction: 'terrain', type: 'polygon', pts: rect(8, -5, 13, 20), cadastre: { section: 'AE', numero: '0102' } },
    b,
  ] as unknown as ObjetPlan[];
}

describe('le doute, note par le calcul', () => {
  it('un corps continu sur la limite : le doute est note, sans reponse', () => {
    const objets = plan();
    const b = objets[2]!;
    expect(b.corpsToit).toHaveLength(1);
    toitAChevalApresCalcul(b, objets, null);
    expect(b.toitACheval).toEqual({ parcelles: ['parcelle', 'p102'] });
    expect(batimentsEnDoute(objets)).toEqual([b]);
  });

  it('une reponse donnee s applique au calcul suivant, sans nouvelle question', () => {
    const objets = plan();
    const b = objets[2]!;
    b.toitACheval = { parcelles: [], reponse: 'parParcelle' };
    toitAChevalApresCalcul(b, objets, mesure().g);
    expect(b.toitACheval).toEqual({ parcelles: ['parcelle', 'p102'], reponse: 'parParcelle' });
    expect(b.corpsToit!.length).toBe(2);
    expect(batimentsEnDoute(objets)).toEqual([]);
  });

  it('un batiment qui n est plus a cheval perd sa question', () => {
    const objets = plan().filter((o) => o.key !== 'p102');
    const b = objets[1]!;
    b.toitACheval = { parcelles: ['parcelle', 'p102'] };
    toitAChevalApresCalcul(b, objets, null);
    expect(b.toitACheval).toBeNull();
  });
});

describe('la question et sa reponse', () => {
  it('nomme le batiment, les deux parcelles et leurs parts, et dit ce que le LiDAR a lu', () => {
    const objets = plan();
    const q = questionACheval(objets[2]!, objets)!;
    expect(q.titre).toBe('Un toit ou deux ?');
    expect(q.texte).toContain('Le bâtiment sélectionné sur le plan (« Longère », 128 m² au sol) est à cheval sur votre parcelle AE 101 (64 m²) et la parcelle AE 102 (64 m²).');
    expect(q.texte).toMatch(/toit continu \(faîtage à [\d,]+ m\)/);
    expect(q.points).toHaveLength(3);
  });

  it('un toit par parcelle : chaque corps tient dans une part, et s arrete a la limite', () => {
    const objets = plan();
    const b = objets[2]!;
    expect(repondreACheval(b, objets, 'parParcelle')).toBe(true);
    expect(b.toitACheval?.reponse).toBe('parParcelle');
    expect(b.corpsToit!.length).toBe(2);
    for (const c of b.corpsToit!) {
      const xs = c.pts.map((q) => q.x);
      expect(Math.max(...xs) <= 8.01 || Math.min(...xs) >= 7.99).toBe(true);
      expect(c.faitage).toBeGreaterThan(7.5);
    }
    // Un seul toit : les corps lus restent.
    const autres = plan();
    const avant = JSON.stringify(autres[2]!.corpsToit);
    expect(repondreACheval(autres[2]!, autres, 'un')).toBe(true);
    expect(JSON.stringify(autres[2]!.corpsToit)).toBe(avant);
    expect(pointInPolygon(p(8, 4), autres[2]!.corpsToit![0]!.pts)).toBe(true);
  });
});

describe('poserQuestionsToitsACheval', () => {
  beforeEach(() => dialogues.fermer());
  const contexte = (objets: ObjetPlan[], lectureSeule = false) => {
    const journal: string[] = [];
    return { journal, ctx: { objets: () => objets, lectureSeule: () => lectureSeule, preparer: () => { journal.push('instantane'); return () => journal.push('empile'); }, apresModification: () => journal.push('redessine'), montrer: (o: ObjetPlan) => journal.push('montre ' + o.key) } };
  };
  const enDoute = () => { const o = plan(); toitAChevalApresCalcul(o[2]!, o, null); return o; };

  it('pose une question par batiment en doute ; la reponse est une etape d annulation', () => {
    const objets = enDoute();
    const { journal, ctx } = contexte(objets);
    poserQuestionsToitsACheval(ctx);
    const d = dialogues.courant();
    expect(d?.type).toBe('choix');
    if (d?.type !== 'choix') return;
    expect(d.principal.libelle).toBe('Un seul toit');
    expect(d.secondaire.libelle).toBe('Un toit par parcelle');
    dialogues.repondreSecondaire();
    expect(objets[2]!.toitACheval?.reponse).toBe('parParcelle');
    expect(journal).toEqual(['montre b1', 'instantane', 'empile', 'redessine']);
    expect(dialogues.courant()).toBeNull();
  });

  it('attend que le dialogue ouvert soit ferme ; Echap ne repond pas', async () => {
    const objets = enDoute();
    dialogues.ouvrir({ type: 'confirmation', texte: 'Autre question', confirmer: () => {} });
    poserQuestionsToitsACheval(contexte(objets).ctx);
    expect(dialogues.courant()?.type).toBe('confirmation');
    dialogues.fermer();
    await Promise.resolve();
    expect(dialogues.courant()?.type).toBe('choix');
    dialogues.fermer();
    expect(objets[2]!.toitACheval?.reponse).toBeUndefined();
  });

  it('en lecture seule, rien n est demande', () => {
    poserQuestionsToitsACheval(contexte(enDoute(), true).ctx);
    expect(dialogues.courant()).toBeNull();
  });
});
