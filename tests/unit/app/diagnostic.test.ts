import { describe, it, expect } from 'vitest';
import { modeDiagnostic, classeToit, classeMurs, couleurDiagnostic, compterDiagnostic, COULEURS_DIAGNOSTIC } from '../../../src/app/diagnostic.js';
import { VERSION_LECTURE_TOITS } from '../../../src/app/toits/toitsLidar.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les modes de diagnostic (?mode=devroof, ?mode=devwall) : la couleur d'un batiment dit d'ou vient son
// toit, ou la couleur de ses murs.

const pts = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }];
const bat = (plus: Record<string, unknown> = {}) => ({ key: 'b', type: 'polygon', fonction: 'batiment', pts, ...plus }) as unknown as ObjetPlan;
const bdtopo = { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'bdtopo' };

describe('les modes de diagnostic', () => {
  it('se lisent dans l adresse', () => {
    expect(modeDiagnostic('?mode=devroof')).toBe('devroof');
    expect(modeDiagnostic('?project=p1&mode=devwall')).toBe('devwall');
    expect(modeDiagnostic('?mode=autre')).toBeNull();
    expect(modeDiagnostic('')).toBeNull();
  });

  it('devroof : non traite en rouge, LiDAR en vert, par defaut faute de LiDAR en orange, le reste en bleu', () => {
    expect(classeToit(bat({ toit: bdtopo }))).toBe('rouge');
    expect(classeToit(bat({ toit: { ...bdtopo, source: 'lidar' } }))).toBe('vert');
    expect(classeToit(bat({ toit: bdtopo, corpsToit: [{}] }))).toBe('vert');
    expect(classeToit(bat({ toit: bdtopo, toitLidarLu: VERSION_LECTURE_TOITS }))).toBe('orange');
    expect(classeToit(bat({ toit: { ...bdtopo, source: 'saisie' } }))).toBe('bleu');
    expect(classeToit(bat({ toit: { ...bdtopo, source: 'photo' } }))).toBe('bleu');
    expect(classeToit({ key: 'p', type: 'polygon', fonction: 'terrain', pts } as unknown as ObjetPlan)).toBeNull();
  });

  it('devwall : par defaut en rouge, fichiers fonciers en orange, photo Panoramax en vert', () => {
    expect(classeMurs(bat())).toBe('rouge');
    expect(classeMurs(bat({ bdtopo: { materiauxMurs: '40' } }))).toBe('orange');
    expect(classeMurs(bat({ bdtopo: { materiauxMurs: '40' }, batiment: { couleurMurs: { photo: { couleur: '#c8b89a' } } } }))).toBe('vert');
    expect(classeMurs(bat({ couleurMurs: { photo: { couleur: '#c8b89a' }, source: 'plan' } }))).toBe('rouge');
  });

  it('donne la couleur du mode et compte les batiments de chaque couleur', () => {
    expect(couleurDiagnostic(bat({ toit: bdtopo }), 'devroof')).toBe(COULEURS_DIAGNOSTIC.rouge);
    expect(couleurDiagnostic({ key: 'p', type: 'polygon', fonction: 'terrain', pts } as unknown as ObjetPlan, 'devroof')).toBeNull();
    const objets = [bat({ toit: bdtopo }), bat({ toit: { ...bdtopo, source: 'lidar' } }), bat({ toit: { ...bdtopo, source: 'lidar' } })];
    expect(compterDiagnostic(objets, 'devroof')).toEqual({ rouge: 1, vert: 2, orange: 0, bleu: 0 });
  });
});
