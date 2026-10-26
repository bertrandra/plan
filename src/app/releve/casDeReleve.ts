// Un cas de calibration (admin › Calibrer la detection) tire d'une facade relevee d'un batiment : sa photo redressee, ses
// dimensions, et ses ouvertures, que la personne a validees au releve (le meilleur depart d'une verite).
//
// Le releve ne garde pas les photos d'origine, seulement l'elevation redressee (la texture) : le cas a une seule photo, deja de
// face, dont les coins sont les angles du mur dans la texture (sous la bande au-dessus de l'egout). Il mesure la detection seule,
// pas le calage : c'est ce qu'il apporte a la calibration. Une texture restee sur l'appareil du releve (`photoLocale`) se relit
// dans le magasin des photos de ce navigateur, quand c'est le meme.

import { FORMAT_CAS_REEL, type CasStocke, type OuvertureVraie } from '../../facade/corpusReel.js';
import { facadesDuContour } from '../../facade/geometrie.js';
import type { ObjetBrut, PtBrut, ReleveFacade } from '../../model/types.js';

/** Une facade relevee, prete a devenir un cas : ce qu'on en montre, et le cas. */
export interface FacadeReleveeACalibrer { libelle: string; cas: CasStocke }

const arrondi = (v: number) => Math.round(v * 100) / 100;
const virgule = (v: number) => String(arrondi(v)).replace('.', ',');

/**
 * Le cas d'une facade relevee, d'apres les dimensions de sa texture en pixels. Null sans texture, ou quand ses dimensions ne
 * disent pas un mur.
 */
export function casDepuisReleve(r: ReleveFacade, nomBatiment: string, dims: { l: number; h: number }, projet: string | null = null, orientation = ''): CasStocke | null {
  if (!r.texture || !(r.largeur > 0) || !(r.hauteur > 0) || !(dims.l > 0) || !(dims.h > 0)) return null;
  // La texture couvre du sol a `hauteurTexture` (le mur, puis la bande au-dessus de l'egout) : l'egout y est a cette part du haut.
  const hT = r.hauteurTexture && r.hauteurTexture > r.hauteur ? r.hauteurTexture : r.hauteur;
  const egout = Math.round(dims.h * (1 - r.hauteur / hT) * 10) / 10;
  const ouvertures: OuvertureVraie[] = r.ouvertures.map((o) => ({ type: o.type, x: arrondi(o.x), y: arrondi(o.y), l: arrondi(o.l), h: arrondi(o.h) }));
  return {
    format: FORMAT_CAS_REEL, version: 1, statut: 'brouillon', source: 'releve',
    nom: nomBatiment + ' · façade ' + (orientation ? orientation.toLowerCase() : String(r.cote + 1)) + (projet ? ' (' + projet + ')' : ''),
    largeurM: arrondi(r.largeur), hauteurM: arrondi(r.hauteur),
    photos: [{ fichier: 'releve', coins: [{ x: 0, y: egout }, { x: dims.l, y: egout }, { x: dims.l, y: dims.h }, { x: 0, y: dims.h }] }],
    images: [r.texture], ouvertures,
  };
}

/** Les facades relevees d'un projet (ses batiments, dans l'ordre du plan), chacune en cas ; `dims` lit la taille d'une texture. */
export async function facadesRelevees(objets: readonly ObjetBrut[], dims: (url: string) => Promise<{ l: number; h: number }>, projet: string | null = null): Promise<FacadeReleveeACalibrer[]> {
  const out: FacadeReleveeACalibrer[] = [];
  for (const o of objets) {
    const facades = (o as { facades?: ReleveFacade[] }).facades;
    if (!Array.isArray(facades)) continue;
    const nom = typeof o.name === 'string' && o.name ? o.name : 'Bâtiment';
    const pts = (o as { pts?: PtBrut[] }).pts;
    const murs = Array.isArray(pts) && pts.length >= 3 ? facadesDuContour(pts, 1) : [];
    for (const r of facades) {
      if (!r.texture) continue;
      const orientation = murs.find((f) => f.cote === r.cote)?.orientation ?? '';
      const d = await dims(r.texture).catch(() => null);
      const cas = d ? casDepuisReleve(r, nom, d, projet, orientation) : null;
      if (!cas) continue;
      out.push({ libelle: nom + ' · façade ' + (orientation ? orientation.toLowerCase() : String(r.cote + 1)) + ' · ' + virgule(r.largeur) + ' × ' + virgule(r.hauteur) + ' m · ' + r.ouvertures.length + ' ouverture' + (r.ouvertures.length > 1 ? 's' : '') + ' relevée' + (r.ouvertures.length > 1 ? 's' : ''), cas });
    }
  }
  return out;
}
