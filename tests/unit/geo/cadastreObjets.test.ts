import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { objetsDepuisCadastre, type ImportCadastral, type ParcelleCadastrale, type ObjetBdTopo } from '../../../src/geo/cadastreObjets.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { PtBrut } from '../../../src/model/types.js';

// Un import cadastral complet et fige : deux parcelles de propriete a fusionner (elles partagent un
// cote, qui devient une limite interne), une voisine retenue, deux batiments (l'un chez soi, l'autre
// chez le voisin), une haie, une zone de vegetation et ses arbres estimes, une adresse et un PLU.
// Ce que `objetsDepuisCadastre` en fait est range dans tests/fixtures/golden/cadastre-objets.json :
// toute retouche de la fonction doit le reproduire a l'identique.

const temoin = resolve(__dirname, '../../fixtures/golden/cadastre-objets.json');
const proj = projecteurLocal(48.9, 2.15);
const carre = (x0: number, y0: number, l: number, h: number): PtBrut[] =>
  [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + h }, { x: x0, y: y0 + h }];
const parcelle = (idu: string, numero: string, pts: PtBrut[], contenance: number): ParcelleCadastrale => ({
  idu, codeInsee: '78650', commune: 'Le Vesinet', section: 'AE', numero, contenance, pts,
  anneauDeg: pts.map(p => { const d = proj.versDegres(p.x, p.y); return [d.lon, d.lat] as [number, number]; }),
  distance: 3.456
});

function importFige(): ImportCadastral {
  const a = parcelle('78650000AE0101', '0101', carre(0, 0, 20, 30), 600);
  const b = parcelle('78650000AE0102', '0102', carre(20, 0, 15, 30), 450);
  const voisine = parcelle('78650000AE0103', '0103', carre(35, 0, 18, 30), 540);
  const bdtopo = (id: string, pts: PtBrut[], parcelles: string[], props: Record<string, unknown>): ObjetBdTopo => ({ id, pts, parcelles, props });
  return {
    principale: a,
    parcellesPropriete: () => [a, b],
    proj, simplifier: true, rayon: 60,
    geo: { label: '1 rue des Tilleuls 78110 Le Vesinet', score: 0.93, genre: 'housenumber', citycode: '78650', ville: 'Le Vesinet', lon: 2.15, lat: 48.9 },
    voisinesRetenues: () => [b, voisine],
    importerBatiments: true,
    batiments: [
      bdtopo('BATIMENT0001', carre(4, 8, 10, 9), ['78650000AE0101'], { usage_1: 'Residentiel', nombre_d_etages: '2', hauteur: '6,5', cleabs: 'BAT01' }),
      bdtopo('BATIMENT0002', carre(40, 10, 8, 8), ['78650000AE0103'], { nature: 'Indifferenciee' })
    ],
    importerHaies: true,
    haies: [bdtopo('HAIE0001', carre(0, 29, 35, 1), ['78650000AE0101', '78650000AE0102'], { hauteur: '1,8' })],
    importerVegetation: true,
    vegetation: [bdtopo('VEG0001', carre(22, 2, 11, 12), ['78650000AE0102'], { nature: 'Bois' })],
    importerArbres: true,
    plu: { zones: [{ libelle: 'UG', typezone: 'U' }] } as NonNullable<ImportCadastral['plu']>
  };
}

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-28T08:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });

describe('objetsDepuisCadastre, sur un import complet fige', () => {
  it('reproduit le temoin a l identique', () => {
    const importe = importFige();
    const objets = objetsDepuisCadastre(importe);
    const texte = JSON.stringify({ fusionEchouee: importe.fusionEchouee ?? null, objets }, null, 1);
    // Le temoin a ete ecrit depuis le code d'avant le decoupage de la fonction (28 septembre 2026).
    // Il ne se reecrit que sur demande explicite — un temoin absent est une erreur, pas une invitation.
    if (process.env.RECAPTURER_CADASTRE) writeFileSync(temoin, texte + '\n');
    expect(existsSync(temoin), 'temoin absent : ' + temoin).toBe(true);
    expect(texte + '\n').toBe(readFileSync(temoin, 'utf8'));
  });

  it('fusionne la propriete, trace la limite interne, et garde les voisines et le bati', () => {
    const { objets } = JSON.parse(readFileSync(temoin, 'utf8')) as { objets: { key: string; fonction?: string; locked?: boolean }[] };
    expect(objets[0]?.key).toBe('parcelle');
    expect(objets.filter(o => o.fonction === 'limite').length).toBeGreaterThan(0);
    expect(objets.some(o => o.key.startsWith('parcelle-ae-103'))).toBe(true);
    // Le bati chez soi est modifiable, celui du voisin verrouille.
    const bati = objets.filter(o => o.fonction === 'batiment');
    expect(bati.map(o => o.locked)).toEqual([false, true]);
    expect(objets.some(o => o.fonction === 'arbre')).toBe(true);
  });
});
