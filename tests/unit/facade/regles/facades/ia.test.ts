import { describe, it, expect } from 'vitest';
import { lireObservationsFacade, type ObservationsFacade, type RunEnregistre } from '../../../../../src/regles/facades/observations.js';
import { accorderOuvertures, avisDesPointes, decisionColombage, reglagesIa, coinsDeLIa, ecartDesPoses, ouvertureDeLIa, poseDeLIa, observationsDuRun, texteAccord, voterObservations } from '../../../../../src/facade/regles/facades/ia.js';
import type { OuvertureFacade } from '../../../../../src/model/types.js';
import { SORTIE_FACADE } from '../../../../fixtures/deploy/fauxAnthropic.js';

// Les regles du run d'une facade (lot F2, MD/spec-facade-calage-audit.md §5, §8) : une observation de Claude entre, une decision du
// moteur sort. Le vote de trois passes (l'option x3 du rejeu), la pose candidate de ses angles, l'accord de ses boites avec la
// detection, le colombage qui ecarte une pose, les pointes contre le gabarit.
// Toutes les reponses ici sont SYNTHETIQUES.

const R = lireObservationsFacade(SORTIE_FACADE) as ObservationsFacade;
const run = (sorties: unknown[], passes: 1 | 3 = 1): RunEnregistre => ({ le: '2026-10-29T08:30:00.000Z', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, passes, sorties, cout: 0.0012, tokens: { entree: 4200, sortie: 900 }, image: { largeur: 1000, hauteur: 600 }, chaine: 10, synthetique: true });

describe('le vote de trois passes', () => {
  it('garde la mediane de ce que plus de la moitie des passes voient', () => {
    const p2 = { ...SORTIE_FACADE, calage: { ...SORTIE_FACADE.calage, angles: { ...SORTIE_FACADE.calage.angles, gauche: { x: 0.16, egout: 0.5, sol: 0.9, confiance: 'moyenne' } } } };
    // La troisieme passe invente une fenetre et ne voit pas l'angle gauche.
    const p3 = { ...SORTIE_FACADE, calage: { ...SORTIE_FACADE.calage, angles: { ...SORTIE_FACADE.calage.angles, gauche: 'indetermine' } },
      ouvertures: [...SORTIE_FACADE.ouvertures, { ...SORTIE_FACADE.ouvertures[0], u0: 0.7, u1: 0.8 }] };
    const v = voterObservations([R, lireObservationsFacade(p2) as ObservationsFacade, lireObservationsFacade(p3) as ObservationsFacade]) as ObservationsFacade;
    expect(v.calage.angles.gauche).toEqual({ x: 0.15, egout: 0.51, sol: 0.89, confiance: 'moyenne' });
    expect(v.ouvertures).toHaveLength(2);
    expect(v.elements).toHaveLength(1);
    expect(observationsDuRun(run([SORTIE_FACADE, p2, p3], 3))?.ouvertures).toHaveLength(2);
    // Une passe seule est rendue telle quelle.
    expect(voterObservations([R])).toBe(R);
  });
});

