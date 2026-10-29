import { describe, it, expect } from 'vitest';
import { mesurerFacade, type DependancesMesures, type MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { verticaliteDesCoins } from '../../../../../src/facade/releve/chaine.js';
import { lignesDiscretes } from '../../../../../src/app/audit/parcelle/discret.js';
import type { IdEtape } from '../../../../../src/model/etapeFacade.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { rechercher } from '../../../../../src/facade/releve/serie.js';
import { VERSION_CHAINE_FACADES } from '../../../../../src/facade/releve/chaine.js';
import { facadesDuContour, type Facade } from '../../../../../src/geometry/cotesVusDeDehors.js';
import type { PhotoCas, PrisePhoto } from '../../../../../src/model/audit.js';
import type { PtBrut } from '../../../../../src/model/types.js';

// Le redressement de toutes les photos d'une facade et leur fusion (audit de la parcelle), sans navigateur : par l'orchestrateur de
// l'enchainement (lot F3), qui dit aussi l'etat et la phrase de chaque etape.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const PTS = rect(5, 10, 15, 18);
const sud = (): Facade => facadesDuContour(PTS, 6).find((f) => f.orientation === 'Sud') as Facade;

/** Un mur enduit, texture deterministe (briques decalees) : de quoi accrocher des points ORB. */
function image() {
  const L = 640, H = 480, data = new Uint8ClampedArray(L * H * 4);
  let s = 7;
  const bruit = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 24) / 255; };
  const grain = new Float32Array(L * H).map(() => bruit() * 24 - 12);
  for (let j = 0; j < H; j++) for (let i = 0; i < L; i++) {
    let c = [205, 186, 152];
    if (j < 60) c = [150, 190, 235];
    else if (j > 420) c = [96, 140, 70];
    else {
      const rang = Math.floor((j - 60) / 24), joint = (j - 60) % 24 < 2 || (i + (rang % 2) * 30) % 60 < 2;
      if (joint) c = [150, 136, 112];
      if ((i > 150 && i < 210 || i > 430 && i < 490) && j > 160 && j < 260) c = [40, 46, 54];
    }
    const k = (j * L + i) * 4, g = grain[j * L + i] as number;
    data[k] = (c[0] as number) + g; data[k + 1] = (c[1] as number) + g; data[k + 2] = (c[2] as number) + g; data[k + 3] = 255;
  }
  return { data, largeur: L, hauteur: H };
}

const prise: PrisePhoto = { t: '2026-10-13T09:00:00Z', x: 10, y: 2, lat: null, lon: null, precisionM: 4, azimutDeg: 0, sourceAzimut: 'boussole', inclinaisonDeg: 5, roulisDeg: 0, champDeg: 67 };
const photo = (t: string): PhotoCas => ({ type: 'image/jpeg', base64: 'AAAA', prise: { ...prise, t } });
/** Le releve sans son horodatage : seul l'instant du calcul change d'un rejeu a l'autre. */
const sansHeure = (r: object | null) => (r ? { ...r, releveLe: undefined } : r);
/** La phrase d'une etape de la mesure. */
const resume = (m: MesureFacade, id: IdEtape) => m.etapes?.find((e) => e.id === id)?.resume ?? '';
const dep = (): DependancesMesures => ({ pixels: async () => image(), chercherCoins: async (e) => rechercher(e), jpeg: () => 'data:image/jpeg;base64,T', limites: () => [] });

