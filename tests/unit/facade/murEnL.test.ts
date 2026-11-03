import { describe, it, expect } from 'vitest';
import { partieBasseDuGabarit, volumesDuBatiment } from '../../../src/facade/profil.js';
import { gabaritDesCorps } from '../../../src/facade/gabaritMur.js';
import { facadesDuContour } from '../../../src/geometry/cotesVusDeDehors.js';
import { derouler } from '../../../src/facade/releve/enchainement.js';
import { prisesDeLaFacade } from '../../../src/facade/releve/prisesFacade.js';
import { rechercher } from '../../../src/facade/releve/serie.js';
import { mesurerDetection } from '../../banc/facades/mesure.js';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { gabaritVrai, photographier, type PriseCamera } from '../../banc/facades/synthese.js';
import type { CorpsToit, PtBrut } from '../../../src/model/types.js';

// Le mur en L (MD/spec-releve-facade.md §6.2) : une partie basse dans l'alignement du mur (garage, extension). Le decrochement que la
// photo posait au doigt n'a plus de geste depuis le lot F6 (la chaine le passait toujours a null) ; la marche est dans le gabarit, le
// haut de la facade sous les corps du LiDAR, et la chaine de l'audit et de la calibration l'ecrit sur le releve (partieBasse).

// Une maison a etage de 6,5 m et un garage de 3,5 m dans son alignement, vus du sud (la scene 25 du banc).
const CONTOUR: PtBrut[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 6.5, y: 6 }, { x: 6.5, y: 8 }, { x: 0, y: 8 }];
const CORPS: CorpsToit[] = [
  { pts: [{ x: 0, y: 0 }, { x: 6.5, y: 0 }, { x: 6.5, y: 8 }, { x: 0, y: 8 }], posFaitage: 4, faitage: 7.5, egouts: [5.6, 5.6], pignons: [], ecart: 0 },
  { pts: [{ x: 6.5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 6.5, y: 6 }], posFaitage: 3, faitage: 3.8, egouts: [2.9, 2.9], pignons: [], ecart: 0 },
];
const sud = () => facadesDuContour(CONTOUR, 5.6).find((f) => f.cote === 0)!;

describe('la partie basse d un mur en L, lue sur le gabarit', () => {
  it('du plan et du LiDAR : le gabarit des corps porte la marche, et la partie basse s en lit', () => {
    const g = gabaritDesCorps(sud(), CORPS, 5.6);
    expect(partieBasseDuGabarit(g, 10, 5.6)).toEqual({ debut: 6.5, fin: 10, hauteur: 2.91 });
  });

  it('a gauche comme a droite ; son egout est le plus bas de son haut (un garage a pignon)', () => {
    expect(partieBasseDuGabarit([{ u: 0, v: 0.5 }, { u: 0.3, v: 0.5 }, { u: 0.3001, v: 1 }, { u: 1, v: 1 }], 10, 6)).toEqual({ debut: 0, fin: 3, hauteur: 3 });
    expect(partieBasseDuGabarit([{ u: 0, v: 1 }, { u: 0.6, v: 1 }, { u: 0.6001, v: 0.5 }, { u: 0.8, v: 0.7 }, { u: 1, v: 0.5 }], 10, 6)).toEqual({ debut: 6, fin: 10, hauteur: 3 });
  });

  it('rien sur un rectangle, un pignon, une rampe, une marche de moins de 50 cm ou de moins d un metre, une partie haute au milieu', () => {
    expect(partieBasseDuGabarit([{ u: 0, v: 1 }, { u: 1, v: 1 }], 10, 6)).toBeNull();
    expect(partieBasseDuGabarit([{ u: 0, v: 1 }, { u: 0.5, v: 1.6 }, { u: 1, v: 1 }], 10, 6)).toBeNull();
    expect(partieBasseDuGabarit([{ u: 0, v: 1 }, { u: 1, v: 1.6 }], 10, 6)).toBeNull();
    expect(partieBasseDuGabarit([{ u: 0, v: 1 }, { u: 0.6, v: 1 }, { u: 0.6001, v: 0.95 }, { u: 1, v: 0.95 }], 10, 6)).toBeNull();
    expect(partieBasseDuGabarit([{ u: 0, v: 1 }, { u: 0.95, v: 1 }, { u: 0.9501, v: 0.5 }, { u: 1, v: 0.5 }], 10, 6)).toBeNull();
    expect(partieBasseDuGabarit([{ u: 0, v: 0.5 }, { u: 0.3, v: 0.5 }, { u: 0.3001, v: 1 }, { u: 0.7, v: 1 }, { u: 0.7001, v: 0.5 }, { u: 1, v: 0.5 }], 10, 6)).toBeNull();
    // Le pignon d'un corps voisin qui deborde la facade (u au-dela de 1) n'est pas une partie basse du mur.
    expect(partieBasseDuGabarit([{ u: 0, v: 1 }, { u: 0.8, v: 1.7 }, { u: 1.6, v: 1 }], 5, 5.2)).toBeNull();
  });

  it('la partie basse ecrite donne les deux volumes du batiment (le garage a la profondeur de son pignon)', () => {
    const r = { cote: 0, largeur: 10, hauteur: 5.6, texture: null, ouvertures: [], distance: null, sourceDistance: null, releveLe: '', partieBasse: { debut: 6.5, fin: 10, hauteur: 2.91 } };
    const v = volumesDuBatiment(CONTOUR, 5.6, [r]);
    expect(v.map((x) => x.hauteur)).toEqual([5.6, 2.91]);
  });
});

