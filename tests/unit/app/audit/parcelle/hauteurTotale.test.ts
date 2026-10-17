import { describe, it, expect } from 'vitest';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { appliquerPropositions } from '../../../../../src/regles/decisions.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import type { ObjetBrut, ObjetPlan, PtBrut, ToitMesure } from '../../../../../src/model/types.js';

// La hauteur totale (au faitage) d'un batiment sans corps : le toit de la BD TOPO contre la surface LiDAR, et ce que cela ecrit.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const mesure = (egout: number, faite: number): ToitMesure => ({ pas: 0.5, x0: 5, y0: 18, nx: 1, ny: 1, z: [[faite]], egout, faite, source: 'lidar' } as unknown as ToitMesure);

function monter(plus: Partial<ObjetPlan>) {
  const objets = normalizeObjects([
    { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101' } },
    { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'bdtopo' }, ...plus },
  ] as ObjetBrut[]) as ObjetPlan[];
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z')).lire();
  return { objets, e: { objets, liste: listeDeControle(objets, capture), capture, mesures: new Map() } };
}
const hauteur = (e: ReturnType<typeof monter>['e']) => propositionsArbitrees(e, {}).find((p) => p.id === 'maison:hauteurTotale');

describe('la hauteur totale d un batiment sans corps', () => {
  it('le LiDAR (faitage à 11,2 m) l emporte sur le toit de la BD TOPO (9 m) : la ligne est cochee, avec ses deux sources', () => {
    const { e } = monter({ toitMesure: mesure(6, 11.2) });
    const p = hauteur(e);
    expect(p).toMatchObject({ source: 'arbitrage', avant: '9 m', apres: '11,2 m, LiDAR HD', effet: { type: 'hauteurToit', faitageM: 11.2 } });
    expect(p?.arbitrages?.[0]).toMatchObject({ attribut: 'hauteurTotale', decision: 'auto' });
    expect(p?.arbitrages?.[0]?.groupes.flatMap((g) => g.lignes.map((l) => l.source)).sort()).toEqual(['ign', 'lidar']);
  });

  it('s ecrit comme la hauteur du toit au-dessus de l egout, apres l egout lui-meme', () => {
    const { objets, e } = monter({ toitMesure: mesure(7, 11.2) });
    const ps = propositionsArbitrees(e, {});
    appliquerPropositions(objets, ps, [], '2026-10-13');
    const m = objets.find((o) => o.key === 'maison')!;
    expect(m.elevation).toBe(7);
    expect(m.toit?.hauteur).toBe(4.2);
  });

  it('ne propose rien quand les corps sont lus (ils portent le faitage), ou a moins de 50 cm', () => {
    const corps = [{ pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 }];
    expect(hauteur(monter({ toitMesure: mesure(6, 11.2), corpsToit: corps as never }).e)).toBeUndefined();
    expect(hauteur(monter({ toitMesure: mesure(6, 9.3) }).e)).toBeUndefined();
  });

  it('la personne peut forcer une hauteur que personne n a lue', () => {
    const { e } = monter({});
    expect(hauteur(e)).toBeUndefined();
    const forcee = propositionsArbitrees(e, {}, undefined, { 'batiment:maison|hauteurTotale': { type: 'force', valeur: 12 } }).find((p) => p.id === 'maison:hauteurTotale');
    expect(forcee).toMatchObject({ effet: { type: 'hauteurToit', faitageM: 12 } });
    expect(forcee?.arbitrages?.[0]).toMatchObject({ decision: 'forcee' });
  });
});
