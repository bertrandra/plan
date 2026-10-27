// Sujet « cheminees » : les souches que Claude voit, posees sur le plus grand corps en pente.

import type { SoucheVue } from '../../../model/ceQueJeVois.js';
import { corpsDesCheminees, souchesSurLeCorps } from '../../../facade/regles/toits/elementsVus.js';
import type { Proposition } from '../../../regles/decisions.js';
import { deClaude, pluriel, type EntreeSujet, type Sujet } from './contrat.js';

function propositionCheminees({ o, b, v, et, contra }: EntreeSujet): Proposition | null {
  const corps = o.batiment?.corpsToit ?? [];
  const n = v.cheminees.valeur;
  if (typeof n !== 'number' || !corps.length) return null;
  const existantes = corps.flatMap((c) => c.cheminees ?? []);
  if (existantes.length === n) return null;
  const i = corpsDesCheminees(corps);
  const c = corps[i];
  if (!c) return null;
  const souches: SoucheVue[] = Array.from({ length: n }, (_, k) => {
    const s = v.souches[k];
    return { ...(s && s.position !== 'indetermine' ? { position: s.position } : {}), ...(s && s.materiau !== 'indetermine' ? { materiau: s.materiau } : {}) };
  });
  return deClaude({
    id: b.cle + ':claude:cheminees', cible: { type: 'batiment', cle: b.cle }, objet: 'Cheminées de ' + b.nom,
    avant: existantes.length ? pluriel(existantes.length, 'cheminée') : 'aucune cheminée',
    apres: (n ? pluriel(n, 'cheminée') : 'Aucune cheminée') + ', vue' + (n > 1 ? 's' : '') + ' par Claude',
    effet: { type: 'cheminees', corps: i, cheminees: souchesSurLeCorps(c, souches) },
  }, 'cheminees', v.cheminees, et, contra);
}

export const cheminees: Sujet = { id: 'cheminees', attribut: 'cheminees', effet: 'cheminees', proposer: propositionCheminees };
