import { describe, it, expect } from 'vitest';
import { construireResume, surfaceDe, type ContexteResume } from '../../../src/export/resume.js';

// Le resume est un des six artefacts de reference et n'avait aucun test : les empreintes disaient
// qu'il ne changeait pas, jamais ce qu'il devait dire.

const CTX: ContexteResume = {
  appVersion: '1.1.0-alpha.1',
  computeMeasureGeom: () => ({ perp: 1.234, along: 5.678 }),
  refLabel: (r) => 'ref:' + r.objKey + '#' + r.segIndex,
  targetLabel: (t) => 'cible:' + t.objKey + '#' + t.ptIndex,
  dateDuJour: () => '29/08/2026'
};

/** Un carre de 4 m de cote, tourne dans le sens horaire. */
function carre(key = 'c', name = 'Carre') {
  return { key, name, type: 'polygon',
    pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
    vertexNames: ['A', 'B', 'C', 'D'], segmentNames: ['S1', 'S2', 'S3', 'S4'] };
}

describe('surface d un objet', () => {
  it('mesure l aire d un polygone', () => {
    expect(surfaceDe(carre())).toBeCloseTo(16, 9);
  });

  it('mesure l aire d un disque', () => {
    expect(surfaceDe({ type: 'circle', r: 2 })).toBeCloseTo(Math.PI * 4, 9);
  });

  it('rend longueur x largeur pour un chemin, faute de surface au sens strict', () => {
    const chemin = { type: 'path', width: 1.5, pts: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }] };
    expect(surfaceDe(chemin)).toBeCloseTo(7 * 1.5, 9);
  });

  it('prend un metre de large quand la largeur manque', () => {
    expect(surfaceDe({ type: 'path', pts: [{ x: 0, y: 0 }, { x: 3, y: 0 }] })).toBeCloseTo(3, 9);
  });
});

describe('en-tete', () => {
  it('dit la version, la date, et surtout ou est l origine', () => {
    // Sans l'origine et le sens des axes, une liste de coordonnees ne veut rien dire pour qui
    // recale le plan sur le terrain.
    const t = construireResume([carre()], [], CTX);
    const lignes = t.split('\n');
    expect(lignes[0]).toBe('Plan interactif 1.1.0-alpha.1 - export (repere local, metres) - 29/08/2026');
    expect(lignes[1]).toContain('Origine (0,0) = Apex');
    expect(lignes[2]).toContain('Axe X+ = Est');
    expect(lignes[2]).toContain('Axe Y+ = Nord');
  });
});

describe('recapitulatif des surfaces', () => {
  it('exclut la parcelle du total : c est le denominateur, pas un objet pose dessus', () => {
    const parcelle = { ...carre('parcelle', 'Parcelle'), pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
    const t = construireResume([parcelle, carre()], [], CTX);
    expect(t).toContain('Emprise totale (hors parcelle): 16.0 m2 (16.0 %)');
  });

  it('n affiche pas de pourcentage sans parcelle', () => {
    const t = construireResume([carre()], [], CTX);
    expect(t).toContain('Emprise totale (hors parcelle): 16.0 m2\n');
    expect(t).not.toContain('%');
  });

  it('signale qu un chemin est compte en longueur x largeur', () => {
    const chemin = { key: 'p', name: 'Allee', type: 'path', width: 1, pts: [{ x: 0, y: 0 }, { x: 3, y: 0 }], vertexNames: ['A', 'B'], segmentNames: ['S1'] };
    expect(construireResume([chemin], [], CTX)).toContain('Allee (p): 3.00 m2 (longueur x largeur)');
  });
});

describe('detail objet par objet', () => {
  it('donne les coordonnees au millimetre et les angles au dixieme', () => {
    const t = construireResume([carre()], [], CTX);
    expect(t).toContain('  A: X=0.000 Y=0.000  Angle=90.0 deg');
    expect(t).toContain('  S1 (A -> B): 4.00 m');
  });

  it('referme le polygone : le dernier cote revient au premier point', () => {
    const t = construireResume([carre()], [], CTX);
    expect(t).toContain('  S4 (D -> A): 4.00 m');
  });

  it('laisse le chemin ouvert, et donne sa longueur totale', () => {
    const chemin = { key: 'p', name: 'Allee', type: 'path', width: 1.2, curve: false,
      pts: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }], vertexNames: ['A', 'B', 'C'], segmentNames: ['S1', 'S2'] };
    const t = construireResume([chemin], [], CTX);
    expect(t).toContain('  Largeur: 1.20 m (droit)');
    expect(t).toContain('  Longueur totale: 7.00 m');
    // Deux segments pour trois points : rien ne revient de C a A.
    expect(t).not.toContain('C -> A');
  });

  it('dit qu un chemin est courbe quand il l est', () => {
    const chemin = { key: 'p', name: 'Allee', type: 'path', width: 1, curve: true,
      pts: [{ x: 0, y: 0 }, { x: 3, y: 0 }], vertexNames: ['A', 'B'], segmentNames: ['S1'] };
    expect(construireResume([chemin], [], CTX)).toContain('(courbe)');
  });

  it('decrit un cercle par son centre et son rayon', () => {
    const c = { key: 'o', name: 'Bac', type: 'circle', center: { x: 1.5, y: -2.25 }, r: 0.8 };
    expect(construireResume([c], [], CTX)).toContain('  Centre: X=1.500 Y=-2.250  Rayon=0.80 m');
  });

  it('nomme un cote sans nom par son rang', () => {
    const chemin = { key: 'p', name: 'Allee', type: 'path', width: 1,
      pts: [{ x: 0, y: 0 }, { x: 3, y: 0 }], vertexNames: ['A', 'B'], segmentNames: [] as string[] };
    expect(construireResume([chemin], [], CTX)).toContain('  Cote 1 (A -> B): 3.00 m');
  });
});

describe('les cotes', () => {
  const mesure = { refObjKey: 'a', refSegIndex: 0, targetObjKey: 'b', targetPtIndex: 2,
    startEnd: 'start', displayMode: 'perp', show: true };

  it('n ecrit pas de section quand il n y en a aucune', () => {
    expect(construireResume([carre()], [], CTX)).not.toContain('=== Mesures ===');
  });

  it('donne les deux distances, perpendiculaire et le long', () => {
    const t = construireResume([carre()], [mesure], CTX);
    expect(t).toContain('  ref:a#0 -> cible:b#2  origine=start  perpendiculaire=1.23 m  le_long=5.68 m');
    expect(t).toContain('affichage_sur_plan=perpendiculaire');
    expect(t).toContain('affiche=oui');
  });

  it('le dit quand une cote n est plus calculable', () => {
    // Ses objets de reference ont disparu : le resume l'annonce au lieu d'ecrire un nombre faux.
    const t = construireResume([carre()], [mesure], { ...CTX, computeMeasureGeom: () => null });
    expect(t).toContain('(non calculable)');
  });

  it('distingue les deux modes d affichage', () => {
    const t = construireResume([carre()], [{ ...mesure, displayMode: 'along', show: false }], CTX);
    expect(t).toContain('affichage_sur_plan=le_long');
    expect(t).toContain('affiche=non');
  });
});
