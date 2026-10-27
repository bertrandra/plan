import { describe, it, expect } from 'vitest';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { valeursParDefaut } from '../../../src/app/cadastre/valeursParDefaut.js';
import { VOISINAGE_3D_DEFAUT, apparenceVoisin, fenetresDuVoisin, dimensionsVoisinReglees, voisinage3dDe } from '../../../src/model/voisinage3d.js';
import type { ObjetBrut, ObjetPlan } from '../../../src/model/types.js';

// Le profil de facades retenu (F§15.2, G12) : il passe l'enregistrement, un fichier qui n'en a pas
// garde sa forme d'avant, et « Actualiser le projet » le fait rechoisir.

const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
const batiment = (extra: Record<string, unknown> = {}) => ({
  key: 'b', type: 'polygon', name: 'Maison', pts, fonction: 'batiment', vertexNames: ['A', 'B', 'C', 'D'], segmentNames: ['1', '2', '3', '4'],
  frozenVertices: [false, false, false, false], ...extra,
}) as unknown as ObjetPlan;

describe('profil de facades a l enregistrement', () => {
  it('revient a l identique', () => {
    const [s] = serializeObjects([batiment({ profilFacades: { id: 'pavillon-idf', version: 3 } })]);
    const [relu] = normalizeObjects([JSON.parse(JSON.stringify(s))]) as unknown as ObjetPlan[];
    expect(relu!.batiment?.profilFacades).toEqual({ id: 'pavillon-idf', version: 3 });
  });

  it('ne s ecrit pas quand il n y en a pas', () => {
    const [s] = serializeObjects([batiment()]);
    expect(s).not.toHaveProperty('profilFacades');
  });

  it('se rechoisit apres « Actualiser le projet »', () => {
    const o = { ...batiment({ profilFacades: { id: 'pavillon-idf', version: 3 }, voisinage: true }) } as unknown as ObjetBrut;
    expect(valeursParDefaut(o)).not.toHaveProperty('profilFacades');
  });
});

describe('les fenetres d une maison voisine', () => {
  it('sans reglage du voisinage, seule la vitre vient de l apparence : les dimensions viennent du profil', () => {
    const r = voisinage3dDe(null);
    expect(dimensionsVoisinReglees(r)).toBe(false);
    const a = apparenceVoisin(r, 'bati-1');
    expect(fenetresDuVoisin(a, r)).toEqual({ couleur: a.fenetres.couleur });
    // Les dimensions d'avant le reglage sont celles du profil par defaut.
    expect(a.fenetres).toMatchObject({ largeur: 1, hauteur: 1.2, entraxe: 2.4 });
  });

  it('des dimensions reglees l emportent', () => {
    const r = { ...VOISINAGE_3D_DEFAUT, fenetres: { ...VOISINAGE_3D_DEFAUT.fenetres, largeurMax: 1.4 } };
    expect(dimensionsVoisinReglees(r)).toBe(true);
    const a = apparenceVoisin(r, 'bati-1');
    expect(fenetresDuVoisin(a, r)).toBe(a.fenetres);
    // Une couleur reglee seule ne fige pas les dimensions.
    const couleur = { ...VOISINAGE_3D_DEFAUT, fenetres: { ...VOISINAGE_3D_DEFAUT.fenetres, couleur: '#123456' } };
    expect(dimensionsVoisinReglees(couleur)).toBe(false);
  });
});
