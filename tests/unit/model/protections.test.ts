import { describe, it, expect } from 'vitest';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import type { ObjetBrut, ObjetPlan } from '../../../src/model/types.js';
import { NIVEAU_ECRIVAIN, NIVEAU_ORIGINE, ecrivainPeut, niveauActuel, origineActuelle, peutEcrire, type BatimentProtege, type ContexteEcriture, type Ecrivain, type Groupe, type Niveau, type Origine } from '../../../src/model/protections.js';

// Qui l'emporte sur un champ d'un batiment (MD/spec-flux-batiment.md, « Qui l'emporte », decision du 28 octobre 2026) : une seule
// hierarchie, la personne (1), ce qui a ete vu sur place (2), le fait (3), la mesure (4), la source officielle (5), le defaut (6).
// Deux tables : d'ou vient la valeur de chaque groupe de champs selon les marques du batiment, et qui peut l'ecrire.

const GROUPES: Groupe[] = ['contour', 'hauteur', 'toit', 'elements', 'couverture', 'murs', 'facades', 'couleurToit', 'photoMurs', 'facadeDimensions', 'facadeForme', 'facadeTexture', 'facadeOuvertures'];
const lu = { toit: { source: 'lidar' as const }, toitLidarLu: 7 };
const corps = { pts: [], posFaitage: 4, faitage: 9, egouts: [6, 6] as [number, number], pignons: [], ecart: 0.1 };

/** Les batiments du tableau, et ce qu'on demande avec (le mur vise, « Recalculer aussi »…). */
const BATIMENTS: Record<string, { o: BatimentProtege; ctx?: ContexteEcriture }> = {
  neuf: { o: {} },
  dessine: { o: { elevation: 3 } },
  bdtopo: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { toit: { source: 'bdtopo' } } } },
  lu: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { ...lu } } },
  luSurUnAutreContour: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { ...lu } }, ctx: { mesurePerimee: true } },
  fige: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { ...lu, toitFige: true } } },
  retouche: { o: { bdtopo: { id: 'B1' }, elevation: 6, retoucheMain: { date: '2026-10-28' }, batiment: { ...lu } } },
  retoucheRepris: { o: { bdtopo: { id: 'B1' }, elevation: 6, retoucheMain: { date: '2026-10-28' }, batiment: { ...lu } }, ctx: { reprendreIgn: true } },
  verifie: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { ...lu, verifieSurPlace: { date: '2026-10-28' } } } },
  verifieRecalcule: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { ...lu, verifieSurPlace: { date: '2026-10-28' } } }, ctx: { relireVerifies: true } },
  toitSaisi: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { toit: { source: 'saisie' } } } },
  toitPhoto: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { toit: { source: 'photo' } } } },
  egoutSaisi: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { ...lu, egoutChoisi: 'saisie' } } },
  egoutVu: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { ...lu, egoutChoisi: 'audit' } } },
  elements: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { ...lu, corpsToit: [{ ...corps, cheminees: [{}] }] } } },
  couverture: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { toit: { source: 'bdtopo', couverture: 'ardoise' } } } },
  mursChoisis: { o: { bdtopo: { id: 'B1' }, batiment: { couleurMurs: { source: 'photo', photo: {} } } } },
  mursVus: { o: { bdtopo: { id: 'B1' }, batiment: { couleurMurs: { materiau: 'brique', photo: {} } } } },
  photoRue: { o: { bdtopo: { id: 'B1' }, batiment: { couleurMurs: { photo: {} } } } },
  photoRueSansConclusion: { o: { bdtopo: { id: 'B1' }, batiment: { couleurMurs: { photo: null, lecture: 2 } } } },
  mursTerrain: { o: { bdtopo: { id: 'B1' }, batiment: { couleurMurs: { terrain: { couleur: '#D9C7A5', date: '2026-10-28' }, photo: {} } } } },
  mursTerrainChoisi: { o: { bdtopo: { id: 'B1' }, batiment: { couleurMurs: { source: 'photo', terrain: { couleur: '#D9C7A5', date: '2026-10-28' } } } } },
  mursPlanChoisi: { o: { bdtopo: { id: 'B1' }, batiment: { couleurMurs: { source: 'plan' } } } },
  mursVerifies: { o: { bdtopo: { id: 'B1' }, batiment: { verifieSurPlace: { date: '2026-10-28' }, couleurMurs: { photo: {} } } } },
  releveMain: { o: { bdtopo: { id: 'B1' }, batiment: { facades: [{ cote: 2 }], profilFacades: { id: 'p' } } }, ctx: { cote: 2 } },
  releveAudit: { o: { bdtopo: { id: 'B1' }, batiment: { facades: [{ cote: 2, depuisAudit: true }] } }, ctx: { cote: 2 } },
  autreMur: { o: { bdtopo: { id: 'B1' }, batiment: { facades: [{ cote: 2 }], profilFacades: { id: 'p' } } }, ctx: { cote: 1 } },
  // La Facade validee (V4, lot F5) : chaque part est de la personne ; une part absente reste celle du releve fait a la main.
  facadeValidee: { o: { bdtopo: { id: 'B1' }, batiment: { facades: [{ cote: 2, dimensions: {}, forme: {}, textureCalee: {}, ouvertures: [{ source: 'detectee', verifieeLe: '2026-10-29' }] }] } }, ctx: { cote: 2 } },
  facadeEnPartie: { o: { bdtopo: { id: 'B1' }, batiment: { facades: [{ cote: 2, dimensions: {}, ouvertures: [{ source: 'detectee' }, { source: 'claude' }] }] } }, ctx: { cote: 2 } },
  ouvertureCorrigee: { o: { bdtopo: { id: 'B1' }, batiment: { facades: [{ cote: 2, depuisAudit: true, ouvertures: [{ source: 'corrigee' }] }] } }, ctx: { cote: 2 } },
  couleurChoisie: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { toit: { source: 'bdtopo', couleur: '#8a3b2a' } } } },
  couleurLue: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { toit: { source: 'bdtopo', couleur: '#8a3b2a', origineCouleur: 'orthophoto' } } } },
  couleurRepli: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { toit: { source: 'bdtopo', couleur: '#777777', origineCouleur: 'gris' } } } },
  couleurLueFigee: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { ...lu, toit: { source: 'lidar', couleur: '#8a3b2a', origineCouleur: 'orthophoto' }, toitFige: true } } },
  couleurLueVerifiee: { o: { bdtopo: { id: 'B1' }, elevation: 6, batiment: { ...lu, toit: { source: 'lidar', couleur: '#8a3b2a', origineCouleur: 'orthophoto' }, verifieSurPlace: { date: '2026-10-28' } } } },
};

