import { describe, it, expect } from 'vitest';
import { lireCasReel } from '../../../../../src/facade/corpusReel.js';
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

  it('reprend de l audit les reperes et le mur ajuste a la main, sinon les coins que la chaine avait lus, et le gabarit du mur', () => {
    const coins = [{ x: 10, y: 20 }, { x: 90, y: 20 }, { x: 90, y: 80 }, { x: 10, y: 80 }];
    const gabarit = [{ u: 0, v: 1 }, { u: 0.4, v: 1.6 }, { u: 1, v: 1 }];
    const f = {
      cle: 'b1', nom: 'Maison', cote: 1, orientation: 'Est', largeurM: 6, hauteurM: 3.4, sourceHauteur: 'fichier', photos: [photo, photo],
      corrections: { '0': { reperes: coins, coins } },
      bilans: [{ rang: 1, statut: 'auto', verticaliteDeg: 0.1, coins: 'trouve', coinsPx: coins }], gabarit,
    };
    const cas = casDepuisFacade(f as never);
    expect(cas.gabarit).toEqual(gabarit);
    expect(cas.photos[0]).toMatchObject({ coins, reperes: coins, murALaMain: true });
    // Sans correction : les coins que la chaine avait retenus, le jour de la mesure.
    expect(cas.photos[1]).toMatchObject({ coins });
    expect(cas.photos[1]?.murALaMain).toBeUndefined();
    // Un mur sans corps : pas de gabarit ecrit, un rectangle.
    expect(casDepuisFacade({ ...f, gabarit: [{ u: 0, v: 1 }, { u: 1, v: 1 }] } as never).gabarit).toBeUndefined();
  });

  it('tire le gabarit du mur des corps du cas fige', () => {
    const p = (x: number, y: number) => ({ x, y });
    const corps = { pts: [p(0, 0), p(10, 0), p(10, 6), p(0, 6)], posFaitage: 3, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 };
    const avecCorps = { batiments: [{ cle: 'b1', nom: 'Maison', mitoyen: false, photos: [], cas: { entrees: { pts: corps.pts }, sorties: { corps: [corps], elevation: 5 } },
      facades: [0, 1, 2, 3].map((c) => facade(c, 'Nord', c % 2 ? 6 : 10, 5, 1)) }] } as unknown as FichierAuditParcelle;
    const f = facadesACalibrer(avecCorps);
    const reliefs = f.map((x) => Math.max(...x.gabarit.map((q) => q.v)) - 1);
    // Deux pignons (les murs de 6 m) montent de 3 m sur 5 ; les deux longs pans sont des rectangles.
    expect(reliefs.filter((r) => r > 0.5)).toHaveLength(2);
    expect(reliefs.filter((r) => r === 0)).toHaveLength(2);
    // Et les corps qui le font, avec le mur de la facade : le diagnostic de forme du cas (lot F4), corps par corps.
    const cas = casDepuisFacade(f[0]!);
    expect(cas.toit?.corps).toEqual([corps]);
    expect(lireCasReel(JSON.parse(JSON.stringify(cas))).toit).toEqual(cas.toit);
    expect(() => lireCasReel({ ...JSON.parse(JSON.stringify(cas)), toit: { mur: cas.toit!.mur, corps: [{ pts: [] }] } })).toThrow(/toit/);
  });
});
