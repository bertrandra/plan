import { describe, expect, it } from 'vitest';
import { batimentsMitoyens, parcellesMitoyennes, procheDuProjet, type ObjetMitoyen } from '../../../src/model/mitoyennete.js';
import type { PtBrut } from '../../../src/model/types.js';

const rect = (x: number, y: number, l: number, h: number): PtBrut[] => [{ x, y }, { x: x + l, y }, { x: x + l, y: y + h }, { x, y: y + h }];

describe('mitoyennete', () => {
  // La parcelle du projet (0..20), une mitoyenne a l'est, une qui ne touche qu'un coin, une eloignee.
  const projet: ObjetMitoyen = { key: 'parcelle', fonction: 'terrain', pts: rect(0, 0, 20, 20) };
  const est: ObjetMitoyen = { key: 'p-est', fonction: 'terrain', pts: rect(20.3, 0, 20, 20), voisinage: true };
  const coin: ObjetMitoyen = { key: 'p-coin', fonction: 'terrain', pts: rect(20, 20, 20, 20), voisinage: true };
  const loin: ObjetMitoyen = { key: 'p-loin', fonction: 'terrain', pts: rect(60, 0, 20, 20), voisinage: true };
  const maison: ObjetMitoyen = { key: 'm', fonction: 'batiment', pts: rect(4, 4, 10, 8), bdtopo: { surParcellePrincipale: true } };
  const voisine: ObjetMitoyen = { key: 'm-est', fonction: 'batiment', pts: rect(24, 4, 12, 8), voisinage: true };
  const lointaine: ObjetMitoyen = { key: 'm-loin', fonction: 'batiment', pts: rect(64, 4, 12, 8), voisinage: true };
  const terrasse: ObjetMitoyen = { key: 't', fonction: 'terrasse', pts: rect(2, 14, 6, 4) };
  const objets = [projet, est, coin, loin, maison, voisine, lointaine, terrasse];

  it('une parcelle est mitoyenne quand elle partage au moins un metre de limite, a 50 cm pres', () => {
    expect(parcellesMitoyennes(objets)).toEqual([est]);
    expect(parcellesMitoyennes([est, loin])).toEqual([]);
  });

  it('les batiments voisins dont le centroide tombe sur une mitoyenne ; jamais ceux du projet', () => {
    expect([...batimentsMitoyens(objets)]).toEqual([voisine]);
  });

  it('le voisinage proche : le projet, ses objets, les mitoyennes et leurs maisons', () => {
    const proche = procheDuProjet(objets);
    expect(objets.filter(proche)).toEqual([projet, est, maison, voisine, terrasse]);
  });
});
