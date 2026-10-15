import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { IMAGES_PAR_REQUETE, preparerDemande, gardesDuRendu, type FabriqueImages } from '../../../../../src/app/audit/parcelle/entreesAnalyse.js';
import { creerAnalyseClaude, messageEchec } from '../../../../../src/app/audit/parcelle/analyseClaude.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { EchecAnalyse, type ClientAnalyse } from '../../../../../src/io/analyseClaude.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import type { PhotoCas } from '../../../../../src/model/audit.js';
import type { ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Le plafond des images d'une requete (deploy/analyse.php, buildsg/analyseAdmin.mjs) : au-dela, le
// serveur refuse tout le batch en 400. Le client reste dessous en gardant d'abord les meilleures
// images, et un refus du serveur se lit en clair (et non plus « répondu de travers »).

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const prise = { t: '2026-10-13T09:00:00Z', x: 10, y: 2, lat: null, lon: null, precisionM: 5, azimutDeg: 0, sourceAzimut: 'boussole' as const, champDeg: 66 };
const avec = (n: number): PhotoCas => ({ type: 'image/jpeg', base64: 'UEhPVE8' + n + '=', prise });
const sans = (n: number): PhotoCas => ({ type: 'image/jpeg', base64: 'U0FOUw' + n + '=' });

const FAB: FabriqueImages = {
  photo: async (p) => ({ base64: p.base64, mediaType: 'image/jpeg' }),
  rendu: () => ({ base64: 'UkVORFU=', mediaType: 'image/jpeg' }),
  ortho: async () => ({ base64: 'T1JUSE8=', mediaType: 'image/jpeg' }),
  carte: () => ({ base64: 'Q0FSVEU=', mediaType: 'image/png' }),
};

function maison() {
  const objets = normalizeObjects([
    { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101' } },
    { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, toitMesure: { pas: 1, x0: 5, y0: 18, nx: 10, ny: 8, z: new Array(80).fill(7), egout: 6, faite: 9, source: 'lidar' } },
  ] as ObjetBrut[]) as ObjetPlan[];
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  return { objets, capture };
}

describe('le plafond des images d une requete', () => {
  it('vaut celui des deux serveurs', () => {
    for (const f of ['deploy/analyse.php', 'buildsg/analyseAdmin.mjs']) {
      const m = /const IMAGES_PAR_REQUETE = (\d+);/.exec(readFileSync(f, 'utf8'));
      expect(Number(m?.[1]), f).toBe(IMAGES_PAR_REQUETE);
    }
  });

  it('garde la vue du dessus, le relief, puis la meilleure photo de chaque facade et son rendu, dans l ordre de la capture', async () => {
    const { objets, capture } = maison();
    const liste0 = listeDeControle(objets, capture.lire());
    const cotes = liste0.batiments[0]!.facades.map((f) => f.cote);
    expect(cotes.length).toBe(4);
    // Huit photos par facade (la premiere de la facade 0 sans prise de vue), quatre du toit : bien plus que 40 images.
    for (const c of cotes) for (let k = 0; k < 8; k++) capture.ajouterPhotoFacade('maison', c, c === cotes[0] && k === 0 ? sans(k) : avec(c * 10 + k));
    for (let k = 0; k < 4; k++) capture.ajouterPhotoBatiment('maison', avec(100 + k));
    const e = { objets, liste: listeDeControle(objets, capture.lire()), capture: capture.lire(), mesures: new Map() };
    const d = await preparerDemande(e, FAB, { projet: null, idu: null, adresse: null, audit: 'a' });
    const contenu = d!.demande.requetes[0]!.contenu;
    expect(contenu.filter((b) => b.type === 'image')).toHaveLength(IMAGES_PAR_REQUETE);
    const et = d!.etiquettes.maison!;
    expect(et).toHaveLength(IMAGES_PAR_REQUETE);
    expect(et.at(-2)?.texte).toMatch(/^orthophoto/);
    expect(et.at(-1)?.texte).toMatch(/^carte des hauteurs LiDAR/);
    // Un rendu par facade, celui de sa meilleure photo : pour la facade 0, celle prise a la boussole
    // (rang 1), pas la premiere qui ne dit pas d'ou elle a ete prise.
    const rendus = et.map((x, k) => (x.texte.startsWith('rendu') ? et[k - 1]?.photo : null)).filter(Boolean);
    expect(rendus.map((p) => [p?.cote, p?.rang])).toEqual(cotes.map((c) => [c, c === cotes[0] ? 1 : 0]));
    // Les photos tombees sont celles du dernier tour : la huitieme des deux dernieres facades.
    const gardees = (c: number) => et.filter((x) => x.photo?.cote === c).map((x) => x.photo?.rang);
    expect(gardees(cotes[0]!)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(gardees(cotes[3]!)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(et.filter((x) => x.photo && x.photo.cote === undefined)).toHaveLength(4);
    const i = et.findIndex((x) => x.photo?.cote === cotes[1]);
    expect(et[i + 1]?.texte).toBe('rendu du modèle actuel de Plan, façade entière du pied du mur au haut du toit, vue du même côté que l’image ' + (i + 1));
    const ordre = et.filter((x) => x.photo?.cote !== undefined).map((x) => cotes.indexOf(x.photo!.cote!) * 10 + x.photo!.rang);
    expect(ordre).toEqual([...ordre].sort((a, z) => a - z));
  });

  it('dit en clair ce que le serveur a refuse', async () => {
    const e = new EchecAnalyse('serveur', 'envoi de l’analyse : Trop d’images dans une requête (40 au plus).');
    expect(messageEchec(e)).toBe('Le serveur de l’analyse a refusé ou n’a pas compris la demande (« Trop d’images dans une requête (40 au plus). ») : seules les mesures sont proposées.');
    expect(messageEchec(new EchecAnalyse('plafond', 'x'))).toMatch(/^Le plafond de l’analyse est atteint/);
    const { objets, capture } = maison();
    capture.ajouterPhotoFacade('maison', listeDeControle(objets, capture.lire()).batiments[0]!.facades[0]!.cote, avec(1));
    capture.terminer();
    const client = { creerBatch: async () => { throw e; } } as unknown as ClientAnalyse;
    const a = creerAnalyseClaude({
      capture, entrees: () => ({ objets, liste: listeDeControle(objets, capture.lire()), capture: capture.lire(), mesures: new Map() }), mesuresPretes: async () => {}, client, images: FAB,
      identite: () => ({ projet: null, idu: null, adresse: null, audit: 'a' }), signaler: () => {}, maintenant: () => new Date('2026-10-13T10:00:00Z'),
    });
    await a.accorder(true);
    expect(a.etat()).toBe('erreur');
    expect(a.detail()).toMatch(/« Trop d’images dans une requête \(40 au plus\)\. »/);
  });
});

describe('le rendu pour Claude montre la facade entiere', () => {
  it('recoit la facade visee, ses bouts et le haut du pignon, pas seulement la prise', async () => {
    const { objets, capture } = maison();
    const liste0 = listeDeControle(objets, capture.lire());
    const sud = liste0.batiments[0]!.facades.find((f) => f.facade.orientation === 'Sud')!;
    capture.ajouterPhotoFacade('maison', sud.cote, avec(1));
    const demandes: { prise: unknown; cible: { gauche: PtBrut; droite: PtBrut; hautM: number } | undefined; gardes: ((cle: string) => boolean) | undefined }[] = [];
    const fab: FabriqueImages = { ...FAB, rendu: (prise, cible, gardes) => { demandes.push({ prise, cible, gardes }); return { base64: 'UkVORFU=', mediaType: 'image/jpeg' }; } };
    const e = { objets, liste: listeDeControle(objets, capture.lire()), capture: capture.lire(), mesures: new Map() };
    await preparerDemande(e, fab, { projet: null, idu: null, adresse: null, audit: 'a' });
    expect(demandes).toHaveLength(1);
    const { cible } = demandes[0]!;
    expect(cible?.gauche).toEqual(sud.facade.gauche);
    expect(cible?.droite).toEqual(sud.facade.droite);
    // Le toit mesure monte a 9 m au faitage, le mur s'arrete a 6 m : le rendu doit tenir jusqu'en haut.
    expect(cible?.hautM).toBeGreaterThanOrEqual(sud.hauteurMur + 0.5);
    // Le rendu est epure : la maison et le sol, pas la cloture ni un arbre.
    const g = demandes[0]!.gardes;
    expect(g?.('maison')).toBe(true);
    expect(g?.('parcelle')).toBe(true);
    expect(g?.('cloture')).toBe(false);
    expect(g?.('arbre')).toBe(false);
  });

  it('garde les batiments de la liste et les terrains, pas la maison voisine', () => {
    const { objets, capture } = maison();
    const voisin = { key: 'voisine', name: 'voisine', type: 'polygon', fonction: 'terrain', pts: rect(20, 0, 40, 30), voisinage: true } as unknown as ObjetPlan;
    const chez = { key: 'chezVoisin', name: 'chezVoisin', type: 'polygon', fonction: 'batiment', pts: rect(22, 5, 30, 12), elevation: 6, voisinage: true } as unknown as ObjetPlan;
    const tous = [...objets, voisin, chez];
    const g = gardesDuRendu({ objets: tous, liste: listeDeControle(tous, capture.lire()), capture: capture.lire(), mesures: new Map() });
    expect(['maison', 'parcelle', 'voisine'].every((c) => g(c))).toBe(true);
    expect(g('chezVoisin')).toBe(false);
  });
});
