import { describe, it, expect, afterEach } from 'vitest';
import { PARAMETRES, bilan, calibrer, evaluerPrepare, mesurerPrepare, preparerCas, score, surchargesValides, FORMAT_CAS_REEL, type CasReel } from '../../../src/facade/corpusReel.js';
import { reglagesDetection } from '../../../src/facade/regles/facades/detection.js';
import { reglagesStructure } from '../../../src/facade/regles/facades/structure.js';
import { poserSurchargesCalibrees, surchargesCalibrees } from '../../../src/facade/regles/facades/surcharges.js';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { photographier, coinsVrais, type PriseCamera } from '../../banc/facades/synthese.js';

// La calibration de la detection (facade/corpusReel.ts) : les surcharges posees, les bornes, la descente par coordonnee
// sur des cas fabriques de scenes du banc.

afterEach(() => poserSurchargesCalibrees({}));

function cas(debut: string) {
  const s = chargerCorpus().find((c) => c.nom.startsWith(debut));
  if (!s) throw new Error('scene absente');
  const p = s.synthese.prise as PriseCamera;
  const ph = photographier(s, 100, p), coins = coinsVrais(s, p);
  if (!ph || !coins) throw new Error('scene impossible');
  const c: CasReel = { format: FORMAT_CAS_REEL, version: 1, nom: s.nom, statut: 'valide', largeurM: s.verite.largeur, hauteurM: s.verite.hauteur, photos: [{ fichier: 'synthese', coins, focalePx: ph.focalePx }], ouvertures: s.verite.ouvertures as never };
  return preparerCas(c, [ph.image]);
}

describe('les surcharges posees', () => {
  it('ne changent rien tant que rien n est pose', () => {
    expect(surchargesCalibrees()).toEqual({});
    expect(reglagesDetection()['facades.detection.areteNette']).toBe(0.6);
  });
  it('se superposent aux valeurs livrees, une surcharge explicite passant devant', () => {
    poserSurchargesCalibrees({ 'facades.detection.areteNette': 0.7 });
    expect(reglagesDetection()['facades.detection.areteNette']).toBe(0.7);
    expect(reglagesDetection({ 'facades.detection.areteNette': 0.5 })['facades.detection.areteNette']).toBe(0.5);
    expect(reglagesDetection()['facades.detection.largeurMinM']).toBe(0.35);
    poserSurchargesCalibrees({});
    expect(reglagesStructure()['facades.structure.niveauRecouvrementMin']).toBe(0.5);
  });
  it('ne gardent que des parametres connus, finis, dans leurs bornes', () => {
    const v = surchargesValides({ 'facades.detection.areteNette': 0.7, 'facades.detection.largeurMinM': 99, inconnu: 1, 'facades.detection.seuilMin': 'x', 'facades.detection.alignementM': Number.NaN });
    expect(v).toEqual({ 'facades.detection.areteNette': 0.7 });
    expect(surchargesValides(null)).toEqual({});
  });
  it('donnent des bornes de la moitie au double, une part restant sous 1', () => {
    const arete = PARAMETRES.find((p) => p.nom === 'facades.detection.areteNette');
    expect(arete).toMatchObject({ min: 0.3, max: 1 });
    expect(PARAMETRES.length).toBeGreaterThan(40);
  });
});

describe('la calibration sur des cas fabriques', () => {
  it('mesure un cas, et la detection seule rend la meme chose que la chaine sans vote', () => {
    const p = cas('02-');
    expect(p).not.toBeNull();
    const m = mesurerPrepare(p!);
    expect(m.vp).toBe(6);
    const d = evaluerPrepare(p!, {});
    expect(d.vp).toBe(6);
  });
  it('ne degrade jamais le score, borne ses changements et est deterministe', async () => {
    const prepares = ['06-', '12-', '02-'].map((d) => cas(d)!);
    const noms = ['facades.detection.areteNette', 'facades.detection.remplissageMin', 'facades.detection.petiteSurfaceM2'];
    const un = await calibrer(prepares, noms, {});
    const deux = await calibrer(prepares, noms, {});
    expect(deux.reglages).toEqual(un.reglages);
    expect(score(un.apres)).toBeGreaterThanOrEqual(score(un.avant) - 1e-9);
    expect(un.evaluations).toBeGreaterThan(noms.length);
    for (const m of un.modifications) {
      const p = PARAMETRES.find((x) => x.nom === m.nom)!;
      expect(m.apres).toBeGreaterThanOrEqual(p.min);
      expect(m.apres).toBeLessThanOrEqual(p.max);
      expect(m.gain).toBeGreaterThanOrEqual(0.01);
    }
    expect(bilan(prepares.map((p) => evaluerPrepare(p, un.reglages))).f1).toBeCloseTo(un.apres.f1 ?? 0, 9);
  }, 120_000);
  it('rapporte son avancement et rend la main', async () => {
    const prepares = [cas('02-')!];
    const vus: string[] = [];
    let mains = 0;
    await calibrer(prepares, ['facades.detection.areteNette', 'facades.detection.seuilMin'], {}, { facteurs: [1.1], progression: (_, t, n) => vus.push(n + '/' + t), rendreLaMain: async () => { mains++; } });
    expect(vus).toEqual(['facades.detection.areteNette/2', 'facades.detection.seuilMin/2', '/2']);
    expect(mains).toBe(2);
  }, 60_000);
});