describe('le redressement de toutes les photos', () => {
  it('une photo seule : redressee, aucune fusion tentee', async () => {
    const m = await mesurerFacade('maison', sud(), { pts: PTS }, [photo('a')], dep());
    expect(m.redressement?.photos).toHaveLength(1);
    expect(m.redressement?.photos[0]?.rang).toBe(0);
    expect(m.redressement?.fusion).toBe('sans');
    expect(m.redressement?.fusionnees).toEqual([]);
    expect(m.redressement?.motifFusion).toBeUndefined();
    expect(m.releve).not.toBeNull();
    expect(resume(m, 'assemblage')).toMatch(/Une photo seule/);
    expect(m.etapes?.find((e) => e.id === 'assemblage')?.etat).toBe('saute');
  }, 60000);

  it('plusieurs photos : chacune a son statut et aucune n est perdue', async () => {
    const photos = [photo('a'), photo('b'), photo('c')];
    const avant = JSON.stringify(photos);
    const m = await mesurerFacade('maison', sud(), { pts: PTS }, photos, dep());
    expect(m.redressement?.photos.map((p) => p.rang)).toEqual([0, 1, 2]);
    for (const p of m.redressement!.photos) expect(['auto', 'manuelle', 'echec']).toContain(p.statut);
    // Un echec dit son motif ; les originaux ne bougent pas.
    for (const p of m.redressement!.photos) if (p.statut === 'echec') expect(p.motif).toBeTruthy();
    expect(JSON.stringify(photos)).toBe(avant);
    expect(['sans', 'fusionnee', 'partielle', 'independantes']).toContain(m.redressement?.fusion);
    // Fusion impossible : le motif est dit, et le releve existe quand meme.
    if (m.redressement?.fusion === 'independantes') expect(m.redressement.motifFusion).toBeTruthy();
    expect(m.releve).not.toBeNull();
  }, 120000);

  it('garde chaque photo redressee seule et la version de la chaine, de quoi comparer un rejeu', async () => {
    const m = await mesurerFacade('maison', sud(), { pts: PTS }, [photo('a'), photo('b')], dep());
    expect(m.versionChaine).toBe(VERSION_CHAINE_FACADES);
    expect(m.redressees?.map((r) => r.rang)).toEqual([0, 1]);
    for (const r of m.redressees ?? []) expect(r.image).toMatch(/^data:image\/jpeg/);
  }, 60000);

  it('rejouer deux fois donne le meme resultat', async () => {
    const photos = [photo('a'), photo('b')];
    const un = await mesurerFacade('maison', sud(), { pts: PTS }, photos, dep());
    const deux = await mesurerFacade('maison', sud(), { pts: PTS }, photos, dep());
    expect(deux.redressement).toEqual(un.redressement);
    expect(sansHeure(deux.releve)).toEqual(sansHeure(un.releve));
    expect(deux.rangReleve).toBe(un.rangReleve);
  }, 120000);

  it('une correction manuelle prime sur le calcul et change le resultat', async () => {
    const photos = [photo('a')];
    const auto = await mesurerFacade('maison', sud(), { pts: PTS }, photos, dep());
    const main = await mesurerFacade('maison', sud(), { pts: PTS }, photos, dep(), {
      '0': { coins: [{ x: 40, y: 70 }, { x: 600, y: 70 }, { x: 600, y: 420 }, { x: 40, y: 420 }] },
    });
    expect(main.redressement?.photos[0]).toMatchObject({ statut: 'manuelle', coins: 'main' });
    expect(auto.redressement?.photos[0]?.statut).not.toBe('manuelle');
    // Rejouee, la meme correction donne le meme releve.
    const encore = await mesurerFacade('maison', sud(), { pts: PTS }, photos, dep(), {
      '0': { coins: [{ x: 40, y: 70 }, { x: 600, y: 70 }, { x: 600, y: 420 }, { x: 40, y: 420 }] },
    });
    expect(sansHeure(encore.releve)).toEqual(sansHeure(main.releve));
    expect(resume(main, 'redressement')).toMatch(/Photo 1 : redressée avec vos points/);
    expect(main.etapes?.find((e) => e.id === 'calage')).toMatchObject({ etat: 'ok', resume: expect.stringMatching(/^Mur posé à la main/) });
  }, 120000);

  it('l echelle corrigee a la main fixe la largeur du mur', async () => {
    const m = await mesurerFacade('maison', sud(), { pts: PTS }, [photo('a')], dep(), { '0': { echelleLargeurM: 9 } });
    expect(m.releve?.largeur).toBe(9);
  }, 60000);

  it('une photo illisible reste dans le bilan, avec son motif', async () => {
    const lues = [image(), null];
    let i = 0;
    const m = await mesurerFacade('maison', sud(), { pts: PTS }, [photo('a'), photo('b')], { ...dep(), pixels: async () => lues[i++ % 2] ?? null });
    expect(m.redressement?.photos).toHaveLength(2);
    expect(m.redressement?.photos.find((p) => p.statut === 'echec')?.motif).toBeTruthy();
    expect(m.redressement?.fusion).toBe('sans');
  }, 60000);
});

