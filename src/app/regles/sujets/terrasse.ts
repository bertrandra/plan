// Sujet « terrasse » : la toiture-terrasse que Claude voit, posee sur le plus grand corps plat.

import { corpsDeLaTerrasse, terrasseVueSurLeCorps } from '../../audit/parcelle/propositions.js';
import type { Proposition } from '../../../regles/decisions.js';
import { deClaude, pluriel, type EntreeSujet, type Sujet } from './contrat.js';

function propositionTerrasse({ o, b, v, et, contra }: EntreeSujet): Proposition | null {
  const corps = o.corpsToit ?? [];
  if (v.terrasse.valeur !== 'oui') return null;
  const i = corpsDeLaTerrasse(corps);
  const c = corps[i];
  if (!c) return null;
  const type = v.typeTerrasse.valeur;
  const vu = {
    ...(type === 'accessible' ? { accessible: true } : type === 'inaccessible' || type === 'technique' ? { accessible: false } : {}),
    ...(type === 'vegetalisee' ? { revetement: 'vegetalise' as const } : {}),
    ...(v.acrotere.valeur === 'oui' ? { acrotereM: 0.6 } : v.acrotere.valeur === 'non' ? { acrotereM: 0 } : {}),
    ...(typeof v.edicules.valeur === 'number' ? { edicules: v.edicules.valeur } : {}),
  };
  const t = c.terrasse;
  const detail = [type !== 'indetermine' && type !== 'sans-objet' ? type : null, v.acrotere.valeur === 'oui' ? 'acrotère' : null, typeof v.edicules.valeur === 'number' && v.edicules.valeur ? pluriel(v.edicules.valeur, 'édicule') : null].filter(Boolean).join(', ');
  return deClaude({
    id: b.cle + ':claude:terrasse', cible: { type: 'batiment', cle: b.cle }, objet: 'Toiture-terrasse de ' + b.nom,
    avant: t ? 'terrasse ' + (t.accessible ? 'accessible' : t.accessible === false ? 'inaccessible' : 'déjà décrite') : 'toit plat, sans détail',
    apres: 'Toiture-terrasse' + (detail ? ' ' + detail : '') + ', vue par Claude',
    effet: { type: 'terrasse', corps: i, terrasse: terrasseVueSurLeCorps(c, vu) },
  }, 'terrasse', v.terrasse, et, contra);
}

export const terrasse: Sujet = { id: 'terrasse', attribut: 'terrasse', effet: 'terrasse', proposer: propositionTerrasse };
