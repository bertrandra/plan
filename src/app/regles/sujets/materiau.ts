// Sujet « materiauMurs » : le parement que Claude voit sur les facades (la texture des murs en 3D).

import { MATERIAUX_MURS_VUS, libelleDe } from '../../../model/ceQueJeVois.js';
import { textureDesMurs, type MateriauTexture } from '../../../model/couleurMur.js';
import type { Vote, VoteAnalyse } from '../../../model/analyseClaude.js';
import type { Proposition } from '../../../regles/decisions.js';
import { deClaude, pluriel, type EntreeSujet, type Sujet } from './contrat.js';

const MATERIAUX: readonly string[] = MATERIAUX_MURS_VUS.map((m) => m.code);

/** Le parement vu sur les facades : la valeur majoritaire parmi elles, portee par leur accord moyen. */
export function materiauDesFacades(v: VoteAnalyse): Vote<MateriauTexture> | null {
  const votes = v.facades.map((f) => f.materiau).filter((m) => m.valeur !== 'indetermine' && MATERIAUX.includes(m.valeur));
  if (!votes.length) return null;
  const comptes = new Map<string, Vote<MateriauTexture>[]>();
  for (const x of votes) comptes.set(x.valeur, [...(comptes.get(x.valeur) ?? []), x as Vote<MateriauTexture>]);
  const [valeur, liste] = [...comptes].sort((a, z) => z[1].length - a[1].length)[0] as [string, Vote<MateriauTexture>[]];
  if (liste.length * 2 <= votes.length && comptes.size > 1) return null;
  return { valeur: valeur as MateriauTexture, accord: Math.min(...liste.map((x) => x.accord)), indices: liste.flatMap((x) => x.indices) };
}

function propositionMateriau({ o, b, v, et }: EntreeSujet): Proposition | null {
  const m = materiauDesFacades(v);
  if (!m) return null;
  const actuel = textureDesMurs(o);
  if (actuel === m.valeur) return null;
  const choisi = o.couleurMurs?.materiau;
  const libelle = (x: MateriauTexture) => libelleDe(MATERIAUX_MURS_VUS, x);
  return deClaude({
    id: b.cle + ':claude:materiauMurs', cible: { type: 'batiment', cle: b.cle }, objet: 'Matériau des murs de ' + b.nom,
    avant: actuel ? libelle(actuel) : 'non renseigné', apres: libelle(m.valeur) + ', vu par Claude sur ' + pluriel(v.facades.length, 'façade'),
    effet: { type: 'materiauMurs', materiau: m.valeur },
  }, 'materiauMurs', m, et, [], choisi ? libelle(choisi) : null);
}

export const materiau: Sujet = { id: 'materiauMurs', libelle: 'Matériau des murs', proposer: propositionMateriau };
