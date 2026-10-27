// Sujet « terrasse » : la toiture-terrasse que Claude voit, posee sur le plus grand corps plat.
// Ce qu'il dit ailleurs la complete : la couverture d'un toit plat (gravillons, membrane, vegetale)
// devient son revetement, et les elements vus sur le toit (acrotere, garde-corps) ses details.

import { corpsDeLaTerrasse, terrasseVueSurLeCorps } from '../../../facade/regles/toits/elementsVus.js';
import type { VoteAnalyse } from '../../../model/analyseClaude.js';
import type { TerrasseToit } from '../../../model/types.js';
import type { Proposition } from '../../../regles/decisions.js';
import { deClaude, pluriel, type EntreeSujet, type Sujet } from './contrat.js';

/** La couverture d'un toit plat, dans le vocabulaire des revetements de terrasse ; les autres couvertures sont celles d'un toit en pente. */
export const REVETEMENTS_PLATS: Readonly<Record<string, NonNullable<TerrasseToit['revetement']>>> = { gravillons: 'gravillons', membrane: 'membrane', vegetale: 'vegetalise' };

const LIBELLES_REVETEMENT: Readonly<Record<string, string>> = { gravillons: 'en gravillons', membrane: 'en membrane', vegetalise: 'végétalisée' };

/** Un element du toit que les passes ont vu (vote a la majorite, voter). */
const vu = (v: VoteAnalyse, element: string): boolean => v.elements.some((e) => e.valeur === element);

function propositionTerrasse({ o, b, v, et, contra }: EntreeSujet): Proposition | null {
  const corps = o.batiment?.corpsToit ?? [];
  const revetementVu = REVETEMENTS_PLATS[v.couverture.valeur];
  // Une couverture de toit plat vaut une terrasse vue, sauf si les passes disent le contraire.
  if (v.terrasse.valeur !== 'oui' && !(revetementVu && v.terrasse.valeur !== 'non')) return null;
  const i = corpsDeLaTerrasse(corps);
  const c = corps[i];
  if (!c) return null;
  const type = v.typeTerrasse.valeur;
  const acrotere = v.acrotere.valeur === 'oui' || (v.acrotere.valeur === 'indetermine' && vu(v, 'acrotere'));
  const revetement = type === 'vegetalisee' ? 'vegetalise' as const : revetementVu;
  const vuSur = {
    ...(type === 'accessible' ? { accessible: true } : type === 'inaccessible' || type === 'technique' ? { accessible: false } : {}),
    ...(revetement ? { revetement } : {}),
    ...(acrotere ? { acrotereM: 0.6 } : v.acrotere.valeur === 'non' ? { acrotereM: 0 } : {}),
    // Un garde-corps vu ne dit la terrasse que si elle est accessible : ailleurs, c'est celui d'un balcon ou d'une veranda.
    ...(type === 'accessible' && vu(v, 'garde-corps') ? { gardeCorps: true } : {}),
    ...(typeof v.edicules.valeur === 'number' ? { edicules: v.edicules.valeur } : {}),
  };
  const t = c.terrasse;
  const detail = [type !== 'indetermine' && type !== 'sans-objet' && type !== 'vegetalisee' ? type : null, revetement ? LIBELLES_REVETEMENT[revetement] : null, acrotere ? 'acrotère' : null,
    vuSur.gardeCorps ? 'garde-corps' : null, typeof v.edicules.valeur === 'number' && v.edicules.valeur ? pluriel(v.edicules.valeur, 'édicule') : null].filter(Boolean).join(', ');
  // La terrasse n'a ete dite que par sa couverture : c'est ce vote qui porte la ligne.
  const vote = v.terrasse.valeur === 'oui' ? v.terrasse : v.couverture;
  return deClaude({
    id: b.cle + ':claude:terrasse', cible: { type: 'batiment', cle: b.cle }, objet: 'Toiture-terrasse de ' + b.nom,
    avant: t ? 'terrasse ' + (t.accessible ? 'accessible' : t.accessible === false ? 'inaccessible' : 'déjà décrite') : 'toit plat, sans détail',
    apres: 'Toiture-terrasse' + (detail ? ' ' + detail : '') + ', vue par Claude',
    effet: { type: 'terrasse', corps: i, terrasse: terrasseVueSurLeCorps(c, vuSur) },
  }, 'terrasse', vote, et, contra);
}

export const terrasse: Sujet = { id: 'terrasse', attribut: 'terrasse', effet: 'terrasse', proposer: propositionTerrasse };
