// Le catalogue des textures Poly Haven (spec §3.2, io/).
//
// Textures CC0, API publique. Le catalogue (852 textures, ~800 ko de JSON) est charge UNE fois et
// garde en memoire : rouvrir le selecteur (zones/parcours/ChoixTexture.tsx) ne doit pas relancer le
// telechargement. Ce module ne connait ni le plan ni l'ecran : il charge, filtre, et resout une
// texture choisie en l'adresse de son image.

import type { TextureAppliquee } from '../model/types.js';

export const POLYHAVEN_ASSETS_URL = 'https://api.polyhaven.com/assets?type=textures';
export const POLYHAVEN_FILES_URL = (id: string) =>
  'https://api.polyhaven.com/files/' + encodeURIComponent(id);

/** Une texture du catalogue, reduite aux champs dont le selecteur se sert. */
export interface TexturePolyhaven {
  name: string;
  categories?: string[];
  tags?: string[];
  download_count?: number;
  thumbnail_url?: string;
  /** Rendu dans l'apercu ; l'API ne garantit ni l'un ni l'autre selon la texture. */
  category?: string;
  description?: string;
}

export type CataloguePolyhaven = Record<string, TexturePolyhaven>;

/** Combien de vignettes la grille montre : au-dela, on demande d'affiner la recherche. */
export const VIGNETTES_MAX = 60;

let catalogue: CataloguePolyhaven | null = null;
let chargement: Promise<CataloguePolyhaven> | null = null;

export function chargerCataloguePolyhaven(): Promise<CataloguePolyhaven> {
  if (catalogue) return Promise.resolve(catalogue);
  if (chargement) return chargement;
  chargement = fetch(POLYHAVEN_ASSETS_URL)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((j: CataloguePolyhaven) => { catalogue = j; chargement = null; return j; })
    .catch(e => { chargement = null; throw e; });
  return chargement;
}

/**
 * Les textures qui repondent a la recherche, les plus telechargees d'abord. La cle n'entre pas dans
 * la recherche : seuls le nom, les categories et les mots-cles.
 */
export function filtrerCatalogue(cat: CataloguePolyhaven, recherche: string): [string, TexturePolyhaven][] {
  const q = recherche.trim().toLowerCase();
  const tous = Object.entries(cat);
  const retenus = !q ? tous : tous.filter(([, d]) =>
    d.name.toLowerCase().includes(q) ||
    (d.categories || []).some(c => c.toLowerCase().includes(q)) ||
    (d.tags || []).some(t => t.toLowerCase().includes(q)));
  return retenus.sort((a, b) => (b[1].download_count || 0) - (a[1].download_count || 0));
}

/**
 * L'image d'une texture choisie : sa carte de couleur (« Diffuse »), dans la plus petite resolution
 * disponible.
 *
 * 1k suffit largement pour un objet de contexte et reste leger. Le repli doit rester la resolution
 * DISPONIBLE LA PLUS PETITE (triee numeriquement), pas la premiere cle venue : l'ordre des cles
 * n'est pas garanti par l'API, et prendre une image 4k/8k (des dizaines de Mo une fois decodee)
 * faisait planter Safari/Chrome iOS par depassement memoire — sans message, puisque c'est l'OS qui
 * tue l'onglet.
 */
export async function resoudreTexture(id: string, data: TexturePolyhaven): Promise<TextureAppliquee> {
  const r = await fetch(POLYHAVEN_FILES_URL(id));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  // La forme de la reponse varie d'une texture a l'autre : seul le chemin lu ici est nomme.
  const f = await r.json() as { Diffuse?: Record<string, { jpg?: { url?: string } }>; diffuse?: Record<string, { jpg?: { url?: string } }> };
  const diff = f.Diffuse || f.diffuse;
  const resolutions = diff ? Object.keys(diff).filter(k => /^\d+k$/i.test(k)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)) : [];
  const reso = diff && (diff[resolutions[0]!] || Object.values(diff)[0]);
  const url = reso && reso.jpg && reso.jpg.url;
  if (!url) throw new Error('Pas de carte de couleur (Diffuse) disponible pour cette texture');
  return { id, nom: data.name, vignette: data.thumbnail_url, url };
}
