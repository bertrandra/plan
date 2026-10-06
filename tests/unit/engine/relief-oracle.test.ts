import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeTerrasseLayers } from '../../../src/engine/layers.js';
import { computeBOM } from '../../../src/engine/bom.js';
import { computeImplantation } from '../../../src/engine/implantation.js';
import { appuisEnHauteur } from '../../../src/engine/hauteurs.js';
import { calculerPergola, chiffrerPergola } from '../../../src/engine/pergola.js';
import { calculerPiscine, chiffrerPiscine } from '../../../src/engine/piscine.js';
import { solDuProjet } from '../../../src/engine/sol.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// Le temoin « projet avec relief » (MD/spec-relief.md §6, tests/fixtures/golden/EMPREINTES.md) :
// une terrasse sur plots, une pergola et une piscine sur une grille plane a 8 % vers l'est, et ce
// que le moteur en compte. Egalite STRICTE : ce sont les nombres qui partent chez un fournisseur.
// Pour le recapturer apres un changement voulu : REECRIRE_TEMOIN_RELIEF=1 npx vitest run tests/unit/engine/relief-oracle.test.ts

const chemin = resolve(__dirname, '../../fixtures/golden/relief-moteur.json');

function plane(a: number, b: number, nx = 100, ny = 100, pas = 0.5): Relief {
  const x0 = -19.75, y0 = 29.75;
  const z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((a * (x0 + i * pas) + b * (y0 - j * pas) + 100) * 100) / 100);
  return { source: 'lidar-hd', couche: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93', dateLecture: '2026-10-06', dateDonnees: '2021-09-24', origine: 'LiDAR HD', precision: 'de l’ordre de 10 cm (IGN)', systemeAltimetrique: 'NGF-IGN69', pas, x0, y0, nx, ny, z, zRef: 100 };
}
const objets: ObjetPlan[] = [
  { key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: [{ x: -15, y: -15 }, { x: 25, y: -15 }, { x: 25, y: 25 }, { x: -15, y: 25 }], relief: plane(-0.08, 0) },
  { key: 't', name: 'Terrasse', type: 'polygon', fonction: 'terrasse', pts: [{ x: 6, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 4 }, { x: 6, y: 4 }], construction: { typePose: 'plots', hauteurPlot: 6 } },
  { key: 'v', name: 'Terrasse sur vis', type: 'polygon', fonction: 'terrasse', pts: [{ x: -10, y: 10 }, { x: -4, y: 10 }, { x: -4, y: 14 }, { x: -10, y: 14 }], construction: { typePose: 'vis-fondation', depassementVis: 2 } },
  { key: 'p', name: 'Pergola', type: 'polygon', fonction: 'pergola', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], pergola: {} },
  { key: 'b', name: 'Bassin', type: 'polygon', fonction: 'piscine', pts: [{ x: 0, y: 10 }, { x: 8, y: 10 }, { x: 8, y: 14 }, { x: 0, y: 14 }], piscine: { plage: 'terrasse-bois', largeurPlage: 2, implantation: 'hors-sol', hauteurHorsSol: 1.2 } }
] as ObjetPlan[];

const commeJson = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function calculer() {
  const sol = solDuProjet(objets);
  const terrasses = objets.filter(o => o.fonction === 'terrasse').map(t => {
    const layers = computeTerrasseLayers(t, objets);
    return { cle: t.key, appuis: appuisEnHauteur(t, layers.vis, sol), bom: computeBOM(t, layers, sol), implantation: computeImplantation(t, layers, sol) };
  });
  const pergola = calculerPergola(objets[3] as ObjetPlan, sol);
  const piscine = calculerPiscine(objets[4] as ObjetPlan, objets);
  return commeJson({
    terrasses,
    pergola: pergola ? { sol: pergola.sol, hauteurReglementaire: pergola.hauteurReglementaire, poteaux: pergola.pieces.filter(p => p.role === 'poteau').map(p => [p.a.z, p.b.z, p.longueur]), chiffrage: chiffrerPergola(pergola) } : null,
    piscine: piscine ? { sol: piscine.sol, fouille: piscine.fouille, plageBois: piscine.plageBois, lignes: chiffrerPiscine(piscine).lignes } : null
  });
}

describe('le temoin « projet avec relief »', () => {
  if (process.env.REECRIRE_TEMOIN_RELIEF) writeFileSync(chemin, JSON.stringify(calculer(), null, 2) + '\n', 'utf8');

  it('existe', () => {
    expect(existsSync(chemin), 'relief-moteur.json absent : REECRIRE_TEMOIN_RELIEF=1').toBe(true);
  });

  it('est reproduit a l identique par le moteur', () => {
    const temoin = JSON.parse(readFileSync(chemin, 'utf8'));
    expect(calculer()).toEqual(temoin);
  });

  it('dit bien un sol en pente : plots de plusieurs gammes, poteaux d aval plus longs, fouille sur le sol reel', () => {
    const r = calculer();
    expect(r.terrasses[0]!.bom.find(l => l.poste === 'vis')!.label).toMatch(/sol en pente/);
    expect(r.pergola!.hauteurReglementaire).toBeGreaterThan(2.4);
    expect(r.piscine!.fouille.nivellement).toBeGreaterThan(0);
  });
});
