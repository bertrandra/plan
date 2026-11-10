import { hauteurCorpsEn } from '../../src/facade/toits/toitCorps.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../src/model/types.js';

// Des surfaces LiDAR synthetiques : un toit dessine par le code de la 3D (hauteurCorpsEn), echantillonne tous les 50 cm avec un
// leger bruit deterministe. Elles servent a verifier que la lecture des formes retrouve ce que la 3D dessine.

export const PAS = 0.5;
export const rect = (L: number, W: number): PtBrut[] => [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }];
export const corps = (L: number, W: number, plus: Partial<CorpsToit>): CorpsToit => ({ pts: rect(L, W), posFaitage: W / 2, faitage: 7, egouts: [3, 3], pignons: [], ecart: 0, ...plus });

export function surface(c: CorpsToit, L: number, W: number, bruit = 0.03): ToitMesure {
  const nx = Math.ceil(L / PAS) + 1, ny = Math.ceil(W / PAS) + 1, y0 = W + PAS / 2, x0 = -PAS / 2;
  const z: (number | null)[] = [];
  let g = 7;
  const alea = () => { g = (g * 16807) % 2147483647; return g / 2147483647 - 0.5; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * PAS, y = y0 - j * PAS;
    z.push(x > 0.1 && x < L - 0.1 && y > 0.1 && y < W - 0.1 ? Math.round((hauteurCorpsEn(c, L, W, x, y) + 2 * bruit * alea()) * 100) / 100 : null);
  }
  const vals = z.filter((v): v is number => v !== null);
  return { pas: PAS, x0, y0, nx, ny, z, egout: Math.min(...c.egouts), faite: Math.max(...vals), source: 'lidar' } as unknown as ToitMesure;
}

export const brise = { type: 'brise' as const, largeurBrisisM: 1.4, hauteurBrisM: 5.4 };