/**
 * D'ou vient chaque groupe, batiment par batiment : contour, hauteur, toit, elements, couverture, murs, facades, couleur du toit, et
 * la case de la photo de rue (`photoMurs`).
 */
const ORIGINES: Record<string, Origine[]> = {
  neuf: ['dessine', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  dessine: ['dessine', 'dessine', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  bdtopo: ['bdtopo', 'bdtopo', 'bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  lu: ['lidar', 'lidar', 'lidar', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  luSurUnAutreContour: ['bdtopo', 'lidar', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  fige: ['fige', 'fige', 'fige', 'fige', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  retouche: ['retouche', 'lidar', 'lidar', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  retoucheRepris: ['lidar', 'lidar', 'lidar', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  verifie: ['verifie', 'verifie', 'verifie', 'defaut', 'defaut', 'verifie', 'verifie', 'verifie', 'defaut', 'verifie', 'verifie', 'verifie', 'verifie'],
  verifieRecalcule: ['lidar', 'lidar', 'lidar', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  toitSaisi: ['bdtopo', 'toitSaisi', 'toitSaisi', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  toitPhoto: ['bdtopo', 'toitPhoto', 'toitPhoto', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  egoutSaisi: ['lidar', 'egoutSaisi', 'lidar', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  egoutVu: ['lidar', 'egoutVu', 'lidar', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  elements: ['lidar', 'lidar', 'lidar', 'elementsPoses', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  couverture: ['bdtopo', 'bdtopo', 'bdtopo', 'defaut', 'couvertureChoisie', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  mursChoisis: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'mursChoisis', 'defaut', 'defaut', 'photoRue', 'defaut', 'defaut', 'defaut', 'defaut'],
  mursVus: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'mursVus', 'defaut', 'defaut', 'photoRue', 'defaut', 'defaut', 'defaut', 'defaut'],
  photoRue: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'photoRue', 'defaut', 'defaut', 'photoRue', 'defaut', 'defaut', 'defaut', 'defaut'],
  releveMain: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'releveMain', 'defaut', 'defaut', 'releveMain', 'releveMain', 'releveMain', 'releveMain'],
  releveAudit: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'releveAudit', 'defaut', 'defaut', 'releveAudit', 'releveAudit', 'releveAudit', 'releveAudit'],
  autreMur: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'profil', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  couleurChoisie: ['bdtopo', 'bdtopo', 'bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'couleurToitChoisie', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  couleurLue: ['bdtopo', 'bdtopo', 'bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'ortho', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  couleurRepli: ['bdtopo', 'bdtopo', 'bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'ortho', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  couleurLueFigee: ['fige', 'fige', 'fige', 'fige', 'defaut', 'defaut', 'defaut', 'ortho', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  couleurLueVerifiee: ['verifie', 'verifie', 'verifie', 'defaut', 'defaut', 'verifie', 'verifie', 'verifie', 'defaut', 'verifie', 'verifie', 'verifie', 'verifie'],
  photoRueSansConclusion: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  mursTerrain: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'mursVus', 'defaut', 'defaut', 'mursVus', 'defaut', 'defaut', 'defaut', 'defaut'],
  mursTerrainChoisi: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'mursChoisis', 'defaut', 'defaut', 'mursVus', 'defaut', 'defaut', 'defaut', 'defaut'],
  mursPlanChoisi: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'mursChoisis', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut'],
  mursVerifies: ['verifie', 'verifie', 'verifie', 'defaut', 'defaut', 'verifie', 'verifie', 'verifie', 'photoRue', 'verifie', 'verifie', 'verifie', 'verifie'],
  // La Facade (lot F5) : ses parts sur le mur vise.
  facadeValidee: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'releveMain', 'defaut', 'defaut', 'facadeValidee', 'facadeValidee', 'facadeValidee', 'facadeValidee'],
  facadeEnPartie: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'releveMain', 'defaut', 'defaut', 'facadeValidee', 'releveMain', 'releveMain', 'releveMain'],
  // Une ouverture corrigee sur un releve pose d'office : le mur reste a l'audit, l'ouverture est gardee une a une (ouvertureGardee).
  ouvertureCorrigee: ['bdtopo', 'defaut', 'defaut', 'defaut', 'defaut', 'defaut', 'releveAudit', 'defaut', 'defaut', 'releveAudit', 'releveAudit', 'releveAudit', 'releveAudit'],
};

/** Le niveau de chaque origine : 1 la personne … 6 le defaut. */
const NIVEAUX: Record<Origine, Niveau> = {
  fige: 1, retouche: 1, dessine: 1, toitSaisi: 1, egoutSaisi: 1, couvertureChoisie: 1, couleurToitChoisie: 1, mursChoisis: 1, releveMain: 1, facadeValidee: 1,
  verifie: 2, egoutVu: 2, toitPhoto: 2, elementsPoses: 2, mursVus: 2, releveAudit: 2,
  profil: 3, lidar: 4, ortho: 4, photoRue: 4, bdtopo: 5, defaut: 6,
};

/** Les niveaux de valeur que chaque ecrivain peut remplacer : le sien et les plus faibles, dans tous les groupes. */
const ECRIT: Record<Ecrivain, Niveau[]> = { audit: [2, 3, 4, 5, 6], faits: [3, 4, 5, 6], lidar: [4, 5, 6], recalage: [4, 5, 6], ortho: [4, 5, 6], panoramax: [4, 5, 6], ign: [5, 6] };

describe('qui l emporte sur un batiment : une seule hierarchie', () => {
  it('d ou vient chaque groupe de champs, selon les marques du batiment', () => {
    for (const [nom, { o, ctx }] of Object.entries(BATIMENTS)) {
      expect(GROUPES.map((g) => origineActuelle(o, g, ctx)), nom).toEqual(ORIGINES[nom]);
    }
    expect(NIVEAU_ORIGINE).toEqual(NIVEAUX);
  });

  it('chaque ecrivain, chaque groupe, chaque niveau de la valeur d aujourd hui', () => {
    expect(NIVEAU_ECRIVAIN).toEqual({ audit: 2, faits: 3, lidar: 4, recalage: 4, ortho: 4, panoramax: 4, ign: 5 });
    for (const e of Object.keys(ECRIT) as Ecrivain[]) {
      for (const [nom, { o, ctx }] of Object.entries(BATIMENTS)) {
        GROUPES.forEach((g, k) => {
          const niveau = NIVEAUX[ORIGINES[nom]![k]!];
          expect(ecrivainPeut(o, e, g, ctx), e + ' / ' + g + ' / ' + nom + ' (niveau ' + niveau + ')').toBe(ECRIT[e].includes(niveau));
        });
      }
    }
  });

  it('le LiDAR bat l IGN : la hauteur mesuree et le contour lu restent, sauf un contour change a l IGN', () => {
    const { o } = BATIMENTS.lu!;
    expect(ecrivainPeut(o, 'ign', 'hauteur')).toBe(false);
    expect(ecrivainPeut(o, 'ign', 'contour')).toBe(false);
    expect(ecrivainPeut(o, 'ign', 'toit')).toBe(false);
    expect(ecrivainPeut(o, 'ign', 'contour', { mesurePerimee: true })).toBe(true);
    expect(ecrivainPeut(o, 'ign', 'toit', { mesurePerimee: true })).toBe(true);
    expect(ecrivainPeut(o, 'ign', 'hauteur', { mesurePerimee: true })).toBe(false);
    // Et le LiDAR se relit lui-meme : meme niveau, la derniere lecture gagne.
    expect(ecrivainPeut(o, 'lidar', 'toit')).toBe(true);
    expect(niveauActuel(o, 'toit')).toBe(4);
    expect(peutEcrire(o, 'toit', 5)).toBe(false);
  });
});

describe('la photo de rue des murs (Panoramax) : sa case, pas la couleur retenue', () => {
  it('une source choisie, « photo » comprise, ou « plan », laisse la lecture tenir sa case a jour', () => {
    for (const nom of ['mursChoisis', 'mursTerrainChoisi', 'mursPlanChoisi', 'mursVus', 'mursVerifies'] as const) {
      expect(niveauActuel(BATIMENTS[nom]!.o, 'murs'), nom).toBeLessThan(4);
    }
    expect(ecrivainPeut(BATIMENTS.mursChoisis!.o, 'panoramax', 'photoMurs')).toBe(true);
    expect(ecrivainPeut(BATIMENTS.mursPlanChoisi!.o, 'panoramax', 'photoMurs')).toBe(true);
    expect(ecrivainPeut(BATIMENTS.mursVus!.o, 'panoramax', 'photoMurs')).toBe(true);
    // Verifie sur place sans couleur vue : la photo reste la seule teinte connue, elle se relit.
    expect(ecrivainPeut(BATIMENTS.mursVerifies!.o, 'panoramax', 'photoMurs')).toBe(true);
    // Et la lecture n'ecrit jamais la couleur retenue : ce groupe-la reste a la personne et a l'audit.
    expect(ecrivainPeut(BATIMENTS.mursChoisis!.o, 'panoramax', 'murs')).toBe(false);
  });

  it('une couleur vue sur place (audit valide) occupe la case : la lecture ne l ecrit plus, l audit si', () => {
    expect(ecrivainPeut(BATIMENTS.mursTerrain!.o, 'panoramax', 'photoMurs')).toBe(false);
    expect(ecrivainPeut(BATIMENTS.mursTerrainChoisi!.o, 'panoramax', 'photoMurs')).toBe(false);
    expect(ecrivainPeut(BATIMENTS.mursTerrain!.o, 'audit', 'photoMurs')).toBe(true);
  });
});

describe('la hauteur a l egout choisie (egoutChoisi)', () => {
  const maison = (plus: Record<string, unknown> = {}): ObjetPlan => normalizeObjects([{
    key: 'maison', type: 'polygon', name: 'Maison', fonction: 'batiment', pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }], elevation: 5.4, ...plus,
  }] as unknown as ObjetBrut[])[0] as ObjetPlan;

  it('s enregistre a plat dans le fichier et se relit dans le batiment', () => {
    const o = maison({ egoutChoisi: 'saisie' });
    expect(o.batiment?.egoutChoisi).toBe('saisie');
    const [plat] = serializeObjects([o]);
    expect((plat as unknown as Record<string, unknown>).egoutChoisi).toBe('saisie');
    const relu = normalizeObjects(JSON.parse(JSON.stringify([plat])) as ObjetBrut[])[0] as ObjetPlan;
    expect(relu.batiment?.egoutChoisi).toBe('saisie');
    expect(JSON.stringify(serializeObjects([relu]))).toBe(JSON.stringify(serializeObjects([o])));
  });

  it('absente, ou d une source inconnue, elle ne s ecrit pas : le fichier garde sa forme d avant', () => {
    expect('egoutChoisi' in (serializeObjects([maison()])[0] as object)).toBe(false);
    expect(maison({ egoutChoisi: 'devine' }).batiment?.egoutChoisi).toBeUndefined();
  });
});
