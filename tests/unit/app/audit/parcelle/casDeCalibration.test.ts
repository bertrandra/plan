import { describe, it, expect } from 'vitest';
import { facadesACalibrer, casDepuisFacade } from '../../../../../src/app/audit/parcelle/casDeCalibration.js';
import type { FichierAuditParcelle } from '../../../../../src/model/fichierAuditParcelle.js';

// Un cas de calibration tire d'un audit : les dimensions viennent du plan (cadastre, LiDAR), jamais d'une mesure sur place.

const photo = { type: 'image/jpeg', base64: 'AAAA' };
const facade = (cote: number, orientation: string, largeurM: number | null, hauteurM: number | null, n: number) =>
  ({ cote, orientation, largeurM, hauteurM, photos: Array.from({ length: n }, () => photo), mesure: null });

const fichier = {
  batiments: [
    { cle: 'b1', nom: 'Maison', mitoyen: false, cas: null, photos: [], facades: [facade(0, 'Nord', 8.964, 5.2, 1), facade(1, 'Est', 6, 3.4, 3), facade(2, 'Sud', 6, 3.4, 0), facade(3, 'Ouest', null, 3.4, 2)] },
  ],
} as unknown as FichierAuditParcelle;

describe('les facades d un audit a calibrer', () => {
  it('garde les facades photographiees et mesurees au plan, de la plus photographiee a la moins', () => {
    const f = facadesACalibrer(fichier);
    expect(f.map((x) => x.orientation)).toEqual(['Est', 'Nord']);
    expect(f[1]).toMatchObject({ largeurM: 8.96, hauteurM: 5.2, sourceHauteur: 'fichier' });
  });

  it('fait un cas brouillon aux dimensions du plan, une image par photo', () => {
    const [f] = facadesACalibrer(fichier);
    const cas = casDepuisFacade(f as never, '78650000AE0101');
    expect(cas.nom).toBe('Maison · façade est (78650000AE0101)');
    expect(cas).toMatchObject({ statut: 'brouillon', largeurM: 6, hauteurM: 3.4, ouvertures: [] });
    expect(cas.images).toHaveLength(3);
    expect(cas.images?.[0]).toBe('data:image/jpeg;base64,AAAA');
    expect(cas.photos.every((p) => p.coins.length === 4)).toBe(true);
  });

  it('reprend de l audit les reperes, le mur ajuste a la main et la silhouette, sinon ce que la chaine avait lu', () => {
    const coins = [{ x: 10, y: 20 }, { x: 90, y: 20 }, { x: 90, y: 80 }, { x: 10, y: 80 }];
    const sil = [{ x: 10, y: 20 }, { x: 50, y: 5 }, { x: 90, y: 20 }];
    const f = {
      cle: 'b1', nom: 'Maison', cote: 1, orientation: 'Est', largeurM: 6, hauteurM: 3.4, sourceHauteur: 'fichier', photos: [photo, photo],
      corrections: { '0': { reperes: coins, coins, silhouette: sil } },
      bilans: [{ rang: 1, statut: 'auto', verticaliteDeg: 0.1, coins: 'trouve', coinsPx: coins, silhouettePx: sil.slice(0, 2) }],
    };
    const cas = casDepuisFacade(f as never);
    expect(cas.photos[0]).toMatchObject({ coins, reperes: coins, silhouette: sil, murALaMain: true });
    // Sans correction : les coins et la silhouette que la chaine avait retenus, le jour de la mesure.
    expect(cas.photos[1]).toMatchObject({ coins, silhouette: sil.slice(0, 2) });
    expect(cas.photos[1]?.murALaMain).toBeUndefined();
  });
});