// De bout en bout, par l'orchestrateur (le chemin de l'audit, et de la calibration qui le rejoue) : la scene 25 du banc, une photo avec
// le GPS, la boussole et l'EXIF, le gabarit vrai, les coins cherches comme sur place.
describe('la chaine sur un mur en L (scene 25)', () => {
  it('cale le mur, l explique, lit les baies des deux parties et pas le ciel au-dessus du garage, et ecrit la partie basse', async () => {
    const s = chargerCorpus().find((c) => c.nom.startsWith('25-'))!;
    const p = s.synthese.prise as PriseCamera, L = s.verite.largeur, H = s.verite.hauteur;
    const ph = photographier(s, 100, p)!;
    const b = ((p.biais ?? 0) * Math.PI) / 180;
    const prise = { t: '2026-11-02T10:00:00.000Z', x: L / 2 + p.distance * Math.sin(b), y: -p.distance * Math.cos(b), lat: null, lon: null, precisionM: 1, azimutDeg: (360 - (p.biais ?? 0)) % 360, sourceAzimut: 'boussole' as const, champDeg: (2 * Math.atan(18 / (p.focale35 ?? 26)) * 180) / Math.PI, sourceFocale: 'exif' as const };
    const facade = { cote: 0, gauche: { x: 0, y: 0 }, droite: { x: L, y: 0 }, largeur: L, hauteur: H, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' };
    const prises = prisesDeLaFacade({ facade, contour: CONTOUR, photos: [{ rang: 0, image: ph.image, prise }], corrections: {}, jpeg: () => '' });
    const r = await derouler({ largeurM: L, hauteurM: H, gabarit: gabaritVrai(s), prises }, { vue: 'audit', chercherCoins: async (e) => rechercher(e) });
    // L'E5 : le coin haut droit du rectangle englobant, au-dessus du garage, n'a pas d'arete ; la pose est juste et s'explique.
    expect(r.etapes.find((e) => e.id === 'calage')).toMatchObject({ etat: 'ok', resume: expect.stringMatching(/expliqué par sa silhouette/) });
    const m = r.sorties.audit?.mesure;
    expect(m?.hauteurM).toBeCloseTo(5.6, 1);
    const pb = m?.releve.partieBasse;
    expect(pb?.fin).toBe(10);
    expect(Math.abs((pb?.debut ?? 0) - 6.5)).toBeLessThan(0.1);
    expect(Math.abs((pb?.hauteur ?? 0) - 2.9)).toBeLessThan(0.1);
    // Les cinq baies, et rien au-dessus du garage (sa bande de tuiles, le ciel).
    const ouv = m?.releve.ouvertures ?? [];
    const c = mesurerDetection(s.verite.ouvertures, ouv);
    expect([c.rappel, c.precision]).toEqual([1, 1]);
    expect(ouv.filter((o) => o.x + o.l / 2 > 6.5).every((o) => o.y + o.h <= 2.9 + 0.1)).toBe(true);
    // La texture couvre le rectangle englobant, la bande au-dessus de l'egout comprise ; la Facade du bilan garde la partie basse
    // par le releve (V4 ecrit le releve).
    expect(m?.textureCalee?.pxParM).toBeGreaterThan(0);
    expect(m?.releve.hauteurTexture).toBeGreaterThan(H);
  }, 120_000);
});
