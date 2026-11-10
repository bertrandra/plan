// Le projet de demonstration d'un etalon de synthese (decision du proprietaire, 4 novembre 2026) : Admin › Calibration, section
// « Étalons de synthèse », « Créer le projet de démonstration ». Rien n'est ajoute au depot : le projet se construit dans le
// navigateur depuis l'etalon, et s'enregistre dans les demos de l'admin (data/demo/), ou l'atelier l'ouvre (`?demofile=<id>`).
//
// - Le batiment autour du mur : facade/banc/projetEtalon.ts (contour, corps du toit, hauteur), toujours la meme regle.
// - La facade photographiee se mesure par le chemin de l'audit, tel quel (audit/parcelle/mesures.ts::mesurerFacade : les photos de
//   synthese et leur prise de vue, les coins cherches, le gabarit des corps), et s'ecrit par la validation V4 de l'audit
//   (facadeValidee.ts::facadeAEcrire) : ce que la chaine a trouve, pas la verite. Le projet montre donc ce qu'un audit aurait donne
//   de ces photos, sur le plan, en 3D et dans le releve.
// - Les parties basses du mur deviennent leurs volumes par le releve, comme pour un batiment de l'audit (facade/profil.ts).

import { batimentDeLEtalon, PROFONDEUR_M } from '../../facade/banc/projetEtalon.js';
import { casDeLEtalon, photosDeLEtalon } from '../../facade/banc/etalons.js';
import type { SceneFacade } from '../../facade/banc/synthese.js';
import type { Image } from '../../facade/vision/homographie.js';
import type { EntreeRecherche, ResultatRecherche } from '../../facade/releve/serie.js';
import { facadesDuContour } from '../../geometry/cotesVusDeDehors.js';
import { mesurerFacade } from '../audit/parcelle/mesures.js';
import { facadeAEcrire } from '../audit/parcelle/facadeValidee.js';
import type { ObjetBrut, ObjetPlan, PtBrut } from '../../model/types.js';
import { creerDepotDemos } from '../../io/depotDemos.js';
import { serializeObjects } from '../../io/serialisation.js';
import { sceneDeLEtalon } from '../../io/etalonsFacades.js';
import { APP_VERSION, SCHEMA_VERSION } from '../../model/version.js';

export interface DependancesProjetEtalon {
  chercherCoins: (e: EntreeRecherche) => Promise<ResultatRecherche>;
  /** Une image en `data:image/jpeg` : la photo montree, la texture du releve. */
  jpeg: (img: Image) => string;
  /** Le jour du releve et de sa validation, ISO 8601. */
  maintenant: () => Date;
}

export interface ProjetEtalon { nom: string; objets: ObjetPlan[] }

const MARGE_M = 6;

/** Le nom du projet : l'identifiant de l'etalon (« Étalon 22-pignon-decentre-pierre »), celui du catalogue, pour le retrouver. */
export const nomDuProjet = (s: SceneFacade): string => 'Étalon ' + s.nom;

/**
 * La parcelle autour du batiment, a MARGE_M de chaque cote : le gazon et la cloture de la 3D s'y posent. Elle n'a ni lieu ni cadastre (un
 * projet de synthese) : le lieu par defaut vaut pour le soleil, et ni l'orthophoto ni le LiDAR ne se lisent ; son nom le dit.
 */
function parcelle(L: number): ObjetPlan {
  const D = PROFONDEUR_M, m = MARGE_M;
  const pts: PtBrut[] = [{ x: -m, y: -m - 4 }, { x: L + m, y: -m - 4 }, { x: L + m, y: D + m }, { x: -m, y: D + m }];
  return {
    key: 'parcelle', type: 'polygon', name: 'Parcelle (projet de synthèse, sans lieu)', fill: '#FBF3D9', fillOpacity: 1, stroke: '#3B2E1F', pts,
    vertexNames: ['Coin Sud-Ouest', 'Coin Sud-Est', 'Coin Nord-Est', 'Coin Nord-Ouest'], segmentNames: ['Sud (rue)', 'Est', 'Nord', 'Ouest'],
    frozenVertices: [false, false, false, false], showName: false, showSegNames: false, showVertNames: false, showDims: false, showAngles: false,
    constrained: false, fonction: 'terrain', matiere: '', priority: 0, locked: true,
  } as ObjetPlan;
}

