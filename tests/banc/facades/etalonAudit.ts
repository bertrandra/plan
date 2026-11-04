// Un etalon du catalogue (src/facade/banc/etalons.ts) pour les tests de l'audit : le batiment de la regle des projets de demonstration
// (facade/banc/projetEtalon.ts), la photo de la scene et sa prise de vue, et une parcelle autour. Un test de l'audit qui a besoin d'une
// maison photographiee prend celle-ci au lieu de peindre la sienne (CLAUDE.md, « chercher avant de creer »).

import { chargerCorpus } from './banc.js';
import { batimentDeLEtalon, PROFONDEUR_M } from '../../../src/facade/banc/projetEtalon.js';
import { photosDeLEtalon } from '../../../src/facade/banc/etalons.js';
import type { CorpsToit, PtBrut, Toit } from '../../../src/model/types.js';
import type { PrisePhoto } from '../../../src/model/audit.js';
import type { Image } from '../../../src/facade/vision/homographie.js';

export interface EtalonAudit {
  nom: string;
  pts: PtBrut[];
  hauteur: number;
  corps: CorpsToit[];
  toit: Toit;
  /** Les photos rendues (les pixels du banc) et leur prise de vue. */
  photos: { image: Image; prise: PrisePhoto | null }[];
  /** Les pixels d'une photo, dans la forme de `DependancesMesures.pixels`. */
  pixels: (k?: number) => { data: Uint8ClampedArray; largeur: number; hauteur: number };
  /** Une parcelle a 6 m autour du batiment. */
  parcelle: PtBrut[];
}

const caches = new Map<string, EtalonAudit>();

/** L'etalon dont le nom commence par `prefixe` (« 02 », « 25-mur »…), rendu une fois par fichier de test. */
export function etalonPourLAudit(prefixe: string): EtalonAudit {
  const deja = caches.get(prefixe);
  if (deja) return deja;
  const s = chargerCorpus().find((x) => x.nom.startsWith(prefixe));
  if (!s) throw new Error('etalon absent : ' + prefixe);
  const b = batimentDeLEtalon(s);
  const photos = photosDeLEtalon(s).map((p) => ({ image: p.image, prise: p.prise }));
  const L = s.verite.largeur, m = 6;
  const e: EtalonAudit = {
    nom: s.nom, pts: b.contour, hauteur: b.hauteur, corps: b.corps, toit: b.toit, photos,
    pixels: (k = 0) => { const p = photos[k] as (typeof photos)[number]; return { data: p.image.donnees, largeur: p.image.largeur, hauteur: p.image.hauteur }; },
    parcelle: [{ x: -m, y: -m - 4 }, { x: L + m, y: -m - 4 }, { x: L + m, y: PROFONDEUR_M + m }, { x: -m, y: PROFONDEUR_M + m }],
  };
  caches.set(prefixe, e);
  return e;
}