describe('la verticalite', () => {
  it('lit l ecart des verticales sur un mur redresse', () => {
    const L = 200, H = 200, data = new Uint8ClampedArray(L * H * 4).fill(255);
    // Trois traits verticaux noirs.
    for (const x0 of [40, 100, 160]) for (let j = 10; j < 190; j++) for (let i = x0; i < x0 + 3; i++) { const k = (j * L + i) * 4; data[k] = data[k + 1] = data[k + 2] = 0; }
    const v = verticaliteDesCoins({ largeur: L, hauteur: H, donnees: data }, [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: H }, { x: 0, y: H }], 2, 2);
    expect(v).not.toBeNull();
    expect(v as number).toBeLessThan(0.5);
  });
  it('ne conclut pas sur un mur sans ligne', () => {
    expect(verticaliteDesCoins({ largeur: 80, hauteur: 80, donnees: new Uint8ClampedArray(80 * 80 * 4).fill(200) }, [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }, { x: 0, y: 80 }], 2, 2)).toBeNull();
  });
});

describe('les corrections manuelles dans la capture', () => {
  it('suivent leur photo quand une autre est retiree, et survivent a un rejeu', () => {
    const cap = creerCapture('78000000AE0101');
    for (const t of ['a', 'b', 'c']) cap.ajouterPhotoFacade('b1', 2, photo(t));
    cap.corrigerRedressement('b1', 2, 2, { echelleLargeurM: 9 });
    cap.corrigerRedressement('b1', 2, 0, { coins: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }] });
    cap.retirerPhotoFacade('b1', 2, 1);
    const f = cap.lire().batiments['b1']!.facades['2']!;
    expect(f.photos).toHaveLength(2);
    expect(Object.keys(f.corrections!).sort()).toEqual(['0', '1']);
    expect(f.corrections!['1']).toEqual({ echelleLargeurM: 9 });
    cap.corrigerRedressement('b1', 2, 0, null);
    cap.corrigerRedressement('b1', 2, 1, null);
    expect(cap.lire().batiments['b1']!.facades['2']!.corrections).toBeUndefined();
  });
});

describe('ce que l audit montre d une facade qui doute', () => {
  const etapes = (assemblage: { etat: 'ok' | 'echec' | 'a-confirmer' | 'saute'; resume: string }) => [
    { id: 'prises' as const, etat: 'ok' as const, resume: '3 photos du mur.' },
    { id: 'redressement' as const, etat: 'ok' as const, resume: '3 photos redressées sur 3.' },
    { id: 'assemblage' as const, ...assemblage },
    { id: 'calage' as const, etat: 'ok' as const, resume: 'Coins du mur trouvés sur la photo.' },
  ];
  it('dit de reprendre la facade avec des chevauchements quand les photos ne s assemblent pas, avec le geste de repli', async () => {
    // Trois photos dont la fusion est impossible : l'etape cachee de l'assemblage se montre, et dit quoi faire.
    const m = await mesurerFacade('maison', sud(), { pts: PTS }, [photo('a'), photo('b')], { ...dep(), pixels: async () => image() });
    if (m.redressement?.fusion !== 'fusionnee') expect(resume(m, 'assemblage')).toMatch(/Reprenez la façade avec des chevauchements/);
    const l = lignesDiscretes(etapes({ etat: 'echec', resume: 'Photos indépendantes : aucune fusion. Reprenez la façade avec des chevauchements entre les photos : un tiers de mur en commun.' }));
    expect(l.map((x) => x.id)).toEqual(['assemblage', 'calage']);
    expect(l[0]).toMatchObject({ etat: 'echec', surLaPhoto: true, option: expect.stringMatching(/retirer une photo/) });
    expect(l[0]?.texte).toMatch(/^Assemblage : Photos indépendantes/);
  }, 120000);
  it('ne montre pas une etape cachee qui a reussi ; le mur tient en une ligne', () => {
    const l = lignesDiscretes(etapes({ etat: 'ok', resume: 'Fusionnée : 3 photos assemblées en une image.' }));
    expect(l).toEqual([{ id: 'calage', etat: 'ok', texte: 'Mur posé : Coins du mur trouvés sur la photo.', option: null, surLaPhoto: false }]);
    expect(lignesDiscretes(etapes({ etat: 'saute', resume: 'Une photo seule : rien à assembler.' })).map((x) => x.id)).toEqual(['calage']);
  });
});
