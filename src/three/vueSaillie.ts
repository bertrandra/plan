// Les vignettes des elements de facade de la palette (groupe « Toit », onglet « Facade »).
//
// Elles sont calculees par les memes fonctions que la 3D (`corpsDeSaillie`, `facettesBowWindow`) et projetees comme les
// vignettes du catalogue (three/catalogueToits.ts) : ce module est donc de la couche three, pas de facade.

import { EXEMPLES_TOITS, corpsDeLExemple, vueIsometrique, type ExempleToit, type VueIso } from './catalogueToits.js';
import { facettesElementsToit } from '../facade/toits/toitFormes.js';
import { DEFAUTS_SAILLIE, corpsDeSaillie, facettesBowWindow, type Pt3 } from '../facade/modeToit/saillies.js';
import { point, repere } from '../facade/toits/toitCorps.js';
import type { FormeSaillie, GenreSaillie } from '../model/types.js';

const DEUX_PANS = EXEMPLES_TOITS.find((e) => e.id === 'deux-pans') as ExempleToit;

/**
 * La vignette d'un element de facade de la palette : un deux-pans, l'element pose contre son mur de devant. Elle est
 * calculee par les memes fonctions que la 3D (`corpsDeSaillie`, `facettesBowWindow`), pas dessinee a part.
 * `nom` : `bow-window` (pans coupes), `bow-rectangle`, `bow-arc`, `bow-conge`, `galerie`, `appentis-ferme`.
 */
export function vueDeSaillie(nom: string): VueIso {
  // Le mur de la maison, une dalle mince et haute : l'element se lit mieux contre un mur seul que contre une maison entiere.
  const mur: ExempleToit = { id: 'mur', titre: 'Mur', famille: 'toit', corps: [{ corps: { posFaitage: 0.15, faitage: 3.4, egouts: [3.4, 3.4] }, w: 0.3, l: 7 }] };
  const hote = corpsDeLExemple(mur)[0];
  if (!hote) return { facettes: [], largeur: 0, hauteur: 0 };
  const genre: GenreSaillie = nom.startsWith('bow-') ? 'bow-window' : nom === 'galerie' ? 'galerie' : 'appentis';
  const forme: FormeSaillie = nom === 'bow-arc' ? 'arc' : nom === 'bow-conge' ? 'conge' : nom === 'bow-rectangle' || genre !== 'bow-window' ? 'rectangle' : 'pans';
  const d = DEFAUTS_SAILLIE[genre];
  const profondeurM = genre === 'bow-window' ? (forme === 'arc' ? 2 : 1.6) : genre === 'galerie' ? 2 : 3;
  const c = corpsDeSaillie(hote, { genre, hote: 0, mur: 2, centreM: 3.5, largeurM: genre === 'bow-window' ? 4 : 6.4, profondeurM, forme, niveau: d.niveau, toit: d.toit });
  const f = facettesBowWindow(c);
  const toS = (q: Pt3) => ({ s: q.x, t: q.y, z: q.z });
  let murs = f.murs;
  if (genre === 'galerie') {
    // Une galerie est ouverte : des poteaux sur son bord, pas de mur.
    const r = repere(c.pts), egout = c.egouts[0];
    murs = [0, 0.5, 1].map((k) => {
      const s0 = k * (r.L - 0.2), P = (s: number, z: number): Pt3 => ({ ...point(r, s, r.W - 0.1), z });
      return [P(s0, 0), P(s0 + 0.2, 0), P(s0 + 0.2, egout), P(s0, egout)];
    });
  }
  return vueIsometrique(mur, [...murs.map((m) => ({ f: m.map(toS), mur: true })), ...f.pans.map((p) => ({ f: p.map(toS), mur: false }))]);
}


/** La vignette d'un element de toit de la palette (fenetre de toit, solaire) : un deux-pans, l'element sur le pan de devant. */
export function vueDeElementToit(type: 'fenetre-toit' | 'solaire'): VueIso {
  const base = corpsDeLExemple(DEUX_PANS)[0];
  if (!base) return { facettes: [], largeur: 0, hauteur: 0 };
  const c = { ...base, elementsToit: [{ type, pan: 1 as const, sM: type === 'solaire' ? 5 : 5, dM: 1.7, echelle: type === 'solaire' ? 1.3 : 2.2 }] };
  const r = repere(c.pts);
  const toS = (q: { s: number; t: number; z: number }) => ({ s: q.s + r.p0.x, t: q.t + r.p0.y, z: q.z });
  const plus = facettesElementsToit(c, r.L, r.W).flatMap((e) => [{ f: e.cadre.map(toS), mur: false, vitre: false }, { f: e.vitre.map(toS), mur: false, vitre: true }]);
  return vueIsometrique(DEUX_PANS, plus);
}