describe('la pose candidate et les boites', () => {
  it('pose le mur par les deux angles, et donne ses quatre coins', () => {
    const p = poseDeLIa(R, { largeur: 1000, hauteur: 600 });
    expect(p).toEqual({ x0: 140, x1: 860, y0: 312, y1: 528 });
    expect(coinsDeLIa(R, { largeur: 1000, hauteur: 600 })).toEqual([{ x: 140, y: 312 }, { x: 860, y: 312 }, { x: 860, y: 528 }, { x: 140, y: 528 }]);
    expect(ecartDesPoses({ x0: 150, x1: 860, y0: 312, y1: 528 }, p as NonNullable<typeof p>)).toBeCloseTo(10 / 720);
    const sansDroite = lireObservationsFacade({ ...SORTIE_FACADE, calage: { ...SORTIE_FACADE.calage, angles: { gauche: SORTIE_FACADE.calage.angles.gauche, droite: 'indetermine' } } }) as ObservationsFacade;
    expect(poseDeLIa(sansDroite, { largeur: 1000, hauteur: 600 })).toBeNull();
    expect(coinsDeLIa(sansDroite, { largeur: 1000, hauteur: 600 })[1]).toBeNull();
  });

  it('ramene une boite en metres, depuis les dimensions du plan', () => {
    expect(ouvertureDeLIa(R.ouvertures[0]!, 10, 2.5)).toEqual({ type: 'fenetre', x: 1, y: 1, l: 1.2, h: 1.13, source: 'claude', confiance: 0.4, niveau: 0, travee: 0, details: { volets: 'battants', allege: 'pleine', forme: 'rect' } });
  });

  it('coche une boite que la detection retrouve, confirme une devinee, laisse decochee une boite seule', () => {
    const detectee: OuvertureFacade = { type: 'fenetre', x: 1.02, y: 1, l: 1.18, h: 1.1, confiance: 0.55, source: 'detectee' };
    const devinee: OuvertureFacade = { type: 'porte', x: 4.5, y: 0, l: 1, h: 2.1, confiance: 0.3, source: 'devinee' };
    const seule = { ...SORTIE_FACADE.ouvertures[0], u0: 0.7, u1: 0.8, v0: 0.4, v1: 0.85, details: {} };
    const r = lireObservationsFacade({ ...SORTIE_FACADE, ouvertures: [...SORTIE_FACADE.ouvertures, seule, { ...seule, u0: 0.3, u1: 0.4, v0: 1.2, v1: 1.6 }] }) as ObservationsFacade;
    const a = accorderOuvertures({ ouvertures: [detectee], decochees: [devinee], observations: r, cartes: null, largeurM: 10, hauteurM: 2.5 });
    expect(a.boites.map((b) => [b.cochee, b.avec])).toEqual([[true, 'detectee'], [true, 'devinee'], [false, null]]);
    // La detectee ne bouge pas : elle gagne en confiance et prend les details de Claude.
    expect(a.ouvertures[0]).toMatchObject({ x: 1.02, confiance: 0.7, details: { volets: 'battants', allege: 'pleine', forme: 'rect' } });
    expect(a.ouvertures[1]).toBe(a.ouvertures.find((o) => o.source === 'devinee'));
    expect(a.decochees.map((o) => o.source)).toEqual(['claude']);
    expect(a.bilan).toEqual({ boites: 4, retrouvees: 1, devineesConfirmees: 1, seules: 1, ecartees: 1, detailsAjoutes: 1 });
    expect(texteAccord(a.bilan)).toBe('4 ouvertures vues par Claude : 1 retrouvée par la détection, 1 baie devinée confirmée, 1 seule, proposée décochée, 1 hors du mur, écartée, 1 détail ajouté');
    // Ce que la personne a corrige n'est jamais retouche.
    const corrigee = { ...detectee, source: 'corrigee' as const };
    expect(accorderOuvertures({ ouvertures: [corrigee], decochees: [], observations: r, cartes: null, largeurM: 10, hauteurM: 2.5 }).ouvertures[0]).toEqual(corrigee);
  });
});

describe('les regles du colombage et des pointes : une observation entre, une decision sort', () => {
  const avecZone = (zone: object) => lireObservationsFacade({ ...SORTIE_FACADE, surface: { principale: 'enduit', zones: [zone], confiance: 'moyenne' } }) as ObservationsFacade;
  const pose = { x0: 100, x1: 700, y0: 300, y1: 500 };

  it('une zone de colombage partielle ecarte une pose qui tient dedans, pas le mur', () => {
    const d = decisionColombage(avecZone({ type: 'colombage', u0: 0.5, u1: 1, v0: 1.2, v1: 2, confiance: 'moyenne' }), pose, { largeur: 1000 });
    expect(d?.zones).toEqual([{ x0: 400, x1: 700, y0: 100, y1: 260 }]);
    expect(d?.ecarte({ x0: 410, x1: 705, y0: 120, y1: 240 })).toBe(true);
    expect(d?.ecarte(pose)).toBe(false);
    // Un mur tout en colombage : ses angles sont ceux du mur, rien n'est ecarte ; un autre parement non plus.
    expect(decisionColombage(avecZone({ type: 'colombage', u0: 0, u1: 1, v0: 0, v1: 1, confiance: 'forte' }), pose, { largeur: 1000 })).toBeNull();
    expect(decisionColombage(avecZone({ type: 'brique', u0: 0.5, u1: 1, v0: 0, v1: 1, confiance: 'forte' }), pose, { largeur: 1000 })).toBeNull();
    // Le seuil est un reglage (regles/facades/ia.json) : une surcharge le change.
    expect(decisionColombage(avecZone({ type: 'colombage', u0: 0.5, u1: 1, v0: 1.2, v1: 2, confiance: 'moyenne' }), pose, { largeur: 1000 }, reglagesIa({ 'facades.ia.colombagePartMax': 0.4 }))).toBeNull();
  });

  it('une pointe a sa place s accorde, plus haute est signalee, en plus ou manquante est un diagnostic', () => {
    // SORTIE_FACADE : deux pointes, u 0.11 (3.1) et u 0.8 (3.2).
    expect(avisDesPointes(R, [{ u: 0.12, v: 3.15 }, { u: 0.5, v: 2 }]).map((a) => a.avis)).toEqual(['accord', 'en-plus', 'manquante']);
    expect(avisDesPointes(R, [{ u: 0.11, v: 2.5 }, { u: 0.8, v: 3.2 }]).map((a) => a.avis)).toEqual(['hauteur', 'accord']);
  });
});