/**
 * Le projet d'un etalon : la parcelle, et le batiment dont le mur sud est la facade photographiee, mesuree et validee comme dans
 * l'audit. Leve si la chaine ne tire rien des photos (aucun releve).
 */
export async function projetDeLEtalon(s: SceneFacade, d: DependancesProjetEtalon): Promise<ProjetEtalon> {
  const b = batimentDeLEtalon(s);
  const photos = photosDeLEtalon(s);
  const cas = casDeLEtalon(s, photos, photos.map((_, k) => 'photo-' + (k + 1)));
  // Les photos comme l'audit les garde (un JPEG et sa prise de vue) ; la chaine en relit les pixels rendus, tels quels.
  const base64 = photos.map((p) => d.jpeg(p.image).replace(/^data:image\/jpeg;base64,/, ''));
  const pixels = new Map(base64.map((b64, k) => [b64, photos[k]?.image ?? null]));
  const f = facadesDuContour(b.contour, b.hauteur).find((x) => x.cote === 0);
  if (!f) throw new Error('Le mur de l’étalon n’a pas de façade.');
  const maison = {
    key: 'maison', type: 'polygon', name: 'Maison', fill: '#DCCFB9', fillOpacity: 0.88, stroke: '#6B5A41', pts: b.contour,
    vertexNames: ['Coin Sud-Ouest', 'Coin Sud-Est', 'Coin Nord-Est', 'Coin Nord-Ouest'], segmentNames: ['Façade photographiée', 'Est', 'Nord', 'Ouest'],
    frozenVertices: [true, true, true, true], showName: true, showSegNames: false, showVertNames: false, showDims: false, showAngles: false,
    constrained: true, fonction: 'batiment', matiere: '', priority: 2, locked: false, elevation: b.hauteur,
    // Le toit est celui de la regle : ni le LiDAR ni un fait ne le relisent (il n'y a pas de batiment de l'IGN derriere).
    batiment: { corpsToit: b.corps, toit: b.toit, toitFige: true, egoutChoisi: 'saisie' },
  } as unknown as ObjetPlan;
  const m = await mesurerFacade('maison', f, { pts: b.contour, corpsToit: b.corps, facades: [] },
    cas.photos.map((p, k) => ({ type: 'image/jpeg' as const, base64: base64[k] as string, ...(p.prise ? { prise: p.prise } : {}) })),
    {
      pixels: async (b64) => { const img = pixels.get(b64); return img ? { data: img.donnees, largeur: img.largeur, hauteur: img.hauteur } : null; },
      chercherCoins: d.chercherCoins, jpeg: d.jpeg, limites: () => [],
    });
  const jour = d.maintenant().toISOString();
  const facade = facadeAEcrire(maison, m, jour);
  if (!facade) throw new Error('La chaîne n’a rien tiré des photos de l’étalon : aucun relevé.');
  (maison.batiment as NonNullable<ObjetPlan['batiment']>).facades = [facade];
  return { nom: nomDuProjet(s), objets: [parcelle(s.verite.largeur), maison] };
}

/**
 * Construit le projet d'un etalon et l'enregistre dans les demos de l'admin : sous le meme nom, il remplace le precedent (le serveur en
 * garde la version d'avant en `.bak`), un seul projet par etalon. Rend l'identifiant de la demo et son nom.
 */
export async function creerProjetDeLEtalon(id: string, f: (entree: string, init?: RequestInit) => Promise<Response>, d: DependancesProjetEtalon): Promise<{ id: string; nom: string }> {
  const s = sceneDeLEtalon(id);
  if (!s) throw new Error('Étalon inconnu : ' + id + '.');
  const p = await projetDeLEtalon(s, d);
  const depot = creerDepotDemos(f);
  const existant = (await depot.lister()).find((x) => x.name === p.nom);
  const objects = serializeObjects(p.objets);
  const charge = { ...(existant ? { id: existant.id } : {}), name: p.nom, objects: objects as unknown as ObjetBrut[], measures: [], appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION };
  const r = await depot.enregistrer(charge);
  return { id: r.id, nom: p.nom };
}
